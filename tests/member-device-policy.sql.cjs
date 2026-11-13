// Isolated PostgreSQL: no cloud connection or real member data.
const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;
 create schema auth;create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create table public.admin_settings(key text primary key,value text,updated_at timestamptz);
 create table public.member_tiers(user_id uuid,tier text,expires_at timestamptz);
 create table public.member_plans(plan_code text primary key,tier text,days integer,price_twd integer,label text,active boolean,sandbox_only boolean,commerce_features jsonb);
 create table public.member_subscription_periods(id uuid,user_id uuid,tier text,starts_at timestamptz,expires_at timestamptz,revoked_at timestamptz);
 create table public.member_payment_orders(user_id uuid,period_id uuid,status text,plan_code text);
 grant usage on schema auth to authenticated;`);
 await db.exec(fs.readFileSync('docs/database/member-device-policy.sql','utf8'));
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const ids=Array.from({length:5},(_,i)=>`33333333-3333-4333-8333-${String(i+1).padStart(12,'0')}`);
 await db.query('insert into auth.users values($1),($2)',[user,other]);
 for(const id of ids)await db.query('insert into auth.sessions values($1,$2,null)',[id,user]);
 const config={revision:1,payments_enabled:false,products:['free','observation','research','vip'].map((tier,i)=>({id:tier,tier,device_limit:[1,1,2,3][i]}))};
 await db.query("insert into public.admin_settings values('member_commerce_v1',$1,now())",[JSON.stringify(config)]);
 async function as(id,uid=user){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,session_id:id,role:'authenticated'})]);await db.exec('set role authenticated');}
 async function act(id,operation='claim',target=null){await as(id);return (await db.query('select public.member_device_manage($1,$2,$3) d',[operation,target,'電腦 · Test'])).rows[0].d;}
 let out=await act(ids[0]);assert.equal(out.enabled,false);assert.equal(out.devices.length,0,'disabled must not reserve');
 await db.exec('reset role');await assert.rejects(db.query('select public.admin_member_device_policy(true)'),/DEVICE_GATE_NOT_INSTALLED/);
 await db.exec(fs.readFileSync('docs/database/member-device-gateway.sql','utf8'));
 await db.query('select public.admin_member_device_policy(true)');
 out=await act(ids[0]);assert.equal(out.limit,1);assert.equal(out.allowed,true);
 assert.equal((await act(ids[0])).devices.length,1,'refresh/tabs reuse slot');
 assert.equal((await act(ids[1])).allowed,false,'free second session denied');
 await as(ids[1]);await assert.rejects(db.query('select public.member_device_require()'),/MEMBER_DEVICE_LIMIT/);
 await as(ids[0]);await db.query('select public.member_device_require()');
 await db.exec('reset role');await db.query("insert into public.member_tiers values($1,'observation',null)",[user]);
 assert.equal((await act(ids[1])).allowed,false,'observation stays one');
 await db.exec('reset role');await db.exec("update public.member_tiers set tier='research'");
 assert.equal((await act(ids[1])).allowed,true);assert.equal((await act(ids[2])).allowed,false);
 await db.exec('reset role');await db.exec("update public.member_tiers set tier='vip'");
 assert.equal((await act(ids[2])).allowed,true);assert.equal((await act(ids[3])).allowed,false);
 await act(ids[3],'takeover');assert.equal((await act(ids[3],'status')).allowed,true);
 assert.equal((await act(ids[0])).allowed,false,'revoked session cannot silently reclaim');
 await as(ids[0]);await assert.rejects(db.query('select public.member_device_require()'),/MEMBER_DEVICE_LIMIT/);
 await db.exec('reset role');await db.query("update public.member_device_leases set seen_at=now()-interval '6 minutes' where session_id=$1",[ids[3]]);
 assert.equal((await act(ids[4])).allowed,true,'idle slot released');
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[ids[4]]);
 await as(ids[4]);await assert.rejects(db.query('select public.member_device_manage()'),/MEMBER_SESSION_INVALID/);
 // Other account cannot list or revoke the owner's leases.
 await db.exec('reset role');await db.query('insert into auth.sessions values($1,$2,null)',[ids[4],other]);
 await as(ids[4],other);out=(await db.query('select public.member_device_manage($1,$2) d',['revoke',ids[3]])).rows[0].d;assert.equal(out.devices.length,0);
 await assert.rejects(db.query('select * from public.member_device_leases'));
 await assert.rejects(db.query('select public.member_device_cap($1)',[user]));
 await assert.rejects(db.query('select public.admin_member_device_policy(false)'));
 // Real paid period snapshot survives a product edit and delisting.
 await db.exec('reset role');await db.exec('delete from public.member_tiers');
 const period='44444444-4444-4444-8444-444444444444';
 await db.query("insert into public.member_plans(plan_code,tier,device_limit) values('paid','research',2)");
 await db.query("insert into public.member_subscription_periods values($1,$2,'research',now()-interval '1 day',now()+interval '1 day',null)",[period,user]);
 await db.query("insert into public.member_payment_orders values($1,$2,'paid','paid')",[user,period]);
 config.products[2].device_limit=1;config.products[2].active=false;
 await db.query("update public.admin_settings set value=$1",[JSON.stringify(config)]);
 assert.equal((await db.query('select public.member_device_cap($1) n',[user])).rows[0].n,2);
 await db.exec("update public.member_subscription_periods set expires_at=now()-interval '1 second'");
 assert.equal((await db.query('select public.member_device_cap($1) n',[user])).rows[0].n,1);

 // Saving a different device count creates a new paid snapshot, preserving old terms.
 const product={id:'research',tier:'research',device_limit:2,days:30,price_twd:680,name:'趨勢研究員',sandbox_only:true,features:[]};
 let saved=(await db.query('select public.admin_member_commerce_save($1,1) d',[JSON.stringify({payments_enabled:false,products:[product]})])).rows[0].d;
 const oldCode=saved.products[0].plan_code;product.device_limit=3;
 saved=(await db.query('select public.admin_member_commerce_save($1,2) d',[JSON.stringify({payments_enabled:false,products:[product]})])).rows[0].d;
 assert.notEqual(saved.products[0].plan_code,oldCode);
 assert.equal((await db.query('select device_limit n from public.member_plans where plan_code=$1',[oldCode])).rows[0].n,2);
 assert.equal((await db.query('select device_limit n from public.member_plans where plan_code=$1',[saved.products[0].plan_code])).rows[0].n,3);
 const newCode=saved.products[0].plan_code;delete product.device_limit;
 saved=(await db.query('select public.admin_member_commerce_save($1,3) d',[JSON.stringify({payments_enabled:false,products:[product]})])).rows[0].d;
 assert.equal(saved.products[0].device_limit,3,'older API retains customized count');
 assert.equal(saved.products[0].plan_code,newCode,'older API does not silently change purchased terms');
 for(const role of ['anon','service_role']){
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role})]);
  await db.exec('set role '+role);await db.query('select public.member_device_pre_request()');await db.exec('reset role');
 }
 // The Data API gate is read-only and does not need heartbeat writes on GET.
 await as(ids[4],other);await db.exec('begin read only');
 await db.query("select set_config('request.path','/rpc/member_device_manage',true)");
 await db.query('select public.member_device_pre_request()');await db.exec('rollback');

 // Storage is a separate API: restrictive policy preserves owner checks and closes bypass.
 await db.exec('reset role;create schema storage;grant usage on schema storage to authenticated;create table storage.objects(id text,bucket_id text,owner uuid);alter table storage.objects enable row level security;grant select on storage.objects to authenticated;create policy own_storage on storage.objects for select to authenticated using(owner=auth.uid())');
 await db.exec(fs.readFileSync('docs/database/member-device-storage.sql','utf8'));
 await db.query("insert into storage.objects values('private-image','member-trade-images',$1)",[other]);
 const storageSession='55555555-5555-4555-8555-555555555555';await db.query('insert into auth.sessions values($1,$2,null)',[storageSession,other]);
 await as(storageSession,other);await db.query("select public.member_device_manage('claim')");
 assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 await db.query("select public.member_device_manage('release')");
 await assert.rejects(db.query('select * from storage.objects'),/MEMBER_DEVICE_LIMIT/);
 await db.exec('reset role');await db.query('select public.admin_member_device_policy(false)');
 await as(storageSession,other);assert.equal((await db.query('select * from storage.objects')).rows.length,1,'disabled still respects original ownership policy');
 await as(ids[0],user);assert.equal((await db.query('select * from storage.objects')).rows.length,0,'ownership boundary preserved');

 // Chief account ID alone grants unlimited slots; revocation still works.
 await db.exec('reset role');await db.query('select public.admin_member_device_policy(true)');
 const chief='93f16c68-d103-4092-b938-93e34012d3c1';await db.query('insert into auth.users values($1)',[chief]);
 const chiefSessions=Array.from({length:12},(_,i)=>`66666666-6666-4666-8666-${String(i+1).padStart(12,'0')}`);
 for(const id of chiefSessions){await db.exec('reset role');await db.query('insert into auth.sessions values($1,$2,null)',[id,chief]);await as(id,chief);const d=(await db.query("select public.member_device_manage('claim') d")).rows[0].d;assert.equal(d.unlimited,true);assert.equal(d.allowed,true);assert.equal(d.limit,0);}
 assert.equal((await db.query("select public.member_device_manage('list') d")).rows[0].d.devices.length,12);
 await db.query("select public.member_device_manage('revoke',$1)",[chiefSessions[0]]);
 await as(chiefSessions[0],chief);await assert.rejects(db.query('select public.member_device_require()'),/MEMBER_DEVICE_LIMIT/);
 await as(storageSession,other);const regular=(await db.query("select public.member_device_manage('status') d")).rows[0].d;assert.equal(regular.limit,1);assert.equal(regular.unlimited,false);
 console.log('PASS device policy: 1/1/2/3, disabled rollout, slot reuse, denial, takeover, revoked JWT, idle expiry, Auth expiry, owner isolation, privileges, paid snapshot and expiry; chief 12 unlimited sessions with revocation.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

