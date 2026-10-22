/* Focused real-chart layout regression; all data requests are isolated fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT;
const data=Array.from({length:280},(_,i)=>{const c=100+Math.sin(i/9)*8+i*.03;return {time:new Date(Date.UTC(2025,0,2+i)).toISOString().slice(0,10),open:c-.5,high:c+1.5,low:c-1.5,close:c,volume:10000+i%7*900};});
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
 async function check(){await p.waitForTimeout(180);const result=await p.evaluate(()=>{const ids=['mainChartPanel','volPanel','macdPanel'];const heights=ids.map(id=>document.getElementById(id).getBoundingClientRect().height);const total=heights.reduce((a,b)=>a+b);return {ratio:heights.map(h=>h/total),plots:['chartContainer','volContainer','macdContainer'].map(id=>{const e=document.getElementById(id);return [e.clientHeight,e.querySelector('.tv-lightweight-charts').getBoundingClientRect().height];})};});result.ratio.forEach((x,i)=>assert.ok(Math.abs(x-[.6,.2,.2][i])<.015,JSON.stringify(result)));result.plots.forEach(([h,canvas])=>assert.ok(Math.abs(h-canvas)<2));}
 for(const [width,height] of [[1440,900],[1366,768],[390,844]]){await p.setViewportSize({width,height});await check();if(out)await p.screenshot({path:path.join(out,`panes-${theme}-${width}.png`)});}
 await p.setViewportSize({width:1440,height:900});await p.evaluate(()=>document.getElementById('chartModal').classList.add('kfull'));await check();await p.evaluate(()=>document.getElementById('chartModal').classList.remove('kfull'));
 const slider=p.getByLabel('K 圖高度比例',{exact:true});await slider.fill('74');await slider.dispatchEvent('input');await p.getByRole('button',{name:'還原圖表比例',exact:true}).click();assert.equal(await slider.inputValue(),'60');await check();
 await p.getByLabel('下方技術指標',{exact:true}).selectOption('rsi');await p.waitForTimeout(160);assert.equal(await p.locator('#rsiPanel').isVisible(),true);assert.equal(await p.locator('#macdPanel').isVisible(),false);await p.close();
}console.log('PASS 60/20/20 actual pane heights, canvas sizing, desktop/mobile, light/dark, fullscreen, reset and RSI switch');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

