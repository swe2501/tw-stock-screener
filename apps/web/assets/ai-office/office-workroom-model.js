/* Deterministic metrics from recorded events; no model calls or inferred work. */
(function(root){
'use strict';
const millis=s=>{const n=Date.parse(s);return Number.isFinite(n)?n:null;};
const duration=(a,b)=>{const x=millis(a),y=millis(b);return x!=null&&y!=null&&y>=x?(y-x)/1000:null;};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
function metrics(roles,tasks,now=Date.now()){
 const steps=roles.flatMap(r=>Array.isArray(r.steps)?r.steps:[]),finished=steps.filter(s=>millis(s.end)!=null&&typeof s.ok==='boolean');
 const terminal=tasks.filter(t=>['approved','failed'].includes(t.status));
 const interrupted=t=>t.status==='running'&&t.execution==='ai'&&millis(t.lease_until)!=null&&millis(t.lease_until)<now;
 const count={work:roles.filter(r=>r.status==='work').length+tasks.filter(t=>t.status==='running'&&!interrupted(t)).length,wait:roles.filter(r=>r.status==='idle').length+tasks.filter(t=>['queued','review'].includes(t.status)).length,done:roles.filter(r=>r.status==='done').length+tasks.filter(t=>t.status==='approved').length,attention:roles.filter(r=>['stuck','warn'].includes(r.status)).length+tasks.filter(t=>['blocked','failed'].includes(t.status)||interrupted(t)).length};
 const timed=finished.map(s=>typeof s.secs==='number'&&s.secs>=0?s.secs:duration(s.start,s.end)).filter(x=>x!=null);
 const waits=[],ontime=[];
 for(const t of tasks){const h=t.history||[],start=h.find(x=>x.status==='running'),end=h.filter(x=>x.status==='approved').at(-1);
  const w=duration(t.created_at,start?.at);if(w!=null)waits.push(w);
  if(t.due_date&&end&&millis(end.at)!=null){const local=new Date(millis(end.at)+8*3600000).toISOString().slice(0,10);ontime.push(local<=t.due_date);}
 }
 const ai=tasks.filter(t=>t.execution==='ai'),number=(t,k)=>typeof t[k]==='number'&&Number.isFinite(t[k])&&t[k]>=0?t[k]:0;
 return {count,success:finished.length+terminal.length?(finished.filter(s=>s.ok).length+terminal.filter(t=>t.status==='approved').length)/(finished.length+terminal.length):null,sample:finished.length+terminal.length,average:avg(timed),waiting:avg(waits),ontime:ontime.length?ontime.filter(Boolean).length/ontime.length:null,ontimeSample:ontime.length,cost:ai.reduce((n,t)=>n+number(t,'cost_usd'),0),reserved:ai.reduce((n,t)=>n+number(t,'reserved_usd'),0),budget:ai.reduce((n,t)=>n+number(t,'budget_usd'),0),aiCount:ai.length,costUncertain:ai.some(t=>t.cost_uncertain),retries:tasks.reduce((n,t)=>n+Math.max(0,number(t,'attempts')-1),0),now};
}
root.ForesightWorkroomModel={metrics,duration};if(typeof module!=='undefined')module.exports=root.ForesightWorkroomModel;
})(typeof window==='undefined'?globalThis:window);
