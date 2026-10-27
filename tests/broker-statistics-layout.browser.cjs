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


 await page.evaluate(()=>{document.querySelector('#homeView').style.display='none';document.querySelector('#sigView').style.display='block';_sigStats=[{pool:'large',method:'lots',broker_name:'元富新莊',signals_total:14,win8_pct:50,n8:12,win20_pct:80,n20:10},{pool:'large',method:'amount',broker_name:'測試分點',signals_total:8,win8_pct:0,n8:4,win20_pct:null,n20:0}];document.getElementById('sigContent').innerHTML=_statsSection();document.getElementById('rankContent').innerHTML=_rkTableSimple([{rank:1,broker_id:'001',broker_name:'元富新莊',events:14,win8:50,n8:12,win20:80,n20:10}],'year_large_lots')+_rkTableOverlap([{broker_name:'元富新莊',rank:1,win20:80,events:14,n20:10,rank_b:2,win20_b:75,events_b:8,n20_b:8}],'張數榜','金額榜');});
 for(const theme of ['light','dark'])for(const width of [1512,390]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:950});for(const id of ['sigView','brankView']){await page.evaluate(id=>{document.getElementById('sigView').style.display=id==='sigView'?'block':'none';document.getElementById('brankView').style.display=id==='brankView'?'block':'none';},id);assert.ok(await page.locator('#'+id+' .broker-metric').evaluateAll(es=>es.every(e=>{const items=[...e.children].map(x=>x.getBoundingClientRect());return items.every((r,i)=>!i||r.top>=items[i-1].bottom-1);})), 'percentage, sample and pending count are separate aligned lines');await page.locator('#'+id+' .broker-table-scroll').first().screenshot({path:path.join(output,'broker-table-'+id+'-'+theme+'-'+width+'.png')});}}
 assert.match(await page.locator('#rankContent').textContent(),/4 筆未滿20日/);assert.match(await page.locator('#sigContent').textContent(),/已滿 10 筆/);console.log('PASS broker statistics and rankings: percentage/sample/pending separation, preserved values, simple and overlap tables, light/dark desktop/mobile.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
