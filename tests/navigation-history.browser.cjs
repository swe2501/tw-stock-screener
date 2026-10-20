const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web'),out='C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/screen-calendar-review';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const theme of ['light']){
const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fixture'}));},theme);
await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='https://fullcalendar.fixture.test'){const f=path.resolve(web,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(f.startsWith(web+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()){if(f.endsWith('index.html'))return r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace('window.SITE_GATE_ON = true','window.SITE_GATE_ON = false')});return r.fulfill({path:f});}if(u.pathname==='/api/auth')return r.fulfill({json:{required:false}});return r.fulfill({json:{}});}if(u.pathname.endsWith('/settings'))return r.fulfill({json:{external:{email:true}}});if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fixture',email:'fixture@example.test',email_confirmed_at:'2026-01-01',user_metadata:{display_name:'研究會員'}}});if(u.pathname.endsWith('/member_screen_calendar'))return r.fulfill({json:{today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),server_time:new Date().toISOString(),rows:[]}});return r.fulfill({json:[]});});

await p.goto('https://fullcalendar.fixture.test');await p.waitForFunction(()=>window.openMemberCenter&&window.AcademyScreenLog);
const show=async v=>{await p.evaluate(v=>window._showView(v),v);await p.waitForFunction(v=>location.hash===(v==='home'?'':'#'+v),v);};
const back=async hash=>{await p.goBack();await p.waitForFunction(hash=>location.hash===hash,hash);};
const forward=async hash=>{await p.goForward();await p.waitForFunction(hash=>location.hash===hash,hash);};
await show('screen');await show('themes');await show('news');
await back('#themes');assert.equal(await p.locator('#themesView').isVisible(),true);
await back('#screen');assert.equal(await p.locator('#proScreenLayout').isVisible(),true,'screen route is not a registry view and must not fall back to home');
await back('');await forward('#screen');await forward('#themes');
await p.evaluate(()=>openMemberCenter('overview'));await p.waitForFunction(()=>location.hash==='#member/overview');
await p.evaluate(()=>openMemberCenter('profile'));await p.waitForFunction(()=>location.hash==='#member/profile');
await p.evaluate(()=>openMemberCenter('screen-calendar'));await p.waitForFunction(()=>location.hash==='#member/screen-calendar');
await back('#member/profile');assert.equal(await p.locator('.member-page').evaluate(e=>e.hidden),false);
await back('#member/overview');await back('#themes');assert.equal(await p.locator('.member-page').evaluate(e=>e.hidden),true);
await forward('#member/overview');await forward('#member/profile');
await show('news');assert.equal(await p.locator('.member-page').evaluate(e=>e.hidden),true,'public navigation leaves account overlay');
await back('#member/profile');assert.equal(await p.locator('.member-page').evaluate(e=>e.hidden),false);
await p.locator('.member-page [data-back]').click();await p.waitForFunction(()=>location.hash==='#member/overview');
await p.locator('body>header .gs-brand').evaluate(e=>e.click());await p.waitForFunction(()=>location.hash==='');await back('#member/overview');assert.equal(await p.locator('.member-page').evaluate(e=>e.hidden),false,'brand home preserves prior account page');
await p.goto('https://fullcalendar.fixture.test/#member/profile');await p.locator('.member-page:not([hidden])').waitFor();assert.equal(await p.evaluate(()=>location.hash),'#member/profile','direct member link survives boot');
await p.evaluate(()=>openMemberCenter('screen-calendar'));await p.waitForFunction(()=>location.hash==='#member/screen-calendar');await back('#member/profile');
assert.deepEqual(errors,[]);await p.close();
}console.log('PASS real website back/forward: public views including screen, member tab history, public/member transitions and member back button.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
