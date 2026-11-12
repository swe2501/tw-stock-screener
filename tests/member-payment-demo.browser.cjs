const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('path');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage();let requests=0;
 await p.route('https://demo.test/**',r=>{if(r.request().method()==='POST'){if(r.request().postDataJSON().action==='pay_linepay_request')requests++;return r.fulfill({status:503,json:{error:'未開放'}});}return r.fulfill({contentType:'text/html',body:'<main></main>'});});
 await p.goto('https://demo.test/');await p.evaluate(()=>{window._isOwner=true;window.AcademyMemberCatalog={refresh:async()=>{},get:()=>null,icon:()=>''};});
 await p.addScriptTag({path:path.resolve('apps/web/assets/member-payments.js')});
 await p.evaluate(()=>AcademyPayments.render('billing',{main:document.querySelector('main'),profile:{}}));
 await p.locator('[data-payment-demo]').click();await p.locator('[data-card-number]').fill('4111111111111111');await p.locator('[data-card-expiry-input]').fill('1230');await p.locator('[data-card-cvc-input]').fill('123');await p.locator('[data-card-holder-input]').fill('TEST MEMBER');
 await p.locator('[data-payment-action]').click();await p.waitForFunction(()=>document.querySelector('[data-payment-success]').getAttribute('aria-hidden')==='false');assert.equal(requests,0);assert.match(await p.locator('[data-payment-success] h3').innerText(),/測試：付款確認成功/);await p.locator('[data-success-back]').click();await p.locator('[data-demo-result]').selectOption('failure');await p.locator('[data-payment-action]').click();await p.waitForFunction(()=>document.querySelector('[data-payment-success]')?.getAttribute('aria-hidden')==='false'&&document.querySelector('.mp-demo-failure'));assert.match(await p.locator('[data-payment-success] h3').innerText(),/付款未完成/);assert.equal(requests,0);
 assert.equal(await p.evaluate(()=>Object.values(localStorage).some(v=>v.includes('4111111111111111'))),false);
 await p.locator('[data-payment-demo]').click();assert.equal(await p.locator('[data-payment-action]').isDisabled(),true);
 console.log('PASS: demo card entry, success and failure with catalog unavailable; no payment request or stored card; exit locks payment.');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
