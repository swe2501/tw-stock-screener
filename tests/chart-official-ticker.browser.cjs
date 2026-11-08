const path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});let requests=0;
  await page.route('**/*',async route=>{
   if(route.request().url().endsWith('/api/auth')){requests++;const {code}=route.request().postDataJSON();if(code==='2330')await new Promise(r=>setTimeout(r,300));return route.fulfill({json:{items:[{id:code,title:code+' 官方公告 <script>',scope:'security',url:'https://www.twse.com.tw/',source:{name:'證交所'},published_date:'2026-11-08'},{id:'policy',title:'市場政策',scope:'market',url:'https://www.mof.gov.tw/',source:{name:'財政部'},published_date:'2026-11-08'}]}}).catch(()=>{});}
   return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"></head><body><div id="chartModal"><div class="modal-header"><div id="modalTitle"></div></div><div class="modal-body">K線</div></div><script>let currentCode="";</script></body></html>'});
  });
  await page.goto('https://chart.fixture.test');await page.evaluate(()=>localStorage.setItem('sb_token','test-only'));
  await page.addStyleTag({path:path.resolve(__dirname,'../apps/web/assets/chart-official-ticker.css')});await page.addScriptTag({path:path.resolve(__dirname,'../apps/web/assets/chart-official-ticker.js')});
  await page.evaluate(()=>{currentCode='2330';document.querySelector('#modalTitle').textContent='2330';document.querySelector('#chartModal').classList.add('open');});
  await page.waitForTimeout(70);await page.evaluate(()=>{currentCode='2395';document.querySelector('#modalTitle').textContent='2395';});
  await page.getByRole('link',{name:'2395 官方公告 <script>'}).waitFor();await page.waitForTimeout(350);
  assert.match(await page.locator('.chart-official-ticker').innerText(),/2395/);assert.equal(await page.locator('.chart-official-ticker script').count(),0);
  assert.equal(await page.getByRole('button',{name:'播放公告輪播'}).count(),1);
  await page.getByRole('button',{name:'下一則官方公告'}).click();assert.equal(await page.locator('.chart-official-ticker strong').innerText(),'市場政策');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{localStorage.removeItem('sb_token');dispatchEvent(new Event('storage'));});assert.match(await page.locator('.chart-official-ticker').innerText(),/請先登入/);
  const count=requests;await page.evaluate(()=>document.querySelector('#chartModal').classList.remove('open'));await page.waitForTimeout(100);assert.equal(requests,count);
  console.log('PASS chart ticker '+width+' exact-stock navigation race, reduced motion, controls, escaping, logout, close');await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
