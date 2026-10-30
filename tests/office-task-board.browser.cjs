const fs=require('fs'),assert=require('assert');const {chromium}=require('playwright');
const statuses={queued:'待執行',running:'執行中',review:'待驗收',approved:'已驗收'};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const dir='C:/Users/User/.codex/visualizations/2026/10/12/01a1308c-6895-7e12-a65a-9588d0dacff3/office-tasks';fs.mkdirSync(dir,{recursive:true});
 try{for(const width of [1280,390])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:50022/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('http://127.0.0.1:50022/');await page.setContent('<!doctype html><html><body><main style="max-width:1100px;margin:auto"><div id="tasks"></div></main></body></html>');
  await page.addStyleTag({content:[...fs.readFileSync('apps/web/index.html','utf8').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n')});
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.addStyleTag({content:':root{--surface:'+(theme==='light'?'#fff':'#172231')+';--surface2:'+(theme==='light'?'#f2f6fa':'#243145')+';--text:'+(theme==='light'?'#182b42':'#e8edf4')+';--text-muted:'+(theme==='light'?'#64778f':'#a2b4c7')+';--border:'+(theme==='light'?'#d1dce7':'#36475d')+';--accent:#078ed0;--on-accent:#fff;--green:#36a375;--red:#e85c5c}body{padding:16px;background:var(--surface2);font-family:Arial,sans-serif}'});
  await page.addStyleTag({path:'apps/web/assets/office-task-board.css'});await page.addScriptTag({path:'apps/web/assets/office-task-board.js'});
  await page.evaluate(()=>{
   window.records=[];window.calls=[];window.errorMode=false;
   const departments=Array.from({length:32},(_,id)=>({id,name:id===7?'資料與金融研究部':id===14?'法遵與風險管理部':'部門 '+id,enabled:id!==16}));
   const post=async(action,b={})=>{
    calls.push({action,body:structuredClone(b)});if(errorMode)return{error:'測試：服務暫時無法讀取'};
    if(action==='admin_office_tasks_list')return{tasks:structuredClone(records),departments,worker:{at:new Date().toISOString()},dependencies:{}};
    if(action==='admin_office_tasks_get')return{task:structuredClone(records.find(t=>t.id===b.id))};
    if(action==='admin_office_tasks_create'){
     const task={...b,status:'queued',revision:1,current_step:'等待執行',result:'',checks:b.criteria.map(()=>false),created_at:new Date().toISOString(),history:[],cost_usd:0,reserved_usd:0,attempts:0};records.unshift(task);return{task:structuredClone(task)};
    }
    const t=records.find(t=>t.id===b.id);if(t.revision!==b.revision)return{error:'任務已更新，請重新整理'};
    if(b.operation==='approve'&&!b.checks.every(Boolean))return{error:'請逐項確認所有驗收條件'};
    t.revision++;if(b.operation==='claim'){t.status='running';t.current_step='已領取';t.attempts++;}
    if(b.operation==='progress')t.current_step=b.note;
    if(b.operation==='submit'){t.status='review';t.result=b.result;t.current_step='待管理者驗收';}
    if(b.operation==='approve'){t.status='approved';t.checks=b.checks;t.current_step='驗收完成';}
    t.history.push({at:new Date().toISOString(),status:t.status,message:'執行者回報'});return{task:structuredClone(t)};
   };window.board=OfficeTaskBoard.mount(document.getElementById('tasks'),post);board.show();
  });
  await page.getByRole('button',{name:'建立任務 ＋'}).click();
  await page.locator('[name=execution]').selectOption('ai');assert(await page.locator('[data-ot-budget]').isVisible());
  await page.locator('[name=execution]').selectOption('manual');assert.equal(await page.locator('[data-ot-budget]').isVisible(),false);
  await page.locator('[name=title]').fill('下週半導體展覽研究');await page.locator('[name=department]').selectOption('7');await page.locator('[name=brief]').fill('查核官方展期，附來源與資料日期。');await page.locator('[name=criteria]').fill('附官方來源\n附資料日期');
  await page.getByRole('button',{name:'建立並派工',exact:true}).click();await page.getByRole('button',{name:'領取並開始',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='admin_office_tasks_create').length),1);
  await page.getByRole('button',{name:'領取並開始',exact:true}).click();await page.locator('[data-ot-note]').fill('已核對官方展期，整理來源中');await page.getByRole('button',{name:'回報進度',exact:true}).click();
  assert((await page.locator('.ot-detail').innerText()).includes('已核對官方展期'));
  await page.locator('[data-ot-result]').fill('## 查核成果\n來源：https://example.org/\n<img src=x onerror=alert(1)>');await page.getByRole('button',{name:'提交成果驗收',exact:true}).click();
  assert.equal(await page.locator('.ot-result img').count(),0);assert((await page.locator('.ot-result').innerText()).includes('<img'));
  await page.getByRole('button',{name:'驗收通過',exact:true}).click();assert((await page.locator('[data-ot-detail-message]').innerText()).includes('逐項確認'));
  await page.locator('[data-ot-checks] input').nth(0).check();await page.locator('[data-ot-checks] input').nth(1).check();await page.getByRole('button',{name:'驗收通過',exact:true}).click();
  await page.getByRole('button',{name:'交接給下一部門',exact:true}).click();assert.notEqual(await page.locator('[name=dependency]').inputValue(),'');
  await page.locator('[name=department]').selectOption('14');await page.locator('[name=criteria]').fill('列出需確認的資料授權');await page.getByRole('button',{name:'建立並派工',exact:true}).click();await page.locator('[aria-label="關閉任務詳情"]').click();
  assert.equal(await page.locator('.ot-card').count(),2);
  await page.screenshot({path:dir+'/board-'+theme+'-'+width+'.png',fullPage:true});
  await page.locator('[data-ot-department]').selectOption('14');assert.equal(await page.locator('.ot-card').count(),1);
  await page.locator('.ot-card').click();await page.screenshot({path:dir+'/detail-'+theme+'-'+width+'.png'});await page.keyboard.press('Escape');
  await page.evaluate(()=>window.errorMode=true);await page.locator('[data-ot-refresh]').click();assert((await page.locator('[data-ot-message]').innerText()).includes('服務暫時'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page horizontal overflow');
  await page.evaluate(()=>board.destroy());assert.equal(await page.locator('dialog').count(),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS task creation, AI budget, manual progress, safe results, acceptance, handoff, filters and cleanup at desktop/mobile light/dark');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
