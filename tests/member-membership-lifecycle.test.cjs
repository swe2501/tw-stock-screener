// Isolated PostgreSQL. No production credentials, writes or network requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to public;grant execute on function auth.uid() to public;`);
 for(const file of ['member-services.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',file),'utf8').replace(/^\uFEFF/,''));
 await db.exec(`create table public.member_tiers(user_id uuid primary key references auth.users(id),tier text not null,set_by text,set_at timestamptz default now());`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/member-membership-lifecycle.sql'),'utf8'));
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
 const admin=()=>db.exec('reset role'),as=async(n,role='authenticated')=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const status=async()=>(await db.query('select public.member_membership_status() value')).rows[0].value;
 for(const n of [1,2])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),n+'@test.invalid']);
 await as(1);assert.equal((await status()).tier,'free');
 await assert.rejects(db.query("insert into public.member_subscription_periods(user_id,tier,provider,external_period_id,starts_at,expires_at) values($1,'vip','test','fake',now(),now()+interval '1 day')",[uid(1)]),/permission denied/);
 await as(null,'anon');await assert.rejects(status(),/permission denied/);
 await as(null);await assert.rejects(status(),/MEMBER_VERIFY_REQUIRED/);
 await admin();await db.query("insert into public.member_subscription_periods(user_id,tier,provider,external_period_id,starts_at,expires_at) values($1,'vip','test','paid1',now()-interval '1 day',now()+interval '1 day')",[uid(1)]);
 await as(1);assert.equal((await status()).tier,'vip');assert.equal((await status()).source,'subscription');
 await as(2);assert.equal((await status()).tier,'free','no other member subscription disclosed');
 await admin();await db.exec("update public.member_subscription_periods set expires_at=now()-interval '1 second'");
 await as(1);assert.equal((await status()).tier,'free','expired period downgrades without deleting records or a job');
 await admin();await db.exec("update public.member_subscription_periods set expires_at=now()+interval '1 day',revoked_at=now()");
 await as(1);assert.equal((await status()).tier,'free','revoked periods do not grant access');
 await admin();await db.exec("update public.member_subscription_periods set starts_at=now()+interval '1 day',expires_at=now()+interval '2 days',revoked_at=null");
 await as(1);assert.equal((await status()).tier,'free','future renewal does not start early');
 await admin();await db.query("insert into public.member_tiers(user_id,tier) values($1,'research')",[uid(1)]);
 await as(1);assert.equal((await status()).tier,'research','explicit permanent legacy grants preserved');assert.equal((await status()).expires_at,null);
 await admin();await db.exec("update public.member_tiers set expires_at=now()-interval '1 second'");
 await as(1);assert.equal((await status()).tier,'free');
 // A valid claimed points/share voucher is evaluated using the existing access RPC.
 await admin();await db.exec("update public.member_voucher_definitions set active=true where id='observation-v1'");
 const voucher=(await db.query("select public._member_issue_voucher($1,'observation-v1',7,'lifecycle-test') id",[uid(1)])).rows[0].id;
 await as(1);await db.query('select public.activate_member_voucher($1,array[]::text[])',[voucher]);assert.equal((await status()).tier,'observation');assert.equal((await status()).source,'voucher');
 await admin();await db.query("update public.member_tiers set expires_at=null,tier='vip' where user_id=$1",[uid(1)]);
 await as(1);assert.equal((await status()).tier,'vip','highest still-valid grant wins');
 // Equality boundary within one transaction, using PostgreSQL's transaction clock.
 await admin();await db.exec('begin');await db.exec("update public.member_tiers set expires_at=now();update public.member_entitlements set expires_at=now();update public.member_subscription_periods set starts_at=now()-interval '1 day',expires_at=now(),revoked_at=null;");
 await as(1);assert.equal((await status()).tier,'free','expires_at is exclusive');await admin();await db.exec('commit');
 assert.equal((await db.query('select count(*) n from public.member_rewards')).rows[0].n,1,'reward history retained');
 assert.equal((await db.query('select count(*) n from public.member_subscription_periods')).rows[0].n,1,'subscription history retained');
 console.log('PASS membership lifecycle: expiry/equality, future periods, revocation, overlapping grants, voucher compatibility, legacy preservation and denied client writes.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
