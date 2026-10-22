/* Deterministic journal ledger. Prices, taxes and broker terms are entered by the member. */
(() => {
'use strict';
const products={stock:'現股',etf:'ETF',margin:'融資',short:'融券',futures:'期貨',options:'選擇權'};
const copy=x=>JSON.parse(JSON.stringify(x));
function date(v){const d=new Date(v+'T00:00:00Z');return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function number(v,label,min=0){if(v===''||v===null||!Number.isFinite(Number(v))||Number(v)<min)throw Error(label+'格式不正確');return Number(v);}
function validate(f){
 if(!f.id||!date(f.date))throw Error('請填寫有效成交日期');
 if(!products[f.product]||!['real','paper'].includes(f.book)||!['long','short'].includes(f.side)||!['open','close'].includes(f.action))throw Error('交易方式不正確');
 if(!/^[A-Za-z0-9._-]{1,20}$/.test(f.symbol)||!String(f.account||'').trim())throw Error('請確認代號與帳戶');
 number(f.qty,'數量',1);if(!Number.isInteger(+f.qty))throw Error('數量須為整數股／口');number(f.price,'成交價',0.000001);number(f.multiplier,'乘數',0.000001);number(f.fee,'手續費');number(f.tax,'稅／其他費用');
 const derivative=['futures','options'].includes(f.product);if(derivative?f.lot!=='contract':!['whole','odd','mixed'].includes(f.lot))throw Error('請選擇符合商品的張／股／口單位');
 if(derivative&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.contractMonth||''))throw Error('期貨／選擇權須確認合約年月');
 if(f.product==='options'&&(!['call','put'].includes(f.optionRight)||!(+f.strike>0)))throw Error('請確認選擇權買權／賣權及履約價');
 if(!derivative&&(+f.multiplier!==1||(['stock','etf','margin'].includes(f.product)&&f.side!=='long')||(f.product==='short'&&f.side!=='short')))throw Error('現股／融資為多單，融券為空單；股票乘數須為 1');
 if(!derivative&&f.lot==='whole'&&+f.qty%1000!==0)throw Error('整張成交須為 1,000 股的倍數；請核對張數換算');
 if(!derivative&&f.lot==='odd'&&+f.qty>999)throw Error('單筆零股數量為 1～999 股');
 return true;
}
const key=f=>[f.book,f.account,f.product,f.symbol,['futures','options'].includes(f.product)?f.contractMonth:'',f.product==='options'?f.optionRight+'-'+f.strike:'',f.side].join('|');
function ledger(fills){
 const positions=new Map(),cycles=[],realizations=[],seen=new Set();let sequence=0;
 const sorted=fills.map((f,i)=>({...f,_seq:i})).sort((a,b)=>a.date.localeCompare(b.date)||a._seq-b._seq);
 for(const f of sorted){validate(f);if(seen.has(f.id))throw Error('成交編號重複，未重複記錄');seen.add(f.id);const k=key(f);let p=positions.get(k);
 if(!p){p={key:k,...copy(f),qty:0,lots:[],cycles:[],realized:0};positions.set(k,p);}else if(+p.multiplier!==+f.multiplier)throw Error('同一合約的交易乘數不同，請使用核對合約乘數統一修正');
 const qty=+f.qty,price=+f.price,m=+f.multiplier,cost=+f.fee + +f.tax;
 if(f.action==='open'){if(p.qty&&p.lots.some(l=>l.multiplier!==m))throw Error('同一合約的交易乘數不同');
 if(!p.qty){const c={id:f.id,key:k,symbol:f.symbol,name:f.name,product:f.product,book:f.book,account:f.account,side:f.side,start:f.date,end:null,qty:0,realized:0,realizedBasis:0,returnPct:null,confirmed:true,fills:[],strategyNames:[],sequence:sequence++};p.cycle=c;cycles.push(c);p.cycles.push(c);}
 p.lots.push({id:f.id,qty,price,multiplier:m,cost,confirmed:f.costConfirmed===true,strategy:f.strategySnapshot?.name||'未指定策略'});p.qty+=qty;p.cycle.qty+=qty;p.cycle.fills.push(f);p.cycle.confirmed&&=f.costConfirmed===true;
 }else{
 if(qty>p.qty+1e-8)throw Error(`${f.date} ${f.symbol} 平倉 ${qty} 超過可用部位 ${p.qty}；請核對日期與同日順序`);
 let remaining=qty,gross=0,openCosts=0,notionalBasis=0,confirmed=f.costConfirmed===true;
 while(remaining>1e-8){const lot=p.lots[0],take=Math.min(remaining,lot.qty),fraction=take/lot.qty;if(lot.multiplier!==m)throw Error('同一合約的交易乘數不同');gross+=(price-lot.price)*take*m*(f.side==='short'?-1:1);openCosts+=lot.cost*fraction;notionalBasis+=lot.price*take*m;confirmed&&=lot.confirmed;lot.cost*=1-fraction;lot.qty-=take;remaining-=take;if(lot.qty<1e-8)p.lots.shift();}
 const net=gross-openCosts-cost;realizations.push({id:f.id,date:f.date,net,basis:notionalBasis+openCosts,returnPct:(notionalBasis+openCosts)>0?net/(notionalBasis+openCosts)*100:null,confirmed,cycleId:p.cycle.id});p.qty-=qty;p.realized+=net;p.cycle.realized+=net;p.cycle.realizedBasis+=notionalBasis+openCosts;p.cycle.returnPct=p.cycle.realizedBasis>0?p.cycle.realized/p.cycle.realizedBasis*100:null;p.cycle.fills.push(f);p.cycle.confirmed&&=f.costConfirmed===true;
 if(p.qty<1e-8){p.qty=0;p.cycle.end=f.date;}
 }
 if(p.cycle)p.cycle.strategyNames=[...new Set(p.cycle.fills.map(x=>x.strategySnapshot?.name||'未指定策略'))];
 }
 return {realizations,positions:[...positions.values()].filter(p=>p.qty>0).map(p=>({...p,average:p.lots.reduce((s,l)=>s+l.price*l.qty,0)/p.qty,openingCosts:p.lots.reduce((s,l)=>s+l.cost,0)})),cycles,closed:cycles.filter(c=>c.end),realized:cycles.reduce((s,c)=>s+c.realized,0)};
}
function append(existing,incoming){const ids=new Set(existing.map(x=>x.id)),out=copy(existing);for(const f of incoming){if(ids.has(f.id)){if(JSON.stringify(existing.find(x=>x.id===f.id))!==JSON.stringify(f))throw Error('相同編號有不同內容，請重新整理後核對');continue;}out.push(copy(f));ids.add(f.id);}if(out.length>10000)throw Error('單一記帳檔最多 10,000 筆，請先備份整理');ledger(out);return out;}
function report(fills,{book='real',account=null,start='',end='9999-12-31'}={}){const all=ledger(fills.filter(f=>f.book===book&&(!account||f.account===account))),closed=all.closed.filter(c=>c.end>=start&&c.end<=end),win=closed.filter(c=>c.realized>0),loss=closed.filter(c=>c.realized<0),events=all.realizations.filter(x=>x.date>=start&&x.date<=end);const basis=events.reduce((s,x)=>s+x.basis,0);return {...all,closed,realizedBasis:basis,returnPct:basis>0?events.reduce((s,x)=>s+x.net,0)/basis*100:null,realized:events.reduce((s,x)=>s+x.net,0),confirmed:events.every(x=>x.confirmed),winRate:closed.length?win.length/closed.length:null,meanWin:win.length?win.reduce((s,c)=>s+c.realized,0)/win.length:null,meanLoss:loss.length?loss.reduce((s,c)=>s+c.realized,0)/loss.length:null};}
function goalProgress(goal,state,today){let value=0,detail='',complete=false;const fills=state.fills.filter(f=>f.book===(goal.book||'real')&&(!goal.account||f.account===goal.account));if(goal.kind==='profit'){const r=report(fills,{book:goal.book||'real',start:goal.start,end:goal.end});const interest=(state.cashflows||[]).filter(c=>c.kind==='interest'&&c.book===(goal.book||'real')&&(!goal.account||c.account===goal.account)&&c.date>=goal.start&&c.date<=goal.end).reduce((sum,c)=>sum+c.amount,0);value=r.confirmed?r.realized-interest:0;detail=r.confirmed?'已實現損益，扣除填寫費稅與期間利息':'費稅尚未確認，暫不計入獲利目標';complete=r.confirmed&&value>=+goal.target;}
 else if(goal.kind==='trade'){const c=ledger(fills).cycles.find(x=>x.id===goal.cycleId),mark=state.marks?.[c?.key];if(c){const entry=c.fills.find(x=>x.action==='open').price,direction=c.side==='short'?-1:1;value=mark?Math.max(0,Math.min(1,(mark.price-entry)*direction/((+goal.target-entry)*direction||1))):0;const exits=c.fills.filter(x=>x.action==='close'),exitQty=exits.reduce((s,f)=>s+f.qty,0),exitPrice=exitQty?exits.reduce((s,f)=>s+f.price*f.qty,0)/exitQty:null;if(c.end&&exitPrice!==null)value=Math.max(0,Math.min(1,(exitPrice-entry)*direction/((+goal.target-entry)*direction||1)));complete=!!c.end&&exitPrice!==null&&(exitPrice-+goal.target)*direction>=0;detail=c.end?(complete?'已成交結束，達成目標價':'已成交結束；未達目標價'):mark?'報價 '+mark.date+'；觸價不等於成交':'尚無部位報價；請到交易紀錄更新';}}
 else{const cs=ledger(fills).closed.filter(c=>c.end>=goal.start&&c.end<=goal.end);value=cs.filter(c=>state.reviews?.[c.id]?.date>=goal.start&&state.reviews[c.id].date<=goal.end&&(!goal.adherence||state.reviews[c.id].adherent)).length;detail=goal.adherence?'依會員覆盤勾選的遵守計畫次數':'已平倉且完成覆盤的交易次數';complete=value>=+goal.target;}
 const ratio=goal.kind==='trade'?value:Math.max(0,Math.min(1,value/(+goal.target||1))),days=Math.ceil((Date.parse(goal.end+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);return {value,ratio:complete?1:Math.min(.99,ratio),complete,detail,days};}
function fingerprint(f){return [f.date,key(f),f.action,+f.qty,+f.price,+f.fee,+f.tax].join('~');}
window.AcademyTradeEngine={products,validate,ledger,append,report,key,date,goalProgress,fingerprint};
})();
