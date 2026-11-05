const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web'),html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const vendor=path.join(process.env.TEMP,'foresight-lightweight-4.1.3.js');
const rows=Array.from({length:320},(_,i)=>{const date=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),close=100+i*.1+Math.sin(i/8)*5;return {time:date,date,trade_date:date,open:close-1,high:close+2,low:close-2,close,value:close,volume:1000};});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{localStorage.setItem('theme',t);localStorage.setItem('fqi.arrival.skip.v2','1');},theme);
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return route.fulfill({path:vendor,contentType:'application/javascript'});
   if(u.origin==='https://market.fixture.test'){const file=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return file.endsWith('index.html')?route.fulfill({contentType:'text/html',body:html.replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}):route.fulfill({path:file});}
   if(u.pathname.endsWith('/api/chart'))return route.fulfill({json:{data:rows}});
   if(u.pathname.endsWith('/index_history')||u.pathname.endsWith('/taiex_daily'))return route.fulfill({json:rows});return route.fulfill({json:[]});});
  await page.goto('https://market.fixture.test/');await page.waitForFunction(()=>window.AcademyMarketDrawing&&window._openSeriesChart);
  await page.evaluate(()=>{document.querySelectorAll('.brand-arrival,#siteGate').forEach(e=>e.remove());document.getElementById('chartModal').classList.add('open');window._names={'2330':'台積電'};});
  for(const [q,code] of [['TSE.TW','^TWII'],['OTC.TW','two'],['FITX*1.TF','wtx&'],['.10088','wtx&'],['VIX.TF','vixtwn'],['TWD.FX','TWD=X'],['SGX FTSE TAIWAN','stwn&']]){
   await page.locator('#chartStockSearch').fill(q);assert.equal(await page.locator('#chartSearchDrop [data-code]').first().getAttribute('data-code'),code,q);
  }
  await page.locator('#chartStockSearch').fill('OTC.TW');await page.locator('#chartStockSearch').press('Enter');
  await page.waitForSelector('#seriesChartDialog .market-draw-tools');const host=page.locator('#seriesChartDialog .vix-history-chart');await host.scrollIntoViewIfNeeded();
  const box=await host.boundingBox(),p1={x:box.x+220,y:box.y+140},p2={x:box.x+400,y:box.y+190};
  await page.locator('#seriesChartDialog [data-draw="seg"]').click();await page.mouse.click(p1.x,p1.y);await page.mouse.click(p2.x,p2.y);
  assert.equal(await page.locator('#seriesChartDialog .market-draw-layer line').count(),1);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('fqi.market.drawings.v1.two')));assert.equal(before.length,1);
  await page.mouse.move(box.x+450,box.y+170);await page.mouse.wheel(0,-200);await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('fqi.market.drawings.v1.two'))),before,'zoom must not mutate anchors');
  await page.mouse.click(box.x+430,box.y+170,{button:'right'});assert.equal(await page.locator('#seriesChartDialog [data-draw=""]').getAttribute('aria-pressed'),'true');
  // Verify redraw and editing against the actual projected line after zoom.
  let line=page.locator('#seriesChartDialog .market-draw-layer line');let geom=await line.evaluate(e=>({x:(+e.getAttribute('x1')+ +e.getAttribute('x2'))/2,y:(+e.getAttribute('y1')+ +e.getAttribute('y2'))/2}));
  await page.mouse.move(box.x+geom.x,box.y+geom.y);await page.mouse.down();await page.mouse.move(box.x+geom.x+20,box.y+geom.y-10,{steps:5});await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('fqi.market.drawings.v1.two'))),before,'line is movable');
  await page.locator('#seriesChartDialog [data-sc-mode="candles"]').click();await page.locator('#seriesChartDialog [data-sc-bench]').click();await page.waitForTimeout(200);
  assert.equal(await page.locator('#seriesChartDialog .market-draw-tools').count(),1,'tools survive candle/benchmark changes');
  await page.locator('#seriesChartDialog .vix-close').click();await page.evaluate(()=>window._openKpiChart('櫃買指數'));await page.waitForSelector('#seriesChartDialog .market-draw-layer line');
  assert.equal(await page.locator('#seriesChartDialog .market-draw-layer line').count(),1,'drawings survive reopening');
  await host.scrollIntoViewIfNeeded();const reopened=await host.boundingBox();geom=await page.locator('#seriesChartDialog .market-draw-layer line').evaluate(e=>({x:(+e.getAttribute('x1')+ +e.getAttribute('x2'))/2,y:(+e.getAttribute('y1')+ +e.getAttribute('y2'))/2}));
  await page.mouse.click(reopened.x+geom.x,reopened.y+geom.y,{button:'right'});await page.locator('#seriesChartDialog [data-copy]').click();
  await page.mouse.click(reopened.x+400,reopened.y+160,{button:'right'});await page.locator('#seriesChartDialog [data-paste]').click();assert.equal(await page.locator('#seriesChartDialog .market-draw-layer line').count(),2,'right click copy/paste');
  await page.locator('#seriesChartDialog [data-undo]').click();assert.equal(await page.locator('#seriesChartDialog .market-draw-layer line').count(),1);
  await page.locator('#seriesChartDialog [data-draw="erase"]').click();await page.mouse.click(reopened.x+geom.x,reopened.y+geom.y);assert.equal(await page.locator('#seriesChartDialog .market-draw-layer line').count(),0,'eraser removes line');
  await page.locator('#seriesChartDialog [data-draw="amplitude"]').click();for(const [x,y] of [[250,210],[350,140],[410,190]])await page.mouse.click(reopened.x+x,reopened.y+y);assert.ok(await page.locator('#seriesChartDialog .market-draw-layer text').count()>0,'three point ruler');
  await page.locator('#seriesChartDialog').screenshot({path:path.join(process.env.TEMP,'market-drawing-'+theme+'.png')});
  await page.locator('#seriesChartDialog .vix-close').click();
  await page.evaluate(()=>window._openMarketTrain());await page.waitForSelector('#marketTrainDialog .market-draw-tools');await page.locator('#marketTrainDialog .train-close').click();
  const relevant=errors.filter(e=>/priceScale|coordinate|AcademyMarket|timeScale|Cannot read/.test(e));assert.deepEqual(relevant,[]);
  console.log('PASS market search, drawing, wheel zoom, move, persistence, train:',theme);await page.close();
 }
 for(const [theme,width,height] of [['light',390,800],['dark',390,800],['light',1366,650]]){
  const page=await browser.newPage({viewport:{width,height}});await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='unpkg.com')return route.fulfill({path:vendor,contentType:'application/javascript'});if(u.origin==='https://market.fixture.test'){const file=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return file.endsWith('index.html')?route.fulfill({contentType:'text/html',body:html.replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}):route.fulfill({path:file});}if(u.pathname.endsWith('/api/chart'))return route.fulfill({json:{data:rows}});if(u.pathname.endsWith('/index_history'))return route.fulfill({json:rows});return route.fulfill({json:[]});});
  await page.goto('https://market.fixture.test/');await page.waitForFunction(()=>window.AcademyMarketDrawing);await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.querySelectorAll('.brand-arrival,#siteGate').forEach(e=>e.remove());window._openKpiChart('台指VIX');},theme);await page.waitForSelector('#seriesChartDialog .market-draw-tools');
  assert.equal(await page.locator('#seriesChartDialog .market-draw-tools').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'toolbar must wrap without horizontal overflow');
  await page.locator('#seriesChartDialog').screenshot({path:path.join(process.env.TEMP,'market-drawing-'+theme+'-'+width+'.png')});await page.close();console.log('PASS compact layout:',theme,width,height);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
