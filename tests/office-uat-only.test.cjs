/* Mock fetch + real post/board/live/model/tower bridge; synthetic clock only. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{system}=require('./helpers/office-uat-only-fixture.cjs');
for(const payload of [{error:'任務中心目前僅在 UAT 啟用'},{message:'任務中心目前僅在 UAT 啟用'},{error:'scope unavailable',message:'此任務僅在 UAT 啟用，請切換環境'}])test('403 UAT-only latches, explains both labels and never retries '+JSON.stringify(payload),async()=>{
 const s=system({payload});await s.start();assert.equal(s.listCalls().length,1);assert.equal(s.h.badge(8),'僅 UAT 啟用');assert.equal(s.h.room(8),'僅 UAT 啟用');
 for(let i=0;i<3;i++)await s.tick();await s.triggers();await s.board.snapshot(null,true);s.board.show();s.timers.filter(t=>t.ms===15000&&!t.cleared).forEach(t=>t.fn());await s.board.snapshot(8,true);
 await s.board.department(8);
 assert.match(s.nodes.get('[data-ot-list]').innerHTML,/僅 UAT 啟用/);assert.equal(s.nodes.get('[data-ot-summary]').innerHTML,'');
 assert.equal(s.calls.length,1,'timers, visibility, focus, selection, force, invalidation and board show may not fetch again');
 assert.equal(s.h.ctx.probe.snapshotFor(8).tasks.length,0);assert.equal(s.h.badge(9),'僅 UAT 啟用');assert.equal(s.h.room(9),'僅 UAT 啟用');
});
for(const [status,payload] of [[403,{error:'forbidden: 僅限管理員'}],[500,{error:'任務中心目前僅在 UAT 啟用'}],[401,{message:'僅在 UAT 啟用'}],[403,{message:'其他錯誤'}]])test('other errors retain retry behavior '+status+' '+JSON.stringify(payload),async()=>{
 const s=system({status,payload});await s.start();await s.tick();await s.tick();assert.equal(s.listCalls().length,3);assert.notEqual(s.h.badge(8),'僅 UAT 啟用');assert.equal(s.h.badge(8),s.h.room(8));
});
test('normal UAT task count and 60s list polling remain intact',async()=>{
 const s=system({status:200});await s.start();assert.match(s.h.badge(8),/排隊中 1/);for(let i=0;i<3;i++)await s.tick();assert.equal(s.listCalls().length,4);assert.match(s.h.badge(8),/排隊中 1/);assert.equal(s.h.badge(8),s.h.room(8));assert.ok(s.h.timers.some(t=>t.ms===60000));
});
test('scope restriction after a successful read drops stale tasks and stays latched',async()=>{
 const s=system({status:200});await s.start();s.setResponse(403,{error:'任務中心目前僅在 UAT 啟用'});await s.tick();const count=s.calls.length;await s.triggers();await s.tick();assert.equal(s.calls.length,count);assert.equal(s.h.ctx.probe.snapshotFor(8).tasks.length,0);assert.equal(s.h.badge(8),'僅 UAT 啟用');
});
