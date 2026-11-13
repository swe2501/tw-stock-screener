const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1366,375]){
  const page=await browser.newPage({viewport:{width,height:844}});let dataCalls=0,claims=0;
  let state={enabled:true,allowed:false,limit:1,devices:[{id:'11111111-1111-4111-8111-111111111111',label:'另一台電腦 <script>bad()</script>',last_seen_at:new Date().toISOString(),current:false}]};
  await page.route('https://device.fixture/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<style>:root{--surface:#fff;--border:#ccd6e0;--text:#12243a;--accent:#2680b5}body{font:16px Arial;margin:24px}</style><section class="mc-security"></section>'});
   if(url.pathname==='/api/auth'){const body=request.postDataJSON();if(body.action==='member_devices'){if(body.operation==='claim')claims++;if(body.operation==='takeover')state={...state,allowed:true,devices:[{...state.devices[0],current:true,label:'電腦 · Edge'}]};if(body.operation==='revoke')state={...state,allowed:false,devices:[]};return route.fulfill({json:state});}}
   dataCalls++;return route.fulfill({json:{ok:true}});
  });
  await page.goto('https://device.fixture/');await page.evaluate(()=>localStorage.setItem('sb_token','fixture-token'));
  await page.addStyleTag({path:'apps/web/assets/member-devices.css'});await page.addScriptTag({path:'apps/web/assets/member-devices.js'});
  await page.locator('[data-device-notice]').waitFor();
  const blocked=await page.evaluate(()=>fetch('/rest/v1/member_notes',{headers:{Authorization:'Bearer fixture-token'}}).then(r=>r.status));
  assert.equal(blocked,409);assert.equal(dataCalls,0,'blocked member request never reaches data');assert.equal(claims,1);
  assert.equal(await page.locator('[data-device-manager] script').count(),0,'device labels escaped');
  page.on('dialog',d=>d.accept());await page.locator('[data-device-notice] button').click();await page.waitForFunction(()=>AcademyMemberDevices.get().allowed);
  const allowed=await page.evaluate(()=>fetch('/rest/v1/member_notes',{headers:{Authorization:'Bearer fixture-token'}}).then(r=>r.status));assert.equal(allowed,200);assert.equal(dataCalls,1);
  await page.locator('[data-device-revoke]').click();await page.locator('[data-device-notice]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`artifacts/member-commerce/devices-${width}.png`,fullPage:true});
  // Before rollout an unavailable/old endpoint must not disable the legacy site.
  await page.route('https://device.fixture/api/auth',r=>r.fulfill({status:503,json:{error:'尚未部署'}}));
  await page.evaluate(()=>{localStorage.setItem('sb_token','new-token');dispatchEvent(new Event('academy-auth-changed'));});
  await page.waitForFunction(()=>AcademyMemberDevices.get()?.unavailable);
  assert.equal(await page.evaluate(()=>fetch('/rest/v1/member_notes',{headers:{Authorization:'Bearer new-token'}}).then(r=>r.status)),200);
  await page.close();
 }
 console.log('PASS browser: admission gate, takeover, removal, escaped labels, legacy rollout, desktop/mobile no overflow.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
