// Isolated PostgreSQL only; never connects to hosted Supabase.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin;
create schema auth; grant usage on schema auth to supabase_auth_admin;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
grant select on auth.sessions to supabase_auth_admin;`);
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const ids=Array.from({length:6},(_,i)=>`33333333-3333-4333-8333-${String(i+1).padStart(12,'0')}`);
await db.query('insert into auth.users values($1),($2)',[A,B]);
// Existing accounts can have old sessions unrelated to today's two browsers.
// This fixture reproduces the rollout failure that the original empty DB missed.
await db.query("insert into auth.sessions(id,user_id,created_at) values ('44444444-4444-4444-8444-444444444441',$1,now()-interval '2 days'),('44444444-4444-4444-8444-444444444442',$1,now()-interval '1 day')",[A]);
await db.exec(fs.readFileSync('docs/database/member-device-limit.sql','utf8'));
assert.equal((await db.query('select count(*)::int n from public.member_device_sessions')).rows[0].n,2);
await db.exec(fs.readFileSync('docs/database/member-device-limit-recovery.sql','utf8'));
async function session(u,s){await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[s,u]);}
async function hook(u,s,sub=u){await db.exec('set role supabase_auth_admin');return (await db.query('select public.member_device_limit_hook($1::jsonb) result',[JSON.stringify({user_id:u,claims:{sub,session_id:s,role:'authenticated',custom:'preserve'}})])).rows[0].result;}
assert.ok((await hook(A,ids[0])).claims,'recovery defaults to disabled and never blocks login');
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int n from public.member_device_sessions')).rows[0].n,2,'disabled check must not reserve a slot');
await db.exec('update public.member_device_limit_control set enabled=true');
await session(A,ids[0]);assert.equal((await hook(A,ids[0])).claims.custom,'preserve');
await session(A,ids[1]);assert.ok((await hook(A,ids[1])).claims);
assert.ok((await hook(A,ids[0])).claims,'refresh/tabs do not consume extra slots');
await session(A,ids[2]);assert.match((await hook(A,ids[2])).error.message,/MEMBER_DEVICE_LIMIT/);
assert.ok((await hook(A,ids[1])).claims,'third login leaves existing session valid');
await session(B,ids[3]);assert.ok((await hook(B,ids[3])).claims,'accounts isolated');
assert.match((await hook(A,ids[0],B)).error.message,/INVALID/);
await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[ids[0]]);
assert.ok((await hook(A,ids[2])).claims,'logout releases a slot');
await db.exec('reset role');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[ids[1]]);
await session(A,ids[4]);assert.ok((await hook(A,ids[4])).claims,'absolute expiration releases a slot');
await session(A,ids[5]);assert.match((await hook(A,ids[5])).error.message,/MEMBER_DEVICE_LIMIT/);
for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from public.member_device_sessions'));await assert.rejects(db.query('update public.member_device_limit_control set enabled=true'));await assert.rejects(db.query("select public.member_device_limit_hook('{}')"));}
console.log('PASS: old-session rollout regression, disabled policy reserves nothing, two slots, refresh reuse, third rejection, account isolation, local logout, expiration, claim preservation, direct access denied');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
