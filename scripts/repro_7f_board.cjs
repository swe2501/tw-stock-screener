/* Synthetic witness for the exact right-side 2 / 3D 3 path; no network or real data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {harness,seed}=require('../tests/helpers/office-dept-fixture.cjs');
const base=process.argv[2]||'4568abc4b91ba6550dcf2e78edc1712f7b3eccbd';
const out=process.argv[3];
if(out)fs.mkdirSync(out,{recursive:true});
function witness(revision){
 if(revision)process.env.OFFICE_SOURCE_REV=revision;else delete process.env.OFFICE_SOURCE_REV;
 const h=harness();seed(h);const before={directory:h.badge(8),room:h.room(8),workroomRevision:h.ctx.probe.snapshotFor(8).tasks.find(t=>t.id==='a2c5c1be').revision};
 h.receive({type:'foresight-office-workroom-invalidated',department:14});
 return {before,after:{directory:h.badge(8),room:h.room(8),active:h.ctx.probe.taskStats(8).wait,workroomRevision:h.ctx.probe.snapshotFor(8).tasks.find(t=>t.id==='a2c5c1be').revision}};
}
const before=witness(base),after=witness(null);
assert.equal(before.after.directory,'待執行 2');assert.equal(before.after.room,'待執行 3 項');
assert.equal(after.after.directory,after.after.room);assert.equal(after.after.active,2);assert.equal(after.after.workroomRevision,3);
const results={base,witness:{before,after},regressions:{}};
for(const [name,revision] of [['before',base],['after',null]]){
 const env={...process.env};if(revision)env.OFFICE_SOURCE_REV=revision;else delete env.OFFICE_SOURCE_REV;
 const run=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/office-dept-sync.test.cjs'],{cwd:path.resolve(__dirname,'..'),env,encoding:'utf8'});
 if(out)fs.writeFileSync(path.join(out,'regression-'+name+'.tap'),run.stdout+run.stderr);
 results.regressions[name]={exit:run.status,tests:Number(run.stdout.match(/^# tests (\d+)/m)?.[1]),pass:Number(run.stdout.match(/^# pass (\d+)/m)?.[1]),fail:Number(run.stdout.match(/^# fail (\d+)/m)?.[1])};
 assert.equal(run.status,name==='before'?1:0,run.stdout+run.stderr);
}
if(out)fs.writeFileSync(path.join(out,'repro-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
