/* Desired-behaviour regressions. Run unchanged against base with OFFICE_SOURCE_REV. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source,harness,boardHarness,seed,task,manual,trial,old,oldQueued,departments}=require('./helpers/office-dept-fixture.cjs');
test('7F canonical department IDs and frontend/backend names remain unchanged',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(source('apps/web/assets/ai-office/office.js'),ctx);const tower=source('apps/web/assets/ai-office/office-tower.js');
 vm.runInContext(tower.slice(0,tower.indexOf('  const colors='))+'globalThis.floors=floors;})();',ctx);
 const backend=JSON.parse(source('lib/office_departments.py').split('DEPARTMENTS = ')[1].replace(/True/g,'true').replace(/False/g,'false').replace(/'/g,'"'));
 assert.deepEqual(Array.from(ctx.floors.find(f=>f.n===7).ids),[9,14,27,8]);for(const id of [9,14,27,8])assert.equal(ctx.window.ForesightOfficeDesign.departments[id].name,backend[id].name);
});
test('own workroom uses max revision from overview, not stale queued',()=>{const h=harness();seed(h);assert.equal(h.ctx.probe.snapshotFor(8).tasks.find(t=>t.id===old.id).status,'cancelled');});
test('right-side 2 / 3D 3 regression: invalidating other dept never revives queued',()=>{
 const h=harness();seed(h);h.receive({type:'foresight-office-workroom-invalidated',department:14});
 assert.equal(h.ctx.probe.snapshotFor(8).tasks.find(t=>t.id===old.id).revision,3);assert.equal(h.badge(8),h.room(8));assert.match(h.badge(8),/待執行 1/);assert.match(h.badge(8),/待驗收 1/);
 assert.ok(h.sent.filter(m=>m.type==='foresight-office-workroom-request'&&m.department===19).length>=2,'invalidation reloads overview while dialog closed');
});
test('invalidation synchronously redraws directory as well as rooms',()=>{
 const h=harness();h.reply(h.request(19),[manual]);h.dirs.find(x=>x.dataset.department==='8').badge.textContent='sentinel';
 h.receive({type:'foresight-office-workroom-invalidated',department:14});assert.notEqual(h.badge(8),'sentinel');assert.equal(h.badge(8),h.room(8));
});
test('terminal-only cancelled/approved records never become pending confirmation',()=>{
 const h=harness();h.reply(h.request(19),[old,task('accepted','approved')]);assert.doesNotMatch(h.badge(8),/待確認|待執行|待驗收|工作中/);assert.equal(h.badge(8),h.room(8));
});
test('risk scheduled role count is explicitly separate from task counts',()=>{
 const h=harness();h.reply(h.request(19),[]);h.receive({type:'foresight-office-departments',roles:[{key:'risk',department:14,status:'idle'}]});
 assert.match(h.badge(14),/舊排程 1 組/);assert.equal(h.badge(14),h.room(14));assert.doesNotMatch(h.badge(14),/待執行|待驗收/);
});
test('response requires both request ID and expected department',()=>{
 const h=harness(),r=h.request(8);h.receive({type:'foresight-office-workroom',request:r.request,department:14,snapshot:{tasks:[manual]}});
 assert.equal(h.ctx.probe.snapshots.has(14),false);h.reply(r,[manual]);assert.equal(h.ctx.probe.snapshotFor(8).tasks[0].id,manual.id);
});
test('latest same-department request wins even when old response arrives last',()=>{
 const h=harness(),first=h.request(19),second=h.request(19);h.reply(second,[old]);h.reply(first,[oldQueued]);assert.equal(h.ctx.probe.snapshotFor(8).tasks[0].revision,3);
});
test('new requests with lower revisions cannot roll back terminal across departments',()=>{
 const h=harness();h.reply(h.request(19),[old]);h.reply(h.request(8),[oldQueued]);assert.equal(h.ctx.probe.snapshotFor(8).tasks[0].status,'cancelled');
});
test('pre-invalidation responses are discarded',()=>{
 const h=harness(),r=h.request(8);h.receive({type:'foresight-office-workroom-invalidated',department:14});h.reply(r,[oldQueued]);assert.equal(h.ctx.probe.snapshotFor(8)?.tasks?.some(t=>t.id===old.id)||false,false);
});
test('all four room badges sync bottom selection before sending board department',()=>{
 const h=harness();h.reply(h.request(19),[manual]);for(const id of [9,14,27,8]){h.rooms.find(x=>+x.dataset.roomDepartment===id).button.onclick({stopPropagation(){}});assert.equal(h.sent.at(-1).department,id);assert.equal(h.ctx.ForesightOffice.selectedDepartment,id);}
});
test('department board entry clears residual search text and cancelled summary is explicit',async()=>{
 const {board,nodes}=boardHarness(async()=>({tasks:[manual,trial,old,task('legal-review','review',1,14)],departments}));await board.snapshot(null,true);
 nodes.get('[data-ot-query]').oninput({target:{value:'does-not-exist'}});await board.department(14);assert.equal(nodes.get('[data-ot-query]').value,'');assert.match(nodes.get('[data-ot-list]').innerHTML,/legal-review/);await board.department(8);assert.match(nodes.get('[data-ot-summary]').innerHTML,/已取消/);
});
test('25+ summary tasks count badges even when QA omitted from 24 details',async()=>{
 const fixtures=Array.from({length:24},(_,i)=>task('d9-'+i,'queued',1,9)).concat([manual]);let gets=0;
 const {board}=boardHarness(async(action,args)=>action==='admin_office_tasks_list'?{tasks:fixtures,total:25,departments}:{task:(gets++,fixtures.find(t=>t.id===args.id))});
 const snapshot=await board.snapshot(null,true);assert.equal(snapshot.tasks.length,24);assert.equal(gets,24);const h=harness();h.reply(h.request(19),snapshot.tasks,snapshot);assert.match(h.badge(8),/待執行 1/);assert.equal(h.badge(8),h.room(8));
});
test('200-list cap is disclosed; absent departments are not confidently zero',async()=>{
 const fixtures=Array.from({length:200},(_,i)=>task('d9-'+i,'queued',1,9));const {board}=boardHarness(async(action,args)=>action==='admin_office_tasks_list'?{tasks:fixtures,total:201,departments}:{task:fixtures.find(t=>t.id===args.id)});
 const snapshot=await board.snapshot(null,true),h=harness();h.reply(h.request(19),snapshot.tasks,snapshot);assert.match(h.badge(8),/未完整/);assert.doesNotMatch(h.badge(8),/無任務/);assert.equal(h.badge(8),h.room(8));
});
test('list refresh cannot revert a detail revision; detail calls remain bounded',async()=>{
 const {board}=boardHarness(async(action)=>action==='admin_office_tasks_list'?{tasks:[oldQueued],total:1,departments}:{task:old});await board.snapshot(null,true);const snapshot=await board.snapshot(null,true);assert.equal(snapshot.tasks[0].status,'cancelled');
});
test('fresh empty summary removes old membership without dropping revision high-water',()=>{
 const h=harness();h.reply(h.request(19),[manual],{summaries:[manual],summaryScope:'all'});h.reply(h.request(19),[],{summaries:[],summaryScope:'all'});assert.equal(h.ctx.probe.snapshotFor(8).tasks.length,0);
});
test('failed response does not mark workroom fresh or lose known terminal revision',()=>{
 const h=harness();h.reply(h.request(19),[old]);h.reply(h.request(8),[],{error:'offline'});assert.equal(h.ctx.probe.snapshotFor(8).tasks[0].status,'cancelled');assert.equal(h.ctx.probe.snapshots.get(8).received,0);
});

test('detail max revision is also rendered by the board, not only its workroom payload',async()=>{
 const {board,nodes}=boardHarness(async(action)=>action==='admin_office_tasks_list'?{tasks:[oldQueued],total:1,departments}:{task:old});await board.snapshot(null,true);assert.match(nodes.get('[data-ot-list]').innerHTML,/is-cancelled/);assert.doesNotMatch(nodes.get('[data-ot-list]').innerHTML,/is-queued/);
});
test('response task department mismatch and unknown request cannot contaminate cache',()=>{
 const h=harness(),r=h.request(8);h.reply(r,[task('wrong-dept','queued',1,14)]);assert.equal(h.ctx.probe.snapshotFor(14)?.tasks?.length||0,0);
 h.receive({type:'foresight-office-workroom',request:9999,department:8,snapshot:{tasks:[manual]}});assert.equal(h.ctx.probe.snapshotFor(8)?.tasks?.length||0,0);
});
test('request source/origin protection remains enforced',()=>{
 const h=harness();const r=h.request(8);assert.equal(h.ctx.probe.snapshots.has(8),false);
 // Handler itself is exercised via the same message listener with a forged origin.
 h.ctx.dispatchEvent({type:'message',source:h.ctx.parent,origin:'https://other.invalid',data:{type:'foresight-office-workroom',request:r.request,department:8,snapshot:{tasks:[manual]}}});
 assert.equal(h.ctx.probe.snapshots.has(8),false);h.reply(r,[manual]);assert.equal(h.ctx.probe.snapshotFor(8).tasks.length,1);
});
test('0 / 24 / 25 / 200 complete lists keep summaries and bounded details',async()=>{
 for(const n of [0,24,25,200]){const fixtures=Array.from({length:n},(_,i)=>task('record-'+i,i===n-1?'review':'queued',1,i===n-1?8:9));let gets=0;
  const {board}=boardHarness(async(action,args)=>action==='admin_office_tasks_list'?{tasks:fixtures,total:n,departments}:{task:(gets++,fixtures.find(t=>t.id===args.id))});
  const snap=await board.snapshot(null,true);assert.equal(snap.summaries?.length,n);assert.equal(gets,Math.min(n,24));assert.equal(snap.countsLimited,false);
  const h=harness();h.reply(h.request(19),snap.tasks,snap);assert.equal(h.ctx.probe.taskStats(8).review,n?1:0);assert.equal(h.badge(8),h.room(8));
 }
});
test('shared wording separates mixed queued/review, terminal, and scheduled work',()=>{
 const model={window:{}};vm.createContext(model);vm.runInContext(source('apps/web/assets/ai-office/office-workroom-model.js'),model);
 const api=model.window.ForesightWorkroomModel;assert.equal(typeof api.taskBadge,'function');
 const now=Date.parse('2026-11-10T06:00:00Z'),records=[manual,trial,old,task('done','approved'),task('run','running'),task('blocked','blocked'),task('failed','failed')];
 const stats=api.taskStats(records,8,now);assert.equal(stats.queued,1);assert.equal(stats.review,1);assert.equal(stats.done,2);assert.equal(stats.work,1);assert.equal(stats.stuck,2);
 const text=api.taskBadge(stats,[{status:'work'}]);for(const word of ['待執行 1','待驗收 1','工作中 1','需處理 2','舊排程 1 組'])assert.ok(text.includes(word));
 assert.equal(api.taskState({...old,due_date:'2020-01-01'},now),'done');assert.equal(api.taskState({...task('run','running'),due_date:'2020-01-01'},now),'work');
 assert.equal(api.taskState({...task('ai','running'),execution:'ai',lease_until:'2020-01-01'},now),'stuck');
 assert.equal(api.taskState({...task('agent','running'),lease_until:'2020-01-01'},now),'work');
});

test('stale detail below summary revision is not cached as complete and may retry',async()=>{
 let gets=0;const summary={...old};delete summary.history;
 const {board}=boardHarness(async(action)=>action==='admin_office_tasks_list'?{tasks:[summary],total:1,departments}:{task:(gets++,oldQueued)});
 const first=await board.snapshot(null,true);assert.equal(first.tasks[0].status,'cancelled');assert.equal(first.tasks[0].revision,3);assert.equal(first.tasks[0].detailsUnavailable,true);
 await board.snapshot(null,true);assert.equal(gets,2);
});
