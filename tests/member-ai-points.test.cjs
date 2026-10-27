// AI point 錢包：只有儲值點數能轉、小數只捨不入、轉回整數、自動補充、單次上限、重送不重扣、兌換先扣任務點數。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;
  create table public.watchlist(id bigserial primary key,user_id uuid not null,code text not null);`);
 const files=['member-services.sql','member-services-supplement.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql','member-task-wallet.sql','member-perks-exchange-v2.sql','member-perks-tasks-v2.sql','member-perks-tasks-v3-points.sql','member-perks-exchange-v3.sql','member-ai-points.sql'];
 for(const f of files)await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',f),'utf8').replace(/^﻿/,''));
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/member-ai-points.sql'),'utf8'));// 可重複執行
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,rid=n=>`${String(n).padStart(8,'0')}-2222-4222-8222-222222222222`,admin=()=>db.exec('reset role');
 const as=async n=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 await db.query(`insert into auth.users(id,email) values($1,'a@t')`,[uid(1)]);
 const grant=(pts,pool,key)=>db.query("insert into public.member_point_ledger(user_id,description,points,source_event_key,pool) values($1,'測試',$2,$3,$4)",[uid(1),pts,key,pool]);
 await admin();await grant(300,'task','task:t1');await grant(1000,'stored','stored:o1');
 await as(1);let w=await value('select public.member_wallet_summary() value');
 assert.deepEqual([w.task_points,w.stored_points,w.ai_points,w.ai_enabled],[300,1000,'0',false]);
 await assert.rejects(value('select public.member_ai_convert(10,$1) value',[rid(1)]),/MEMBER_AI_UNAVAILABLE/,'starts closed');
 await admin();await db.exec('update public.member_ai_settings set active=true,stored_enabled=true');await as(1);
 // 只能用儲值點數：要轉 1,001 點（超過儲值 1,000，雖然任務＋儲值夠）→ 拒絕
 await assert.rejects(value('select public.member_ai_convert(1001,$1) value',[rid(2)]),/MEMBER_STORED_POINTS_INSUFFICIENT/);
 let r=await value('select public.member_ai_convert(100,$1) value',[rid(3)]);assert.equal(r.ai_points,'100.0000');
 assert.equal((await value('select public.member_ai_convert(100,$1) value',[rid(3)])).duplicate,true,'retry does not convert twice');
 w=await value('select public.member_wallet_summary() value');assert.deepEqual([w.task_points,w.stored_points],[300,900]);
 // 伺服器扣點：0.12345 → 只扣 0.1234；同一 request 不重扣；上限 2 → 實際 5 只扣 2
 await admin();
 const charge=(req,amt,cap)=>value("select public.member_ai_charge($1,$2,$3,$4,'{\"title\":\"盤後問答\",\"model\":\"m\",\"input_tokens\":1200,\"output_tokens\":300}') value",[uid(1),req,amt,cap]);
 assert.equal((await charge('q1',0.12345,1)).charged,'0.1234');assert.equal((await charge('q1',0.12345,1)).duplicate,true);
 assert.equal((await charge('q2',5,2)).charged,'2.0000');
 await assert.rejects(db.exec("set role authenticated;select public.member_ai_charge('"+uid(1)+"','x',1,1)"),/permission denied/);await admin();
 // 轉回只能整數：餘額 97.8766 → 轉回 98 失敗、97 成功、剩 0.8766
 await as(1);await assert.rejects(value('select public.member_ai_convert_back(98,$1) value',[rid(4)]),/MEMBER_AI_POINTS_INSUFFICIENT/);
 r=await value('select public.member_ai_convert_back(97,$1) value',[rid(5)]);assert.equal(r.ai_points,'0.8766');
 w=await value('select public.member_wallet_summary() value');assert.equal(w.stored_points,997);
 // 自動補充：關閉時不足會拒絕；開啟（每次 50、低於 5 再補）後，扣 3 → 補 50，扣完 47.8766；低於門檻後再補
 await admin();await assert.rejects(charge('q3',3,null),/MEMBER_AI_POINTS_INSUFFICIENT/);
 await as(1);await value('select public.member_ai_update_settings(true,50,5) value');await admin();
 r=await charge('q4',3,null);assert.equal(r.ai_points,'47.8766');assert.equal(r.topped_up,50);
 r=await charge('q5',45,null);assert.equal(r.ai_points,'52.8766','after use fell below 5 → topped up 50 more');
 // 明細：會員只看得到自己的
 await as(1);const led=(await db.query("select kind,ai_delta::text d from public.member_ai_ledger order by created_at,id")).rows;assert.ok(led.length>=6);assert.ok(led.some(x=>x.kind==='auto_topup'));
 // 兌換：先扣任務點數 300，再扣儲值點數
 await admin();await db.exec("update public.member_exchange_definitions set active=true where id='vip-1d-v1';update public.member_voucher_definitions set active=true");
 await as(1);await value('select public.exchange_member_points($1,$2) value',['vip-1d-v1',rid(9)]);
 w=await value('select public.member_wallet_summary() value');assert.deepEqual([w.task_points,w.stored_points],[0,997-100-200]);
 console.log('PASS member AI points: stored-only conversion, 4-decimal truncation, whole-point convert back, cap, idempotent charge, auto top-up, service-only charge, task-first exchange');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
