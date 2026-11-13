/* Local rehearsal only. This model never writes orders or membership grants. */
(function(root){
  'use strict';
  const rank={free:0,observation:1,research:2,advanced:2,vip:3};
  const copy=x=>JSON.parse(JSON.stringify(x));
  function month(value,anchor){
    const d=new Date(new Date(value).getTime()+8*3600000),day=anchor||d.getUTCDate();
    d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(day,last));return new Date(d.getTime()-8*3600000).toISOString();
  }
  function quote(state,plan,now){
    if(!plan||!Object.hasOwn(rank,plan.tier)||!Number.isInteger(plan.price_twd)||plan.price_twd<0)throw Error('方案無效');
    if(!state||Date.parse(state.end)<=Date.parse(now))return {operation:'new',amount:plan.price_twd};
    if(state.plan.id===plan.id)return {operation:'unchanged',amount:0};
    if(rank[plan.tier]<rank[state.plan.tier]||(rank[plan.tier]===rank[state.plan.tier]&&plan.price_twd<state.plan.price_twd))return {operation:'downgrade',amount:0};
    return {operation:'upgrade',amount:Math.round(Math.max(0,plan.price_twd-state.plan.price_twd)*Math.max(0,Math.min(1,(Date.parse(state.end)-Date.parse(now))/(Date.parse(state.end)-Date.parse(state.start)))))};
  }
  function event(current,action,{plan,now=new Date().toISOString(),mode='monthly',id}={}){
    let s=current?copy(current):null;
    if(s?.events.includes(id))return s;
    if(!id)throw Error('缺少事件編號');
    if(action==='start'){
      quote(null,plan,now);if(!['monthly','one_time'].includes(mode))throw Error('購買方式無效');
      if(s&&Date.parse(s.end)>Date.parse(now)&&s.status!=='expired')throw Error('已有方案，請使用升降級');
      const anchor=new Date(Date.parse(now)+8*3600000).getUTCDate();
      s={is_test:true,mode,plan:copy(plan),start:now,end:mode==='monthly'?month(now,anchor):new Date(Date.parse(now)+(plan.days||30)*86400000).toISOString(),anchor,status:'active',cancel:false,pending:null,events:[],version:0};
    }else{
      if(!s||s.is_test!==true)throw Error('沒有模擬方案');
      if(action==='change'){
        if(Date.parse(s.end)<=Date.parse(now))throw Error('方案已到期，請重新選擇');
        const q=quote(s,plan,now);
        if(q.operation==='upgrade'){s.plan=copy(plan);s.pending=null;s.lastAmount=q.amount;}
        else if(q.operation==='downgrade')s.pending=copy(plan);
      }else if(action==='unqueue'){s.pending=null;}
      else if(action==='cancel'){s.cancel=true;s.pending=null;}
      else if(action==='resume'){if(Date.parse(s.end)<=Date.parse(now))throw Error('已到期');s.cancel=false;}
      else if(action==='renew_failed'){
        if(s.mode!=='monthly'||s.cancel||Date.parse(now)<Date.parse(s.end))throw Error('尚未到可續訂時間');
        s.status='past_due';
      }else if(action==='renew_success'){
        if(s.mode!=='monthly'||s.cancel||Date.parse(now)<Date.parse(s.end))throw Error('不能續訂');
        s.plan=s.pending||s.plan;s.pending=null;s.start=s.end;s.end=month(s.end,s.anchor);s.status='active';
      }else if(action==='expire'){
        if(Date.parse(now)<Date.parse(s.end))throw Error('本期尚未到期');s.status='expired';
      }else throw Error('不支援的模擬操作');
    }
    s.events.push(id);s.version++;return s;
  }
  const api={month,quote,event};if(typeof module!=='undefined')module.exports=api;else root.AcademyBillingModel=api;
})(typeof window==='undefined'?globalThis:window);
