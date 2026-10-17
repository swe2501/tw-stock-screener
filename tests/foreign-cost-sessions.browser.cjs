const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf(' var verifiedSettlement=');
assert.ok(start>0);
const script=html.slice(start,html.indexOf('</script>',start));
const cssStart=html.lastIndexOf('<style>',start);
const css=html.slice(cssStart+7,html.indexOf('</style>',cssStart));
let mode='normal';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1512,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
 await page.route('http://session.test/**',async route=>{
  const url=route.request().url();
  if(url.includes('/api/screen'))return route.fulfill({json:{date:'2026-09-16',basis:{net:{point:46063.28}}}});
  if(url.includes('/api/chart')){
   if(mode==='error')return route.fulfill({status:502,json:{error:'unavailable'}});
   return route.fulfill({json:{quoteType:'published_daily',sessions:{day:{session:'day',price:47242,date:'2026-10-16',contractMonth:'202610'},night:mode==='missing'?null:{session:'night',price:47366,date:'2026-10-16',contractMonth:'202610'}}}});
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--surface:#fff;--text:#263448;--text-muted:#607087;--border:#d6deea;--accent:#347fc4}body{margin:0;font-family:Arial}*{box-sizing:border-box}'+css+'</style><div id="hpFut"></div><div id="hpForeignCost"></div><div id="fhCards"></div><div id="fhForeignCost"></div><script>(function(){'+script+'</script>'});
 });
 await page.goto('http://session.test/');
 const detail=page.locator('#fhForeignCost');
 await detail.getByText('47,242 點',{exact:true}).waitFor({timeout:5000});
 assert.match(await detail.textContent(),/1,178.72 點/);
 await detail.getByRole('button',{name:'夜盤',exact:true}).click();
 assert.match(await detail.textContent(),/47,366 點/);
 assert.match(await detail.textContent(),/1,302.72 點/);
 assert.equal(await page.locator('[data-fx-session=night][aria-pressed=true]').count(),2);
 assert.equal(await detail.locator('.fx-ecg-current-label').textContent(),'47,366');
 await detail.getByRole('button',{name:'日盤',exact:true}).click();
 assert.match(await detail.textContent(),/47,242 點/);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await detail.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
 const output=process.env.QA_OUTPUT;
 if(output){fs.mkdirSync(output,{recursive:true});await detail.screenshot({path:path.join(output,'day-mobile.png')});}
 mode='missing';await page.evaluate(()=>window._loadForeignSettlementCost());
 await detail.getByRole('button',{name:'夜盤',exact:true}).click();
 assert.match(await detail.textContent(),/夜盤資料待更新|夜盤 · 資料待更新/);
 assert.doesNotMatch(await detail.textContent(),/47,242|47,366|1,302/);
 assert.equal(await detail.locator('.fx-ecg-current-label').count(),0);
 mode='error';await page.evaluate(()=>window._loadForeignSettlementCost());
 await detail.getByRole('button',{name:'日盤',exact:true}).click();
 assert.match(await detail.textContent(),/日盤資料待更新|日盤 · 資料待更新/);
 assert.doesNotMatch(await detail.textContent(),/47,242|47,366/);
 assert.deepEqual(errors,[]);
 console.log('PASS day/night sync, quote/difference/chart, missing/error state, 390px layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
