const {PGlite}=require(process.env.PGLITE_MODULE),fs=require('node:fs'),a=require('node:assert/strict');
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('11111111-1111-1111-1111-111111111111');");
 await db.exec(fs.readFileSync('docs/database/member-recurring-billing.sql','utf8'));
 a.equal((await db.query("select relrowsecurity from pg_class where relname='member_billing_contracts'")).rows[0].relrowsecurity,true);
 for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])a.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'member_billing_contracts',privilege])).rows[0].allowed,false);
 await a.rejects(db.exec("insert into member_billing_contracts(user_id,status,plan_snapshot,is_test) values('11111111-1111-1111-1111-111111111111','active','{}',false)"));
 const insert="insert into member_billing_contracts(user_id,status,plan_snapshot,is_test,provider,provider_subscription_id,current_period_start,current_period_end) values('11111111-1111-1111-1111-111111111111','active','{}',false,'fixture',$1,'2027-01-01','2027-02-01') returning id";
 const id=(await db.query(insert,['sub1'])).rows[0].id;
 await a.rejects(db.query(insert,['sub2']));
 await db.query("insert into member_billing_events(contract_id,provider_event_id,event_type,amount_twd) values($1,'event1','confirmed',380)",[id]);
 await a.rejects(db.query("insert into member_billing_events(contract_id,provider_event_id,event_type,amount_twd) values($1,'event1','confirmed',380)",[id]));
 console.log('PASS: prepared billing SQL, RLS, browser denies, real contract requires complete period/provider, one live contract, duplicate event rejected.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
