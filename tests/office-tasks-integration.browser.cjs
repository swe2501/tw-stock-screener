const fs=require('fs'),assert=require('assert');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:50024/**',r=>r.fulfill({contentType:'text/html',body:r.request().url().includes('ai-office.html')?'<button id="assign" onclick="parent.postMessage({type:\'foresight-office-create-task\',department:7},location.origin)">指派任務</button>':'<main id="office"></main>'}));
 await page.goto('http://127.0.0.1:50024/');await page.addScriptTag({path:'apps/web/assets/office-task-board.js'});await page.addScriptTag({path:'apps/web/assets/admin-office.js'});
 await page.evaluate(()=>AdminOffice.show(document.getElementById('office'),async action=>action==='admin_office'?{agents:{}}:{tasks:[],departments:[{id:7,name:'資料與金融研究部',enabled:true}],worker:{}}));
 await page.frameLocator('#aoTowerFrame').locator('#assign').waitFor();
 const officeFrame=page.frames().find(f=>f.url().includes('ai-office.html'));
 await officeFrame.goto('http://127.0.0.1:50024/index.html');
 await page.getByRole('button',{name:'金融大廈',exact:true}).click();
 await page.frameLocator('#aoTowerFrame').locator('#assign').click();
 await page.locator('.ot-form').waitFor({state:'visible'});assert.equal(await page.locator('[name=department]').inputValue(),'7');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#aoJobsTab').isVisible(),false);await page.getByRole('button',{name:'金融大廈',exact:true}).click();assert(await page.locator('#aoTowerPanel').isVisible());
 await page.evaluate(()=>window.postMessage({type:'foresight-office-create-task',department:7},location.origin));assert.equal(await page.locator('.ot-form').isVisible(),false);
 await page.getByRole('button',{name:'任務中心',exact:true}).click();assert(await page.locator('#aoTasksPanel').isVisible());assert.equal(await page.locator('#aoLegacyPanel').isVisible(),false);
 await page.evaluate(()=>AdminOffice.hide());assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('#aoTowerFrame').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS admin task tab, trusted department assignment bridge, rejected unrelated messages and cleanup');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
