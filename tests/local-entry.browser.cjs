// Original local entry remains a tiny redirect, never a second website copy.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),entry=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=entry.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.ok(entry.length<2500);assert.ok(fs.existsSync(path.join(root,'apps/web/index.html')));
for(const suffix of ['', '?ref=GS123456#member/referrals','?code=fixture%2Bcode#access_token=fixture-token&type=recovery']){
 const url=new URL('file:///C:/Users/JUSTY%20LIN/Documents/Codex/tw-stock-screener/index.html'+suffix);let target;
 vm.runInNewContext(script,{URL,location:{href:url.href,search:url.search,hash:url.hash,replace:value=>{target=new URL(value);}}});
 assert.equal(target.protocol,'file:');assert.ok(target.pathname.endsWith('/tw-stock-screener/apps/web/index.html'));
 assert.equal(target.search,url.search);assert.equal(target.hash,url.hash);
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://entry.test/**',route=>{
  const url=new URL(route.request().url());
  return route.fulfill({contentType:'text/html; charset=utf-8',body:url.pathname==='/index.html'?entry:'<h1 id="fixture">'+(url.pathname==='/before'?'Previous':'Canonical website')+'</h1>'});
 });
 await page.goto('https://entry.test/before');
 await page.goto('https://entry.test/index.html?ref=GS123456#member/referrals');
 await page.waitForURL('https://entry.test/apps/web/index.html?ref=GS123456#member/referrals');
 await page.locator('#fixture').waitFor();assert.equal(await page.locator('#fixture').textContent(),'Canonical website');
 await page.goBack();assert.equal(new URL(page.url()).pathname,'/before');assert.deepEqual(errors,[]);
 const fallback=await browser.newContext({javaScriptEnabled:false}),nojs=await fallback.newPage();
 await nojs.route('https://entry.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:entry}));
 await nojs.goto('https://entry.test/index.html');assert.equal(await nojs.getByRole('link',{name:'進入網站 →'}).getAttribute('href'),'apps/web/index.html');await fallback.close();
 console.log('PASS original entry: Windows file URL/space path, invitations and callbacks preserved, browser redirect uses replace, no history loop, no-JS fallback, single canonical source.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
