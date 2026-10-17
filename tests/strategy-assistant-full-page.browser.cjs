/* Real index/modules/CSS, isolated identity and offline network fixtures. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT;
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1512,height:1050}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'strategy-fixture',email:'fixture@example.test'}));});
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.origin==='https://strategy.fixture.test'){
   if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});
   if(u.pathname==='/')return r.fulfill({path:path.join(root,'index.html'),contentType:'text/html; charset=utf-8'});
   const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
   if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});
   return r.fulfill({json:{}});
  }
  if(u.hostname.endsWith('.supabase.co')){
   if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'strategy-fixture',email:'fixture@example.test',user_metadata:{display_name:'隔離測試'}}});
   return r.fulfill({json:[]});
  }
  return r.fulfill({contentType:'application/json',body:'{}'});
 });
 await p.goto('https://strategy.fixture.test/#member/strategy');
 await p.locator('.ms-creation-workspace').waitFor({timeout:20000});
 assert.equal(await p.locator('.ms-chat-dialog').isVisible(),false);await p.getByRole('button',{name:'開啟策略小書靈聊天室',exact:true}).click();await p.getByText('本機引導可用 · AI 自由討論尚未啟用',{exact:true}).waitFor();
 assert.equal(await p.locator('[data-ai-form] button').isDisabled(),false);assert.equal(await p.locator('[data-assistant-mode] [value=ai]').evaluate(e=>e.disabled),true);
 assert.equal(await p.locator('[data-rule-param=fast]').first().inputValue(),'5');
 assert.equal(await p.locator('[data-rule-param=slow]').first().inputValue(),'20');
 if(output){fs.mkdirSync(output,{recursive:true});await p.screenshot({path:path.join(output,'full-page-desktop.png')});}
 await p.setViewportSize({width:390,height:844});
 assert.ok(await p.locator('.member-page').evaluate(e=>e.scrollWidth<=innerWidth+1));
 if(output)await p.screenshot({path:path.join(output,'full-page-mobile.png')});await p.evaluate(()=>document.documentElement.dataset.theme='dark');if(output)await p.screenshot({path:path.join(output,'full-page-mobile-dark.png')});assert.ok(await p.locator('.member-page').evaluate(e=>e.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('PASS full index/modules: local guide available, paid AI disabled, editable 5/20 rules, no errors or mobile overflow');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
