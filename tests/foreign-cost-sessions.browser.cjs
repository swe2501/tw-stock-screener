const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync(path.join(__dirname,'../apps/web/index.html'),'utf8');
const start=html.indexOf(' var verifiedSettlement=');
assert.ok(start>0);
const script=html.slice(start,html.indexOf('</script>',start));
const cssStart=html.lastIndexOf('<style>',start);
const css=process.env.FULL_STYLE?Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),m=>m[1]).join('\n')+fs.readFileSync(path.join(__dirname,'../apps/web/assets/site-readability.css'),'utf8'):html.slice(cssStart+7,html.indexOf('</style>',cssStart));
let mode='normal';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1512,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
 await page.route('http://session.test/**',async route=>{
  const url=route.request().url();
  if(url.includes('/api/screen'))return route.fulfill({json:{date:'2026-09-16',basis:{long:{lots:10},short:{lots:40},net:{point:46063.28,lots:mode==='zero'?0:mode==='nolots'?null:-30}}}});
  if(url.includes('/api/chart')){
   if(mode==='error')return route.fulfill({status:502,json:{error:'unavailable'}});
   return route.fulfill({json:{quoteType:'published_daily',sessions:{day:{session:'day',price:mode==='bear'?45000:mode==='flat'?46163.28:mode==='upper'?46563.28:mode==='lower'?45563.28:47242,date:'2026-10-16',contractMonth:'202610'},night:mode==='missing'?null:{session:'night',price:47366,date:'2026-10-16',contractMonth:'202610'}}}});
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--surface:#fff;--text:#263448;--text-muted:#607087;--border:#d6deea;--accent:#347fc4}body{margin:0;font-family:Arial}*{box-sizing:border-box}'+css+'</style><div id="hpFut" class="hp-grid"><article class="hp-mc"><h3>外資部位摘要</h3><p>摘要測試內容</p></article><article class="hp-mc"><h3>小台多空摘要</h3><p>摘要測試內容</p></article><article class="hp-mc"><h3>微台多空摘要</h3><p>摘要測試內容</p></article></div><div id="hpForeignCost"></div><div id="fhCards"></div><div id="fhForeignCost"></div><script>(function(){'+script+'</script>'});
 });
 await page.goto('http://session.test/');
 const detail=page.locator('#fhForeignCost');
 await detail.getByText('47,242 點',{exact:true}).waitFor({timeout:5000});
 assert.match(await detail.textContent(),/1,178.72 點/);
 assert.equal(await page.locator('#hpForeignCost .fx-position-lots').count(),0);assert.equal(await page.locator('#hpForeignCost .fx-session-note').count(),0);assert.equal(await detail.locator('.fx-position-lots').count(),1);
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
 await page.setViewportSize({width:1512,height:1000});assert.ok(await page.locator('#hpFut .hp-mc').first().evaluate(e=>e.getBoundingClientRect().height<280),'summary cards must not stretch with detailed content');assert.ok(await page.locator('#hpForeignCost .fx-session-switch').evaluate(e=>{const last=e.lastElementChild.getBoundingClientRect(),r=e.getBoundingClientRect();return r.right-last.right<=7;}),'session segments must fit content');assert.ok(await page.locator('#hpFut').evaluate(e=>{const heights=[...e.children].map(c=>c.getBoundingClientRect().height);return Math.max(...heights)-Math.min(...heights)<2;}),'summary cards must share row height');if(output)await page.locator('#hpFut').screenshot({path:path.join(output,'home-cost-summary.png')});

 await page.setViewportSize({width:1512,height:1000});

 for(const width of [1512,1220,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('#hpForeignCost').evaluate(e=>{const number=e.querySelector('.fx-cost-number'),n=number.getBoundingClientRect(),s=e.querySelector('.fx-session-switch').getBoundingClientRect();return n.right<=s.left+1&&number.scrollWidth<=number.clientWidth+1&&e.scrollWidth<=e.clientWidth+1;}),'cost and session controls must not overlap '+width);}
 await page.setViewportSize({width:1512,height:1000});
 await page.emulateMedia({reducedMotion:'no-preference'});
 async function freeze(ms){await page.waitForTimeout(80);await detail.evaluate((e,t)=>e.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t;}),ms);}
 async function effect(name,selector,animation){
  assert.equal(await detail.locator('.fx-ecg').getAttribute('data-fx-effect'),name);
  await freeze(3400);
  const state=await detail.locator(selector).first().evaluate(e=>({animation:getComputedStyle(e).animationName,opacity:+getComputedStyle(e).opacity,display:getComputedStyle(e).display}));
  assert.equal(state.animation,animation);assert.ok(state.opacity>0);assert.notEqual(state.display,'none');
 }
 async function reload(next){mode=next;await page.evaluate(()=>window._loadForeignSettlementCost());await page.waitForTimeout(120);}
 await effect('rocket','.rocket','fxRocketAfterArrival');
 assert.equal(await detail.locator('.meteor').count(),0);
 assert.match(await detail.locator('.fx-position-lots').textContent(),/淨空30口/);
 if(output)await detail.screenshot({path:path.join(output,'rocket.png')});
 await reload('bear');await effect('meteor','.meteor','fxMeteorAfterArrival');
 assert.equal(await detail.locator('.rocket').count(),0);
 if(output)await detail.screenshot({path:path.join(output,'meteor.png')});
 for(const state of ['flat','upper','lower']){
  await reload(state);await effect('tug','.fx-tug-firework i','fxSparkAfterArrival');
  assert.equal(await detail.locator('.fx-tug-ray').count(),2);
  assert.equal(await detail.locator('.fx-tug-firework i').count(),12);
 }
 await freeze(1000);
 const tips=()=>detail.evaluate(e=>{const l=e.querySelector('.fx-tug-ray.left').getBoundingClientRect(),r=e.querySelector('.fx-tug-ray.right').getBoundingClientRect(),p=e.querySelector('.fx-ecg-plot').getBoundingClientRect();return {gap:r.left-l.right,center:(l.right+r.left)/2,expected:p.x+p.width/2};});
 const early=await tips();await freeze(2999);const late=await tips();
 assert.ok(early.gap>late.gap+100);assert.ok(Math.abs(late.center-late.expected)<2);assert.ok(late.gap<2);
 await freeze(3400);if(output)await detail.screenshot({path:path.join(output,'firework.png')});
 await reload('zero');assert.match(await detail.locator('.fx-position-lots').textContent(),/多空持平0口/);
 await reload('nolots');assert.match(await detail.locator('.fx-position-lots').textContent(),/多空淨額—口/);
 mode='missing';await page.evaluate(()=>window._loadForeignSettlementCost());
 await detail.getByRole('button',{name:'夜盤',exact:true}).click();
 assert.match(await detail.textContent(),/夜盤資料待更新|夜盤 · 資料待更新/);
 assert.doesNotMatch(await detail.textContent(),/47,242|47,366|1,302/);
 assert.equal(await detail.locator('.fx-ecg-current-label').count(),0);

 await effect('basis-demo','.fx-tug-firework i','fxSparkAfterArrival');
 assert.match(await detail.textContent(),/光效為結算基準示意/);
 assert.equal(await detail.locator('.fx-flight').count(),0);
 if(output){await detail.screenshot({path:path.join(output,'pending.png')});await page.setViewportSize({width:390,height:844});assert.equal(await detail.evaluate(e=>e.scrollWidth<=e.clientWidth),true);await detail.screenshot({path:path.join(output,'pending-mobile.png')});}
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await detail.locator('.fx-tug-ray').first().evaluate(e=>getComputedStyle(e).display),'none');
 mode='error';await page.evaluate(()=>window._loadForeignSettlementCost());
 await detail.getByRole('button',{name:'日盤',exact:true}).click();
 assert.match(await detail.textContent(),/日盤資料待更新|日盤 · 資料待更新/);
 assert.doesNotMatch(await detail.textContent(),/47,242|47,366/);
 assert.deepEqual(errors,[]);
 console.log('PASS day/night sync, lots/zero/missing, rocket/meteor animation frames, converging beams/fireworks, boundary thresholds, pending demo, reduced motion, 390px layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
