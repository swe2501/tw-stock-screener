/* Full site, fake auth only. No real credentials, SMS, email or OAuth provider calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||require('node:os').tmpdir();
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1100}}),errors=[],calls=[];let manual=false,phoneEnabled=false,linked=false,confirmedPhone=null,pendingPhone=null;
 const user=()=>({id:'auth-ui-fixture',email:'member@example.test',email_confirmed_at:'2026-01-01',phone:confirmedPhone,phone_confirmed_at:confirmedPhone?'2026-10-17':null,user_metadata:{display_name:'介面驗證會員'},identities:[{provider:'email'},{provider:'google'},...(linked?[{provider:'custom:line-web'}]:[])]});
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('sb_token','fixture-token');localStorage.setItem('sb_user',JSON.stringify({id:'auth-ui-fixture'}));});
 await page.route('**/*',r=>{const u=new URL(r.request().url()),method=r.request().method();
  if(u.origin==='https://auth-ui.fixture.test'){
   const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});
   if(u.pathname==='/')return r.fulfill({path:path.join(root,'index.html'),contentType:'text/html; charset=utf-8'});return r.fulfill({json:{}});
  }
  if(u.hostname==='provider.fixture.test')return r.fulfill({contentType:'text/html',body:'<h1>隔離 OAuth 授權頁</h1>'});
  if(u.hostname.endsWith('.supabase.co')){calls.push({path:u.pathname,query:u.search,method,body:r.request().postData(),headers:r.request().headers()});
   if(u.pathname.endsWith('/settings'))return r.fulfill({json:{external:{email:true,google:true,apple:false,facebook:false,phone:phoneEnabled}}});
   if(u.pathname==='/auth/v1/user'){if(method==='PUT'){pendingPhone=r.request().postDataJSON().phone;}return r.fulfill({json:user()});}
   if(u.pathname.endsWith('/user/identities/authorize'))return manual?r.fulfill({json:{url:'https://provider.fixture.test/authorize'}}):r.fulfill({status:400,json:{error_code:'manual_linking_disabled'}});
   if(u.pathname==='/auth/v1/token'){linked=true;return r.fulfill({json:{access_token:'linked-token',refresh_token:'refresh',user:user()}});}
   if(u.pathname==='/auth/v1/verify'){assert.equal(r.request().postDataJSON().type,'phone_change');confirmedPhone=pendingPhone;return r.fulfill({json:{user:user()}});}
   if(u.pathname==='/auth/v1/recover')return r.fulfill({json:{}});
   return r.fulfill({json:[]});
  }
  return r.fulfill({json:{}});
 });
 await page.goto('https://auth-ui.fixture.test/');await page.waitForFunction(()=>window.AcademyProviderUI);await page.evaluate(()=>openAuthModal('login'));
 const modal=page.locator('#authModal'),box=modal.locator('.auth-box');
 await modal.locator('[data-provider=google]:not(:disabled)').waitFor();assert.equal(await modal.locator('[data-auth-brand] img[alt="跟誰學 Logo"]').count(),1);
 const positions=await modal.evaluate(e=>({email:e.querySelector('#authEmail').getBoundingClientRect().top,social:e.querySelector('.academy-social').getBoundingClientRect().top}));assert.ok(positions.email<positions.social);
 for(const provider of ['google','line'])assert.equal(await modal.locator('[data-provider='+provider+'] img').evaluate(e=>e.complete&&e.naturalWidth>0),true,provider+' original mark must load');
 assert.equal(await modal.locator('[data-provider]').count(),3);assert.equal(await modal.locator('[data-provider=phone]').isDisabled(),true);assert.equal(await modal.locator('[data-provider=line]').isEnabled(),true);
 assert.match(await box.evaluate(e=>getComputedStyle(e).animationName),/ma-auth/);
 await page.waitForTimeout(450);await page.screenshot({path:path.join(output,'signin-redesign-light.png')});
 await modal.getByRole('button',{name:'顯示密碼',exact:true}).click();assert.equal(await modal.locator('#authPassword').getAttribute('type'),'text');await modal.getByRole('button',{name:'隱藏密碼',exact:true}).click();
 await modal.locator('[data-auth-switch=register]').click();assert.equal(await modal.locator('#authTitle').textContent(),'建立帳號');assert.equal(await modal.locator('#tabLogin').evaluate(e=>e.classList.contains('pro-primary')||e.classList.contains('active')),false);assert.equal(await modal.locator('#tabRegister').evaluate(e=>e.classList.contains('active')),true);assert.notEqual(await modal.locator('#tabRegister').evaluate(e=>getComputedStyle(e).backgroundImage),'none');assert.equal(await modal.locator('#authPassword').getAttribute('autocomplete'),'new-password');await modal.locator('[data-auth-switch=login]').click();
 await page.evaluate(()=>window._toggleTheme());await page.waitForTimeout(450);await page.screenshot({path:path.join(output,'signin-redesign-dark.png')});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await box.evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await box.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);for(const provider of ['google','line','phone']){const b=modal.locator('[data-provider='+provider+']');await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width);}}
 await page.setViewportSize({width:390,height:844});await box.evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(output,'signin-redesign-mobile.png')});await page.keyboard.press('Escape');assert.equal(await modal.evaluate(e=>e.classList.contains('open')),false);
 await page.setViewportSize({width:1512,height:1100});await page.evaluate(()=>{_toggleTheme();openMemberCenter('security');});
 const security=page.locator('.mc-security');await security.locator('[data-bind-provider=line]:not(:disabled)').waitFor();
 await security.locator('[data-security-provider=google] [data-linked=true]').waitFor();assert.equal(await security.locator('[data-security-provider=google] [data-linked=true]').count(),1);assert.equal(await security.locator('[data-security-provider=line] [data-linked=false]').count(),1);
 assert.equal(await security.locator('[data-bind-provider=apple]').isDisabled(),true);assert.equal(await security.locator('[data-bind-provider=phone]').isDisabled(),true);
 await page.screenshot({path:path.join(output,'member-security-linking-light.png')});
 await security.locator('[data-bind-provider=line]').click();await security.locator('[role=status]').filter({hasText:'尚未開啟帳號綁定'}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sb_user')).id),'auth-ui-fixture');
 manual=true;await security.locator('[data-bind-provider=line]').click();await page.waitForURL('https://provider.fixture.test/authorize');
 const link=calls.find(c=>c.path.endsWith('/identities/authorize'));assert.equal(link.headers.authorization,'Bearer fixture-token');assert.equal(new URLSearchParams(link.query).get('provider'),'custom:line-web');
 await page.goto('https://auth-ui.fixture.test/?code=fixture-code');await page.locator('.member-page:not([hidden]) .mc-security').waitFor();await page.locator('[data-security-provider=line] [data-linked=true]').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sb_user')).id),'auth-ui-fixture');assert.equal(await page.evaluate(()=>location.hash),'#member/security');
 // A new page simulates a separately enabled SMS service; still no real messages.
 phoneEnabled=true;await page.reload();await page.locator('[data-bind-provider=phone]:not(:disabled)').waitFor();await page.locator('[data-bind-provider=phone]').click();
 const dialog=page.locator('.mc-contact-dialog');await dialog.locator('#mc-link-value').fill('0912345678');await dialog.locator('[data-send-link]').click();await dialog.locator('#mc-link-code').waitFor();await dialog.locator('#mc-link-code').fill('123456');await dialog.getByRole('button',{name:'驗證並綁定',exact:true}).click();await dialog.waitFor({state:'detached'});await page.locator('[data-security-provider=phone] [data-linked=true]').waitFor();
 assert.equal(calls.some(c=>c.path.endsWith('/otp')),false,'linking must never sign up a new phone member');assert.equal(calls.filter(c=>c.path==='/auth/v1/user'&&c.method==='PUT').length,1);
 await page.locator('[data-member-email=password]').click();await page.locator('.mc-security [role=status]').filter({hasText:'密碼設定信已寄出'}).waitFor();assert.ok(calls.find(c=>c.path.endsWith('/recover')));
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS branded login order, three primary provider icons, rounded responsive layout, reduced motion, real link request, same-member callback, disabled state, verified phone linking and email recovery.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
