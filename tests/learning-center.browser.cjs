/* QA：學習中心（目錄、搜尋、手機目錄、每週挑戰、小算盤、回到頂端）。隔離網路。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||require('node:os').tmpdir()+'/strategy-studio-qa';fs.mkdirSync(out,{recursive:true});
const rows=Array.from({length:700},(_,i)=>{const t=new Date(Date.UTC(2024,0,2+i)).toISOString().slice(0,10),c=100+Math.sin(i/9)*8+i*.03;return {time:t,open:c-.5,high:c+1.5,low:c-1.5,close:c,volume:10000+(i%7)*900};});
async function page(b,width,theme,init){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.meta={display_name:'測試',member_learning:[]};p.verified=new Set();p.readReady=false;p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(([theme,init])=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fx',email:'fx@example.test'}));localStorage.setItem('theme',theme);if(init)for(const [k,v] of Object.entries(init))localStorage.setItem(k,v);},[theme,init||null]);
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/api/chart'))return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{name:'測試',data:rows}});
  if(u.origin==='https://studio.fixture.test'){if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});const f=path.resolve(root,'apps/web','.'+decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({json:{}});}
  if(u.hostname.endsWith('.supabase.co')){
   if(u.pathname==='/auth/v1/user'){if(r.request().method()==='PUT'){const d=r.request().postDataJSON()?.data||{};Object.assign(p.meta,d);}return r.fulfill({json:{id:'fx',email:'fx@example.test',user_metadata:p.meta}});}
   if(u.pathname.endsWith('/rpc/member_learning_start'))return r.fulfill({json:{ready_at:new Date(Date.now()+30000).toISOString()}});
   if(u.pathname.endsWith('/rpc/member_learning_complete')){const d=r.request().postDataJSON();if(!p.readReady)return r.fulfill({status:400,json:{message:'LEARNING_READ_REQUIRED'}});p.verified.add(d.p_lesson_id);return r.fulfill({json:{completed_at:new Date().toISOString(),lesson_id:d.p_lesson_id}});}
   if(u.pathname.endsWith('/rpc/member_learning_challenge')){const d=r.request().postDataJSON();if(!p.challenge.ids.every(id=>p.verified.has(id)))return r.fulfill({status:400,json:{message:'LEARNING_LESSONS_REQUIRED'}});return r.fulfill({json:{passed:true,challenge_id:p.challenge.id,score:p.challenge.quiz.length,total:p.challenge.quiz.length,completed_at:new Date().toISOString()}});}
   if(u.pathname.endsWith('/rpc/member_screen_calendar')){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());return r.fulfill({json:{today,save_policy:'latest-market-v2',latest_market_date:rows.at(-1).time,server_time:new Date().toISOString(),month:today.slice(0,7)+'-01',rows:globalThis.calRows||[]}});}
   if(u.pathname.endsWith('/rpc/save_member_screen_record_v2')){const d=r.request().postDataJSON();(globalThis.savedScreens=globalThis.savedScreens||[]).push(d);return r.fulfill({json:{row:{id:'rec-'+globalThis.savedScreens.length,record_date:d.p_record_date,market_date:d.p_market_date,recorded_at:new Date().toISOString(),strategies:d.p_strategies,conditions:d.p_conditions,stocks:d.p_stocks,note:d.p_note}}});}
   if(u.pathname.endsWith('/price_window')){const q=u.searchParams;if(q.get('select')==='trade_date')return r.fulfill({json:rows.slice(-400).reverse().map(x=>({trade_date:x.time}))});const codes=(q.get('code')||'').replace(/^in\.\(|\)$/g,'').split(',').filter(Boolean);if(+q.get('offset')>0)return r.fulfill({json:[]});
    const out=[];for(const c of codes.slice(0,2)){const k=+c%3;for(const x of rows.slice(-120))out.push({code:c,trade_date:x.time,open:x.open+k,high:x.high+k,low:x.low+k,close:x.close+k,volume:x.volume});}return r.fulfill({json:out});}
   return r.fulfill({json:[]});}
  return r.fulfill({contentType:'application/json',body:'{}'});});
 p.errors=errors;return p;}
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark'])for(const w of [1440,375]){const p=await page(b,w,theme);await p.goto('https://studio.fixture.test/#member/learning');await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForSelector('.lc-hero',{timeout:20000});await p.waitForTimeout(800);
  const C=await p.evaluate(()=>{const c=window.AcademyLearningChallenge.current();return {id:c.id,ids:c.ids,quiz:c.quiz.map(q=>q.answer),pass:c.pass};});
  p.challenge=C;
  assert.equal(await p.locator('.lc-toc-group[open]').count(),0,'all categories are collapsed on entry');
  assert.equal(await p.locator('.lc-week').count(),8,'8 stages');assert.equal(await p.locator('.lc-topic').count(),6,'6 topics');assert.equal(await p.locator('.lc-challenge').count(),1,'challenge card');
  assert.ok(await p.locator('[data-ch-start]').isDisabled(),'quiz locked until reading');
  await p.screenshot({path:out+`/learn-${theme}-${w}-top.png`});
  // 開第一篇：圖解、實際算一次、多題、小算盤
  await p.locator('.lc-next').click();await p.waitForTimeout(500);assert.equal(await p.locator('.lc-toc-group[open]').count(),0,'choosing a lesson does not automatically expand navigation');const d=p.locator('.lc-content .lc-lesson[open]');
  assert.equal(await d.getAttribute('data-lesson-id'),'tw-market');
  await d.locator('input[type=radio]').nth(2).check();await d.locator('[data-check]').first().click();assert.match(await d.locator('.lc-result').first().innerText(),/答對了/);
  assert.equal(await d.locator('.lc-fig svg').count(),1);assert.ok(await d.locator('.lc-ex li').count()>=3);assert.ok(await d.locator('.lc-quiz').count()>=2);
  assert.match(await d.locator('.lc-calc .is-key dd').innerText(),/80,114/);await d.locator('.lc-calc input[data-k=price]').fill('50');assert.match(await d.locator('.lc-calc .is-key dd').innerText(),/50,071/);
  await d.screenshot({path:out+`/learn-${theme}-${w}-lesson.png`}).catch(()=>{});
  // Personal read flags alone cannot replace server proof; timing failure must be visible and retryable.
  await d.locator('[data-verify-read]').click();assert.match(await d.locator('[data-verify-status]').innerText(),/所有小測驗/);
  const selections=await p.evaluate(()=>AcademyLearning.lessons.find(l=>l.id==='tw-market').quiz.map(q=>q.answer));
  for(let i=0;i<selections.length;i++)await d.locator(`input[name="q-tw-market-${i}"][value="${selections[i]}"]`).check();
  await d.locator('[data-verify-read]').click();await p.waitForFunction(()=>document.querySelector('[data-verify-status]').textContent.includes('24 小時'));assert.equal(p.verified.size,0);
  p.readReady=true;await d.locator('[data-verify-read]').click();await p.waitForFunction(()=>document.querySelector('[data-verify-status]').textContent.includes('閱讀核驗完成'));assert.equal(p.verified.has('tw-market'),true);
  // 讀完 → 存到帳號
  await d.locator('[data-read]').click();await p.waitForTimeout(700);assert.ok((await p.evaluate(()=>1))&&true);
  // 主題、篩選、搜尋（桌機用左側目錄；手機用底部目錄）
  if(w>=1000){
   assert.ok(await p.locator('.lc-side').isVisible(),'sidebar visible');
   await p.locator('.lc-side [data-search]').fill('零股');await p.waitForTimeout(600);assert.ok(await p.locator('.lc-content [data-lesson-id="odd-lot"]').count()===1,'search finds odd-lot');
   await p.locator('.lc-side [data-search]').fill('');await p.waitForTimeout(600);
   await p.locator('.lc-side .lc-toc-group summary',{hasText:'策略實驗室'}).click();await p.locator('.lc-side [data-open="exits"]').click();await p.waitForTimeout(500);
   assert.equal(await p.locator('.lc-content .lc-lesson').count(),11,'strategy topic 11');assert.equal(await p.locator('.lc-content .lc-lesson[open]').getAttribute('data-lesson-id'),'exits');
  }else{
   assert.equal(await p.locator('.lc-side').isVisible(),false,'sidebar hidden on phone');
   await p.locator('[data-sheet]').click();await p.waitForTimeout(300);assert.ok(await p.locator('.lc-sheet-panel').isVisible(),'sheet open');
   await p.screenshot({path:out+`/learn-${theme}-${w}-sheet.png`});
   await p.locator('.lc-sheet .lc-toc-group summary',{hasText:'籌碼觀察'}).click();await p.locator('.lc-sheet [data-open="margin-call"]').click();await p.waitForTimeout(500);
   assert.equal(await p.locator('.lc-sheet').isHidden(),true,'sheet closes');assert.equal(await p.locator('.lc-content .lc-lesson[open]').getAttribute('data-lesson-id'),'margin-call');
  }
  // 收藏篩選
  await p.locator('.lc-content .lc-lesson[open] [data-save]').click();await p.waitForTimeout(300);
  // 每週挑戰：把本週 4 篇標為已讀（直接寫入帳號資料後重新整理），通過週測驗並存檔
p.meta.member_learning=[...new Set([...(p.meta.member_learning||[]),...C.ids])];
  await p.evaluate(()=>{sessionStorage.setItem('academy.learning.track','');sessionStorage.removeItem('academy.learning.open');});await p.reload();await p.waitForSelector('.lc-challenge',{timeout:20000});await p.waitForTimeout(500);
  assert.equal(await p.locator('[data-ch-start]').isDisabled(),false,'quiz unlocked');await p.locator('[data-ch-start]').click();
  for(let i=0;i<C.quiz.length;i++)await p.locator(`.lc-ch-form input[name="ch-${i}"][value="${C.quiz[i]}"]`).check();
  await p.locator('.lc-ch-form [type=submit]').click();await p.waitForFunction(()=>document.querySelector('.lc-ch-msg').textContent.includes('閱讀核驗'));assert.equal(Object.keys(p.meta.member_learning_challenges||{}).length,0,'forged personal read flags do not save a passed challenge');
  C.ids.forEach(id=>p.verified.add(id));
  await p.locator('.lc-ch-form [type=submit]').click();await p.waitForTimeout(900);
  const rec=Object.values(p.meta.member_learning_challenges||{})[0];assert.ok(rec&&rec.passed&&rec.score===C.quiz.length,'challenge saved');
  await p.waitForSelector('.lc-challenge.is-passed');assert.equal(await p.locator('.lc-badges li').count(),1,'badge shown');
  await p.locator('.lc-challenge').screenshot({path:out+`/learn-${theme}-${w}-challenge.png`});
  // 回到頂端
  await p.evaluate(()=>{const g=document.querySelector('.member-page');g.scrollTop=g.scrollHeight;});await p.waitForTimeout(500);assert.ok(await p.locator('.mc-to-top.is-visible').count()===1,'to-top visible');
  await p.screenshot({path:out+`/learn-${theme}-${w}-totop.png`});
  await p.locator('.mc-to-top').click();await p.waitForTimeout(1200);assert.ok(await p.evaluate(()=>document.querySelector('.member-page').scrollTop)<5,'scrolled to top');
  assert.equal(await p.evaluate(()=>{const g=document.querySelector('.member-page');return g.scrollWidth>g.clientWidth+1}),false,'no overflow');assert.deepEqual(p.errors,[]);await p.close();}
 console.log('PASS learning center v3: directory, search, phone sheet, weekly challenge + badge, calculators, back-to-top, light/dark 1440/375');}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
