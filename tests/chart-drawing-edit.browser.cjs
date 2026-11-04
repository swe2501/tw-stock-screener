/* Focused real-chart layout regression; all data requests are isolated fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT;
const data=Array.from({length:280},(_,i)=>{const c=100+Math.sin(i/9)*8+i*.03;return {time:new Date(Date.UTC(2025,0,2+i)).toISOString().slice(0,10),open:c+(i%2?.5:-.5),high:c+1.5,low:c-1.5,close:c,volume:10000+i%7*900};});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{for(const theme of ['light','dark']){
 const p=await browser.newPage({viewport:{width:1440,height:900}});
 await p.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fx',email:'swe250165@gmail.com'}));},theme);
 await p.route('**/*',r=>{const u=new URL(r.request().url());
 if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
 if(u.pathname.endsWith('/api/chart'))return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{name:'Chart layout fixture',data}});
 if(u.origin==='https://pane.fixture.test'){
 if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});
 if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});
 const f=path.resolve(root,'apps/web','.'+u.pathname);if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});
 }
 if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'swe250165@gmail.com'}});
 return r.fulfill({json:[]});});
 await p.goto('https://pane.fixture.test/');await p.evaluate(()=>openChart('2330','Chart layout fixture',''));
 await p.waitForFunction(()=>document.querySelector('#macdContainer canvas')&&document.querySelector('#chartModal.chart-fit'));


 await p.waitForTimeout(500);
 await p.evaluate(()=>{_drawShapes.push({type:'seg',pts:[{time:'2025-08-01',price:102},{time:'2025-08-10',price:105}]});redrawCanvas();});
 const point=await p.evaluate(()=>{const b=AcademyChartBridge.get(),g=AcademyChartBridge.plot(),s=b.drawings.at(-1);return{x:g.pageLeft+(AcademyChartBridge.x(s.pts[0])+AcademyChartBridge.x(s.pts[1]))/2,y:g.pageTop+(b.series.priceToCoordinate(s.pts[0].price)+b.series.priceToCoordinate(s.pts[1].price))/2};});
 const before=await p.evaluate(()=>JSON.stringify(AcademyChartBridge.get().drawings.at(-1)));
 await p.mouse.move(point.x,point.y);await p.mouse.down();await p.mouse.move(point.x+35,point.y-18,{steps:8});await p.mouse.up();
 assert.notEqual(await p.evaluate(()=>JSON.stringify(AcademyChartBridge.get().drawings.at(-1))),before);
 const moved=await p.evaluate(()=>{const b=AcademyChartBridge.get(),g=AcademyChartBridge.plot(),s=b.drawings.at(-1);return{x:g.pageLeft+AcademyChartBridge.x(s.pts[0]),y:g.pageTop+b.series.priceToCoordinate(s.pts[0].price)};});
 await p.mouse.click(moved.x,moved.y,{button:'right'});await p.getByRole('menuitem',{name:'複製',exact:true}).click();
 await p.mouse.click(moved.x+80,moved.y+45,{button:'right'});await p.getByRole('menuitem',{name:'貼上',exact:true}).click();
 assert.equal(await p.evaluate(()=>AcademyChartBridge.get().drawings.length),2);
 const saved=await p.evaluate(()=>AcademyChartBridge.get().drawings.map(s=>s.pts.map(q=>[q.time,q.price])));
 await p.evaluate(()=>chartInstance.timeScale().setVisibleLogicalRange({from:150,to:279}));await p.waitForTimeout(200);
 assert.deepEqual(await p.evaluate(()=>AcademyChartBridge.get().drawings.map(s=>s.pts.map(q=>[q.time,q.price]))),saved);

 for(const kind of ['amplitude','legacy']){
  await p.evaluate(kind=>{if(kind==='amplitude')_drawShapes.push({type:'amplitude',pts:[{time:'2025-09-01',price:113},{time:'2025-09-07',price:116},{time:'2025-09-15',price:112}]});else trendLines.push({time1:'2025-08-15',price1:111,time2:'2025-08-20',price2:113});redrawCanvas();},kind);
  const start=await p.evaluate(kind=>{const b=AcademyChartBridge.get(),g=AcademyChartBridge.plot(),p=kind==='amplitude'?b.drawings.at(-1).pts[0]:{time:trendLines.at(-1).time1,price:trendLines.at(-1).price1};return{x:g.pageLeft+AcademyChartBridge.x(p),y:g.pageTop+b.series.priceToCoordinate(p.price),price:p.price};},kind);
  await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(start.x+20,start.y+15,{steps:6});await p.mouse.up();
  assert.notEqual(await p.evaluate(kind=>kind==='amplitude'?AcademyChartBridge.get().drawings.at(-1).pts[0].price:trendLines.at(-1).price1,kind),start.price);
 }
 await p.close();
}console.log('PASS drag drawing, right-click copy/paste, stable time/price anchors across zoom, light/dark');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
