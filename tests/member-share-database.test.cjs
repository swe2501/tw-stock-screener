// Real PostgreSQL in memory; never connects to the website or Supabase.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to public;grant execute on function auth.uid() to public;`);
  for(const file of ['member-services.sql','member-share-unlock.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',file),'utf8'));
  const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,A=id(1),B=id(2);
  const admin=()=>db.exec('reset role');
  const as=async uid=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
  const call=async(claim=false,confirmed=false)=>(await db.query('select public.member_share_unlock($1,$2) value',[claim,confirmed])).rows[0].value;
  const denied=async(sql,args=[],pattern)=>assert.rejects(db.query(sql,args),pattern);
  const user=async(n,{phone=true,email=true,joined=null,number=null}={})=>{await admin();await db.query(`insert into auth.users(id,email,phone,email_confirmed_at,phone_confirmed_at,created_at)
   values($1,$2,$3,case when $4 then now() end,case when $5 then now() end,coalesce($6::timestamptz,now()))`,[id(n),`member${n}@example.test`,number||`88691234${String(n).padStart(4,'0')}`,email,phone,joined]);};
  await user(1,{phone:false});await user(2);
  await as(A);let s=await call();const code=s.code;
  assert.equal(s.campaign_active,false);assert.equal(s.verified,false);assert.equal(s.has_access,false);
  await denied('select public.member_share_unlock(true,true)',[],/MEMBER_SHARE_PAUSED/);
  await denied('update public.member_share_campaign set active=true');
  await denied("select public._member_share_grant($1,'forged',999,'forged')",[A]);
  await denied("insert into public.member_entitlements(user_id,feature,starts_at,expires_at,reward_id) values($1,'research_tools',now(),now()+interval '999 days',gen_random_uuid())",[A]);
  await admin();await db.exec("update public.member_share_campaign set active=true");
  await as(A);await denied('select public.member_share_unlock(true,true)',[],/MEMBER_VERIFY_REQUIRED/);
  await denied('select public.member_share_unlock(true,false)',[],/MEMBER_INPUT_INVALID/);
  await admin();await db.query('update auth.users set phone_confirmed_at=now() where id=$1',[A]);
  await as(A);s=await call(true,true);
  assert.equal(s.trial_claimed,true);assert.equal(s.has_access,true);
  assert.ok(Math.abs(Date.parse(s.expires_at)-Date.parse(s.server_time)-3*86400000)<2000);
  const end3=s.expires_at;assert.equal((await call(true,true)).expires_at,end3);
  // Repeated retries and two callers re-entering the same transaction cannot add days.
  await db.exec('begin');await call(true,true);await call(true,true);await db.exec('commit');
  assert.equal((await call()).expires_at,end3);
  await denied('select public.bind_member_referral($1)',[code],/MEMBER_SELF_REFERRAL/);
  await as(B);await db.query('select public.bind_member_referral($1)',[code]);
  const bind=async n=>{await as(id(n));await db.query('select public.bind_member_referral($1)',[code]);};
  await as(A);assert.equal((await call()).confirmed_count,1);
  assert.equal((await call()).rewarded_groups,0);
  await user(3);await bind(3);await as(A);assert.equal((await call()).confirmed_count,2);
  await user(4);await bind(4);await as(A);s=await call();
  assert.equal(s.confirmed_count,3);assert.equal(s.rewarded_groups,1);
  assert.ok(Math.abs(Date.parse(s.expires_at)-Date.parse(end3)-7*86400000)<1000);
  const end10=s.expires_at;assert.equal((await call()).expires_at,end10);
  // Already registered accounts and late referral binding cannot earn new-signup rewards.
  await user(5,{joined:'2020-01-01T00:00:00Z'});await bind(5);
  await user(6,{joined:new Date(Date.now()-8*86400000).toISOString()});await bind(6);
  await as(A);assert.equal((await call()).confirmed_count,3);
  // Email verification alone does not qualify under the default phone requirement.
  await user(7,{phone:false});await bind(7);await as(A);assert.equal((await call()).confirmed_count,3);
  await admin();await db.query('update auth.users set phone_confirmed_at=now() where id=$1',[id(7)]);
  await as(A);assert.equal((await call()).confirmed_count,4);
  await user(8);await bind(8);await user(9);await bind(9);
  await as(A);s=await call();assert.equal(s.confirmed_count,6);assert.equal(s.rewarded_groups,2);
  assert.ok(Math.abs(Date.parse(s.expires_at)-Date.parse(end10)-7*86400000)<1000);
  // Duplicate verified contact cannot inflate the invitation count.
  await user(10,{number:'886912340009'});await bind(10);await as(A);assert.equal((await call()).confirmed_count,6);
  await as(B);const other=await call();assert.equal(other.trial_claimed,false);assert.equal(other.has_access,false);
  assert.equal((await db.query('select * from public.member_entitlements')).rows.length,0);
  await denied('select public.bind_member_referral($1)',[other.code],/MEMBER_SELF_REFERRAL/);
  await as(id(3));await denied('select public.bind_member_referral($1)',[other.code],/MEMBER_REFERRAL_BOUND/);
  await admin();assert.equal((await db.query("select count(*) n from public.member_rewards where user_id=$1",[A])).rows[0].n,3);
  // Pause blocks new awards but preserves already-issued access.
  await db.exec('update public.member_share_campaign set active=false');await as(A);s=await call();assert.equal(s.has_access,true);assert.equal(s.campaign_active,false);
  await denied('select public.member_share_unlock(true,true)',[],/MEMBER_SHARE_PAUSED/);
  // Server time and dates determine expiry; retries never renew an expired trial.
  await admin();await db.query("update public.member_entitlements set starts_at=now()-interval '20 days',expires_at=now()-interval '1 day' where user_id=$1",[A]);
  await db.exec('update public.member_share_campaign set active=true');await as(A);s=await call(true,true);assert.equal(s.has_access,false);assert.equal(s.trial_claimed,true);
  await admin();await db.exec('set role anon');await denied('select public.member_share_unlock()');await denied('select * from public.member_share_campaign');
  console.log('PASS isolated PostgreSQL: inactive rollout, phone verification, trial idempotency, exact three-person rounds, 3+7+7 stacking, new-account window, duplicate contacts, cross-owner RLS, pause/expiry, internal grant and anonymous access denied.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
