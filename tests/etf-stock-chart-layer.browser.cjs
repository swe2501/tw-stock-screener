const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  const p=await b.newPage({viewport:{width,height:920},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await p.route('**/*',r=>{const u=new URL(r.request().url());
   if(u.origin==='https://etf-layer.fixture.test'){
    const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));
    if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()){
     if(f.endsWith('index.html'))return r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('var origShow=window._showView, origOpen=window.openChart, origClose=window.closeChart;',`window.openChart=function(code,name){document.getElementById('chartModal').classList.add('open');document.getElementById('modalTitle').textContent=code+' '+name;};var origShow=window._showView, origOpen=window.openChart, origClose=window.closeChart;`).replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')});
     return r.fulfill({path:f});
    }if(u.pathname==='/api/auth')return r.fulfill({json:{required:false}});return r.fulfill({json:{}});
   }
   if(u.pathname.endsWith('/etf_products'))return r.fulfill({json:[{code:'00400A',name:'測試主動 ETF',active:true,close:14.84}]});
   if(u.pathname.endsWith('/etf_holdings'))return r.fulfill({json:[{code:'00400A',stock_code:'2330',stock_name:'台積電',weight:8.9,shares:1130000}]});
   return r.fulfill({json:[]});
  });
  await p.goto('https://etf-layer.fixture.test');await p.waitForFunction(()=>window._etxOpen&&window.AcademyNavigationLayers);
  await p.evaluate(()=>{_showView('etfx');_etxOpen('00400A');});await p.locator('#etxDrawer .etx-dtabs button').filter({hasText:'成分股'}).click();
  assert.match(await p.locator('#etxDrawer .etx-donut-note').innerText(),/8.90%/);assert.match(await p.locator('#etxDrawer .etx-donut-note').innerText(),/91.10%/);
  const row=p.locator('#etxDrawer tr').filter({hasText:'台積電'});await row.locator('td').nth(1).click();await p.waitForFunction(()=>history.state?.academyLayers?.length===2);
  assert.equal(await p.locator('#chartModal').isVisible(),true);assert.match(await p.locator('#modalTitle').textContent(),/2330/);
  assert.equal(await p.evaluate(()=>{const d=document.getElementById('etxDrawer'),c=document.getElementById('chartModal');return Number(getComputedStyle(c).zIndex)>Number(getComputedStyle(d).zIndex);}),true,'standalone chart must be above the ETF source');
  assert.equal(await p.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('#chartModal')!==null),true,'chart receives pointer input, not the drawer backdrop');
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('chartModal').classList.contains('open'));
  assert.equal(await p.locator('#etxDrawer').isVisible(),true);assert.equal(await p.locator('#etxDrawer .etx-dtabs button.on').textContent(),'成分股');
  await p.goForward();await p.waitForFunction(()=>document.getElementById('chartModal').classList.contains('open'));
  await p.locator('#chartModal .modal-close').click();await p.waitForFunction(()=>!document.getElementById('chartModal').classList.contains('open'));
  assert.equal(await p.locator('#etxDrawer').isVisible(),true);
  await p.evaluate(()=>_etxTab('technical'));await p.waitForFunction(()=>document.getElementById('chartModal').classList.contains('etx-embedded'));
  assert.equal(await p.locator('#chartModal').evaluate(e=>getComputedStyle(e).zIndex),'auto','embedded ETF technical chart remains in the drawer');
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS ETF stock chart layers: real holdings click, chart above drawer and clickable, Escape/close/forward preserve ETF tab, embedded technical chart unchanged; light/dark desktop/mobile.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
