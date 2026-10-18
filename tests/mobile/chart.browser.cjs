const {chromium}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chartDocument}=require('../../apps/mobile/src/chart-document');
const {aggregateCandles}=require('../../apps/mobile/src/chart-model');
// Deliberately synthetic render fixture, never used by the App data service.
const rows=Array.from({length:65},(_,i)=>{const close=1000+i*2+Math.sin(i)*12;return {date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:close-3,high:close+5,low:close-5,close};});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const dark of [false,true])for(const width of [320,430,1024]){
  const page=await browser.newPage({viewport:{width,height:420}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.messages=[];window.ReactNativeWebView={postMessage:m=>window.messages.push(JSON.parse(m))};});
  await page.route('https://chart.fixture.test/',r=>r.fulfill({contentType:'text/html',body:chartDocument(aggregateCandles(rows),dark,[5,20])}));
  await page.goto('https://chart.fixture.test/');await page.waitForFunction(()=>window.messages.some(m=>m.type==='ready'));
  await page.mouse.move(width*.5,180);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok(await page.locator('canvas').count()>=2);assert.deepEqual(errors,[]);
  assert.ok(await page.evaluate(()=>window.messages.some(m=>m.type==='bar')));
  const output=path.join(__dirname,'../../apps/mobile/dist/chart-review');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,`${dark?'dark':'light'}-${width}.png`)});
  await page.close();
 }
 console.log('PASS: bundled K chart, crosshair and width checks at 320/430/1024 in light/dark');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
