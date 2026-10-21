// 會員任務 v2＋兌換商品 v2：在隔離 PGlite 套用完整既有鏈，再套用兩份 v2 SQL 驗證。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;
  create table public.watchlist(id bigserial primary key,user_id uuid not null,code text not null);`);
// member-vip-read-access.sql 依賴管理員研究表，隔離環境略過；它與 exchange-v2 第 1 步同樣開通 hottopics／selltrack。
 for(const f of ['member-services.sql','member-services-supplement.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql','member-task-wallet.sql','member-perks-exchange-v2.sql','member-perks-tasks-v2.sql'])
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',f),'utf8').replace(/^﻿/,''));
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,admin=()=>db.exec('reset role');
 const as=async n=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const claim=id=>value('select public.claim_member_task($1) value',[id]),wallet=async()=>(await value('select public.member_wallet_summary() value')).task_points,status=()=>value('select public.member_task_status() value');
 const birth=new Date(Date.now()+8*3600e3).toISOString().slice(5,7);
 await db.query(`insert into auth.users(id,email,email_confirmed_at,created_at,raw_user_meta_data) values
  ($1,'a@t',now(),now()-interval '400 days',jsonb_build_object('display_name','Justy','member_preferences',jsonb_build_object('mail',true),'birth_date','1997-'||$3||'-28')),
  ($2,'b@t',null,now(),'{}')`,[uid(1),uid(2),birth]);

 // 套用後：新任務與兌換全部關閉、目錄四項工具可由券開通
 await admin();
 assert.equal((await db.query("select count(*)::int n from public.member_task_definitions where active")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from public.member_exchange_definitions where active")).rows[0].n,0);
 assert.deepEqual((await db.query("select feature from public.member_feature_catalog where voucher_enabled order by feature")).rows.map(r=>r.feature),['breadth','fhedge','hottopics','selltrack']);
 assert.deepEqual((await db.query("select id,points,duration_days from public.member_exchange_definitions order by points,id")).rows.map(r=>r.id+':'+r.points+':'+r.duration_days),
  ['choice-3d-v1:150:3','advanced-3d-v1:250:3','observation-3d-v1:250:3','research-3d-v1:250:3','vip-3d-v1:500:3','vip-7d-v1:1000:7','vip-30d-v1:3500:30']);
 await as(1);await assert.rejects(claim('daily-screen-v1'),/MEMBER_TASK_UNAVAILABLE/);

 // 開放（不含審核、影片），並開放券與兌換
 await admin();await db.exec(`update public.member_task_definitions set active=true;update public.member_voucher_definitions set active=true;update public.member_exchange_definitions set active=true;`);

 // 一次性：伺服器 verifier
 await as(1);
 assert.equal((await claim('name-v1')).points,20);assert.equal((await claim('name-v1')).duplicate,true);
 assert.equal((await claim('preferences-v1')).points,10);
 await assert.rejects(claim('watch-v1'),/MEMBER_TASK_INCOMPLETE/);
 await admin();await db.query("insert into public.watchlist(user_id,code) values($1,'2330')",[uid(1)]);await as(1);
 assert.equal((await claim('watch-v1')).points,30);
 assert.equal((await claim('verify-contact-v1')).points,20);
 await as(2);await assert.rejects(claim('name-v1'),/MEMBER_TASK_INCOMPLETE/);await assert.rejects(claim('verify-contact-v1'),/MEMBER_TASK_INCOMPLETE/);

 // 每日：期間唯一＋每日 30 點上限
 await as(1);
 for(const id of ['daily-market-v1','daily-screen-v1','daily-check-v1'])assert.equal((await claim(id)).duplicate,false); // 10+5+10=25
 assert.equal((await claim('daily-screen-v1')).duplicate,true,'same day returns original');
 assert.equal((await claim('daily-learn-v1')).points,5); // 30
 await assert.rejects(claim('daily-risk-v1'),/MEMBER_TASK_LIMIT_REACHED/);
 let s=await status();assert.equal(s.caps.daily_research.used,30);assert.equal(s.caps.daily_research.limit,30);
 assert.equal(s.rows.find(r=>r.id==='daily-screen-v1').claimed,true);assert.equal(s.rows.find(r=>r.id==='daily-risk-v1').claimed,false);
 // 換日：改寫舊領取紀錄的期間鍵模擬昨天，今天可再領
 await admin();const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);await db.query(`update public.member_task_claims set period_key='2000-01-01' where task_id like 'daily-%'`);await db.query(`update public.member_point_ledger set source_event_key=replace(source_event_key,$1,'2000-01-01') where source_event_key like '%:daily-%'`,[today]);await as(1);
 assert.equal((await claim('daily-screen-v1')).duplicate,false,'new day can claim again');

 // 每週上限 150
 for(const id of ['weekly-notes-v1','weekly-summary-v1','weekly-screen-v1'])await claim(id); // 60+40+30=130
 await assert.rejects(claim('weekly-learn-v1'),/MEMBER_TASK_LIMIT_REACHED/); // 130+30>150

 // 審核制：會員不能自領；管理端（service role）發點可冪等
 await assert.rejects(claim('feedback-v1'),/MEMBER_TASK_REVIEW_ONLY/);
 await admin();await db.exec('set role service_role');
 const award=await value("select public.admin_award_member_task($1,'feedback-v1',120,'修正題材顯示錯誤','ticket-42') value",[uid(1)]);
 assert.equal(award.points,120);assert.equal((await value("select public.admin_award_member_task($1,'feedback-v1',120,'修正題材顯示錯誤','ticket-42') value",[uid(1)])).duplicate,true);
 await as(1);await assert.rejects(value("select public.admin_award_member_task($1,'feedback-v1',999,'x','y') value",[uid(1)]));

 // 生日（本月）＋附贈研究券；週年（註冊滿一年）
 const b=await claim('birthday-v1');assert.equal(b.points,100);assert.ok(b.reward_id,'birthday voucher issued');
 assert.equal((await claim('birthday-v1')).duplicate,true,'once per year');
 assert.equal((await claim('anniversary-v1')).points,200);
 await as(2);await assert.rejects(claim('anniversary-v1'),/MEMBER_TASK_INCOMPLETE/);await assert.rejects(claim('birthday-v1'),/MEMBER_TASK_INCOMPLETE/);

 // 獎勵影片：每日 3 支（15 點）
 await as(1);for(let n=0;n<3;n++)assert.equal((await claim('ad-video-v1')).points,5);
 await assert.rejects(claim('ad-video-v1'),/MEMBER_TASK_LIMIT_REACHED/);
 s=await status();assert.equal(s.caps.daily_video.used,15);assert.equal(s.rows.find(r=>r.id==='ad-video-v1').claimed,true);

 // 兌換：全工具通行券 7 天＝四項工具；點數正確扣除
 await admin();await db.query("insert into public.member_point_ledger(user_id,description,points,source_event_key) values($1,'測試加點',1000,'test-grant-1')",[uid(1)]);await as(1);
 const before=await wallet();assert.ok(before>=1000);
 const ex=await value('select public.exchange_member_points($1,$2) value',['vip-7d-v1',uid(900)]);assert.equal(ex.points,1000);
 assert.equal(await wallet(),before-1000);
 const v=(await value('select public.member_usage_vouchers() value')).rows.find(r=>r.id===ex.reward_id);
 assert.equal(v.duration_days,7);assert.deepEqual([...v.allowed_features].sort(),['breadth','fhedge','hottopics','selltrack']);
 await assert.rejects(value('select public.exchange_member_points($1,$2) value',['vip-30d-v1',uid(901)]),/MEMBER_POINTS_INSUFFICIENT/);
 assert.equal(await wallet(),before-1000,'failed exchange keeps points');

 // 隔離：B 看不到 A 的點數／領取紀錄；會員不能直接寫 ledger 或 claims；匿名全拒
 await as(2);assert.equal(await wallet(),0);await assert.rejects(db.query('select * from public.member_task_claims'));
 await assert.rejects(db.query("insert into public.member_point_ledger(user_id,description,points,source_event_key) values($1,'x',99,'x-1')",[uid(2)]));
 await admin();await db.exec('set role anon');await assert.rejects(status());await assert.rejects(claim('daily-screen-v1'));
 console.log('PASS v2: inactive on apply, server verifiers, daily/weekly caps, period-unique idempotent claims, new-day reset, admin-only review awards, birthday voucher, anniversary, 3 ad videos per day, 7-day all-tools exchange with 4 features, isolation and anon denial.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
