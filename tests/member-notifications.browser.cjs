const path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<header><button id="themeToggle">主題</button></header><div id="authArea"></div>'}));await page.goto('https://notifications.fixture.test/');
 await page.evaluate(()=>{localStorage.setItem('sb_token','a');window.profile={id:'a',member_preferences:{}};window.fail=false;window.saved=[];window.AcademyIdentity={getProfile:async()=>profile,updateProfile:async data=>{if(fail)throw Error('連線失敗，尚未儲存');saved.push(data);return window.profile={...profile,...data};}};});
 for(const file of ['member-features.js','member-center.js'])await page.addScriptTag({path:path.resolve(__dirname,'../apps/web/assets',file)});
 await page.getByRole('button',{name:'通知',exact:true}).first().click();await page.waitForSelector('#mc-preferences');assert.equal(new URL(page.url()).hash,'#member/notifications');assert.equal(await page.locator('.mc-main h2').first().textContent(),'通知');
 for(const input of await page.locator('#mc-preferences [type=checkbox]').all())await input.uncheck();await page.locator('[name=frequency]').selectOption('off');
 await page.evaluate(()=>window.fail=true);await page.getByRole('button',{name:'儲存通知偏好',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-feature-status]').textContent.includes('尚未儲存'));assert.equal(await page.locator('[data-notification-tasks]').count(),0);
 await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'儲存通知偏好',exact:true}).click();await page.waitForSelector('[data-notification-tasks]');assert.deepEqual(await page.evaluate(()=>saved[0].member_preferences),{birthday:false,referral:false,events:false,weekly:false,channel:'in_app',frequency:'off'});
 await page.locator('[data-notification-tasks]').click();assert.equal(new URL(page.url()).hash,'#member/tasks');assert.deepEqual(errors,[]);
 console.log('PASS notifications: bell route, plain label, failed save cannot complete, all-off persisted, return to task qualification.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
