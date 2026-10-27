// 會員任務 v3（點數校準）：在隔離 PGlite 套用完整既有鏈＋v2，再套用 v3 驗證點數、上限與學習任務。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;
  create table public.watchlist(id bigserial primary key,user_id uuid not null,code text not null);`);
// member-vip-read-access.sql 依賴管理員研究表，隔離環境略過；它與 exchange-v2 第 1 步同樣開通 hottopics／selltrack。
 for(const f of ['member-services.sql','member-services-supplement.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql','member-task-wallet.sql','member-perks-exchange-v2.sql','member-perks-tasks-v2.sql','member-perks-tasks-v3-points.sql','member-perks-exchange-v3.sql'])
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
 assert.deepEqual(['daily-market-v1','daily-screen-v1','daily-check-v1','daily-learn-v1','weekly-notes-v1','weekly-learn-v1','learning10-v1','challenge4-v1'].map(k=>pts[k]),[20,10,10,10,60,50,50,100]);
 assert.equal((await db.query("select title from public.member_task_definitions where id='weekly-learn-v1'")).rows[0].title,'完成本週學習挑戰');
 // 套用兩次也安全
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/member-perks-tasks-v3-points.sql'),'utf8'));
 await db.exec(`update public.member_task_definitions set active=true;`);
 await as(1);
 // 每日上限 40：20＋10＋10 後第四項被擋
 assert.equal((await claim('daily-market-v1')).points,20);assert.equal((await claim('daily-screen-v1')).points,10);assert.equal((await claim('daily-check-v1')).points,10);
 await assert.rejects(claim('daily-learn-v1'),/LIMIT|CAP|上限/i);
 // 每週上限 200：60＋40＋40＋40 後第五項被擋；學習挑戰不占上限
 for(const t of ['weekly-notes-v1','weekly-summary-v1','weekly-screen-v1','weekly-screen-review-v1'])assert.ok((await claim(t)).points>0);
 await assert.rejects(claim('weekly-plan-v1'),/LIMIT|CAP|上限/i);
 assert.equal((await claim('weekly-learn-v1')).points,50);
 assert.equal((await claim('learning10-v1')).points,50);
 // 兌換商品 v3 方案重整：現行 8 項（點數依 1 元＝10 點）、退場商品保留但關閉、名稱不含進出場字眼、重跑不變
 await admin();const cur="('vip-1d-v1','choice-7d-v1','research-7d-v1','vip-7d-v1','choice-30d-v1','research-30d-v1','vip-30d-v1','vip-90d-v1')";
 const ex=(await db.query("select id,points,duration_days from public.member_exchange_definitions where id in "+cur+" order by points,id")).rows;
 assert.deepEqual(ex.map(r=>r.id+':'+r.points+':'+r.duration_days),['vip-1d-v1:500:1','choice-7d-v1:1000:7','research-7d-v1:1800:7','vip-7d-v1:2500:7','choice-30d-v1:3800:30','research-30d-v1:6800:30','vip-30d-v1:8800:30','vip-90d-v1:24000:90']);
 assert.equal((await db.query("select count(*)::int n from public.member_exchange_definitions where active or title ~ '進出場|出場'")).rows[0].n,0);
 assert.equal((await db.query("select title from public.member_feature_catalog where feature='selltrack'")).rows[0].title,'持股觀察站');
 assert.deepEqual((await db.query("select allowed_features from public.member_voucher_definitions where id='research-v1'")).rows[0].allowed_features,['fhedge','breadth','hottopics']);
 const ver=(await db.query("select id,version from public.member_voucher_definitions order by id")).rows;
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/member-perks-exchange-v3.sql'),'utf8'));
 assert.deepEqual((await db.query("select id,version from public.member_voucher_definitions order by id")).rows,ver,'re-running does not bump versions');
 await db.exec("update public.member_exchange_definitions set active=true where id in "+cur+";update public.member_voucher_definitions set active=true;");await db.query("insert into public.member_point_ledger(user_id,description,points,source_event_key) values($1,'測試加點',600,'test-grant-v3')",[uid(1)]);await as(1);
 const trial=await value('select public.exchange_member_points($1,$2) value',['vip-1d-v1',uid(700)]);assert.equal(trial.points,500);
 const st=await status();assert.equal(st.caps.daily_research.limit,40);assert.equal(st.caps.weekly_research.limit,200);assert.equal(st.caps.weekly_research.used,180);
 // 連續打卡：只有今天 → 不能領；補齊前 5 天 → 6 天仍不能；補第 7 天 → 可領 100，同一週重領回傳 duplicate
 await assert.rejects(claim('streak7-v1'),/MEMBER_TASK_INCOMPLETE/);
 await admin();const led=(await db.query("select id from public.member_point_ledger where user_id=$1 limit 1",[uid(1)])).rows[0].id;
 const seed=async n=>{for(let g=1;g<=n;g++)await db.query("insert into public.member_task_claims(user_id,task_id,period_key,cap_group,points,ledger_id) values($1,'daily-review-v1',to_char((now() at time zone 'Asia/Taipei')::date-$2::int,'YYYY-MM-DD'),'daily_research',10,$3) on conflict do nothing",[uid(1),g,led]);};
 await seed(5);await as(1);await assert.rejects(claim('streak7-v1'),/MEMBER_TASK_INCOMPLETE/);
 await admin();await seed(6);await as(1);const s7=await claim('streak7-v1');assert.equal(s7.points,50);assert.ok(s7.reward_id,'7-day streak issues a voucher');assert.equal((await claim('streak7-v1')).duplicate,true);
 await assert.rejects(claim('streak15-v1'),/MEMBER_TASK_INCOMPLETE/);await admin();await seed(14);await as(1);const s15=await claim('streak15-v1');assert.equal(s15.points,100);assert.ok(s15.reward_id);
 await assert.rejects(claim('streak30-v1'),/MEMBER_TASK_INCOMPLETE/);
 await admin();await seed(29);await as(1);const s30=await claim('streak30-v1');assert.equal(s30.points,200);
 await admin();const days=(await db.query('select duration_days from public.member_rewards where id = any($1) order by duration_days',[[s7.reward_id,s15.reward_id,s30.reward_id]])).rows.map(r=>r.duration_days);assert.deepEqual(days,[3,7,14],'streak vouchers 3/7/14 days');await as(1);
 const stp=(await status()).rows.find(r=>r.id==='streak30-v1');assert.equal(stp.period,'monthly');assert.equal(stp.claimed,true);
 console.log('PASS member perks v3: sticky points, caps 40/200, 7/15/30-day streaks with vouchers, uncapped weekly challenge, learning milestones, 8 current products (retired kept inactive), one point currency, trial exchange, idempotent');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
