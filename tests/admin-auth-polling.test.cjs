/* Admin office polling budget: real board + iframe live/model/tower bridge, mock fetch and synthetic clock only.
 * OFFICE_SOURCE_REV=<base> runs the same assertions against the pre-change sources. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{system}=require('./helpers/office-uat-only-fixture.cjs');
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const requests=s=>s.h.sent.filter(m=>m.type==='foresight-office-workroom-request').length;
test('successful empty board snapshot is cached for 30s; force and expiry refetch',async()=>{
 const s=system({status:200,tasks:[]});
 assert.equal((await s.board.snapshot(null)).tasks.length,0);assert.equal(s.listCalls().length,1);
 for(const dep of [null,8,9,null]){s.advance(5000);await s.board.snapshot(dep);}
 assert.equal(s.listCalls().length,1,'empty result must be cached within 30s across departments');
 await s.board.snapshot(8,true);assert.equal(s.listCalls().length,2,'forced refresh still fetches');
 s.advance(30001);await s.board.snapshot(null);assert.equal(s.listCalls().length,3,'cache expires after 30s');
});
test('errors are never cached as empty snapshots',async()=>{
 const s=system({status:500,payload:{error:'synthetic outage'}});
 assert.ok((await s.board.snapshot(null)).error);await s.board.snapshot(null);assert.equal(s.listCalls().length,2);
 s.setResponse(200,{});assert.equal((await s.board.snapshot(null)).error,undefined);await s.board.snapshot(null);assert.equal(s.listCalls().length,3);
});
test('7F iframe keeps successful empty overview 30s (selection/visibility do not refetch)',async()=>{
 const s=system({status:200,tasks:[]});await s.start();assert.equal(s.listCalls().length,1);const sent=requests(s);
 for(let i=0;i<5;i++){s.advance(5000);s.h.ctx.dispatchEvent({type:'foresight-office-selection'});s.h.receive({type:'foresight-office-visibility',visible:true});await s.pump();}
 assert.equal(requests(s),sent,'office-live must not re-request an empty snapshot within 30s');assert.equal(s.listCalls().length,1);
 await s.tick(60000);assert.equal(s.listCalls().length,2,'60s overview refresh still runs');
 s.h.receive({type:'foresight-office-workroom-invalidated'});await s.pump();assert.equal(s.listCalls().length,3,'invalidation still forces a refetch');
});
test('task list polls every 60s while active; timer cleared on hide/destroy',async()=>{
 const s=system({status:200,tasks:[]});s.board.show();await settle();assert.equal(s.listCalls().length,1);
 const live=()=>s.timers.filter(t=>!t.cleared);assert.deepEqual(live().map(t=>t.ms),[60000]);assert.equal(s.timers.some(t=>t.ms===15000),false);
 s.advance(60000);live()[0].fn();await settle();assert.equal(s.listCalls().length,2);
 s.board.hide();assert.equal(live().length,0);s.board.show();await settle();assert.equal(live().length,1);s.board.destroy();assert.equal(live().length,0);
});
test('visibility/focus catch-up is throttled to one refresh per 10s and respects guards',async()=>{
 const s=system({status:200,tasks:[]});s.board.show();await settle();const n=()=>s.listCalls().length;assert.equal(n(),1);
 s.fire('window','focus');s.fire('document','visibilitychange');await settle();assert.equal(n(),1,'within 10s of last success: no catch-up');
 s.advance(9999);s.fire('window','focus');await settle();assert.equal(n(),1);
 s.advance(2);s.fire('window','focus');s.fire('window','focus');s.fire('document','visibilitychange');await settle();assert.equal(n(),2,'one catch-up, then throttled');
 s.advance(15000);s.setHidden(true);s.fire('document','visibilitychange');await settle();assert.equal(n(),2,'hidden tab does not refresh');
 s.setHidden(false);s.fire('document','visibilitychange');await settle();assert.equal(n(),3,'becoming visible catches up');
 s.advance(15000);s.created[1].open=true;s.fire('window','focus');await settle();assert.equal(n(),3,'detail dialog open: no refresh');s.created[1].open=false;
 s.created[0].open=true;s.fire('window','focus');await settle();assert.equal(n(),3,'form dialog open: no refresh');s.created[0].open=false;
 s.fire('window','focus');await settle();assert.equal(n(),4);
});
test('failed refresh does not start the throttle window; catch-up may retry',async()=>{
 const s=system({status:500,payload:{error:'synthetic outage'}});s.board.show();await settle();assert.equal(s.listCalls().length,1);
 s.fire('window','focus');await settle();assert.equal(s.listCalls().length,2,'no successful refresh yet, catch-up may retry');
});
test('catch-up listeners are removed on hide/destroy and inactive board ignores events',async()=>{
 const s=system({status:200,tasks:[]});assert.equal(s.listenerCount(),0);s.board.show();await settle();assert.equal(s.listenerCount(),2);
 s.board.show();assert.equal(s.listenerCount(),2,'show is idempotent');
 s.board.hide();assert.equal(s.listenerCount(),0);const before=s.listCalls().length;s.advance(60000);s.fire('window','focus');await settle();assert.equal(s.listCalls().length,before);
 s.board.show();await settle();assert.equal(s.listenerCount(),2);s.board.destroy();assert.equal(s.listenerCount(),0);
});
test('UAT-only latch: catch-up never refetches',async()=>{
 const s=system();s.board.show();await settle();assert.equal(s.listCalls().length,1);s.advance(60000);s.fire('window','focus');s.fire('document','visibilitychange');await settle();assert.equal(s.listCalls().length,1);
});
test('board refresh success counts as a snapshot: no second list within 30s, same data',async()=>{
 const data=[];const s=system({status:200,tasks:data});s.board.show();await settle();assert.equal(s.listCalls().length,1);
 const live=()=>s.timers.filter(t=>!t.cleared);
 for(const ms of [0,5000,10000,10000,4999]){s.advance(ms);assert.equal((await s.board.snapshot(null)).tasks.length,0);}
 assert.equal(s.listCalls().length,1,'empty refresh result reused by snapshot() within 30s');
 // 60s board timer refreshes with new data; snapshot right after returns exactly that data without another list
 const {task}=require('./helpers/office-dept-fixture.cjs');data.push(task('fresh','queued',1,8));
 s.advance(30000);live()[0].fn();await settle();assert.equal(s.listCalls().length,2);
 s.advance(7000);const snap=await s.board.snapshot(8);assert.equal(s.listCalls().length,2,'snapshot after timer refresh must not refetch');
 assert.deepEqual([...snap.tasks.map(t=>t.id)],["fresh"],'snapshot returns the data refresh() fetched');
 s.advance(23001);await s.board.snapshot(null);assert.equal(s.listCalls().length,3,'cache still expires 30s after the last success');
});
test('failed board refresh does not mark snapshot fresh; force still refetches',async()=>{
 const s=system({status:200,tasks:[]});s.board.show();await settle();assert.equal(s.listCalls().length,1);
 const live=()=>s.timers.filter(t=>!t.cleared);
 s.advance(31000);s.setResponse(500,{error:'synthetic outage'});live()[0].fn();await settle();assert.equal(s.listCalls().length,2);
 s.setResponse(200,{});s.advance(1000);await s.board.snapshot(null);assert.equal(s.listCalls().length,3,'failed refresh must not suppress snapshot fetch');
 s.advance(1000);await s.board.snapshot(null);assert.equal(s.listCalls().length,3,'successful snapshot then cached');
 s.advance(1000);await s.board.snapshot(8,true);assert.equal(s.listCalls().length,4,'force=true still fetches');
 s.advance(1000);live()[0].fn();await settle();s.advance(1000);await s.board.snapshot(8,true);assert.equal(s.listCalls().length,6,'force=true fetches even right after a refresh');
});
test('QA scenario: board 60s timer then 7F iframe 60s tick a few seconds later = one list per minute',async()=>{
 const s=system({status:200,tasks:[]});s.board.show();await settle();await s.start();
 const base=s.listCalls().length;const board=()=>s.timers.filter(t=>!t.cleared&&t.ms===60000)[0];
 for(let minute=0;minute<3;minute++){s.advance(53000);board().fn();await settle();await s.tick(7000);}
 assert.equal(s.listCalls().length-base,3,'3 minutes idle: exactly 3 list calls (was 6 before fix)');
});
