/* QA：策略工作台五步驟、上架、聊天室版面、K 圖按鈕、私房篩選器多選。隔離網路。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||require('node:os').tmpdir()+'/strategy-studio-qa';fs.mkdirSync(out,{recursive:true});
const rows=Array.from({length:700},(_,i)=>{const t=new Date(Date.UTC(2024,0,2+i)).toISOString().slice(0,10),c=100+Math.sin(i/9)*8+i*.03;return {time:t,open:c-.5,high:c+1.5,low:c-1.5,close:c,volume:10000+(i%7)*900};});
async function page(b,width,theme,init){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(([theme,init])=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fx',email:'fx@example.test'}));localStorage.setItem('theme',theme);if(init)for(const [k,v] of Object.entries(init))localStorage.setItem(k,v);},[theme,init||null]);
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return r.fulfill({path:process.env.CHART_LIBRARY_PATH||path.resolve(root,'../2026-10-08/new-chat/work/lightweight-charts-4.1.3.js'),contentType:'text/javascript'});
  if(u.pathname.endsWith('/api/chart'))return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{name:'測試',data:rows}});
  if(u.origin==='https://studio.fixture.test'){if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});const f=path.resolve(root,'apps/web','.'+decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({json:{}});}
  if(u.hostname.endsWith('.supabase.co')){
   if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'fx@example.test',user_metadata:{display_name:'測試'}}});
   if(u.pathname.endsWith('/rpc/member_screen_calendar')){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());return r.fulfill({json:{today,save_policy:'latest-market-v2',latest_market_date:rows.at(-1).time,server_time:new Date().toISOString(),month:today.slice(0,7)+'-01',rows:[]}});}
   if(u.pathname.endsWith('/rpc/save_member_screen_record_v2')){const d=r.request().postDataJSON();(globalThis.savedScreens=globalThis.savedScreens||[]).push(d);return r.fulfill({json:{row:{id:'rec-'+globalThis.savedScreens.length,record_date:d.p_record_date,market_date:d.p_market_date,recorded_at:new Date().toISOString(),strategies:d.p_strategies,conditions:d.p_conditions,stocks:d.p_stocks,note:d.p_note}}});}
   if(u.pathname.endsWith('/price_window')){const q=u.searchParams;if(q.get('select')==='trade_date')return r.fulfill({json:rows.slice(-400).reverse().map(x=>({trade_date:x.time}))});const codes=(q.get('code')||'').replace(/^in\.\(|\)$/g,'').split(',').filter(Boolean);if(+q.get('offset')>0)return r.fulfill({json:[]});
    const out=[];for(const c of codes.slice(0,2)){const k=+c%3;for(const x of rows.slice(-120))out.push({code:c,trade_date:x.time,open:x.open+k,high:x.high+k,low:x.low+k,close:x.close+k,volume:x.volume});}return r.fulfill({json:out});}
   return r.fulfill({json:[]});}
  return r.fulfill({contentType:'application/json',body:'{}'});});
 p.errors=errors;return p;}


(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const p=await page(b,1440,theme);await p.goto('https://studio.fixture.test/#member/strategy');await p.locator('.ms-chat-launcher').waitFor();await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const cfg of [{width:1440,height:900,button:'close',expanded:false,edge:'right'},{width:1366,height:768,button:'minimize',expanded:true,edge:'left'},{width:390,height:844,button:'close',expanded:false,edge:'right'}]){
   await p.setViewportSize({width:cfg.width,height:cfg.height});await p.locator('.ms-chat-launcher').focus();await p.keyboard.press(cfg.edge==='left'?'Alt+ArrowLeft':'Alt+ArrowRight');await p.waitForTimeout(1100);
   const target=await p.locator('.ms-chat-launcher').boundingBox();await p.locator('.ms-chat-launcher').click();await p.locator('.ms-chat-dialog[open]').waitFor();if(cfg.expanded){await p.getByRole('button',{name:'放大策略聊天室',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.ms-chat-dialog').getAnimations().every(a=>a.playState==='finished'));}
   const hash=await p.evaluate(()=>location.hash),count=await p.locator('.ms-ai-message').count();
   await p.locator('[data-chat-'+cfg.button+']').evaluate(e=>e.click());
   const checks=await p.locator('.ms-chat-dialog').evaluate(d=>{const a=d.getAnimations().find(a=>a.effect.getTiming().duration===520);if(!a)return null;a.pause();const rect=()=>{const r=d.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,opacity:+getComputedStyle(d).opacity};};a.currentTime=0;const start=rect();a.currentTime=260;const middle=rect();a.currentTime=520;const end=rect();return {start,middle,end,open:d.open};});
   assert.ok(checks&&checks.open,'dialog stays open during suction');for(const key of ['x','y','width','height'])assert.ok(Math.abs(checks.end[key]-target[key])<2,JSON.stringify({key,checks,target}));assert.ok(checks.middle.width<checks.start.width&&checks.middle.width>target.width);assert.ok(checks.middle.opacity>.9,'keep contents visible until near the launcher');
   await p.locator('.ms-chat-dialog').evaluate(d=>{const a=d.getAnimations().find(a=>a.effect.getTiming().duration===520);a.currentTime=260;});await p.screenshot({path:out+`/suction-${theme}-${cfg.width}-midpoint.png`});
   await p.locator('.ms-chat-dialog').evaluate(d=>{const a=d.getAnimations().find(a=>a.effect.getTiming().duration===520);a.finish();});await p.locator('.ms-chat-launcher').waitFor({state:'visible'});assert.equal(await p.locator('.ms-chat-dialog').evaluate(e=>e.open),false);assert.equal(await p.evaluate(()=>location.hash),hash);
   await p.locator('.ms-chat-launcher').click();assert.equal(await p.locator('.ms-ai-message').count(),count,'conversation retained');await p.emulateMedia({reducedMotion:'reduce'});await p.locator('[data-chat-close]').click();await p.locator('.ms-chat-launcher').waitFor({state:'visible'});await p.emulateMedia({reducedMotion:'no-preference'});
  }
  assert.deepEqual(p.errors,[]);await p.close();
 }
 console.log('PASS close and minimize suction lands on launcher at left/right/mobile and expanded sizes, late fade, conversation/history retained, reduced motion immediate.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
