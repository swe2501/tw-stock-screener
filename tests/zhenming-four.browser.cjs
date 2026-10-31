/* Full index + all real modules, isolated HTTP origin and fake REST; no user account data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||require('node:os').tmpdir();
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.addInitScript(()=>{localStorage.setItem('fqi_onboarded_v1','1');localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'full-page-fixture',email:'fixture@example.test'}));});
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


 await page.evaluate(()=>{window._isOwner=true;_showView('screen');_scToggle('zm');});
 await page.locator('#zhenming4').check();
 assert.equal(await page.locator('[data-cat=zm] .sc-hd').getAttribute('data-count'),'1');
 assert.equal(await page.locator('.sc-cbs #zhenmingHiddenCard').evaluate(e=>!e.nextElementSibling),true);
 let request,mode='new';
 await page.route('**/api/screen',r=>{request=r.request().postDataJSON();return r.fulfill({json:{date:'2026/01/13',total:1,count:1,zhenming4_applied:mode==='new',results:[{code:'2330',name:'測試個股',open:105,high:107,low:104,close:106,volume_lots:100,candle_pct:.94,zm4:{day_n:3,support_low:103,ma5:104}}]}});});
 await page.evaluate(()=>doScreen());await page.locator('.zm4-result').waitFor();assert.equal(request.zhenming4,true);assert.match(await page.locator('.zm4-result').innerText(),/3／12/);
 mode='old';await page.evaluate(()=>doScreen());await page.waitForFunction(()=>document.body.innerText.includes('尚未支援真名四式'));assert.equal(await page.locator('#resultsArea').innerText(),'');
 for(const [theme,width] of [['light',1440],['dark',1440],['light',390],['dark',390]]){
  await page.setViewportSize({width,height:960});await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);await page.locator('.zm4-rules summary').click();
  assert.ok(await page.locator('.zm4-rules').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
  await page.locator('.zm4-rules').screenshot({path:path.join(output,'four-'+theme+'-'+width+'.png')});await page.locator('.zm4-rules summary').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS four-style request, results, old backend guard, hidden-last placement and responsive themes');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
