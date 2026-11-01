const assert=require('assert/strict');const {metrics}=require('../apps/web/assets/ai-office/office-workroom-model.js');
const roles=[{status:'work',steps:[{start:'2026-10-30T00:00:00Z',end:'2026-10-30T00:01:00Z',ok:true},{secs:120,end:'2026-10-30T00:02:00Z',ok:false},{start:'invalid',end:'invalid',ok:true}]}];
const tasks=[{status:'approved',execution:'ai',created_at:'2026-10-30T00:00:00Z',due_date:'2026-10-30',history:[{at:'2026-10-30T00:02:00Z',status:'running'},{at:'2026-10-30T01:00:00Z',status:'approved'}],cost_usd:.12,reserved_usd:0,budget_usd:.3,attempts:2},{status:'failed',execution:'manual'}];
const m=metrics(roles,tasks);assert.equal(m.average,90);assert.equal(m.waiting,120);assert.equal(m.ontime,1);assert.equal(m.cost,.12);assert.equal(m.retries,1);assert.equal(m.count.work,1);assert.equal(m.count.attention,1);
assert.equal(metrics([],[]).success,null);assert.equal(metrics([],[]).average,null);assert.equal(metrics([],[]).ontime,null);
const late=metrics([],[{status:'approved',due_date:'2026-10-30',history:[{status:'approved',at:'2026-10-30T17:00:00Z'}]}]);assert.equal(late.ontime,0);
console.log('PASS recorded durations, empty metrics, retries, costs and Taiwan deadline boundary');
