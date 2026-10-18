// Full website and real modules, synthetic public data, all network intercepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./sector-fixtures.cjs');
const root=path.join(__dirname,'..'),web=path.join(root,'apps/web'),data=fixture(400),output=process.env.QA_OUTPUT;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1512,height:1100},reducedMotion:'reduce'}),errors=[];let sectorRequests=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin==='https://sector.fixture.test'){
   const file=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
   return route.fulfill({json:[]});
  }
  if(u.pathname.endsWith('/sector_turnover')){if(u.searchParams.get('limit')==='520')sectorRequests++;return route.fulfill({json:[...data.rows].reverse().slice(0,Number(u.searchParams.get('limit'))||520)});}
  if(u.pathname.endsWith('/taiex_daily'))return route.fulfill({json:[...data.taiex].reverse()});
  if(u.pathname.endsWith('/otc_index_daily'))return route.fulfill({json:[...data.otc].reverse()});
  return route.fulfill({json:[]});
 });
 await page.goto('https://sector.fixture.test/');
 const dashboard=page.locator('#hpStruct .sd-dashboard');await dashboard.waitFor({timeout:20000});
 assert.equal(await dashboard.locator('[data-sd-sector]').count(),3);assert.equal(await dashboard.locator('select').count(),1);
 assert.deepEqual(await dashboard.locator('option').allTextContents(),['今日','3日','5日','10日','20日','60日']);
 assert.equal(await page.locator('#hpStruct .gs-otc').count(),1);assert.equal(await page.locator('#hpStruct .gs-shdet').count(),1);
 assert.doesNotMatch(await dashboard.textContent(),/主攻|多頭結構強勁|健康主流攻堅/);
 await dashboard.locator('select').selectOption('5');
 assert.match(await dashboard.locator('.sd-context').textContent(),/近 5 個交易日，對比前 5 個交易日/);
 await dashboard.locator('[data-sd-sector=elec]').click();
 const detail=page.locator('dialog.sd-detail');await detail.waitFor({state:'visible'});
 assert.match(await detail.locator('h2').textContent(),/電子/);assert.equal(await detail.locator('[data-sd-period]').inputValue(),'5');
 assert.equal(await detail.locator('.sd-stat').count(),4);assert.equal(await detail.locator('.sd-period-cell').count(),6);
 assert.equal(await detail.locator('.sd-history-line').count(),1);
 await detail.locator('[data-sd-date]').fill('10');await detail.locator('[data-sd-date]').dispatchEvent('input');
 assert.match(await detail.locator('[data-sd-readout]').textContent(),/\d{4}-\d{2}-\d{2} · .*%/);
 await detail.locator('[data-sd-mode=amount]').click();assert.match(await detail.locator('[data-sd-readout]').textContent(),/億元/);
 if(output)fs.mkdirSync(output,{recursive:true});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{if((document.documentElement.dataset.theme==='light')!==(theme==='light'))window._toggleTheme();},theme);
  assert.equal(await detail.locator('[data-sd-period]').inputValue(),'5');
  assert.equal(await detail.locator('[data-sd-mode=amount]').getAttribute('aria-pressed'),'true');
  assert.ok(await detail.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  if(output)await detail.screenshot({path:path.join(output,'detail-'+theme+'-desktop.png')});
 }
 await detail.locator('[data-sd-period]').selectOption('60');assert.equal(await dashboard.locator('select').inputValue(),'60');
 await detail.locator('[data-sd-close]').click();assert.ok(await dashboard.locator('[data-sd-sector=elec]').evaluate(e=>e===document.activeElement));
 if(output)await dashboard.screenshot({path:path.join(output,'dashboard-dark-desktop.png')});
 await dashboard.locator('[data-sd-sector=fin]').focus();await page.keyboard.press('Enter');await detail.waitFor({state:'visible'});assert.match(await detail.locator('h2').textContent(),/金融/);
 for(const theme of ['light','dark'])for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.evaluate(theme=>{if((document.documentElement.dataset.theme==='light')!==(theme==='light'))window._toggleTheme();},theme);
  assert.ok(await detail.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'mobile dialog '+width);
  assert.ok(await detail.locator('[data-sd-close]').isVisible());
  if(output)await detail.screenshot({path:path.join(output,'detail-'+theme+'-'+width+'.png')});
 }
 await page.keyboard.press('Escape');assert.equal(await detail.isVisible(),false);
 assert.ok(await dashboard.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 if(output)await dashboard.screenshot({path:path.join(output,'dashboard-dark-mobile.png')});
 // Actual source currently has only 23 sector sessions: do not invent earlier history.
 await page.evaluate(d=>AcademySectorDashboard.mount(document.getElementById('hpStruct'),d),{...data,rows:data.rows.slice(-23)});
 await dashboard.locator('select').selectOption('20');assert.match(await dashboard.locator('.sd-notice').textContent(),/前期需要 20 個交易日，目前有 3 日/);
 await dashboard.locator('select').selectOption('60');assert.match(await dashboard.locator('.sd-notice').textContent(),/本期需要 60 個交易日，目前有 23 日/);
 assert.equal(await dashboard.locator('.pro-gauge-num').first().textContent(),'—');
 await dashboard.locator('[data-sd-sector=trad]').click();assert.match(await detail.locator('h2').textContent(),/其他傳產/);assert.match(await detail.locator('.sd-detail-summary').textContent(),/資料不足/);
 await page.keyboard.press('Escape');
 const sparse=data.rows.slice(-23).map(r=>{const x={...r};delete x.total_amt;return x;});
 await page.evaluate(d=>AcademySectorDashboard.mount(document.getElementById('hpStruct'),d),{...data,rows:sparse});
 await dashboard.locator('select').selectOption('5');assert.match(await dashboard.locator('.sd-context').textContent(),/每日占比平均/);
 await dashboard.locator('[data-sd-sector=elec]').click();assert.match(await detail.locator('.sd-detail-summary').textContent(),/缺少完整成交金額/);
 if(process.env.LIVE_PUBLIC_FIXTURE){
  const actual=JSON.parse(fs.readFileSync(process.env.LIVE_PUBLIC_FIXTURE,'utf8'));
  await page.keyboard.press('Escape');await page.setViewportSize({width:1512,height:1100});
  await page.evaluate(d=>AcademySectorDashboard.mount(document.getElementById('hpStruct'),d),actual);
  await dashboard.locator('select').selectOption('1');
  const latest=[...actual.rows].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  assert.equal(await dashboard.locator('.pro-gauge-num').first().textContent(),(latest.elec_amt/latest.total_amt*100).toFixed(1)+'%');
  assert.match(await dashboard.locator('.sd-context').textContent(),new RegExp(latest.date));
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{if((document.documentElement.dataset.theme==='light')!==(theme==='light'))window._toggleTheme();},theme);
   if(output)await dashboard.screenshot({path:path.join(output,'actual-dashboard-'+theme+'.png')});
  }
  await dashboard.locator('[data-sd-sector=elec]').click();
  if(output)await detail.screenshot({path:path.join(output,'actual-detail-dark.png')});
  await page.keyboard.press('Escape');await dashboard.locator('select').selectOption('60');assert.match(await dashboard.locator('.sd-notice').textContent(),/資料/);
 }
 assert.deepEqual(errors,[]);assert.equal(sectorRequests,1,'theme/period changes must not refetch or reset the dashboard');
 console.log('PASS full-site sector dashboard: six compact dropdown periods, 3 clickable gauges, equal-window money comparison, dialog sync, money/share chart and keyboard dates, preserved OTC/reference, themes, desktop/390/320, keyboard close/focus, 23-session shortages, explicit percentage fallback, no false bullish claims.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
