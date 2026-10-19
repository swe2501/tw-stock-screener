/* Full-site theme changes with isolated data and synthetic chart state only. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.hostname==='unpkg.com'&&process.env.LIGHTWEIGHT_FIXTURE)return r.fulfill({path:process.env.LIGHTWEIGHT_FIXTURE,contentType:'text/javascript'});
  if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/rest/'))return r.fulfill({json:[]});
  if(u.hostname==='127.0.0.1'){
   const file=path.resolve(root,'apps/web','.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});
  }
  return r.fulfill({json:[]});
 });
 await page.goto('http://127.0.0.1:49994/?view=groupbook');
 await page.locator('#gbWindow button.on').waitFor();
 await page.locator('#gbWindow [data-w="20"]').click();await page.locator('#gbMode [data-m="list"]').click();
 await page.evaluate(()=>{
  const host=document.createElement('section');host.id='theme-audit';host.style='position:absolute;left:-2000px;width:400px';
  host.innerHTML='<div class="sm-tile" style="position:relative;background:color(srgb .8 .9 .95);width:100px;height:40px">淺色熱區</div>'+['tmx-tabs','ep-seg','ef-seg','in-seg','gs-pdtabs'].map(c=>'<div class="'+c+'"><button class="on">已選</button><button>未選</button></div>').join('');
  document.body.append(host);
 });
 if(process.env.LIGHTWEIGHT_FIXTURE){
  await page.evaluate(()=>{
   const host=document.createElement('div');host.id='theme-chart';host.style='position:absolute;left:-2000px;width:400px;height:200px';document.body.append(host);
   const chart=_createThemedChart(host,{width:400,height:200,layout:{background:{color:'transparent'},textColor:'#111'}}),series=chart.addLineSeries({color:'#4caf83'});
   const data=Array.from({length:30},(_,i)=>({time:'2026-09-'+String(i+1).padStart(2,'0'),value:100+i}));series.setData(data);chart.timeScale().setVisibleLogicalRange({from:5,to:15});
   const adaptive=chart.addLineSeries({color:'#233c56'});_bindThemedSeries(chart,adaptive,{color:'#233c56'},{color:'#e8f2fb'});window.themeAuditAdaptive=adaptive;window.themeAuditChart=chart;window.themeAuditSeries=series;window.themeAuditData=JSON.stringify(series.data());
  });
 }
 async function contrast(selector){return page.locator(selector).evaluateAll(nodes=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  function rgba(s){ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);const d=ctx.getImageData(0,0,1,1).data;return [d[0],d[1],d[2],d[3]/255];}
  function lum(rgb){const c=rgb.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  return nodes.map(e=>{let bg=[0,0,0,0];for(let p=e;p&&bg[3]<.99;p=p.parentElement){const c=rgba(getComputedStyle(p).backgroundColor),a=bg[3]+c[3]*(1-bg[3]);bg=[...[0,1,2].map(i=>(bg[i]*bg[3]+c[i]*c[3]*(1-bg[3]))/(a||1)),a];}const fg=rgba(getComputedStyle(e).color),a=lum(fg),b=lum(bg);return {text:e.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),tone:e.dataset.proTone};});
 });}
 for(let i=0;i<6;i++){
  await page.locator('#themeToggle').click();await page.waitForTimeout(400);
  for(const c of await contrast('#gbWindow button,#gbMode button'))assert.ok(c.ratio>=4.5,JSON.stringify(c));
  assert.equal(await page.locator('#gbWindow button.on').getAttribute('data-w'),'20');
  assert.equal(await page.locator('#gbMode button.on').getAttribute('data-m'),'list');
  assert.equal(await page.locator('button[data-pro-tone]').count(),0,'Theme contrast must not cache text color on controls');
  for(const c of await contrast('#theme-audit .sm-tile'))assert.ok(c.ratio>=4.5,JSON.stringify(c));
  const light=await page.evaluate(()=>document.documentElement.dataset.theme==='light');
  const expected=light?'rgb(255, 255, 255)':'rgb(16, 24, 32)';
  for(const color of await page.locator('#theme-audit button.on').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).color))){const a=color.match(/[0-9.]+/g).map(Number),b=expected.match(/[0-9.]+/g).map(Number);assert.ok(a.every((x,i)=>Math.abs(x-b[i])<=3),color+' should match '+expected);}
  if(process.env.LIGHTWEIGHT_FIXTURE){
   const state=await page.evaluate(()=>({range:themeAuditChart.timeScale().getVisibleLogicalRange(),data:JSON.stringify(themeAuditSeries.data()),text:themeAuditChart.options().layout.textColor,border:themeAuditChart.options().timeScale.borderColor,expected:getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(),grid:getComputedStyle(document.documentElement).getPropertyValue('--border').trim(),original:themeAuditData}));
   assert.deepEqual(state.range,{from:5,to:15});assert.equal(state.data,state.original);assert.equal(state.text.toLowerCase(),state.expected.toLowerCase());assert.equal(state.border.toLowerCase(),state.grid.toLowerCase());assert.equal(await page.evaluate(()=>themeAuditSeries.options().color),'#4caf83');assert.equal(await page.evaluate(()=>themeAuditAdaptive.options().color),light?'#233c56':'#e8f2fb');
  }
  await page.locator('#gbWindow [data-w="5"]').click();await page.locator('#gbWindow [data-w="20"]').click();
  await page.locator('#gbMode [data-m="cards"]').click();await page.locator('#gbMode [data-m="list"]').click();
 }
 await page.locator('#theme-audit .sm-tile').evaluate(e=>{e.style.background='color(srgb .02 .04 .06)';});
 await page.waitForTimeout(160);
 for(const c of await contrast('#theme-audit .sm-tile'))assert.ok(c.ratio>=4.5,JSON.stringify(c));
 await page.evaluate(()=>{for(let i=0;i<9;i++)_toggleTheme();});await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),await page.evaluate(()=>document.documentElement.dataset.theme==='light'?'light':'dark'));
 for(const c of await contrast('#gbWindow button,#gbMode button'))assert.ok(c.ratio>=4.5,JSON.stringify(c));
 if(process.env.LIGHTWEIGHT_FIXTURE){
  assert.deepEqual(await page.evaluate(()=>themeAuditChart.timeScale().getVisibleLogicalRange()),{from:5,to:15});
  await page.evaluate(()=>themeAuditChart.remove());await page.locator('#themeToggle').click();await page.waitForTimeout(400);
 }
 if(output){fs.mkdirSync(output,{recursive:true});if(await page.evaluate(()=>document.documentElement.dataset.theme!=='light')){await page.locator('#themeToggle').click();await page.waitForTimeout(400);}await page.locator('.gb-hero').screenshot({path:path.join(output,'group-controls-light.png')});await page.locator('#themeToggle').click();await page.waitForTimeout(400);await page.locator('.gb-hero').screenshot({path:path.join(output,'group-controls-dark.png')});}
 await page.setViewportSize({width:390,height:844});
 for(let i=0;i<2;i++){await page.locator('#themeToggle').click();await page.waitForTimeout(400);for(const c of await contrast('#gbWindow button,#gbMode button'))assert.ok(c.ratio>=4.5,JSON.stringify(c));}
 assert.deepEqual(errors,[]);
 console.log('PASS theme controls: repeated theme/selection changes preserve state, readable active/inactive labels, no reload');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
