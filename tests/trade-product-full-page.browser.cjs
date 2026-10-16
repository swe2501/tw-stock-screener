/* Full index + all real modules, isolated HTTP origin and fake REST; no user account data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||require('node:os').tmpdir();
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.addInitScript(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'full-page-fixture',email:'fixture@example.test'}));});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='https://full-page.fixture.test'){
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});
  if(u.pathname==='/')return r.fulfill({path:path.join(root,'index.html'),contentType:'text/html; charset=utf-8'});
  return r.fulfill({json:{}});
 }
 if(u.hostname.endsWith('.supabase.co')){if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'full-page-fixture',email:'fixture@example.test',user_metadata:{display_name:'隔離測試'},email_confirmed_at:'2026-01-01'}});if(u.pathname.endsWith('/save_member_research_document')){const v=r.request().postDataJSON();return r.fulfill({json:{kind:v.p_kind,revision:v.p_expected_revision+1,payload:v.p_payload}});}return r.fulfill({json:[]});}
 return r.fulfill({contentType:'application/json',body:'{}'});
 });
 await page.goto('https://full-page.fixture.test/#member/trades');await page.locator('[data-batch]').waitFor({timeout:20000});
 const row=page.locator('.mt-batch-row').first();assert.equal(await row.locator('[name=symbolText]').count(),1);
 for(const mode of ['futures','options','stock','etf','margin','short','options','futures']){
  await row.locator('[name=product]').selectOption(mode);
  assert.equal(await row.getAttribute('data-product-mode'),mode,JSON.stringify(errors));
  assert.equal(await row.locator('[name=lot]').isVisible(),!['futures','options'].includes(mode));
  assert.equal(await row.locator('[data-option-party]').isVisible(),mode==='options');
  assert.equal(await row.locator('[name=symbolText]').count(),1);
  if(mode==='options'){assert.match(await row.locator('[name=symbolText]').getAttribute('placeholder'),/搜尋選擇權/);assert.equal(await row.locator('[name=strike]').isVisible(),true);await page.screenshot({path:path.join(output,'full-page-options-format.png')});}
 }
 await page.screenshot({path:path.join(output,'full-page-product-format.png')});
 assert.equal(errors.filter(e=>/member-trade|Cannot read properties|not a function/.test(e)).length,0,JSON.stringify(errors));
 console.log('PASS full index product form switching. Page diagnostics: '+JSON.stringify(errors));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
