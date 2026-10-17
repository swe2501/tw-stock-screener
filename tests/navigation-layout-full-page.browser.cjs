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
 await page.goto('https://full-page.fixture.test/');await page.locator('#mainNav .site-search').waitFor();
 for(const width of [1920,1512,1280,1240,1024,900,768,390,320]){
  await page.setViewportSize({width,height:950});await page.waitForTimeout(100);
  const boxes=await page.locator('#mainNav .mn-item,#mainNav .site-search').evaluateAll(es=>es.filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim().slice(0,12),x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const a of boxes){assert.ok(a.x>=-1&&a.right<=width+1,width+' clipped '+JSON.stringify(a));for(const b of boxes){if(a===b)continue;const overlap=Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;assert.equal(overlap,false,width+' overlapping '+a.text+' / '+b.text);}}
  assert.equal(await page.locator('#mainNav').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'nav overflow at '+width);
  const font=await page.locator('#mainNav .mn-item').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.equal(font,width>900?15:14);
  if([1512,390].includes(width)){await page.screenshot({path:path.join(output,'larger-navigation-'+width+'.png')});const group=page.locator('#mainNav .mn-grp').filter({hasText:'今日焦點'});await group.locator('.mn-item').hover();const menu=group.locator('.mn-menu');assert.equal(await menu.isVisible(),true);const r=await menu.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width+1,'dropdown clipped');await page.mouse.move(width-1,940);}
 }
 console.log('PASS enlarged navigation at nine viewport widths, no control overlap, search fits, dropdowns remain accessible.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
