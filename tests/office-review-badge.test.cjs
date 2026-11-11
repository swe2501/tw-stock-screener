/* Synthetic presentation-only tests: no API, browser profile or external assets. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source}=require('./helpers/office-dept-fixture.cjs'),ctx={};vm.createContext(ctx);vm.runInContext(source('apps/web/assets/ai-office/office-workroom-model.js'),ctx);
const m=ctx.ForesightWorkroomModel,base={x:2,y:.12,z:1},seat=m.chairSeat(-1,1,0,true);
for(const reduced of [false,true])test(`seated review keeps its badge without a time-based pulse (reduced=${reduced})`,()=>{
 const poses=[0,350,17000,60000].map(time=>m.personPose({base,seat,pose:'review',time,reduced}));
 for(const p of poses){assert.equal(p.reviewBadge,true);assert.equal(p.typing,false);assert.equal(p.recline,-.55);assert.equal(p.handMotion,0);}
 for(const p of poses.slice(1))assert.deepEqual(p,poses[0],'no bobbing/flashing pose parameter');
});
test('work, walk, alert, unknown and unseated review never show a badge',()=>{
 for(const reduced of [false,true])for(const pose of ['work','walk','alert','unknown'])for(const time of [0,17000])assert.equal(m.personPose({base,seat,pose,time,reduced}).reviewBadge,false,pose);
 assert.equal(m.personPose({base,pose:'review'}).reviewBadge,false);
});
test('screen-facing badge stays fixed-size, noninteractive and static including its icon and hidden state',()=>{
 const css=source('apps/web/assets/ai-office/office-workroom.css');
 assert.match(css,/\.person-review-badge\{[^}]*font:[^}]*13px/);
 assert.match(css,/\.person-review-badge\{[^}]*pointer-events:none/);
 assert.match(css,/\.person-review-badge[^}]*animation:none/);
 assert.match(css,/\.person-review-badge[^}]*transition:none/);
 assert.match(css,/\.person-review-badge\[hidden\]\{display:none!important\}/);
});
