const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});let registered=false,blocked=false,errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://forum.test/**',async route=>{
  if(!route.request().url().endsWith('/api/auth'))return route.fulfill({contentType:'text/html',body:'<main>先見</main>'});
  const {action}=route.request().postDataJSON();let out={};let status=200;
  if(action==='site_ads')out={ads:[]};
  else if(action==='forum_events')out={events:[{id:'TPE1122',city_name:'台北',date:'2099-11-22',start:'13:30',end:'17:30',venue:'會議中心'}]};
  else if(action==='forum_registration_status')out={attended:false,no_shows:blocked?3:0,blocked,registrations:registered?[{event:'TPE1122',status:'registered'}]:[]};
  else if(action==='forum_register'){if(blocked){status=403;out={code:'FORUM_NO_SHOW_LIMIT',error:'你已累計三次報名未到場，本次未能完成報名。'};}else{registered=true;out={ok:true};}}
  else if(action==='forum_cancel'){registered=false;out={ok:true};}else throw Error(action);
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});
 });
 await page.goto('https://forum.test');await page.evaluate(()=>localStorage.setItem('sb_token','browser-test-only'));
 await page.addStyleTag({content:':root{--surface:#fff;--text:#293849;--text-muted:#63738a;--border:#d7e0e8;--accent:#3b85c4}'});
 await page.addStyleTag({path:'apps/web/assets/forum-ads.css'});await page.addScriptTag({path:'apps/web/assets/forum-member.js'});
 await page.evaluate(()=>ForumMember.openForum());await page.getByRole('button',{name:'站內報名',exact:true}).click();
 await page.getByRole('button',{name:'取消報名',exact:true}).waitFor();assert(registered);
 await page.getByRole('button',{name:'取消報名',exact:true}).click();await page.getByRole('button',{name:'站內報名',exact:true}).waitFor();assert(!registered);
 blocked=true;await page.getByRole('button',{name:'站內報名',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-reg-msg]')?.textContent.includes('三次'));
 assert(!registered);const card=await page.locator('.fm-card').boundingBox();assert(card.y>=0&&card.y+card.height<=844);
 assert.deepEqual(errors,[]);await browser.close();console.log('Member forum browser: signup, cancel, blocked message and mobile bounds passed (mock API).');
})().catch(e=>{console.error(e);process.exitCode=1});
