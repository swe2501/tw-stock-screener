/* Full index + all real modules, isolated HTTP origin and fake REST; no user account data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||require('node:os').tmpdir();
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.addInitScript(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'full-page-fixture',email:'fixture@example.test'}));});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/api/broker_watch')return r.fulfill({json:[]});if(u.origin==='https://full-page.fixture.test'){
  const file=path.resolve(root,'apps/web','.'+decodeURIComponent(u.pathname));
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return file.endsWith('index.html')?r.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}):r.fulfill({path:file});
  if(u.pathname==='/')return r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(root,'apps/web/index.html'),'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')});
  return r.fulfill({json:{}});
 }
 if(u.hostname.endsWith('.supabase.co')){if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'full-page-fixture',email:'fixture@example.test',user_metadata:{display_name:'隔離測試'},email_confirmed_at:'2026-01-01'}});if(u.pathname.endsWith('/save_member_research_document')){const v=r.request().postDataJSON();return r.fulfill({json:{kind:v.p_kind,revision:v.p_expected_revision+1,payload:v.p_payload}});}return r.fulfill({json:[]});}
 return r.fulfill({contentType:'application/json',body:'{}'});
 });
 await page.goto('https://full-page.fixture.test/');await page.locator('#mainNav .site-search').waitFor();
 assert.match(await page.locator('#navBrokerGrp').textContent(),/不籌吃穿/);assert.equal(await page.locator('#navBrokerGrp svg').count(),1,'uses the same line icon system as other menu items');assert.equal(await page.locator('#navBrokerGrp summary').count(),0);
 await page.evaluate(()=>{document.body.classList.add('is-owner');document.querySelectorAll('.nav-owner').forEach(e=>e.style.display='');});
 for(const width of [1920,1512,1280,1240,1024,900,768,390,320]){
  await page.setViewportSize({width,height:950});await page.waitForTimeout(100);
  const boxes=await page.locator('#mainNav .mn-item,#mainNav .site-search').evaluateAll(es=>es.filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim().slice(0,12),x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const a of boxes){assert.ok(a.x>=-1&&a.right<=width+1,width+' clipped '+JSON.stringify(a));for(const b of boxes){if(a===b)continue;const overlap=Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;assert.equal(overlap,false,width+' overlapping '+a.text+' / '+b.text);}}
  assert.equal(await page.locator('#mainNav').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'nav overflow at '+width);
  const font=await page.locator('#mainNav .mn-item').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(font>=14&&font<=16,'navigation labels stay readable at '+width);
  if([1512,390].includes(width)){await page.screenshot({path:path.join(output,'larger-navigation-'+width+'.png')});const group=page.locator('#mainNav .mn-grp').filter({has:page.locator('#navBrokerGrp')});await group.locator('.mn-item').hover();const menu=group.locator('.mn-menu');assert.equal(await menu.isVisible(),true);const r=await menu.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width+1,'dropdown clipped');await page.mouse.move(width-1,940);}
 }
 await page.setViewportSize({width:1512,height:950});await page.evaluate(()=>{window._isOwner=true;window.openBrokerSignals=()=>{};window.openBrokerRankings=()=>{};});await page.evaluate(()=>_showView('sig'));
 for(const [label,id] of [['分點回測','brankView'],['追蹤觀察站','brokertrackView'],['主力訊號','sigView']]){await page.locator('.broker-workspace-tabs:visible').getByRole('button',{name:label,exact:true}).click();assert.equal(await page.locator('#'+id).isVisible(),true);if(id==='brokertrackView'){await page.waitForFunction(()=>document.getElementById('sellTrackBody').textContent.includes('還沒有追蹤'));assert.equal(await page.locator('#sellTrackModal').isVisible(),false,'tracking appears within the workspace rather than another modal');}assert.equal(await page.locator('#'+id+' .broker-workspace-tabs button[aria-pressed=true]').textContent(),label);}
 for(const theme of ['light','dark'])for(const width of [1512,390]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:950});assert.ok(await page.locator('.broker-workspace-tabs:visible button').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),'three workspace buttons fit');await page.locator('.broker-workspace-tabs:visible').screenshot({path:path.join(output,'broker-tabs-'+theme+'-'+width+'.png')});}
 console.log('PASS enlarged navigation at nine viewport widths, no control overlap, search fits, dropdowns remain accessible.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
