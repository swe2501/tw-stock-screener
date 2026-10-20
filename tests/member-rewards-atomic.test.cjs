const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 const bundle=execFileSync(process.env.PYTHON_TEST_RUNTIME||'python',['-c',"import sys;sys.path.insert(0,'scripts');from prepare_member_rewards_migration import assemble;print(assemble())"],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;`);
 for(const f of ['member-services.sql','member-services-supplement.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',f),'utf8').replace(/^\uFEFF/,''));
 await assert.rejects(db.exec(bundle),/MEMBER_VIP_RLS_REVIEW_REQUIRED/);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('public.member_share_campaign') value")).rows[0].value,null,'failed final policy preflight must roll back all earlier migrations');
 await db.exec('create table public.broker_sell_alerts(id integer);alter table public.broker_sell_alerts enable row level security');
 await db.exec(bundle);
 for(const table of ['member_share_campaign','member_voucher_definitions','member_task_definitions','member_exchange_definitions'])assert.equal((await db.query(`select count(*)::int value from public.${table} where active`)).rows[0].value,0,'migration must not activate '+table);
 await assert.rejects(db.exec(bundle),/MEMBER_MIGRATION_ALREADY_PRESENT/);await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int value from public.member_feature_catalog where feature in ('sig','brank','mingdeng') and member_research")).rows[0].value,0);
 console.log('PASS assembled migration: any RLS preflight failure rolls back all schema changes, successful apply keeps every campaign/task/exchange inactive, repeated apply refused.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
