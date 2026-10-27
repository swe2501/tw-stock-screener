// 盤後今日行情：price_window 尚未上傳時，收盤後（週一～五 13:30 起）可保存今天的行情日期。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;insert into auth.users values('11111111-1111-4111-8111-111111111111');create table public.price_window(trade_date date);grant select on public.price_window to authenticated;`);
for(const f of ['member-screen-calendar.sql','member-screen-latest-market.sql','member-screen-today-close.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../docs/database',f),'utf8'));
const acc=async(latest,today,local)=>(await db.query('select public.member_screen_accept_dates($1::date,$2::date,$3::timestamp) v',[latest,today,local])).rows[0].v.map(d=>d.toISOString?d.toISOString().slice(0,10):String(d));
// 2026-10-21 是週三
assert.deepEqual(await acc('2026-10-20','2026-10-21','2026-10-21 19:07'),['2026-10-20','2026-10-21'],'after close: today accepted');
assert.deepEqual(await acc('2026-10-20','2026-10-21','2026-10-21 13:29'),['2026-10-20'],'before close: only uploaded date');
assert.deepEqual(await acc('2026-10-21','2026-10-21','2026-10-21 19:07'),['2026-10-21'],'already uploaded: no duplicate');
assert.deepEqual(await acc('2026-10-23','2026-10-24','2026-10-24 15:00'),['2026-10-23'],'Saturday: no today');
assert.deepEqual(await acc(null,'2026-10-21','2026-10-21 08:00'),[],'no data before close');
// RPC 回傳 accept_market_dates，且一定包含已上傳的最新日期
const owner='11111111-1111-4111-8111-111111111111';await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
const read=async()=>(await db.query('select public.member_screen_calendar() v')).rows[0].v;const today=(await read()).today,prev=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
await db.exec('reset role');await db.query('insert into public.price_window values($1)',[prev]);await db.exec('set role authenticated');
const d=await read();assert.ok(d.accept_market_dates.includes(prev));assert.equal(d.latest_market_date,prev);
const save=(n,market)=>db.query('select public.save_member_screen_record_v2($1,$2,$3,$4,$5,$6,$7) v',[String(n).padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa',today,market,JSON.stringify(['私房：測試']),JSON.stringify(['條件']),JSON.stringify([{code:'2330',name:'測試',close:100}]),'']);
assert.equal((await save(1,prev)).rows[0].v.row.market_date,prev);
if(d.accept_market_dates.includes(today))assert.equal((await save(2,today)).rows[0].v.row.market_date,today);else await assert.rejects(save(2,today),/SCREEN_LATEST_MARKET_ONLY/);
await assert.rejects(save(3,new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10)),/SCREEN_LATEST_MARKET_ONLY/,'future rejected');
console.log('PASS after-close today accepted while price_window lags, before-close/weekend/no-data cases, future rejected, RPC exposes accepted dates.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
