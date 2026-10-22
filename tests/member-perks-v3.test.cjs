// 會員任務 v3（點數校準）：在隔離 PGlite 套用完整既有鏈＋v2，再套用 v3 驗證點數、上限與學習任務。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;
  create table public.watchlist(id bigserial primary key,user_id uuid not null,code text not null);`);
// member-vip-read-access.sql 依賴管理員研究表，隔離環境略過；它與 exchange-v2 第 1 步同樣開通 hottopics／selltrack。
 for(const f of ['member-services.sql','member-services-supplement.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql','member-task-wallet.sql','member-perks-exchange-v2.sql','member-perks-tasks-v2.sql','member-perks-tasks-v3-points.sql'])
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',f),'utf8').replace(/^﻿/,''));
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,admin=()=>db.exec('reset role');
 const as=async n=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const claim=id=>value('select public.claim_member_task($1) value',[id]),wallet=async()=>(await value('select public.member_wallet_summary() value')).task_points,status=()=>value('select public.member_task_status() value');
 const birth=new Date(Date.now()+8*3600e3).toISOString().slice(5,7);
 await db.query(`insert into auth.users(id,email,email_confirmed_at,created_at,raw_user_meta_data) values
  ($1,'a@t',now(),now()-interval '400 days',jsonb_build_object('display_name','Justy','member_preferences',jsonb_build_object('mail',true),'birth_date','1997-'||$3||'-28')),
  ($2,'b@t',null,now(),'{}')`,[uid(1),uid(2),birth]);

 await admin();
 assert.equal((await db.query("select count(*)::int n from public.member_task_definitions where active")).rows[0].n,0,'all tasks stay inactive');
 const pts=Object.fromEntries((await db.query("select id,points from public.member_task_definitions")).rows.map(r=>[r.id,r.points]));
 assert.deepEqual(['daily-market-v1','daily-screen-v1','daily-check-v1','daily-learn-v1','weekly-notes-v1','weekly-learn-v1','learning10-v1','challenge4-v1'].map(k=>pts[k]),[10,5,5,5,30,30,50,100]);
 assert.equal((await db.query("select title from public.member_task_definitions where id='weekly-learn-v1'")).rows[0].title,'完成本週學習挑戰');
 // 套用兩次也安全
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/member-perks-tasks-v3-points.sql'),'utf8'));
 await db.exec(`update public.member_task_definitions set active=true;`);
 await as(1);
 // 每日上限 20：10＋5＋5 後第四項被擋
 assert.equal((await claim('daily-market-v1')).points,10);assert.equal((await claim('daily-screen-v1')).points,5);assert.equal((await claim('daily-check-v1')).points,5);
 await assert.rejects(claim('daily-learn-v1'),/LIMIT|CAP|上限/i);
 // 每週上限 100：30＋20＋20＋20＋...，第六項被擋；學習挑戰不占上限
 for(const t of ['weekly-notes-v1','weekly-summary-v1','weekly-screen-v1','weekly-screen-review-v1'])assert.ok((await claim(t)).points>0);
 await assert.rejects(claim('weekly-plan-v1'),/LIMIT|CAP|上限/i);
 assert.equal((await claim('weekly-learn-v1')).points,30);
 assert.equal((await claim('learning10-v1')).points,50);
 const st=await status();assert.equal(st.caps.daily_research.limit,20);assert.equal(st.caps.weekly_research.limit,100);assert.equal(st.caps.weekly_research.used,90);
 console.log('PASS member perks v3: recalibrated points, caps 20/100, uncapped weekly challenge, learning milestones, idempotent');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
