/* QA：策略工作台五步驟、上架、聊天室版面、K 圖按鈕、私房篩選器多選。隔離網路。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||require('node:os').tmpdir()+'/strategy-studio-qa';fs.mkdirSync(out,{recursive:true});
const rows=Array.from({length:700},(_,i)=>{const t=new Date(Date.UTC(2024,0,2+i)).toISOString().slice(0,10),c=100+Math.sin(i/9)*8+i*.03;return {time:t,open:c-.5,high:c+1.5,low:c-1.5,close:c,volume:10000+(i%7)*900};});
async function page(b,width,theme,init){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(([theme,init])=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fx',email:'fx@example.test'}));localStorage.setItem('theme',theme);if(init)for(const [k,v] of Object.entries(init))localStorage.setItem(k,v);},[theme,init||null]);
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/api/chart'))return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{name:'測試',data:rows}});
  if(u.origin==='https://studio.fixture.test'){if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});const f=path.resolve(root,'apps/web','.'+decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({json:{}});}
  if(u.hostname.endsWith('.supabase.co')){
   if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'fx@example.test',user_metadata:{display_name:'測試'}}});
   if(u.pathname.endsWith('/rpc/member_screen_calendar')){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());return r.fulfill({json:{today,save_policy:'latest-market-v2',latest_market_date:rows.at(-1).time,server_time:new Date().toISOString(),month:today.slice(0,7)+'-01',rows:globalThis.calRows||[]}});}
   if(u.pathname.endsWith('/rpc/save_member_screen_record_v2')){const d=r.request().postDataJSON();(globalThis.savedScreens=globalThis.savedScreens||[]).push(d);return r.fulfill({json:{row:{id:'rec-'+globalThis.savedScreens.length,record_date:d.p_record_date,market_date:d.p_market_date,recorded_at:new Date().toISOString(),strategies:d.p_strategies,conditions:d.p_conditions,stocks:d.p_stocks,note:d.p_note}}});}
   if(u.pathname.endsWith('/price_window')){const q=u.searchParams;if(q.get('select')==='trade_date')return r.fulfill({json:rows.slice(-400).reverse().map(x=>({trade_date:x.time}))});const codes=(q.get('code')||'').replace(/^in\.\(|\)$/g,'').split(',').filter(Boolean);if(+q.get('offset')>0)return r.fulfill({json:[]});
    const out=[];for(const c of codes.slice(0,2)){const k=+c%3;for(const x of rows.slice(-120))out.push({code:c,trade_date:x.time,open:x.open+k,high:x.high+k,low:x.low+k,close:x.close+k,volume:x.volume});}return r.fulfill({json:out});}
   return r.fulfill({json:[]});}
  return r.fulfill({contentType:'application/json',body:'{}'});});
 p.errors=errors;return p;}
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const w of [1440,375]){const p=await page(b,w,theme);await p.goto('https://studio.fixture.test/#member/learning');await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForSelector('.lc-hero',{timeout:20000});await p.waitForTimeout(800);
  await p.locator('.lc-hero').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/learn-${theme}-${w}-top.png`});
  await p.locator('.lc-lesson summary').first().click();await p.locator('.lc-lesson[open] input[type=radio]').nth(2).check();await p.locator('.lc-lesson[open] [data-check]').first().click();
  assert.match(await p.locator('.lc-lesson[open] .lc-result').first().innerText(),/答對了/);
  assert.ok(await p.locator('.lc-lesson[open] .lc-fig svg').count()===1,'figure rendered');assert.ok(await p.locator('.lc-lesson[open] .lc-ex li').count()>=3,'worked example');assert.ok(await p.locator('.lc-lesson[open] .lc-quiz').count()>=2,'multi quiz');
  assert.match(await p.locator('.lc-lesson[open] .lc-calc .is-key dd').innerText(),/80,114/);await p.locator('.lc-lesson[open] .lc-calc input[data-k=price]').fill('50');assert.match(await p.locator('.lc-lesson[open] .lc-calc .is-key dd').innerText(),/50,071/);
  assert.equal(await p.locator('.lc-week').count(),4);
  await p.locator('.lc-lesson[open]').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/learn-${theme}-${w}-lesson.png`});
  await p.locator('[data-track=strategy]').click();await p.waitForTimeout(200);assert.equal(await p.locator('.lc-lesson').count(),5);
  await p.locator('[data-save]').first().click().catch(()=>{});await p.locator('[data-lesson-id]').first().locator('summary').click();await p.locator('[data-save]').first().click();await p.waitForTimeout(200);assert.equal(await p.locator('[data-track=saved]').count(),1);
  await p.locator('.lc-practice').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/learn-${theme}-${w}-practice.png`});
  assert.equal(await p.evaluate(()=>{const g=document.querySelector('.member-page');return g.scrollWidth>g.clientWidth+1}),false,'no overflow');assert.deepEqual(p.errors,[]);await p.close();}
console.log('PASS learning center: tracks, lesson reader, quiz, bookmarks, light/dark 1440/375');}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
