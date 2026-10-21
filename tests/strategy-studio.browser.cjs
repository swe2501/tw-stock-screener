/* QA：策略工作台五步驟、上架、聊天室版面、K 圖按鈕、私房篩選器多選。隔離網路。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||require('node:os').tmpdir()+'/strategy-studio-qa';fs.mkdirSync(out,{recursive:true});
const rows=Array.from({length:700},(_,i)=>{const t=new Date(Date.UTC(2024,0,2+i)).toISOString().slice(0,10),c=100+Math.sin(i/9)*8+i*.03;return {time:t,open:c-.5,high:c+1.5,low:c-1.5,close:c,volume:10000+(i%7)*900};});
async function page(b,width,theme,init){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(([theme,init])=>{localStorage.setItem('sb_token','fixture');localStorage.setItem('sb_user',JSON.stringify({id:'fx',email:'fx@example.test'}));localStorage.setItem('theme',theme);if(init)for(const [k,v] of Object.entries(init))localStorage.setItem(k,v);},[theme,init||null]);
 await p.route('**/*',r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/api/chart'))return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{name:'測試',data:rows}});
  if(u.origin==='https://studio.fixture.test'){if(u.pathname==='/api/auth')return r.fulfill({json:{enabled:false}});if(u.pathname==='/')return r.fulfill({path:path.join(root,'apps/web/index.html'),contentType:'text/html; charset=utf-8'});const f=path.resolve(root,'apps/web','.'+decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({json:{}});}
  if(u.hostname.endsWith('.supabase.co')){
   if(u.pathname==='/auth/v1/user')return r.fulfill({json:{id:'fx',email:'fx@example.test',user_metadata:{display_name:'測試'}}});
   if(u.pathname.endsWith('/rpc/member_screen_calendar')){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());return r.fulfill({json:{today,save_policy:'latest-market-v2',latest_market_date:rows.at(-1).time,server_time:new Date().toISOString(),month:today.slice(0,7)+'-01',rows:[]}});}
   if(u.pathname.endsWith('/rpc/save_member_screen_record_v2')){const d=r.request().postDataJSON();(globalThis.savedScreens=globalThis.savedScreens||[]).push(d);return r.fulfill({json:{row:{id:'rec-'+globalThis.savedScreens.length,record_date:d.p_record_date,market_date:d.p_market_date,recorded_at:new Date().toISOString(),strategies:d.p_strategies,conditions:d.p_conditions,stocks:d.p_stocks,note:d.p_note}}});}
   if(u.pathname.endsWith('/price_window')){const q=u.searchParams;if(q.get('select')==='trade_date')return r.fulfill({json:rows.slice(-400).reverse().map(x=>({trade_date:x.time}))});const codes=(q.get('code')||'').replace(/^in\.\(|\)$/g,'').split(',').filter(Boolean);if(+q.get('offset')>0)return r.fulfill({json:[]});
    const out=[];for(const c of codes.slice(0,2)){const k=+c%3;for(const x of rows.slice(-120))out.push({code:c,trade_date:x.time,open:x.open+k,high:x.high+k,low:x.low+k,close:x.close+k,volume:x.volume});}return r.fulfill({json:out});}
   return r.fulfill({json:[]});}
  return r.fulfill({contentType:'application/json',body:'{}'});});
 p.errors=errors;return p;}
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const p=await page(b,1440,theme);await p.goto('https://studio.fixture.test/#member/strategy');await p.locator('.ms-creation-workspace').waitFor({timeout:30000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await p.waitForFunction(()=>document.querySelector('[name=auditDate]')?.value,null,{timeout:20000});
  assert.equal(await p.locator('.ms-steps [data-step]').count(),5);assert.equal(await p.locator('[data-dim-card] [data-dim]').count(),1,'only ready dims');
  assert.equal(await p.locator('[data-publish]').isDisabled(),true,'cannot publish unsaved');
  await p.screenshot({path:out+`/studio-${theme}-top.png`});
  // 設停損、存檔、上架
  await p.locator('.ms-risk summary').click();await p.locator('[data-strategy-editor] input[name=stop]').fill('6');await p.locator('[data-strategy-editor] input[name=stop]').dispatchEvent('change');
  await p.locator('[data-strategy-name]').fill('測試策略A');await p.locator('[data-strategy-name]').dispatchEvent('input');
  await p.locator('[data-save-strategy]').click();
  await p.waitForFunction(()=>!document.querySelector('[data-publish]')?.disabled);
  const stepNote=await p.locator('.ms-steps li').nth(2).innerText();assert.match(stepNote,/停損 6%/);
  await p.locator('[data-publish]').click();await p.waitForFunction(()=>document.querySelector('.ms-publish-state')?.textContent==='已上架');
  const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('academy.research.v1.fx')).strategies);assert.equal(stored[0].published,true);assert.deepEqual(stored[0].dimensions,['tech']);
  assert.match(await p.locator('.ms-library-item').first().innerText(),/已上架/);
  // 做空：切換方向、標題改為放空／回補、回測產生放空交易
  await p.locator('[data-trade=short]').click();assert.match(await p.locator('.ms-rule-section h3').first().innerText(),/放空條件/);assert.match(await p.locator('.ms-steps li').first().innerText(),/做空/);
  await p.locator('[data-save-strategy]').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('academy.research.v1.fx')).strategies[0].direction==='short');
  await p.locator('[data-run-strategy] [name=start]').fill(rows[200].time);await p.locator('[data-run-strategy] [name=end]').fill(rows.at(-2).time);await p.locator('[data-run-strategy] button[type=submit]').click();await p.waitForFunction(()=>/回測完成|請|無效|不足/.test(document.querySelector('[data-strategy-status]').textContent));
  const runText=await p.locator('[data-strategy-status]').innerText();assert.match(runText,/回測完成/,runText);assert.match(await p.locator('[data-strategy-result]').innerText(),/放空|回補|0 筆|沒有/);
  await p.locator('[data-dim-card]').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/studio-${theme}-short.png`});
  // 垃圾桶：刪除 → 復原 → 再刪除 → 永久刪除
  await p.locator('[data-library-trash]').first().click();assert.equal(await p.locator('[data-library-list] .ms-library-item').count(),0);assert.equal(await p.locator('[data-trash-count]').innerText(),'1');
  assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('academy.research.v1.fx')))).strategy_trash.length,1);
  await p.locator('[data-trash] summary').click();await p.screenshot({path:out+`/studio-${theme}-trash.png`});
  await p.locator('[data-trash-restore]').click();assert.equal(await p.locator('[data-library-list] .ms-library-item').count(),1);assert.match(await p.locator('[data-library-status]').innerText(),/已復原/);
  await p.locator('[data-library-trash]').first().click();await p.locator('[data-trash-purge]').click();assert.match(await p.locator('[data-trash-purge]').innerText(),/確定/);await p.locator('[data-trash-purge]').click();assert.equal(await p.locator('[data-trash-count]').innerText(),'0');
  assert.deepEqual((await p.evaluate(()=>JSON.parse(localStorage.getItem('academy.research.v1.fx')))).strategies,[]);
  await p.locator('[data-dim-card]').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/studio-${theme}-dims.png`});
  await p.locator('[data-publish-card]').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/studio-${theme}-publish.png`});
  // 步驟按鈕可捲動
  await p.locator('.ms-steps [data-step="3"]').click();
  // K 圖按鈕：開在會員頁上方、置中
  await p.locator('[data-return-chart]').scrollIntoViewIfNeeded();await p.locator('[data-return-chart]').click();await p.waitForTimeout(900);
  const chart=await p.evaluate(()=>{const m=document.getElementById('chartModal'),box=m.querySelector('.modal-box').getBoundingClientRect(),top=document.elementFromPoint(innerWidth/2,innerHeight/2);return {open:m.classList.contains('open'),topInside:m.contains(top),cx:Math.round(box.left+box.width/2),w:innerWidth};});
  assert.ok(chart.open&&chart.topInside,'chart visible above member page '+JSON.stringify(chart));assert.ok(Math.abs(chart.cx-chart.w/2)<4,'chart centered');
  await p.screenshot({path:out+`/studio-${theme}-kchart.png`});await p.evaluate(()=>window.closeChart());
  // 聊天室
  await p.locator('.ms-chat-launcher').click();await p.locator('.ms-chat-dialog[open]').waitFor();await p.waitForTimeout(400);
  const chat=await p.evaluate(()=>{const d=document.querySelector('.ms-chat-dialog'),r=x=>Math.round(d.querySelector(x).getBoundingClientRect().height);return {w:Math.round(d.getBoundingClientRect().width),h:Math.round(d.getBoundingClientRect().height),log:r('.ms-ai-conversation'),form:r('[data-ai-form]'),overflowX:d.scrollWidth>d.clientWidth+1};});
  console.log(theme,'chat',JSON.stringify(chat));assert.ok(chat.w>=500&&chat.log>=380,'chat roomy');assert.equal(chat.overflowX,false);
  await p.screenshot({path:out+`/chat-${theme}.png`});
  await p.locator('.ms-guide-choices button').first().click();await p.waitForTimeout(300);await p.locator('[name=idea]').fill('我想研究均線突破');await p.locator('[data-ai-form] button').click();await p.waitForTimeout(500);
  await p.screenshot({path:out+`/chat-${theme}-talk.png`});
  await p.locator('.ms-strategy-explore>summary').click();await p.waitForTimeout(200);await p.screenshot({path:out+`/chat-${theme}-explore.png`});await p.locator('.ms-strategy-explore>summary').click();
  await p.getByRole('button',{name:'關閉策略聊天室'}).click();
  assert.deepEqual(p.errors,[],'no page errors');await p.close();
  // 手機
  const m=await page(b,375,theme);await m.goto('https://studio.fixture.test/#member/strategy');await m.locator('.ms-creation-workspace').waitFor({timeout:30000});await m.evaluate(t=>document.documentElement.dataset.theme=t,theme);await m.waitForTimeout(1500);
  assert.ok(await m.evaluate(()=>{const pg=document.querySelector('.member-page');return pg.scrollWidth<=pg.clientWidth+1;}),'no horizontal overflow mobile');
  await m.locator('.ms-steps').scrollIntoViewIfNeeded();await m.screenshot({path:out+`/studio-${theme}-375.png`});
  await m.locator('.ms-chat-launcher').click();await m.locator('.ms-chat-dialog[open]').waitFor();await m.waitForTimeout(400);
  const mc=await m.evaluate(()=>{const d=document.querySelector('.ms-chat-dialog').getBoundingClientRect();return {l:d.left,r:innerWidth-d.right,t:d.top,b:innerHeight-d.bottom,log:document.querySelector('.ms-ai-conversation').getBoundingClientRect().height};});console.log(theme,'mobile chat',JSON.stringify(mc));assert.ok(mc.l>=0&&mc.r>=0&&mc.t>=0&&mc.b>=0&&mc.log>200);
  await m.screenshot({path:out+`/chat-${theme}-375.png`});assert.deepEqual(m.errors,[]);await m.close();
 }
 // 私房篩選器
 const research={strategies:[
  {id:'s1',name:'均線多頭',entryMode:'all',exitMode:'any',entry:[{id:'a',type:'maPair',op:'above',fast:5,slow:20}],exit:[],risk:{stop:5,take:0,maxBars:0},dimensions:['tech'],published:true},
  {id:'s2',name:'舊版策略（未標示）',entryMode:'all',exitMode:'any',entry:[{id:'b',type:'ma',op:'above',period:60}],exit:[],risk:{stop:0,take:0,maxBars:0}},
  {id:'s3',name:'草稿策略',entryMode:'all',exitMode:'any',entry:[{id:'c',type:'ma',op:'below',period:5}],exit:[],risk:{stop:3,take:0,maxBars:0},published:false},
  {id:'s5',name:'空方突破',direction:'short',entryMode:'all',exitMode:'any',entry:[{id:'e',type:'maPair',op:'below',fast:5,slow:20}],exit:[],risk:{stop:5,take:0,maxBars:0},published:true},
  {id:'s4',name:'均線空頭',entryMode:'all',exitMode:'any',entry:[{id:'d',type:'maPair',op:'below',fast:5,slow:20}],exit:[],risk:{stop:5,take:0,maxBars:0},published:true}]};
 for(const theme of ['light','dark']){
  const p=await page(b,1440,theme,{'academy.research.v1.fx':JSON.stringify(research)});await p.goto('https://studio.fixture.test/');await p.addStyleTag({content:'#siteGate{display:none!important}'});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await p.evaluate(()=>window._showView?.('screen'));await p.waitForTimeout(1500);
  const panel=p.locator('.ms-private-panel');await panel.scrollIntoViewIfNeeded();await panel.locator('summary').first().click();await p.waitForTimeout(400);
  const names=await panel.locator('.ms-private-item b').allInnerTexts();assert.deepEqual(names,['均線多頭','舊版策略（未標示）','空方突破','均線空頭'],'draft hidden, legacy kept');
  assert.match(await panel.locator('[data-private-foot]').innerText(),/另有 1 個未上架/);
  await panel.locator('[data-private-pick=s1]').check();await panel.locator('[data-private-pick=s4]').check();
  assert.equal(await panel.locator('[data-private-pick=s5]').isDisabled(),true,'short disabled after picking long');assert.match(await panel.locator('.ms-private-list').innerText(),/做空策略請另外篩選/);
  assert.match(await panel.locator('[data-private-run]').innerText(),/2 個策略/);
  await panel.screenshot({path:out+`/private-${theme}-pick.png`});
  await panel.locator('[data-private-run]').click();await p.waitForFunction(()=>!document.querySelector('[data-private-run]').disabled,null,{timeout:60000});
  const t1=await panel.locator('[data-private-results]').innerText();console.log(theme,'AND:',t1.slice(0,160).replace(/\n/g,' | '));
  assert.match(t1,/沒有股票同時符合全部 2 個策略/,'opposite strategies cannot both match');
  await panel.locator('[data-private-any]').click();await p.waitForFunction(()=>!document.querySelector('[data-private-run]').disabled&&document.querySelector('#resultsArea td[data-viewed-code]'),null,{timeout:60000});
  assert.equal(await panel.locator('[data-private-mode=any]').getAttribute('aria-pressed'),'true');
  await panel.locator('[data-private-results]').scrollIntoViewIfNeeded();await p.screenshot({path:out+`/private-${theme}-any.png`});
  // 結果顯示在右側篩選結果，並可記錄到選股日曆
  assert.ok(await p.locator('#resultsArea td[data-viewed-code]').count()>0,'private results on right panel');assert.match(await p.locator('#statusArea .results-meta').innerText(),/私房策略 2 個・任一符合/);
  assert.match(await panel.locator('[data-private-results]').innerText(),/結果已顯示在右側/);
  await p.locator('.sl-record').first().click();await p.getByRole('button',{name:'儲存到選股日曆',exact:true}).waitFor({timeout:15000});
  assert.deepEqual(await p.locator('.sl-dialog .sl-chip').allInnerTexts(),['私房：均線多頭','私房：均線空頭']);await p.screenshot({path:out+`/private-${theme}-record.png`});
  await p.getByRole('button',{name:'儲存到選股日曆',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.sl-dialog [role=status]')?.textContent.includes('已保存'),null,{timeout:15000});
  const saved=globalThis.savedScreens.at(-1);assert.deepEqual(saved.p_strategies,['私房：均線多頭','私房：均線空頭']);assert.ok(saved.p_stocks.length>0);await p.keyboard.press('Escape');
  const prefs=await p.evaluate(()=>JSON.parse(localStorage.getItem('academy.private-screen.v1.fx')));assert.deepEqual(prefs,{selected:['s1','s4'],mode:'any'});
  assert.deepEqual(p.errors,[]);
  await p.setViewportSize({width:375,height:900});await p.waitForTimeout(300);await panel.scrollIntoViewIfNeeded();await p.screenshot({path:out+`/private-${theme}-375.png`});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow 375');await p.close();
 }
 console.log('PASS studio steps/dims/publish, chart above member page centered, roomy chat light/dark/mobile, private multi-select AND/OR with hidden drafts and legacy compatibility');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
