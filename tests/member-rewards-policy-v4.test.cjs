const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const sql=f=>fs.readFileSync(path.join(__dirname,'../docs/database',f),'utf8');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;create table public.watchlist(id bigserial primary key,user_id uuid not null,code text not null);create table public.price_window(code text,trade_date date);insert into public.price_window values('2330',current_date);`);
 for(const f of ['member-services.sql','member-services-supplement.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql','member-task-wallet.sql','member-perks-exchange-v2.sql','member-perks-tasks-v2.sql','member-perks-tasks-v3-points.sql','member-perks-onboarding-v3.sql','member-learning-verification.sql','member-learning-catalog-v1.sql','member-screen-calendar.sql','member-task-work.sql','member-task-bulk-claim.sql','member-rewards-policy-v4.sql'])await db.exec(sql(f));
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
 const admin=()=>db.exec('reset role'),as=async n=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 const val=async(q,args=[])=>(await db.query(q,args)).rows[0].v;
 for(const n of [1,2,3])await db.query(`insert into auth.users(id,raw_user_meta_data) values($1,'{"display_name":"核驗姓名","member_preferences":{"frequency":"off"}}')`,[uid(n)]);
 await db.exec(`insert into public.member_task_definitions(id,title,active,verifier,points,period) values
 ('test-daily','daily',true,'profile_name',20,'daily'),('test-weekly','weekly',true,'profile_name',40,'weekly'),
 ('test-extra','extra',true,'profile_name',5,'daily');
 update public.member_task_definitions set active=true where id='preferences-v1';`);
 const claim=id=>val('select public.claim_member_task($1) v',[id]),status=()=>val('select public.member_task_status() v');
 await as(1);let s=await status();assert.equal(s.rewards_policy_version,4);assert.equal(s.caps.daily_research.limit,60);assert.equal(s.caps.weekly_research.limit,300);
 assert.equal(s.rows.find(t=>t.id==='preferences-v1').global_caps,false);
 await claim('test-daily');await claim('test-weekly');s=await status();assert.equal(s.caps.daily_research.used,60);assert.equal(s.caps.weekly_research.used,60,'weekly/daily groups share the same total');
 await assert.rejects(claim('test-extra'),/MEMBER_TASK_LIMIT_REACHED/);
 assert.equal((await claim('test-daily')).duplicate,true,'retry at cap returns original receipt');
 await claim('preferences-v1');assert.equal((await status()).caps.daily_research.used,60,'one-time onboarding exemption');
 const bulk=await val("select public.claim_completed_member_tasks('99999999-2222-4222-8222-222222222222') v");assert.equal(bulk.awarded_points,0);assert.ok(bulk.capped_count>0,'bulk route cannot bypass the global cap');
 await assert.rejects(val('select public._member_claim_task_pre_rewards_v4($1) v',['test-extra']),/permission denied/);
 await admin();
 // Seed historical real ledger/claim pairs; prior credit counts without being rewritten.
 const seed=async(n,points,when,key)=>db.query(`with l as(insert into public.member_point_ledger(user_id,description,points,source_event_key) values($1,'historical',$2,$3) returning id)
 insert into public.member_task_claims(user_id,task_id,period_key,points,ledger_id,created_at) select $1,'test-extra',$3,$2,id,`+when+` from l`,[uid(n),points,key]);
 await seed(2,300,"date_trunc('week',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'",'week-total');
 await as(2);assert.equal((await status()).caps.weekly_research.used,300);await assert.rejects(claim('test-extra'),/MEMBER_TASK_LIMIT_REACHED/);
 await admin();await seed(3,500,"(date_trunc('week',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei')-interval '1 microsecond'",'before-week');
 await as(3);assert.equal((await status()).caps.weekly_research.used,0,'Monday midnight is the boundary');await claim('test-extra');
 await admin();assert.equal(await val("select points v from public.member_point_ledger where source_event_key='week-total'"),300,'historical ledger unchanged');
 assert.equal(await val("select sum(points) v from public.member_task_definitions where public._member_task_onboarding_v4(id)"),500);
 assert.equal(await val("select count(*) v from public.member_task_definitions where verifier in ('task_streak7','task_streak15','task_streak30') and voucher_definition is not null"),0);
 console.log('PASS rewards v4: combined daily/weekly caps, onboarding exception, replay, bulk enforcement, private wrappers, Monday boundary and preserved ledger.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
