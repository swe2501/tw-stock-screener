/* Offline QA department-8 regression: use the shipped THREE and actual avatar rig. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {source}=require('./helpers/office-dept-fixture.cjs');
const ctx={console:{warn(){},log(){},error:console.error}};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['three.min.js','office-architecture.js','office-workroom-model.js'])vm.runInContext(source('apps/web/assets/ai-office/'+file),ctx);
const {THREE,ForesightArchitecture:architecture,ForesightWorkroomModel:m}=ctx;
const now=Date.parse('2026-11-10T14:19:00Z'),base={x:2,y:.12,z:1},seat=m.chairSeat(-1,1,0,true);
function rig(p){
 const parent=new THREE.Group(),mat=new THREE.MeshBasicMaterial();
 const cylinder=(g,x,y,z,r,h,material,segments)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),material);mesh.position.set(x,y+h/2,z);g.add(mesh);return mesh;};
 const box=(g,x,y,z,w,h,d,material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y+h/2,z);g.add(mesh);return mesh;};
 const person=architecture.person({THREE,parent,x:0,z:0,color:mat,variant:8,box,cylinder});
 person.position.set(0,p.y,0);person.userData.upperBody.rotation.x=p.recline;
 person.userData.legs.forEach(leg=>leg.rotation.x=p.leg);person.userData.knees.forEach(knee=>knee.rotation.x=p.knee);
 person.userData.arms.forEach((arm,i)=>{arm.rotation.x=p.arm+p.handMotion*(i?-1:1);arm.rotation.z=(p.armInward||0)*(i?-1:1);});
 person.userData.elbows.forEach(elbow=>elbow.rotation.x=p.elbow);parent.updateMatrixWorld(true);
 const point=o=>o.getWorldPosition(new THREE.Vector3());
 return {person,hands:person.userData.elbows.map(elbow=>point(elbow.children.find(o=>o.geometry?.type==='SphereGeometry'))),head:point(person.userData.head),shoulders:person.userData.arms.map(point),elbows:person.userData.elbows.map(point),knees:person.userData.knees.map(point)};
}
test('department 8 queued + review selects only one review actor, never work',()=>{
 const tasks=[{id:'fixture-review',department:8,status:'review',execution:'agent',worker:'agent-qa',assignee:'qa'},{id:'fixture-queue',department:8,status:'queued',execution:'ai',executor:'grok',worker:''}];
 const plan=m.roomPlan(tasks,[seat],{snapshot:{at:new Date(now).toISOString()}},now);
 assert.equal(plan.actors.length,1);assert.equal(plan.actors[0].pose,'review');assert.match(plan.badge,/待驗收 1/);assert.match(plan.badge,/尚未領取／無人執行 1/);
});
for(const reduced of [false,true])test(`rest has a reclined silhouette, vertical upper arms and both hands on thighs (reduced=${reduced})`,()=>{
 const results=[100,17100,60100].map(time=>{const p=m.personPose({base,seat,pose:'review',time,reduced}),r=rig(p);
  assert.equal(p.typing,false);assert.equal(p.handMotion,0);assert.ok(p.recline<=-.5,'at least 28 degrees, not the old subtle 12 degrees');
  assert.ok(r.head.z<-.30,'head silhouette clearly behind hips from above');
  for(let i=0;i<2;i++){const h=r.hands[i],s=r.shoulders[i],e=r.elbows[i],k=r.knees[i];assert.ok(Math.abs(k.y-.60)<1e-9&&Math.abs(k.z-.25)<1e-9,'actual seated thigh stays horizontal');assert.ok(Math.abs(h.x-k.x)<.07,'hand aligns over its own thigh');assert.ok(e.y<s.y-.20,'upper arm hangs down');assert.ok(Math.abs(e.z-s.z)<.09,'upper arm is not reaching at keyboard');assert.ok(Math.abs(h.x)>=.07&&Math.abs(h.x)<=.17,'hands rest inward over thighs, not outside legs');assert.ok(h.y>=.66&&h.y<=.77,'hands below desk and above thighs');assert.ok(h.z>=.04&&h.z<=.22,'hands stay on lap, not reaching to desk');}
  return {p,hands:r.hands.map(v=>v.toArray()),head:r.head.toArray()};});
 for(const r of results.slice(1))assert.deepEqual(r,results[0],'17s and 60s later: no typing or pose override');
 const work=rig(m.personPose({base,seat,pose:'work',time:100,reduced}));
 assert.ok(results[0].head[2]<work.head.z-.30,'overhead head position differs from work');
 for(let i=0;i<2;i++){assert.ok(work.hands[i].y-results[0].hands[i][1]>.15,'rest hands visibly lower than typing');assert.ok(work.hands[i].z-results[0].hands[i][2]>.25,'rest hands pulled back from keyboard');}
});
