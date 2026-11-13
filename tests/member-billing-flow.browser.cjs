const {chromium}=require('playwright'),a=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
 const p=await browser.newPage({viewport:{width,height:900}});let writes=0;
 await p.route('https://billing.test/**',r=>{if(r.request().method()==='POST'){writes++;return r.fulfill({status:503,json:{error:'not connected'}});}return r.fulfill({contentType:'text/html',body:'<main></main>'});});
 await p.goto('https://billing.test/');await p.evaluate(()=>{window._isOwner=true;const products=[{id:'free',tier:'free',name:'見習研究生',description:'免費'},{id:'observer',tier:'observation',name:'市場觀察員',description:'每週 6 次',days:30},{id:'research',tier:'research',name:'趨勢研究員',description:'每週 15 次',days:30}];window.AcademyMemberCatalog={refresh:async()=>{},get:()=>({products}),icon:()=>''};});
 await p.addStyleTag({content:':root{--surface:#fff;--surface2:#f7fafc;--bg:#fff;--border:#dbe2eb;--text:#18293d;--text-muted:#63748a;--accent:#438cc5}*{box-sizing:border-box}body{font-family:Arial;margin:0}'});
 await p.addStyleTag({path:path.resolve('apps/web/assets/member-payments.css')});
 for(const file of ['member-billing-model.js','member-billing-benefits.js','member-payments.js'])await p.addScriptTag({path:path.resolve('apps/web/assets',file)});
 await p.evaluate(()=>AcademyPayments.render('billing',{main:document.querySelector('main'),profile:{id:'tester'}}));
 a.equal(await p.locator('.mp-checkout').isVisible(),false);await p.locator('[name=billing-product]').first().waitFor();
 a.equal(await p.locator('[data-product-subscribe=free]').innerText(),'選擇免費身分');
 await p.locator('[data-payment-demo]').click();await p.locator('[data-product-subscribe=observer]').click();await p.locator('[data-billing-next]').click();
 a.equal(await p.locator('.mp-checkout').isVisible(),true);a.equal(await p.locator('[data-method=line]').isDisabled(),true);
 const card=await p.locator('.mp-card-scene').boundingBox();a(Math.abs(card.width/card.height-1.586)<.12,JSON.stringify(card));
 await p.locator('button').filter({hasText:'← 返回選擇方案'}).click();await p.locator('[data-product-once=observer]').click();await p.locator('[data-billing-next]').click();await p.locator('[data-method=line]').click();
 a.equal(await p.locator('.mp-checkout').isVisible(),true);a.equal(await p.locator('[name=billing-product]:checked').inputValue(),'observer');
 await p.locator('[data-payment-action]').click();a.equal(await p.locator('.mp-checkout').isVisible(),false);a.match(await p.locator('.mp-billing-review').first().innerText(),/單次購買/);a.doesNotMatch(await p.locator('.mp-billing-review').first().innerText(),/NT\$/);
 a.equal(await p.locator('[data-billing-submit]').isDisabled(),true);await p.locator('[data-billing-consent]').check();a.equal(await p.locator('[data-billing-submit]').isDisabled(),false);
 a.equal(await p.locator('dialog').count(),0);if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))console.log(await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,w:e.getBoundingClientRect().width})).slice(0,20)));a.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await p.screenshot({path:path.resolve('artifacts/member-commerce/billing-confirm-'+width+'.png'),fullPage:true});
 await p.close();
 }
 console.log('PASS: plan first, free bypass, monthly card only, one-time method switch, retained plan, explicit consent, hidden prices, desktop/mobile, no dialogs or payment submission.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
