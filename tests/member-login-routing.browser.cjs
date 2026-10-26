/* Real UI and PKCE callbacks against isolated service responses only. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const web=path.resolve(__dirname,'../apps/web');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'}),user={id:'route-member',email:'route@example.test',email_confirmed_at:'2026-01-01',user_metadata:{display_name:'路由驗證會員',onboarded_tour_v1:true},identities:[{provider:'email'},{provider:'google'}]},errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{localStorage.setItem('fqi.arrival.skip.v1','1');localStorage.setItem('fqi_onboarded_v1','1');});
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.pathname==='/api/auth')return r.fulfill({json:{required:false}});
  if(u.origin==='https://routing.fixture.test'){const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill(f.endsWith('index.html')?{contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')}:{path:f});return r.fulfill({json:{}});}
  if(u.hostname==='provider.fixture.test')return r.fulfill({contentType:'text/html',body:'<h1>隔離授權頁</h1>'});
  if(u.pathname.endsWith('/settings'))return r.fulfill({json:{external:{google:true,email:true}}});
  if(u.pathname.endsWith('/user/identities/authorize'))return r.fulfill({json:{url:'https://provider.fixture.test/authorize'}});
  if(u.pathname==='/auth/v1/user')return r.fulfill({json:user});
  if(u.pathname==='/auth/v1/token')return r.fulfill({json:{access_token:'route-token',refresh_token:'route-refresh',user}});
  return r.fulfill({json:[]});
 });
 // Even a legacy normal login return target must not open member overview.
 await p.goto('https://routing.fixture.test/');await p.waitForFunction(()=>window.AcademyLoginNavigation);
 await p.evaluate(()=>sessionStorage.setItem('academy.oauth',JSON.stringify({verifier:'fixture-verifier',created:Date.now(),returnHash:'#member/overview'})));
 await p.goto('https://routing.fixture.test/?code=isolated-login');await p.waitForFunction(()=>localStorage.getItem('sb_token')==='route-token'&&getComputedStyle(document.getElementById('homeView')).display!=='none');assert.ok(!p.url().includes('#member/'));assert.equal(await p.locator('.member-page').isVisible(),false);
 // Bind from profile through the actual authorization/callback functions.
 await p.evaluate(()=>{window.AcademyCloud=null;openMemberCenter('profile');});await p.locator('.member-page:not([hidden])').waitFor();await p.evaluate(()=>AcademyIdentity.linkOAuth('google'));await p.waitForURL('https://provider.fixture.test/authorize');
 await p.goto('https://routing.fixture.test/?code=isolated-link');await p.waitForURL('**/#member/profile');await p.locator('.member-page:not([hidden])').waitFor();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('sb_user')).id),'route-member');assert.deepEqual(errors,[]);
 console.log('PASS new OAuth login returns home; verified identity binding returns to the original member profile page and preserves account identity.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
