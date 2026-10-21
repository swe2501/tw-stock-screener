// Real isolated PostgreSQL. Never connects to Supabase or reads member secrets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;`);
 for(const file of ['member-services.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',file),'utf8').replace(/^\uFEFF/,''));
 await db.exec("create table public.broker_sell_alerts(id integer primary key);alter table public.broker_sell_alerts enable row level security;insert into public.broker_sell_alerts values(1);create table public.broker_rankings(id integer);alter table public.broker_rankings enable row level security;grant select on public.broker_rankings to authenticated;insert into public.broker_rankings values(1);");
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
 const admin=()=>db.exec('reset role'),as=async n=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const issue=async(n,type,event)=>{await admin();return value('select public._member_issue_voucher($1,$2,7,$3) value',[uid(n),type,event]);};
 const activate=(id,features=[])=>value('select public.activate_member_voucher($1,$2) value',[id,features]);
 const access=()=>value('select public.member_feature_access() value');
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[uid(1),'one@example.test',uid(2),'two@example.test']);
 await assert.rejects(issue(1,'vip-v1','inactive-vip'),/MEMBER_VOUCHER_UNAVAILABLE/);
 await admin();await db.exec("update public.member_voucher_definitions set active=true where id in ('vip-v1','choice-v1','observation-v1');insert into public.member_feature_catalog values('admin','管理員','admin',false,true)");
 await assert.rejects(issue(1,'vip-v1','vip-before-rls'),/MEMBER_VIP_NOT_READY/);
 await admin();await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database/member-vip-read-access.sql'),'utf8'));
 await assert.rejects(db.exec("insert into public.member_feature_catalog values('sig','主力訊號','sig',true,true)"));
 await assert.rejects(db.exec("insert into public.member_feature_catalog values('brank','分點回測','brank',true,true)"));
 await assert.rejects(db.exec("insert into public.member_feature_catalog values('mingdeng','神燈與冥燈','mingdeng',true,true)"));
 const choice=await issue(1,'choice-v1','event-choice-001');assert.equal(await issue(1,'choice-v1','event-choice-001'),choice);
 await as(1);assert.deepEqual((await access()).features,{});
 const wallet=await value('select public.member_usage_vouchers() value');assert.equal(wallet.rows[0].selection_count,1);assert.equal(wallet.rows[0].tier,'choice');assert.equal(wallet.feature_catalog.length,4);
 for(const choices of [[],['fhedge','breadth'],['fhedge','fhedge'],['admin'],[null],null])await assert.rejects(activate(choice,choices),/MEMBER_SELECTION_INVALID/);
 await assert.rejects(db.query('select public.claim_member_reward($1)',[choice]),/MEMBER_SELECTION_INVALID/);
 await as(2);assert.equal((await value('select public.member_usage_vouchers() value')).rows.length,0);await assert.rejects(activate(choice,['fhedge']),/MEMBER_REWARD_NOT_FOUND/);
 // Exercise trusted issuer denial directly under member role.
 await as(1);await assert.rejects(value('select public._member_issue_voucher($1,$2,7,$3) value',[uid(1),'vip-v1','browser-issue']));
 const started=await activate(choice,['fhedge']);assert.equal(started.duplicate,false);assert.deepEqual(started.features,['fhedge']);assert.equal(Date.parse(started.expires_at)-Date.parse(started.starts_at),7*86400000);
 const retry=await activate(choice,['breadth']);assert.equal(retry.duplicate,true);assert.deepEqual(retry.features,['fhedge']);assert.equal(retry.expires_at,started.expires_at);
 assert.deepEqual(Object.keys((await access()).features),['fhedge']);
 const share=await value('select public.member_share_unlock() value');assert.ok(share.feature_access.fhedge);assert.equal(share.feature_access.breadth,undefined);
 await assert.rejects(db.exec("update public.member_rewards set selected_features=array['admin']"));
 const vip=await issue(2,'vip-v1','event-vip-001');
 await admin();await db.exec("insert into public.member_feature_catalog values('futuretool','未來工具','futuretool',true,true)");
 await as(2);const vipUsed=await activate(vip);assert.deepEqual(vipUsed.features,['breadth','fhedge','hottopics','selltrack']);assert.equal((await access()).tier,'vip');assert.equal((await access()).features.admin,undefined);assert.equal((await access()).features.futuretool,undefined,'new catalog entries do not silently widen issued VIPs');
 assert.equal((await db.query('select * from public.broker_sell_alerts')).rows.length,1);assert.equal((await db.query('select * from public.broker_rankings')).rows.length,0,'VIP cannot read admin-only broker rankings');await assert.rejects(db.exec('delete from public.broker_sell_alerts'));
 // Changing an inactive definition does not change already-issued terms.
 const fixed=await issue(1,'observation-v1','event-observe-001');await admin();await db.exec("update public.member_voucher_definitions set allowed_features=array['futuretool'],version=2 where id='observation-v1'");
 await as(1);assert.deepEqual((await activate(fixed)).features,['fhedge','breadth']);
 const expired=await issue(1,'choice-v1','event-expired-001');await admin();await db.query("update public.member_rewards set activation_deadline=now()-interval '1 second' where id=$1",[expired]);await as(1);await assert.rejects(activate(expired,['breadth']),/MEMBER_REWARD_EXPIRED/);
 // Confirmed invitation product: three verified invitees deliver a READY VIP 7-day voucher.
 await admin();await db.exec("update public.member_share_campaign set active=true,require_phone=false,starts_at=now()-interval '1 day'");
 for(let n=3;n<=5;n++)await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),`invite${n}@example.test`]);
 await as(1);const code=(await value('select public.ensure_member_referral_code() value')).code;
 for(let n=3;n<=5;n++){await as(n);await db.query('select public.bind_member_referral($1)',[code]);}
 await as(1);await value('select public.member_share_unlock() value');
 const earned=(await db.query("select * from public.member_rewards where source_event_key like '%:round:%'")).rows;
 assert.equal(earned.length,1);assert.equal(earned[0].voucher_tier,'vip');assert.equal(earned[0].duration_days,7);assert.equal(earned[0].status,'ready');assert.ok(earned[0].allowed_features.every(f=>!['sig','brank','mingdeng'].includes(f)));
 await value('select public.member_share_unlock() value');assert.equal((await db.query("select * from public.member_rewards where source_event_key like '%:round:%'")).rows.length,1);
 // Re-submit the invite after verification and re-read progress: this is still the same invitation, not another reward event.
 for(let repeat=0;repeat<3;repeat++){await as(3);await db.query('select public.bind_member_referral($1)',[code]);await as(1);const progress=await value('select public.member_share_unlock() value');assert.equal(progress.confirmed_count,3);assert.equal(progress.rewarded_groups,1);}
 assert.equal((await db.query("select * from public.member_rewards where source_event_key like '%:round:%'")).rows.length,1,'signup, verification and supplemental binding must not deliver multiple referral vouchers');

 await admin();await db.exec("update public.member_entitlements set starts_at=now()-interval '9 days',expires_at=now()-interval '2 days'");await as(1);assert.deepEqual((await access()).features,{});assert.equal((await access()).tier,null);
 await admin();await db.exec('set role anon');await assert.rejects(access());await assert.rejects(activate(choice,['breadth']));
 console.log('PASS typed voucher snapshots, exact one selection, own-account RLS, issuer denial, inactive definitions, VIP admin exclusion, immutable retries, full duration, expiry and per-feature access.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
