/* Deterministic daily-bar engine. Rules inspect the previous close, never the execution bar. */
(() => {
  'use strict';
  const VERSION='2.0.0';
  const definitions={
    ma:{name:'價格與均線',fields:{period:['均線週期',20,2,240]},ops:['above','below','crossUp','crossDown']},
    maPair:{name:'兩條均線',fields:{fast:['短均線',5,2,239],slow:['長均線',20,3,240]},ops:['above','below','crossUp','crossDown']},
    breakout:{name:'突破區間價位',fields:{period:['回看天數（不含當日）',20,2,240]},ops:['above','below']},
    volume:{name:'成交量與均量',fields:{period:['均量週期（不含當日）',20,2,240],value:['均量倍數',1.5,.1,20,.1]},ops:['above','below']},
    rsi:{name:'RSI',fields:{period:['RSI 週期',14,2,120],value:['RSI 門檻',30,0,100,.1]},ops:['above','below','crossUp','crossDown']},
    macd:{name:'MACD 快慢線',fields:{fast:['快線 EMA 週期',12,2,119],slow:['慢線 EMA 週期',26,3,240],signal:['訊號 EMA 週期',9,2,120]},ops:['above','below','crossUp','crossDown']},
    kd:{name:'KD 的 K 與 D',fields:{period:['RSV 週期',9,2,120],smoothK:['K 平滑參數',3,1,30],smoothD:['D 平滑參數',3,1,30]},ops:['above','below','crossUp','crossDown']},
    always:{name:'期間開始即買進（買進持有）',fields:{},ops:['above']}
  };
  const opNames={above:'高於',below:'低於',crossUp:'由下往上穿越',crossDown:'由上往下穿越'};
  function rule(type='maPair',op='crossUp'){if(!definitions[type].ops.includes(op))op=definitions[type].ops[0];return {id:typeof crypto!=='undefined'?crypto.randomUUID():String(Math.random()),type,op,...Object.fromEntries(Object.entries(definitions[type].fields).map(([k,v])=>[k,v[1]]))};}
  const copy=v=>JSON.parse(JSON.stringify(v));
  function template(type='trend'){
    const s={id:null,name:'我的均線策略',entryMode:'all',exitMode:'any',entry:[rule('maPair')],exit:[rule('maPair','crossDown')],risk:{stop:0,take:0,maxBars:0}};
    if(type==='breakout'){s.name='突破放量範例';s.entry=[rule('breakout','above'),rule('volume','above')];s.exit=[rule('ma','below')];}
    if(type==='rsi'){s.name='RSI 回升範例';s.entry=[rule('rsi')];s.exit=[{...rule('rsi','crossDown'),value:70}];}
    if(type==='macd'){s.name='MACD 交叉範例';s.entry=[rule('macd')];s.exit=[rule('macd','crossDown')];}
    if(type==='kd'){s.name='KD 交叉範例';s.entry=[rule('kd')];s.exit=[rule('kd','crossDown')];}
    if(type==='hold'){s.name='買進持有範例';s.entry=[rule('always')];s.exit=[];}
    return s;
  }
  function validate(s){
    if(!s||typeof s.name!=='string'||!s.name.trim()||s.name.length>60)throw Error('策略名稱請填寫 1～60 個字');
    for(const side of ['entry','exit']){
      if(!Array.isArray(s[side])||s[side].length>10||(side==='entry'&&!s[side].length)||!['all','any'].includes(s[side+'Mode']))throw Error('每組可設定 1～10 條條件；賣出條件可留空');
      for(const r of s[side]){const def=definitions[r.type];if(!def||!def.ops.includes(r.op)||(side==='exit'&&r.type==='always'))throw Error('條件類型或比較方式不支援');for(const [k,f] of Object.entries(def.fields)){if(!Number.isFinite(r[k])||r[k]<f[2]||r[k]>f[3]||(!f[4]&&!Number.isInteger(r[k])))throw Error(def.name+'：'+f[0]+'設定無效');}if(['maPair','macd'].includes(r.type)&&r.fast>=r.slow)throw Error('短／快線週期必須小於長／慢線週期');}
    }
    const risk=s.risk||{};if(!Number.isFinite(risk.stop)||risk.stop<0||risk.stop>=100||!Number.isFinite(risk.take)||risk.take<0||risk.take>1000||!Number.isInteger(risk.maxBars)||risk.maxBars<0||risk.maxBars>1000)throw Error('停損、停利或最長持有天數無效');
    return true;
  }
  function describeRule(r){
    const op=opNames[r.op];if(r.type==='always')return '期間第一個有效開盤買進';
    if(r.type==='ma')return `收盤價${op} ${r.period} 日簡單均線`;
    if(r.type==='maPair')return `${r.fast} 日簡單均線${op} ${r.slow} 日簡單均線`;
    if(r.type==='breakout')return `收盤價${op}前 ${r.period} 日${r.op==='above'?'最高':'最低'}價（不含當日）`;
    if(r.type==='volume')return `成交量${op}前 ${r.period} 日均量的 ${r.value} 倍`;
    if(r.type==='rsi')return `${r.period} 日 RSI ${op} ${r.value}`;
    if(r.type==='macd')return `MACD DIF（${r.fast}, ${r.slow}）${op}訊號線（${r.signal}）`;
    return `KD（${r.period}, ${r.smoothK}, ${r.smoothD}）K ${op} D`;
  }
  function summary(s){return ['買進：'+s.entry.map(describeRule).join(s.entryMode==='all'?'，而且 ':'，或 '),'賣出：'+(s.exit.length?s.exit.map(describeRule).join(s.exitMode==='all'?'，而且 ':'，或 '):'不依指標賣出'),`停損 ${s.risk.stop||'關閉'}${s.risk.stop?'%':''}；停利 ${s.risk.take||'關閉'}${s.risk.take?'%':''}；最長持有 ${s.risk.maxBars||'不限'}${s.risk.maxBars?' 根日K':''}`].join('\n').replace(/NaN/g,'未填');}
  function sma(a,n){let sum=0,count=0;return a.map((v,i)=>{if(Number.isFinite(v)){sum+=v;count++;}if(i>=n&&Number.isFinite(a[i-n])){sum-=a[i-n];count--;}return i>=n-1&&count===n?sum/n:null;});}
  function ema(a,n){let prev=null,total=0,count=0;return a.map(v=>{if(!Number.isFinite(v))return null;if(prev===null){total+=v;count++;if(count<n)return null;prev=total/n;}else prev=v*2/(n+1)+prev*(1-2/(n+1));return prev;});}
  function indicators(data,r){
    const c=data.map(x=>x.close),n=data.length;let left=[],right=[];
    if(r.type==='always')return {left:Array(n).fill(1),right:Array(n).fill(0)};
    if(r.type==='ma')return {left:c,right:sma(c,r.period)};
    if(r.type==='maPair')return {left:sma(c,r.fast),right:sma(c,r.slow)};
    if(r.type==='macd'){const f=ema(c,r.fast),s=ema(c,r.slow);left=c.map((_,i)=>f[i]===null||s[i]===null?null:f[i]-s[i]);return {left,right:ema(left,r.signal)};}
    if(r.type==='breakout')return {left:c,right:c.map((_,i)=>i<r.period?null:(r.op==='above'?Math.max(...data.slice(i-r.period,i).map(x=>x.high)):Math.min(...data.slice(i-r.period,i).map(x=>x.low))))};
    if(r.type==='volume'){left=data.map(x=>x.volume);const av=sma(left,r.period);return {left,right:av.map((_,i)=>i>0&&av[i-1]!==null?av[i-1]*r.value:null)};}
    if(r.type==='rsi'){
      let gain=0,loss=0;left=Array(n).fill(null);
      for(let i=1;i<n;i++){const delta=c[i]-c[i-1],g=Math.max(0,delta),l=Math.max(0,-delta);if(i<=r.period){gain+=g;loss+=l;if(i<r.period)continue;gain/=r.period;loss/=r.period;}else{gain=(gain*(r.period-1)+g)/r.period;loss=(loss*(r.period-1)+l)/r.period;}left[i]=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}
      return {left,right:Array(n).fill(r.value)};
    }
    let k=50,d=50;left=Array(n).fill(null);right=Array(n).fill(null);
    for(let i=r.period-1;i<n;i++){const a=data.slice(i-r.period+1,i+1),hi=Math.max(...a.map(x=>x.high)),lo=Math.min(...a.map(x=>x.low)),rsv=hi===lo?50:(c[i]-lo)/(hi-lo)*100;k=(k*(r.smoothK-1)+rsv)/r.smoothK;d=(d*(r.smoothD-1)+k)/r.smoothD;left[i]=k;right[i]=d;}
    return {left,right};
  }
  function match(r,series,i){if(r.type==='always')return true;const {left:l,right:v}=series;if(i<0||!Number.isFinite(l[i])||!Number.isFinite(v[i]))return false;if(r.op==='above')return l[i]>v[i];if(r.op==='below')return l[i]<v[i];if(i<1||!Number.isFinite(l[i-1])||!Number.isFinite(v[i-1]))return false;return r.op==='crossUp'?l[i]>v[i]&&l[i-1]<=v[i-1]:l[i]<v[i]&&l[i-1]>=v[i-1];}
  function prepare(rows){
    if(!Array.isArray(rows))throw Error('歷史行情格式無效');
    if(rows.some(x=>!x||typeof x!=='object'))throw Error('歷史行情格式無效');
    const data=rows.map(x=>({...x,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:x.volume==null||String(x.volume).trim()===''?null:+x.volume})).sort((a,b)=>String(a.time).localeCompare(String(b.time)));
    if(!data.length||data.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x.time)||!Number.isFinite(Date.parse(x.time+'T00:00:00Z'))||new Date(x.time+'T00:00:00Z').toISOString().slice(0,10)!==x.time||![x.open,x.high,x.low,x.close].every(v=>Number.isFinite(v)&&v>0)||x.low>Math.min(x.open,x.close)||x.high<Math.max(x.open,x.close)||x.low>x.high))throw Error('需要完整且有效的日線開高低收資料，不能用收盤價虛構 K 棒');
    if(new Set(data.map(x=>x.time)).size!==data.length)throw Error('歷史行情日期重複');return data;
  }
  function inspectAt(data,s,i,cache){
    const side=key=>{const checks=s[key].map(r=>{const v=cache.get(r),cross=r.op.startsWith('cross'),ready=r.type==='always'||i>=0&&Number.isFinite(v.left[i])&&Number.isFinite(v.right[i])&&(!cross||i>0&&Number.isFinite(v.left[i-1])&&Number.isFinite(v.right[i-1]));return {rule:describeRule(r),ready,matched:ready&&match(r,v,i),left:Number.isFinite(v.left[i])?v.left[i]:null,right:Number.isFinite(v.right[i])?v.right[i]:null,previousLeft:Number.isFinite(v.left[i-1])?v.left[i-1]:null,previousRight:Number.isFinite(v.right[i-1])?v.right[i-1]:null};});return {mode:s[key+'Mode'],checks,ready:checks.every(c=>c.ready),matched:!!checks.length&&checks.every(c=>c.ready)&&(s[key+'Mode']==='all'?checks.every(c=>c.matched):checks.some(c=>c.matched))};};
    return {date:data[i]?.time||null,entry:side('entry'),exit:side('exit')};
  }
  function inspect(rows,s,date){validate(s);const data=prepare(rows),i=data.findIndex(x=>x.time===date);if(i<0)throw Error('所選日期沒有日K資料');const cache=new Map([...s.entry,...s.exit].map(r=>[r,indicators(data,r)]));return inspectAt(data,s,i,cache);}
  function scan(rows,s){
    validate(s);if(s.entry.some(r=>r.type==='always'))throw Error('買進持有是回測方式，請先新增可用於選股的買進條件');
    const data=prepare(rows),i=data.length-1,checks=s.entry.map(r=>{const v=indicators(data,r),cross=r.op.startsWith('cross'),ready=i>=0&&Number.isFinite(v.left[i])&&Number.isFinite(v.right[i])&&(!cross||i>0&&Number.isFinite(v.left[i-1])&&Number.isFinite(v.right[i-1]));return {rule:describeRule(r),ready,matched:ready&&match(r,v,i)};});
    return {date:data[i].time,ready:checks.every(x=>x.ready),matched:checks.every(x=>x.ready)&&(s.entryMode==='all'?checks.every(x=>x.matched):checks.some(x=>x.matched)),checks};
  }
  function run(rows,s,p){
    validate(s);const data=prepare(rows);
    if(!Number.isFinite(p.capital)||p.capital<100||p.capital>1e9||![p.fee,p.tax,p.slip].every(x=>Number.isFinite(x)&&x>=0&&x<=.05)||!Number.isFinite(p.allocation)||p.allocation<=0||p.allocation>1||!['ratio','amount'].includes(p.sizing)||p.sizing==='amount'&&(!Number.isFinite(p.amount)||p.amount<=0))throw Error('資金或交易成本設定無效');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.start)||!/^\d{4}-\d{2}-\d{2}$/.test(p.end)||p.start>p.end||p.start<data[0].time||p.end<data[0].time)throw Error('請選擇行情可用範圍內的回測日期');
    if([p.start,p.end].some(d=>!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d))throw Error('回測日期無效');
    const first=data.findIndex(x=>x.time>=p.start),last=data.findLastIndex(x=>x.time<=p.end);if(first<0||last-first<2)throw Error('所選期間不足三根日K');
    if(p.end>data.at(-1).time)throw Error('結束日期超出已載入行情，請確認資料日期後再回測');
    const rules=[...s.entry,...s.exit],cache=new Map(rules.map(r=>[r,indicators(data,r)]));
    if(rules.some(r=>r.type==='volume')&&data.slice(0,last+1).some(x=>!Number.isFinite(x.volume)||x.volume<0))throw Error('此策略需要完整成交量資料');
    if(rules.some(r=>r.type!=='always'&&(first<1||!Number.isFinite(cache.get(r).left[first-1])||!Number.isFinite(cache.get(r).right[first-1])||r.op.startsWith('cross')&&(first<2||!Number.isFinite(cache.get(r).left[first-2])||!Number.isFinite(cache.get(r).right[first-2])))))throw Error('開始日期前的指標暖機資料不足，請將起始日期往後移');
    const evaluate=(side,i)=>s[side].length?(s[side+'Mode']==='all'?s[side].every(r=>match(r,cache.get(r),i)):s[side].some(r=>match(r,cache.get(r),i))):false;
    let cash=p.capital,qty=0,buyPrice=0,buyCost=0,held=0,peak=p.capital,dd=0,wins=0,closed=0,fees=0;const trades=[],curve=[];
    const benchmarkFill=data[first].open*(1+p.slip),benchmarkQty=Math.floor(p.capital/(benchmarkFill*(1+p.fee))),benchmarkCash=p.capital-benchmarkQty*benchmarkFill*(1+p.fee);
    let buyDate=null;
    const sell=(bar,raw,reason,signal=null)=>{const price=raw*(1-p.slip),cost=qty*price*(p.fee+p.tax),net=qty*price-cost,pnl=net-buyCost;cash+=net;fees+=cost;closed++;if(pnl>0)wins++;trades.push({date:bar.time,side:'賣出',price,rawPrice:raw,shares:qty,cost,reason,pnl,returnPct:buyCost?pnl/buyCost*100:null,entryDate:buyDate,entryPrice:buyPrice,signal});qty=0;held=0;};
    for(let i=first;i<=last;i++){
      const bar=data[i];let sold=false;
      if(qty){const stop=buyPrice*(1-s.risk.stop/100),take=buyPrice*(1+s.risk.take/100);
        if(evaluate('exit',i-1)){sell(bar,bar.open,'前日賣出訊號',inspectAt(data,s,i-1,cache));sold=true;}
        else if(s.risk.maxBars&&held>=s.risk.maxBars){sell(bar,bar.open,'持有期限');sold=true;}
        else if(s.risk.stop&&bar.open<=stop){sell(bar,bar.open,'跳空停損');sold=true;}
        else if(s.risk.take&&bar.open>=take){sell(bar,bar.open,'跳空停利');sold=true;}
      }
      if(!qty&&!sold&&evaluate('entry',i-1)){
        const price=bar.open*(1+p.slip),budget=p.sizing==='amount'?Math.min(cash,p.amount):cash*p.allocation,n=Math.floor(budget/(price*(1+p.fee)));
        if(n>0){qty=n;buyPrice=price;buyDate=bar.time;buyCost=n*price*(1+p.fee);cash-=buyCost;held=0;fees+=n*price*p.fee;trades.push({date:bar.time,side:'買進',price,rawPrice:bar.open,shares:n,cost:n*price*p.fee,reason:i===first&&s.entry.some(r=>r.type==='always')?'期間起始':'前日買進訊號',signal:inspectAt(data,s,i-1,cache)});}
      }
      if(qty){const stop=buyPrice*(1-s.risk.stop/100),take=buyPrice*(1+s.risk.take/100);if(s.risk.stop&&bar.low<=stop)sell(bar,Math.min(bar.open,stop),'盤中停損（同棒雙觸價以停損優先）');else if(s.risk.take&&bar.high>=take)sell(bar,Math.max(bar.open,take),'盤中停利');}
      if(qty)held++;const equity=cash+qty*bar.close;peak=Math.max(peak,equity);dd=Math.max(dd,(peak-equity)/peak);curve.push({date:bar.time,equity,benchmark:benchmarkCash+benchmarkQty*bar.close});
    }
    return {engineVersion:VERSION,curve,trades,returnPct:(curve.at(-1).equity/p.capital-1)*100,benchmarkPct:(curve.at(-1).benchmark/p.capital-1)*100,drawdown:dd*100,closed,winRate:closed?wins/closed*100:null,openShares:qty,fees,first:curve[0].date,last:curve.at(-1).date,strategy:copy(s),parameters:copy(p)};
  }
  window.AcademyStrategyEngine={VERSION,definitions,opNames,rule,template,validate,describeRule,summary,sma,ema,indicators,prepare,run,scan,inspect};
})();
