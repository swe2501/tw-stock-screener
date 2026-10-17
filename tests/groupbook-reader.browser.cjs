/* Real reader UI, offline requests: no credentials or live financial mutations. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT;
const source=JSON.parse(fs.readFileSync(path.join(root,'data/groupbook-quarterly-research.json'),'utf8'));
for(const [quarter,records] of Object.entries(source.quarters)){
 const text=fs.readFileSync(path.join(root,'assets/groupbook-research',quarter+'.js'),'utf8');
 const bundle=JSON.parse(text.slice(text.indexOf(']=')+2).replace(/;\s*$/,''));
 assert.deepEqual(bundle.records,records,'Bundled source must not truncate or drop research: '+quarter);
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],calls=[];
 let bundleFails=true,apiHealthy=false,cacheHealthy=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/screen'&&['groupresearch','groupbook'].includes(u.searchParams.get('stat'))){
   calls.push(u.origin);
   if(apiHealthy&&u.searchParams.get('stat')==='groupresearch'){
    const quarter=u.searchParams.get('quarter'),records=source.quarters[quarter];
    return route.fulfill({json:{quarter,stocks:{},financials:{},editorial:{'力晶／力積電集團':Object.fromEntries(['6770','6531','3006'].filter(c=>records[c]).map(c=>[c,records[c]]))}}});
   }
   return route.fulfill({json:{status:'ok'}});
  }
  if(u.pathname.includes('/assets/groupbook-research/')&&bundleFails)return route.fulfill({status:503,body:''});
  if(u.pathname==='/rest/v1/page_cache'&&cacheHealthy){
   const isResearch=u.searchParams.get('or').includes('groupbook_research_');
   const payload=isResearch?{quarter:'2026Q4',stocks:{},financials:{},editorial:{'力晶／力積電集團':Object.fromEntries(['6770','6531','3006'].map(c=>[c,source.quarters['2026Q4'][c]]))}}:{window:10,date:'2026-10-16',groups:[{name:'力晶／力積電集團',samples:4,score:55,members:[{code:'6770',samples:4,winRate:50,medianReturn:1}],events:[{quarter:'2026Q3',return:1,excess:0,breadth:50}]}]};
   assert.ok(route.request().headers().apikey);
   assert.equal(route.request().headers().authorization,undefined,'Public data fallback must not transmit a member token');
   return route.fulfill({json:[{payload,updated_at:'2026-10-17T00:00:00Z'}]});
  }
  if(u.hostname==='127.0.0.1'){
   const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
  }
  return route.fulfill({json:[]});
 });
 await page.goto('http://127.0.0.1:49995/?view=groupbook');
 await page.locator('#gbBoard [data-g="力晶／力積電集團"]').click();
 const drawer=page.locator('#gbDetail .gb-detail'),research=drawer.locator('#gbSectionResearch');
 await research.getByText(/目前無法確認涵蓋數，不代表零筆/).waitFor();
 assert.doesNotMatch(await research.innerText(),/研究 0 檔|所選季度尚無/);
 assert.doesNotMatch(await drawer.locator('#gbSectionFinancial').innerText(),/已取得 0/);
 assert.match(await drawer.locator('#gbSectionStats').innerText(),/統計資料載入失敗/);
 bundleFails=false;await research.locator('#gbResearchRetry').click();
 await drawer.locator('.gb-stock-research').first().waitFor();
 assert.equal(await drawer.locator('.gb-stock-research').count(),3);
 assert.match(await research.innerText(),/隨網站版本附載的完整研究/);
 assert.match(await research.innerText(),/目前已載入有來源研究 3 檔/);
 assert.equal(await drawer.locator('.gb-stock-research details[open]').count(),3);
 assert.ok(calls.length&&calls.every(x=>x==='https://tw-stock-screener-neon.vercel.app'));
 assert.ok(await drawer.locator('.gb-subtitle').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>parseFloat(getComputedStyle(e.parentElement.querySelector('p')).fontSize)));
 const originalWindowScroll=await page.evaluate(()=>scrollY);
 for(const id of ['Financial','Stats','Background','Members','Research']){
  await drawer.locator('[data-gb-section="gbSection'+id+'"]').click();
  await page.waitForTimeout(1000);
  const placement=await drawer.evaluate((d,id)=>{const nav=d.querySelector('.gb-detail-nav').getBoundingClientRect(),target=d.querySelector('#gbSection'+id).getBoundingClientRect();return {targetTop:target.top,navBottom:nav.bottom,scroll:d.scrollTop,overflow:d.scrollWidth>d.clientWidth+1};},id);
  assert.ok(placement.targetTop>=placement.navBottom-1,'Target heading must remain below sticky bookmarks: '+id);
  assert.ok(placement.targetTop<900,'Target heading must be visible after the jump: '+id);
  assert.equal(placement.overflow,false);
  assert.equal(await drawer.locator('[data-gb-section="gbSection'+id+'"]').getAttribute('aria-current'),'true');
 }
 assert.equal(await page.evaluate(()=>scrollY),originalWindowScroll);
 if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'group-reader-desktop.png')});}
 await page.setViewportSize({width:390,height:844});
 await drawer.locator('[data-gb-section="gbSectionResearch"]').click();await page.waitForTimeout(1000);
 assert.ok(await drawer.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 assert.ok(await drawer.locator('.gb-detail-nav').evaluate(n=>Array.from(n.children).every(b=>b.getBoundingClientRect().right<=n.getBoundingClientRect().right+1)));
 if(output)await page.screenshot({path:path.join(output,'group-reader-mobile.png')});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await drawer.locator('[aria-current=true]').evaluate(e=>getComputedStyle(e,':before').animationName),'none');
 apiHealthy=true;await drawer.locator('[data-gb-section="gbSectionResearch"]').click();
 await research.locator('#gbResearchRetry').click();
 await page.waitForFunction(()=>!document.querySelector('#gbResearchRetry'));
 assert.equal(await drawer.locator('.gb-stock-research').count(),3);
 assert.doesNotMatch(await research.innerText(),/版本附載|研究 0 檔/);
 apiHealthy=false;cacheHealthy=true;bundleFails=true;
 await page.goto('http://127.0.0.1:49995/?view=groupbook&cache_fixture=1');
 await page.locator('#gbBoard [data-g="力晶／力積電集團"]').click();
 await drawer.locator('.gb-stock-research').first().waitFor();
 assert.equal(await drawer.locator('.gb-stock-research').count(),3);
 assert.doesNotMatch(await research.innerText(),/版本附載|研究 0 檔/);
 await drawer.locator('#gbSectionStats .gb-drawer-kpis').waitFor({state:'attached'});
 assert.match(await drawer.locator('#gbSectionStats').innerText(),/55/);
 assert.deepEqual(errors,[]);
 console.log('PASS group reader: failed != zero, complete bundled research, full source visible, local routing, smooth section bookmarks, mobile layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
