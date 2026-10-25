const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;insert into auth.users values('11111111-1111-4111-8111-111111111111');create table public.price_window(trade_date date);create table public.taiex_daily(trade_date date);`);
for(const f of ['member-screen-calendar.sql','member-screen-latest-market.sql','member-screen-three-trading-days.sql'])await db.exec(fs.readFileSync('docs/database/'+f,'utf8'));
await db.exec(`insert into price_window values('2026-10-15'),('2026-10-16'),('2026-10-19'),('2026-10-20'),('2026-10-21');insert into taiex_daily values('2026-10-22'),('2099-01-01');`);
assert.deepEqual((await db.query("select member_screen_recent_dates('2026-10-25') d")).rows[0].d.map(d=>d instanceof Date?d.toISOString().slice(0,10):String(d).slice(0,10)),['2026-10-20','2026-10-21','2026-10-22']);
await db.query("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");await db.exec('set role authenticated');const calendar=(await db.query('select member_screen_calendar() v')).rows[0].v;assert.deepEqual(calendar.accept_market_dates,['2026-10-20','2026-10-21','2026-10-22']);
const save=(n,date)=>db.query('select save_member_screen_record_v2($1,$2,$3,$4,$5,$6,$7) v',[String(n).padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa',calendar.today,date,JSON.stringify(['真名隱藏式']),JSON.stringify(['比大盤強']),JSON.stringify([{code:'2330',name:'測試',close:100}]),'']);
for(const [i,date]of calendar.accept_market_dates.entries()){const r=(await save(i+1,date)).rows[0].v;assert.equal(r.row.market_date,date);assert.equal(r.row.record_date,calendar.today);}
await assert.rejects(save(7,'2026-10-19'),/SCREEN_LATEST_MARKET_ONLY/);await assert.rejects(save(8,'2099-01-01'),/SCREEN_LATEST_MARKET_ONLY/);assert.equal((await save(1,'2026-10-20')).rows[0].v.duplicate,true);
await db.exec('reset role;set role anon');await assert.rejects(save(9,'2026-10-22'),/permission denied/);
console.log('PASS actual three market dates across weekend, immutable server record date, duplicate receipt, old/future rejection and anonymous denial');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
