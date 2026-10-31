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

 await p.waitForFunction(()=>JSON.stringify(chartInstance.timeScale().getVisibleLogicalRange())===JSON.stringify(volInstance.timeScale().getVisibleLogicalRange()));
 const before=await p.evaluate(()=>volInstance.timeScale().getVisibleLogicalRange());
 for(const index of [255,256]){
  await p.evaluate(time=>AcademyVolumeFocus.hover(time),data[index].time);
  await p.locator('.volume-focus-bar').waitFor({state:'visible'});
  assert.match(await p.locator('.volume-focus-label').innerText(),new RegExp(Number(data[index].volume).toLocaleString('zh-TW')));
  assert.equal(await p.locator('.volume-focus-bar').evaluate(e=>e.style.getPropertyValue('--volume-focus')),index%2?(theme==='light'?'#208653':'#50d49b'):(theme==='light'?'#d84545':'#ff7878'));
  const range=await p.evaluate(()=>volInstance.timeScale().getVisibleLogicalRange());assert.deepEqual(range,before);
 }
 // Actual pointer crosshair events on the main chart update the volume pane.
 const point=await p.evaluate(t=>({x:chartInstance.timeScale().timeToCoordinate(t),r:document.getElementById('chartContainer').getBoundingClientRect().toJSON()}),data[260].time);
 await p.mouse.move(point.r.left+point.x,point.r.top+90);await p.waitForTimeout(100);
 assert.equal(await p.locator('.volume-focus-bar').isVisible(),true);
 assert.match(await p.locator('.volume-focus-label').innerText(),new RegExp(Number(data[260].volume).toLocaleString('zh-TW')));
 if(out)await p.screenshot({path:path.join(out,`volume-focus-${theme}.png`)});
 await p.evaluate(()=>AcademyVolumeFocus.hover(null));assert.equal(await p.locator('.volume-focus-bar').isVisible(),false);
 await p.evaluate(()=>_renderVOLChart(window._vpCandles));assert.equal(await p.locator('.volume-focus-bar').count(),1);
 await p.close();
}console.log('PASS real crosshair volume emphasis, exact value, unchanged scale/range, cleanup, light/dark');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
