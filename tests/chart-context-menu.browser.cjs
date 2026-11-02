/* Compact chart context palette and keyboard editing regression. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const data=Array.from({length:280},(_,i)=>{const c=100+Math.sin(i/9)*8+i*.03;return {time:new Date(Date.UTC(2025,0,2+i)).toISOString().slice(0,10),open:c-.5,high:c+1.5,low:c-1.5,close:c,volume:10000+i%7*900};});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{for(const theme of ['light','dark']){
 const p=await browser.newPage({viewport:{width:1440,height:900}});
 await p.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fx',email:'swe250165@gmail.com'}));},theme);
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
  if(u.pathname.endsWith('/api/chart'))return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{name:'Context fixture',data}});
  if(u.origin==='https://context.fixture.test'){if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});const f=path.resolve(root,'apps/web','.'+u.pathname);if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});}
  if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'swe250165@gmail.com'}});return r.fulfill({json:[]});});
 await p.goto('https://context.fixture.test/');await p.evaluate(()=>openChart('2330','Context fixture',''));
 await p.waitForFunction(()=>document.querySelector('#chartContainer canvas')&&window.AcademyChartBridge?.get()?.series);
 const tooltip=await p.evaluate(()=>{const tip=document.getElementById('ohlcTooltip');tip.style.display='block';tip.innerHTML='<div class="tt-head"><b>2026/10/30</b><span class="tt-state">已收盤</span></div><div class="tt-ohlc"><span>開</span><b>100</b><span>高</span><b>102</b><span>低</span><b>99</b><span>收</span><b>101</b></div><div class="tt-rows"><span>成交張數</span><span>1,000 張</span></div>';
  _tipFollow({point:{x:360,y:180}});_tipFollow({point:{x:300,y:180}});const leftward=parseFloat(tip.style.left),w=tip.offsetWidth;
  _tipFollow({point:{x:340,y:180}});const rightward=parseFloat(tip.style.left),cs=getComputedStyle(tip);tip.style.display='none';
  return{leftward,rightward,w,bg:cs.backgroundColor,blur:cs.backdropFilter||cs.webkitBackdropFilter};});
 assert.ok(tooltip.leftward>300,'leftward cursor movement should place tooltip on the right');
 assert.ok(tooltip.rightward<340,'rightward cursor movement should place tooltip on the left');
 assert.ok(tooltip.w<220,'tooltip should remain compact');
 assert.match(tooltip.blur,/blur/,'tooltip should use translucent backdrop blur');
 await p.evaluate(()=>{_drawShapes.push({type:'seg',pts:[{time:'2025-08-01',price:102},{time:'2025-08-10',price:105}]});redrawCanvas();});
 const shapePoint=await p.evaluate(()=>{const b=AcademyChartBridge.get(),g=AcademyChartBridge.plot(),s=b.drawings.at(-1);return{x:g.pageLeft+(AcademyChartBridge.x(s.pts[0])+AcademyChartBridge.x(s.pts[1]))/2,y:g.pageTop+(b.series.priceToCoordinate(s.pts[0].price)+b.series.priceToCoordinate(s.pts[1].price))/2};});
 await p.mouse.click(shapePoint.x,shapePoint.y,{button:'right'});
 assert.equal(await p.locator('.drawing-context:not([hidden])').count(),1);
 assert.equal(await p.locator('.drawing-context-tools [data-tool]').count(),6);
 await p.getByRole('menuitem',{name:'複製',exact:true}).click();
 const blank=await p.evaluate(()=>{const g=AcademyChartBridge.plot();return{x:g.pageLeft+g.width*.72,y:g.pageTop+g.height*.7};});
 await p.mouse.click(blank.x,blank.y,{button:'right'});await p.keyboard.press('Control+V');
 assert.equal(await p.evaluate(()=>AcademyChartBridge.get().drawings.length),2);
 const pastedPoint=await p.evaluate(()=>{const b=AcademyChartBridge.get(),g=AcademyChartBridge.plot(),s=b.drawings.at(-1);return{x:g.pageLeft+(AcademyChartBridge.x(s.pts[0])+AcademyChartBridge.x(s.pts[1]))/2,y:g.pageTop+(b.series.priceToCoordinate(s.pts[0].price)+b.series.priceToCoordinate(s.pts[1].price))/2};});
 await p.mouse.click(pastedPoint.x,pastedPoint.y,{button:'right'});await p.keyboard.press('Delete');
 assert.equal(await p.evaluate(()=>AcademyChartBridge.get().drawings.length),1);
 await p.mouse.click(blank.x,blank.y,{button:'right'});await p.locator('.drawing-context [data-tool="rect"]').click();
 assert.equal(await p.evaluate(()=>AcademyChartBridge.get().tool),'rect');await p.keyboard.press('Escape');await p.close();
 }console.log('PASS compact translucent tooltip direction, right-click tools, Ctrl+C/Ctrl+V/Delete, light/dark');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
