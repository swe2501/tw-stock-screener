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
 const launch=p.locator('.ms-chat-launcher');
 for(const width of [1512,390,320]){
  await p.setViewportSize({width,height:844});
  for(const key of ['ArrowRight','ArrowLeft','ArrowDown']){
   await launch.focus();await p.keyboard.press('Alt+'+key);
   await p.waitForFunction(()=>!document.querySelector('.ms-chat-launcher').classList.contains('is-docking'));
   assert.ok(await launch.evaluate(e=>{const label=e.querySelector('span:not(.ms-chat-question)'),r=document.createRange();r.selectNodeContents(label);const lines=r.getClientRects(),a=e.getBoundingClientRect(),b=label.getBoundingClientRect();return lines.length===1&&a.left>=10&&a.right<=innerWidth-10&&b.left>=a.left&&b.right<=a.right;}),'Companion label stays on one line within each docked edge at '+width);
  }
 }
 await p.setViewportSize({width:1512,height:1050});
 const start=await launch.boundingBox();await p.mouse.move(start.x+start.width/2,start.y+start.height/2);await p.mouse.down();await p.mouse.move(600,350,{steps:12});await p.mouse.up();assert.equal(await p.locator('.ms-chat-dialog').isVisible(),false);assert.ok(await launch.evaluate(e=>getComputedStyle(e).transitionTimingFunction.includes('cubic-bezier')));assert.ok(await launch.evaluate(e=>parseInt(e.style.getPropertyValue('--ms-dock-duration'))>=600));await p.waitForFunction(()=>document.querySelector('.ms-chat-launcher').getBoundingClientRect().left<=14);

 await launch.evaluate(e=>{window.hintTimes=[];let on=false;new MutationObserver(()=>{const next=e.classList.contains('ms-hint-visible');if(next&&!on)window.hintTimes.push(performance.now());on=next;}).observe(e,{attributes:true,attributeFilter:['class']});});
 await p.waitForFunction(()=>window.hintTimes.length>=2,{},{timeout:7500});const hintTimes=await p.evaluate(()=>window.hintTimes);assert.ok(hintTimes[1]-hintTimes[0]>=2800&&hintTimes[1]-hintTimes[0]<3400);assert.equal(await launch.locator('>svg').evaluate(e=>getComputedStyle(e).animationName),'ms-mascot-glimmer');
 await p.locator('.ms-chat-launcher').hover();await p.waitForFunction(()=>getComputedStyle(document.querySelector('.ms-chat-launcher .ms-mascot-smile')).opacity==='1');if(output){fs.mkdirSync(output,{recursive:true});await p.locator('.ms-chat-launcher').screenshot({path:path.join(output,'launcher-smile.png')});}
 assert.equal(await p.locator('.ms-chat-dialog').isVisible(),false);await p.getByRole('button',{name:'開啟策略小書靈聊天室',exact:true}).click();await p.getByText('本機引導可用 · AI 自由討論尚未啟用',{exact:true}).waitFor();
 assert.equal(await p.locator('[data-ai-form] button').isDisabled(),false);assert.equal(await p.locator('[data-assistant-mode] [value=ai]').evaluate(e=>e.disabled),true);
 const compact=await p.locator('.ms-chat-dialog').boundingBox();await p.getByRole('button',{name:'放大策略聊天室',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.ms-chat-dialog').getAnimations().every(a=>a.playState==='finished'));assert.ok((await p.locator('.ms-chat-dialog').boundingBox()).width>compact.width);const count=await p.locator('.ms-ai-message').count();await p.getByRole('button',{name:'縮小策略聊天室',exact:true}).click();assert.equal(await p.locator('.ms-chat-dialog').isVisible(),false);await p.getByRole('button',{name:'開啟策略小書靈聊天室',exact:true}).click();assert.equal(await p.locator('.ms-ai-message').count(),count);await p.getByRole('button',{name:'還原策略聊天室',exact:true}).click();const restore=await p.locator('.ms-chat-dialog').evaluate(e=>e.getAnimations().find(a=>a.effect.getTiming().duration===720)?.effect.getTiming().duration);assert.equal(restore,720);await p.waitForFunction(()=>document.querySelector('.ms-chat-dialog').getAnimations().every(a=>a.playState==='finished'));assert.ok((await p.locator('.ms-chat-dialog').boundingBox()).width<=compact.width+1);

 await p.getByRole('button',{name:'放大策略聊天室',exact:true}).click();await p.waitForTimeout(100);await p.getByRole('button',{name:'還原策略聊天室',exact:true}).click();await p.waitForTimeout(100);await p.getByRole('button',{name:'放大策略聊天室',exact:true}).click();await p.getByRole('button',{name:'還原策略聊天室',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.ms-chat-dialog').getAnimations().every(a=>a.playState==='finished'));assert.ok((await p.locator('.ms-chat-dialog').boundingBox()).width<=compact.width+1);
 await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'放大策略聊天室',exact:true}).click();assert.equal(await p.locator('.ms-chat-dialog').evaluate(e=>e.getAnimations().filter(a=>[480,720].includes(a.effect.getTiming().duration)).length),0);await p.getByRole('button',{name:'還原策略聊天室',exact:true}).click();await p.emulateMedia({reducedMotion:'no-preference'});
 const idea=p.locator('[name=idea]'),beforeSend=await p.locator('.ms-ai-message.user').count();await idea.fill('我想要開發一個有七成的策略');await idea.press('Shift+Enter');assert.match(await idea.inputValue(),/\n/);assert.equal(await p.locator('.ms-ai-message.user').count(),beforeSend);await idea.dispatchEvent('compositionstart');await idea.press('Enter');assert.equal(await p.locator('.ms-ai-message.user').count(),beforeSend);await idea.dispatchEvent('compositionend');await idea.press('Enter');assert.equal(await p.locator('.ms-ai-message.user').count(),beforeSend+1);assert.equal(await idea.inputValue(),'');assert.equal(await p.locator('.ms-ai-message.assistant').last().evaluate(e=>getComputedStyle(e).borderTopLeftRadius),'23px');assert.equal(await p.locator('.ms-ai-message.user').last().evaluate(e=>getComputedStyle(e,':before').content),'""');assert.match(await p.locator('.ms-ai-message.assistant').last().textContent(),/勝率不能承諾/);const bubbles=await p.locator('.ms-ai-conversation').evaluate(log=>{const user=log.querySelector('.user'),bot=log.querySelector('.assistant');return {user:getComputedStyle(user).alignSelf,bot:getComputedStyle(bot).alignSelf};});assert.deepEqual(bubbles,{user:'flex-end',bot:'flex-start'});
 const library=p.locator('.ms-strategy-explore');await library.locator('> summary').click();await library.locator('[data-catalog-query]').fill('布林');assert.match(await library.locator('[data-catalog-results]').textContent(),/尚未支援回測/);assert.ok(await library.locator('[data-catalog-results] a').count());await library.locator('[data-catalog-query]').fill('不存在的獲利密碼');assert.match(await library.locator('[data-catalog-results]').textContent(),/沒有找到/);await library.locator('> summary').click();
 assert.equal(await p.locator('[data-rule-param=fast]').first().inputValue(),'5');
 assert.equal(await p.locator('[data-rule-param=slow]').first().inputValue(),'20');
 if(output){fs.mkdirSync(output,{recursive:true});await p.screenshot({path:path.join(output,'full-page-desktop.png')});}
 await p.setViewportSize({width:390,height:844});
 assert.ok(await p.locator('.member-page').evaluate(e=>e.scrollWidth<=innerWidth+1));await p.getByRole('button',{name:'放大策略聊天室',exact:true}).click();assert.ok(await p.locator('.ms-chat-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=10&&r.top>=10&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await p.getByRole('button',{name:'還原策略聊天室',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.ms-chat-dialog').getAnimations().every(a=>a.playState==='finished'));if(output)await p.screenshot({path:path.join(output,'full-page-mobile.png')});await p.evaluate(()=>document.documentElement.dataset.theme='dark');if(output)await p.screenshot({path:path.join(output,'full-page-mobile-dark.png')});assert.ok(await p.locator('.member-page').evaluate(e=>e.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('PASS full index/modules: local guide available, paid AI disabled, editable 5/20 rules, no errors or mobile overflow');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
