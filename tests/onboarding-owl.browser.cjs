const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web'),scan=process.env.VISUAL_SCAN_PATH,out=process.env.OWL_QA_PATH;
const data=JSON.parse(fs.readFileSync(path.join(web,'assets/codex-visual-patterns.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(path.join(scan,'stocks/8081/source.json'),'utf8'));
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],paid=[];let boxReads=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('fqi_onboarded_v1','1');localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user','{"id":"fx","email":"swe250165@gmail.com"}');});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='api.openai.com'||u.searchParams.get('stat')==='aibuy')paid.push(u.toString());
  if(u.hostname==='unpkg.com'&&u.pathname.includes('lightweight-charts'))return r.fulfill({path:process.env.CHART_LIBRARY_PATH,contentType:'text/javascript'});
  if(u.pathname==='/api/chart')return r.fulfill({json:source});
  if(u.pathname==='/api/screen'&&u.searchParams.get('stat')==='visual_patterns')return r.fulfill({json:data});
  if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});
  if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'swe250165@gmail.com'}});
  if(u.pathname==='/rest/v1/box_patterns'){boxReads++;return r.fulfill({json:[{code:'8081',status:'CONFIRMED_UP',upper_center:260,lower_center:240,upper_outer:270,lower_outer:230,data_date:'2026-10-23',window_start:'2026-08-01',window_end:'2026-10-23'}]});}
  if(u.pathname==='/rest/v1/price_window')return r.fulfill({json:[{code:'8081',close:265,trade_date:'2026-10-23'}]});
  if(u.origin==='https://visual-site.fixture.test'){const file=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(file.startsWith(web+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});}
  return r.fulfill({json:[]});
 });

 await page.goto('https://visual-site.fixture.test/');await page.evaluate(()=>FqiTour.open());
 const owl=page.locator('#obRoot .owl-art');await owl.waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('#obRoot .owl-art image')).length===6);
 const size=await owl.boundingBox();assert(Math.abs(size.width/size.height-1789/879)<.01,'original logo ratio');
 const ids=await page.locator('.owl-art [id]').evaluateAll(es=>es.map(e=>e.id));assert.equal(ids.length,new Set(ids).size,'unique clip and mask IDs per logo');
 async function phase(t){await owl.evaluate((e,t)=>e.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t}),t);}
 const frames=await owl.locator('.owl-wing-left').first().evaluate(e=>{const a=e.getAnimations()[0];return {duration:a.effect.getTiming().duration,offsets:a.effect.getKeyframes().map(k=>k.computedOffset)};});
 assert.equal(frames.duration,1600);assert.deepEqual(frames.offsets,[0,.5,1],'continuous strokes without hold keyframes');
 await phase(0);await page.screenshot({path:path.join(out,'tour-rest.png'),animations:'allow'});
 await owl.screenshot({path:path.join(out,'owl-rest.png'),scale:'css'});
 await phase(800);await page.screenshot({path:path.join(out,'tour-flap.png'),animations:'allow'});
 await owl.screenshot({path:path.join(out,'owl-flap.png'),scale:'css'});
 assert.equal(await owl.locator('.owl-body').evaluateAll(es=>es.every(e=>getComputedStyle(e).transform==='none')),true,'head/body/book never transform');
 await page.setViewportSize({width:375,height:900});await page.screenshot({path:path.join(out,'tour-mobile.png'),animations:'allow'});assert.equal(await page.locator('#obRoot').evaluate(e=>e.scrollWidth<=innerWidth),true,'mobile overlay within viewport');
 await page.locator('#themeToggle').evaluate(e=>e.click());await phase(800);await page.screenshot({path:path.join(out,'tour-dark.png'),animations:'disabled'});
 assert.equal(await owl.locator('.owl-dark-v2').evaluate(e=>getComputedStyle(e).display!=='none'),true);
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>{window.__tourScrolls=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.__tourScrolls.push(options);return original.call(this,options);};});
 await page.locator('#obRoot [data-a="start"]').click();
 await page.locator('.ob-guide').waitFor();
 await page.waitForTimeout(450);
 const stable=await page.locator('.ob-guide').boundingBox();const scroll=await page.evaluate(()=>scrollY);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>scrollY),scroll,'no late scroll after first step appears');assert.equal((await page.locator('.ob-guide').boundingBox()).y,stable.y,'first bubble stays positioned');
 assert.equal(await page.evaluate(()=>window.__tourScrolls.some(o=>o?.behavior==='smooth')),false,'tour never measures during smooth scrolling');
 assert.equal(await page.locator('.ob-pop .ob-owl').count(),0,'owl stands outside speech bubble');
 assert.equal(await page.locator('.ob-guide-host .ob-owl').count(),1);
 for(const width of [1440,375]){
  await page.setViewportSize({width,height:950});await page.waitForTimeout(350);
  const bounds=await page.locator('.ob-guide').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=951,'guide within viewport '+width+' '+JSON.stringify(bounds));
  await page.screenshot({path:path.join(out,'guide-bubble-'+width+'.png')});
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.ob-guide .owl-art').evaluate(e=>e.getAnimations({subtree:true}).length),0,'reduced motion stops wings');
 assert.deepEqual(errors,[]);assert.deepEqual(paid,[]);console.log('PASS: unique SVG layers, original aspect ratio, stationary body, wing motion, light/dark/mobile, reduced motion, no inference.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
