/* Deterministic daily-bar engine. Rules inspect the previous close, never the execution bar. */
(() => {
  'use strict';
  const VERSION='2.1.0';
  // A small typed language, interpreted as series. Never executes JavaScript.
  const formula=(()=>{
    const aliases={參數:'param',收盤價:'close',收盤:'close',開盤價:'open',最高價:'high',最低價:'low',成交量:'volume',均線:'SMA',簡單均線:'SMA',指數均線:'EMA',相對強弱:'RSI',區間最高:'HHV',區間最低:'LLV',前值:'REF',向上穿越:'CROSSUP',向下穿越:'CROSSDOWN',絕對值:'ABS',較大值:'MAX',較小值:'MIN',且:'AND',而且:'AND',或:'OR',或者:'OR',非:'NOT',高於:'>',大於:'>',低於:'<',小於:'<',大於等於:'>=',小於等於:'<=',等於:'==',不等於:'!='};
    const inputs=new Set(['open','high','low','close','volume']),functions=new Set(['SMA','EMA','RSI','HHV','LLV','REF','CROSSUP','CROSSDOWN','ABS','MIN','MAX']);
    const fail=(t,m)=>{throw Error(`公式第 ${t.line} 行、第 ${t.col} 欄：${m}`);};
    function compile(code,overrides={}){
      if(typeof code!=='string'||!code.trim()||code.length>4000||code.split('\n').length>60)throw Error('公式請填寫 1～4000 字、最多 60 行');
      if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).length>12)throw Error('公式參數格式無效');
      const tokens=[];let pos=0,line=1,col=1;
      while(pos<code.length){const start=pos,l=line,c=col,ch=code[pos];if(ch==='\n'){tokens.push({v:';',line,col,pos,end:pos+1});pos++;line++;col=1;continue;}if(/[\s]/.test(ch)){pos++;col++;continue;}if(ch==='#'){while(pos<code.length&&code[pos]!=='\n'){pos++;col++;}continue;}
        const rest=code.slice(pos);let m,v,kind;
        if((m=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest))){v=Number(m[0]);kind='number';if(!Number.isFinite(v)||Math.abs(v)>1e9)fail({line:l,col:c},'數值超出範圍');}
        else if((m=/^[\p{L}_][\p{L}\p{N}_]*/u.exec(rest))){v=Object.hasOwn(aliases,m[0])?aliases[m[0]]:m[0];if(['and','or','not'].includes(v.toLowerCase()))v=v.toUpperCase();kind='id';}
        else if((m=/^(?:>=|<=|==|!=|&&|\|\||[+*/()!,=<>;\-])/.exec(rest))){v=({'&&':'AND','||':'OR','!':'NOT'})[m[0]]||m[0];kind='op';}
        else fail({line:l,col:c},'不支援的字元「'+ch+'」；不允許字串、屬性存取或程式呼叫');
        pos+=m[0].length;col+=m[0].length;tokens.push({v,kind,line:l,col:c,pos:start,end:pos});if(tokens.length>600)fail(tokens.at(-1),'公式過於複雜');
      }
      tokens.push({v:'EOF',line,col,pos,end:pos});let at=0,nodes=0,depth=0,usesVolume=false;const env=new Map(),parameters=[],variables=[],steps=[];
      const peek=()=>tokens[at],take=()=>tokens[at++],expect=v=>{const t=take();if(t.v!==v)fail(t,'預期「'+v+'」');return t;},node=(t,fields)=>{if(++nodes>200)fail(t,'運算節點超過 200 個');return {t,...fields};};
      const reserved=name=>inputs.has(name)||functions.has(name)||['param','AND','OR','NOT','true','false','EOF','__proto__','prototype','constructor'].includes(name);
      const requireType=(a,type,t)=>{if(a.type!==type)fail(t,'這裡需要'+(type==='number'?'數值':'成立／不成立條件'));};
      const prec={OR:1,AND:2,'>':3,'<':3,'>=':3,'<=':3,'==':3,'!=':3,'+':4,'-':4,'*':5,'/':5};
      function expression(min=0){if(++depth>32)fail(peek(),'括號或運算巢狀過深');let a=primary();while(Object.hasOwn(prec,peek().v)&&prec[peek().v]>=min){const op=take(),b=expression(prec[op.v]+1),boolean=['AND','OR'].includes(op.v),comparison=prec[op.v]===3;if(boolean){requireType(a,'boolean',op);requireType(b,'boolean',op);}else if(comparison){if(a.type!==b.type||a.type==='boolean'&&!['==','!='].includes(op.v))fail(op,'比較兩側的型別不符');}else{requireType(a,'number',op);requireType(b,'number',op);}a=node(op,{kind:'binary',op:op.v,a,b,type:boolean||comparison?'boolean':'number',constant:a.constant&&b.constant});if(comparison)steps.push(a);}depth--;return a;}
      function primary(){const t=take();if(t.v==='('){const a=expression();expect(')');return a;}if(['+','-','NOT'].includes(t.v)){const a=expression(6);requireType(a,t.v==='NOT'?'boolean':'number',t);return node(t,{kind:'unary',op:t.v,a,type:a.type,constant:a.constant});}
        if(t.kind==='number')return node(t,{kind:'literal',value:t.v,type:'number',constant:true});
        if(t.kind!=='id')fail(t,'需要數值、變數或允許的函式');
        if(functions.has(t.v)){expect('(');const args=[];if(peek().v!==')'){do{args.push(expression());if(peek().v!==',')break;take();}while(true);}expect(')');const count=t.v==='ABS'?1:2;if(args.length!==count)fail(t,t.v+' 需要 '+count+' 個參數');args.forEach(a=>requireType(a,'number',t));let period=null;
          if(['SMA','EMA','RSI','HHV','LLV','REF'].includes(t.v)){if(!args[1].constant)fail(t,'週期必須是固定數值或參數，不能用行情或變數動態改變');period=constantValue(args[1]);const low=t.v==='REF'?0:['HHV','LLV'].includes(t.v)?1:2,high=t.v==='REF'?500:t.v==='RSI'?120:240;if(!Number.isInteger(period)||period<low||period>high)fail(t,`週期須為 ${low}～${high} 的整數`);}
          const a=node(t,{kind:'call',name:t.v,args,period,type:t.v.startsWith('CROSS')?'boolean':'number',constant:['ABS','MIN','MAX'].includes(t.v)&&args.every(a=>a.constant)});if(a.type==='boolean')steps.push(a);return a;
        }
        if(inputs.has(t.v)){if(t.v==='volume')usesVolume=true;return node(t,{kind:'input',name:t.v,type:'number',constant:false});}
        if(env.has(t.v))return env.get(t.v);fail(t,'未定義的名稱「'+t.v+'」；請先宣告參數或變數');
      }
      function constantValue(a){if(a.kind==='literal')return a.value;if(a.kind==='unary'){const v=constantValue(a.a);return a.op==='-'?-v:a.op==='NOT'?!v:v;}if(a.kind==='binary')return operate(a.op,constantValue(a.a),constantValue(a.b),a.t);if(a.kind==='call'){const v=a.args.map(constantValue);return a.name==='ABS'?Math.abs(v[0]):a.name==='MIN'?Math.min(...v):Math.max(...v);}fail(a.t,'不是固定參數');}
      function binding(){const t=take();if(t.kind!=='id'||String(t.v).length>32||reserved(t.v)||env.has(t.v))fail(t,'名稱重複、保留或無效（最多 32 字）');return t;}
      const separators=()=>{while(peek().v===';')take();};let output=null;separators();
      while(peek().v!=='EOF'){if(output)fail(peek(),'最後的條件之後不能再寫其他內容');if(peek().v==='param'){take();const t=binding();expect('=');const sign=peek().v==='-'?(take(),-1):1,v=take();if(v.kind!=='number')fail(v,'參數預設值必須是數字');const initial=sign*v.v,value=Object.hasOwn(overrides,t.v)?overrides[t.v]:initial;if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e9)fail(t,'參數數值無效');if(parameters.length>=12)fail(t,'最多 12 個參數');parameters.push({name:t.v,default:initial,value,line:t.line});env.set(t.v,node(t,{kind:'literal',value,type:'number',constant:true,param:t.v}));}
        else if(peek().kind==='id'&&tokens[at+1]?.v==='='){const t=binding();expect('=');const a=expression();if(variables.length>=20)fail(t,'最多 20 個變數');env.set(t.v,a);variables.push({name:t.v,a});}
        else{output=expression();requireType(output,'boolean',output.t);}
        if(![';','EOF'].includes(peek().v))fail(peek(),'每行一個宣告或條件，請檢查運算子');separators();
      }
      if(!output)fail(peek(),'最後一行請填寫成立／不成立的條件');
      for(const name of Object.keys(overrides))if(!parameters.some(p=>p.name===name))throw Error('公式參數「'+name+'」沒有宣告');
      function print(a){if(a.param)return a.param;if(a.kind==='literal')return String(a.value);if(a.kind==='input')return a.name;if(a.kind==='unary')return a.op+' ('+print(a.a)+')';if(a.kind==='binary')return '('+print(a.a)+' '+a.op+' '+print(a.b)+')';return a.name+'('+a.args.map(print).join(', ')+')';}
      // Variable references retain their names in translated source; values remain AST references.
      const names=new Map();function readable(a,expand=false){if(!expand&&names.has(a))return names.get(a);if(a.kind==='binary')return '('+readable(a.a)+' '+a.op+' '+readable(a.b)+')';if(a.kind==='unary')return a.op+' ('+readable(a.a)+')';if(a.kind==='call')return a.name+'('+a.args.map(x=>readable(x)).join(', ')+')';return print(a);}
      const normalized=parameters.map(p=>'param '+p.name+' = '+p.default);for(const v of variables){normalized.push(v.name+' = '+readable(v.a,true));if(!names.has(v.a))names.set(v.a,v.name);}normalized.push(readable(output,true));
      return {parameters,variables,steps,output,usesVolume,normalized:normalized.join('\n'),label:readable(output,true),print:readable};
    }
    function operate(op,a,b,t,date=''){let v;if(op==='+')v=a+b;else if(op==='-')v=a-b;else if(op==='*')v=a*b;else if(op==='/'){if(b===0)fail(t,(date?date+' ':'')+'除數為 0');v=a/b;}else if(op==='>')return a>b;else if(op==='<')return a<b;else if(op==='>=')return a>=b;else if(op==='<=')return a<=b;else if(op==='==')return a===b;else if(op==='!=')return a!==b;else if(op==='AND')return a&&b;else if(op==='OR')return a||b;if(!Number.isFinite(v)||Math.abs(v)>1e15)fail(t,(date?date+' ':'')+'運算結果超出範圍');return v;}
    function evaluate(data,r){const p=compile(r.code,r.params||{}),n=data.length;if(n>5000)throw Error('自訂公式每次最多計算 5000 根日K');if(p.usesVolume&&data.some(d=>!Number.isFinite(d.volume)||d.volume<0))throw Error('自訂公式需要完整成交量資料');const cache=new Map();
      function calc(a){if(cache.has(a))return cache.get(a);let out;
        if(a.kind==='literal')out=Array(n).fill(a.value);else if(a.kind==='input')out=data.map(d=>d[a.name]);else if(a.kind==='unary'){out=calc(a.a).map(v=>v===null?null:a.op==='-'?-v:a.op==='NOT'?!v:v);}
        else if(a.kind==='binary'){const l=calc(a.a),r=calc(a.b);out=l.map((v,i)=>v===null||r[i]===null?null:operate(a.op,v,r[i],a.t,data[i].time));}
        else{const x=calc(a.args[0]),y=a.args[1]?calc(a.args[1]):null,k=a.period;
          if(a.name==='SMA')out=sma(x,k);else if(a.name==='EMA')out=ema(x,k);
          else if(a.name==='REF')out=x.map((_,i)=>i<k?null:x[i-k]);
          else if(a.name==='RSI'){out=Array(n).fill(null);let gain=0,loss=0,count=0;for(let i=1;i<n;i++){if(x[i]===null||x[i-1]===null){count=0;gain=loss=0;continue;}const delta=x[i]-x[i-1],g=Math.max(0,delta),l=Math.max(0,-delta);if(count<k){gain+=g;loss+=l;count++;if(count<k)continue;gain/=k;loss/=k;}else{gain=(gain*(k-1)+g)/k;loss=(loss*(k-1)+l)/k;}out[i]=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}}
          else if(['HHV','LLV'].includes(a.name)){const queue=[];let head=0,valid=0;out=x.map((v,i)=>{if(v===null)valid=0;else valid++;while(head<queue.length&&queue[head]<=i-k)head++;if(v!==null){while(queue.length>head&&(a.name==='HHV'?x[queue.at(-1)]<=v:x[queue.at(-1)]>=v))queue.pop();queue.push(i);}return valid>=k?x[queue[head]]:null;});}
          else if(a.name==='ABS')out=x.map(v=>v===null?null:Math.abs(v));
          else if(['MIN','MAX'].includes(a.name))out=x.map((v,i)=>v===null||y[i]===null?null:a.name==='MIN'?Math.min(v,y[i]):Math.max(v,y[i]));
          else out=x.map((v,i)=>i<1||v===null||y[i]===null||x[i-1]===null||y[i-1]===null?null:a.name==='CROSSUP'?v>y[i]&&x[i-1]<=y[i-1]:v<y[i]&&x[i-1]>=y[i-1]);
        }cache.set(a,out);return out;
      }
      const values=calc(p.output),variableValues=p.variables.map(v=>({name:v.name,values:calc(v.a)})),checks=p.steps.map(a=>{const args=a.kind==='binary'?[a.a,a.b]:a.args;return {expression:p.print(a,true),left:calc(args[0]),right:calc(args[1]),values:calc(a)};});
      return {left:values.map(v=>v===null?null:v?1:0),right:Array(n).fill(0),formula:{parameters:p.parameters,variables:variableValues,checks}};
    }
    function fromChinese(text){if(typeof text!=='string'||text.length>1000)throw Error('中文描述最多 1000 字');let s=text.trim().replace(/[。；;]+$/,'').replace(/^(?:當|如果)/,'').replace(/(?:時)?(?:買進|買入|賣出|賣掉|出場|進場)$/,'').replace(/而且|並且|並|且/g,' AND ').replace(/或者|或/g,' OR ').replace(/[，,]/g,' ');
      s=s.replace(/前\s*(\d+)\s*日均量(?:的)?\s*(\d+(?:\.\d+)?)\s*倍/g,(_,n,v)=>`(REF(SMA(volume, ${n}), 1) * ${v})`).replace(/前\s*(\d+)\s*日均量/g,(_,n)=>`REF(SMA(volume, ${n}), 1)`).replace(/(\d+)\s*日均量(?:的)?\s*(\d+(?:\.\d+)?)\s*倍/g,(_,n,v)=>`(SMA(volume, ${n}) * ${v})`).replace(/(\d+)\s*日均線/g,(_,n)=>`SMA(close, ${n})`).replace(/(\d+)\s*日\s*RSI/gi,(_,n)=>`RSI(close, ${n})`).replace(/大於等於|不低於/g,' >= ').replace(/小於等於|不高於/g,' <= ').replace(/高於|大於/g,' > ').replace(/低於|小於/g,' < ').replace(/收盤價|收盤/g,' close ').replace(/開盤價/g,' open ').replace(/最高價/g,' high ').replace(/最低價/g,' low ').replace(/成交量/g,' volume ');
      try{return compile(s).normalized;}catch{throw Error('目前只能轉換明確的比較句，例如「收盤價高於 20 日均線，而且成交量大於前 20 日均量的 1.5 倍」。請補上週期、倍數及比較方式；不會猜測「強勢」或「爆量」。');}
    }
    function createGuide(){
      let step='idea',side='entry',kind='',period=0,threshold=0,entry=null,exit=null,risk={stop:0,take:0,maxBars:0};
      const answer=(message,choices=[],proposal=null)=>({message,choices,proposal});
      const intro=()=>answer('你想研究什麼買進時機？可以用一句話說，也可以回答「不知道」。我會逐步確認數值，不替你決定。這是本機規則引導，並非生成式 AI。',['不知道，先介紹','均線','RSI','突破區間','成交量']);
      const exitPrompt=()=>{step='exit';return answer('買進條件已記下。什麼時候賣出？可說「收盤價低於 20 日均線」，也能選擇一步步設定，或明確選擇只用風控。',['一步步設定賣出條件','只用停損停利／持有期限']);};
      const riskPrompt=()=>{step='stop';return answer('停損要設幾 %？以模擬買進價計算；輸入 0 表示關閉。下方數字只是範例，點選才採用。',['0','5','10']);};
      const kindPrompt=()=>{step='kind';return answer('先選一個觀察方式：均線看價格相對趨勢；RSI 看近期漲跌強弱；突破看前期高低價；成交量看交易活躍程度。這些不保證預測正確。',['均線','RSI','突破區間','成交量']);};
      function chooseKind(text){const choices=[[/均線/,'ma'],[/RSI|強弱/i,'rsi'],[/突破|區間/,'breakout'],[/成交量|均量|放量/,'volume']].filter(([pattern])=>pattern.test(text));if(choices.length!==1)return kindPrompt();kind=choices[0][1];step='period';return answer((side==='entry'?'買進':'賣出')+'條件想看幾根日K？'+(kind==='rsi'?'RSI 可用 2～120 根。':'可用 2～240 根。')+'按鈕是可修改的範例，請選擇或輸入數字。',['5','20','60']);}
      function directionPrompt(){step='direction';return answer('要在數值「高於」或「低於」門檻時成立嗎？'+(['ma','rsi'].includes(kind)?'「向上穿越」只在前日未高於、當日變高於時成立；持續高於是另一種條件。':''),['ma','rsi'].includes(kind)?['高於','低於','向上穿越','向下穿越']:['高於','低於']);}
      function finishCondition(direction){const high=['高於','向上穿越'].includes(direction),left=kind==='volume'?'volume':kind==='rsi'?'RSI(close, period)':'close',right=kind==='ma'?'SMA(close, period)':kind==='rsi'?'threshold':kind==='volume'?'REF(SMA(volume, period), 1) * threshold':`REF(${high?'HHV(high':'LLV(low'}, period), 1)`,expression=direction==='向上穿越'?`CROSSUP(${left}, ${right})`:direction==='向下穿越'?`CROSSDOWN(${left}, ${right})`:`${left} ${high?'>':'<'} ${right}`,code=`param period = ${period}\n`+(['rsi','volume'].includes(kind)?`param threshold = ${threshold}\n`:'')+expression;
        compile(code);if(side==='entry'){entry=code;return exitPrompt();}exit=code;return riskPrompt();}
      return {start:intro,send(text){text=String(text||'').trim();if(!text||text.length>1000)return answer('請用 1～1000 個字描述。');
        if(step==='done')return answer('建議已整理好，請檢查後按「套用到新草稿」。若想重新整理，可按「重新開始引導」。');
        if(step==='idea'){try{entry=fromChinese(text);return exitPrompt();}catch{}if(/不知道|不懂|介紹|怎麼|如何/.test(text))return kindPrompt();return chooseKind(text);}
        if(step==='kind')return chooseKind(text);
        if(step==='exit'){if(/一步步/.test(text)){side='exit';return kindPrompt();}if(text==='只用停損停利／持有期限'){exit=null;return riskPrompt();}try{exit=fromChinese(text);return riskPrompt();}catch{return answer('賣出條件還不夠明確。請說明比較方式與週期，例如「收盤價低於 20 日均線」。若不熟悉，可選一步步設定；不會自動替你套入條件。',['一步步設定賣出條件','只用停損停利／持有期限']);}}
        if(step==='direction'){if(!['高於','低於','向上穿越','向下穿越'].includes(text)||['breakout','volume'].includes(kind)&&text.includes('穿越'))return directionPrompt();return finishCondition(text);}
        if(step==='name'){if(text.length>60)return answer('請將策略名稱縮短到 60 字以內。');const rule=code=>({type:'formula',op:'above',code,params:{}}),proposal={name:text,entryMode:'all',exitMode:'any',entry:[rule(entry)],exit:exit?[rule(exit)]:[],risk:{...risk}};step='done';return answer('已依你確認的條件整理成待確認草稿。請檢查買賣規則和風控，再決定是否套用。收盤條件在下一交易日開盤模擬成交；目前沒有執行回測、儲存或下單。',[],proposal);}
        const number=/^\s*(\d+(?:\.\d+)?)\s*(?:%|％|日|天|根|倍)?\s*$/.exec(text),value=number?Number(number[1]):NaN;
        if(step==='period'&&/不知道|不懂/.test(text))return answer('週期是計算時回看的日K根數；較短通常變化較快，較長較平滑。下列只是示範值，請選一個再驗算，並非獲利建議。',['5','20','60']);
        if(step==='threshold'&&/不知道|不懂/.test(text))return answer(kind==='rsi'?'RSI 是 0～100 的漲跌強弱數值；還需要你選擇門檻與高於／低於，才有完整規則。':'倍數 1 表示等於前期平均量，1.5 表示平均量的 1.5 倍。這只是條件定義，不能保證上漲。',kind==='rsi'?['30','50','70']:['1','1.5','2']);
        if(step==='stop'&&/不知道|不懂/.test(text))return answer('停損是從模擬買進價往下的百分比。例如買價 100、停損 5%，門檻是 95；實際跳空可能更低。0 表示關閉，請自行選擇。',['0','5','10']);
        if(step==='take'&&/不知道|不懂/.test(text))return answer('停利是從模擬買進價往上的百分比。例如買價 100、停利 10%，門檻是 110。0 表示關閉，請自行選擇。',['0','10','20']);
        if(step==='bars'&&/不知道|不懂/.test(text))return answer('持有期限以有效日K計算，不是日曆天；例如 20 根是持有 20 根日K後，下一根開盤退出。0 表示不限。',['0','20','60']);
        if(step==='period'){if(!Number.isInteger(value)||value<2||value>(kind==='rsi'?120:240))return answer('請輸入有效的整數週期；'+(kind==='rsi'?'2～120':'2～240')+' 根日K。',['5','20','60']);period=value;if(['rsi','volume'].includes(kind)){step='threshold';return answer(kind==='rsi'?'RSI 要用多少作為門檻？請輸入 0～100；數字按鈕只是範例。':'成交量要比前期均量的幾倍？請輸入 0.1～20；均量不含訊號當日，按鈕只是範例。',kind==='rsi'?['30','50','70']:['1','1.5','2']);}return directionPrompt();}
        if(step==='threshold'){if(!Number.isFinite(value)||value<(kind==='rsi'?0:.1)||value>(kind==='rsi'?100:20))return answer('請輸入'+(kind==='rsi'?'0～100 的 RSI 門檻。':'0.1～20 的均量倍數。'));threshold=value;return directionPrompt();}
        if(step==='stop'){if(!Number.isFinite(value)||value<0||value>=100)return answer('請輸入 0～99 的停損百分比；0 表示關閉。');risk.stop=value;step='take';return answer('停利要設幾 %？輸入 0 關閉；同一天同時觸及停損與停利時，回測採停損優先。',['0','10','20']);}
        if(step==='take'){if(!Number.isFinite(value)||value<0||value>1000)return answer('請輸入 0～1000 的停利百分比；0 表示關閉。');risk.take=value;step='bars';return answer('最多持有幾根日K？0 表示不限；達期限後下一根開盤退出。',['0','20','60']);}
        if(step==='bars'){if(!Number.isInteger(value)||value<0||value>1000)return answer('請輸入 0～1000 的整數；0 表示不限。');risk.maxBars=value;step='name';return answer('最後，替這個策略取個名字（最多 60 字）。');}
        return intro();
      }};
    }
    return {compile,evaluate,fromChinese,createGuide};
  })();
  const definitions={
    formula:{name:'自訂公式／中文語法',fields:{},ops:['above']},
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
  function rule(type='maPair',op='crossUp'){if(!definitions[type].ops.includes(op))op=definitions[type].ops[0];return {id:typeof crypto!=='undefined'?crypto.randomUUID():String(Math.random()),type,op,...Object.fromEntries(Object.entries(definitions[type].fields).map(([k,v])=>[k,v[1]])),...(type==='formula'?{code:'param period = 20\ntrend = SMA(close, period)\nclose > trend',params:{}}:{})};}
  const copy=v=>JSON.parse(JSON.stringify(v));
  function template(type='trend'){
    const s={id:null,name:'我的均線策略',entryMode:'all',exitMode:'any',entry:[rule('maPair')],exit:[rule('maPair','crossDown')],risk:{stop:0,take:0,maxBars:0}};
    if(type==='breakout'){s.name='突破放量範例';s.entry=[rule('breakout','above'),rule('volume','above')];s.exit=[rule('ma','below')];}
    if(type==='rsi'){s.name='RSI 回升範例';s.entry=[rule('rsi')];s.exit=[{...rule('rsi','crossDown'),value:70}];}
    if(type==='macd'){s.name='MACD 交叉範例';s.entry=[rule('macd')];s.exit=[rule('macd','crossDown')];}
    if(type==='kd'){s.name='KD 交叉範例';s.entry=[rule('kd')];s.exit=[rule('kd','crossDown')];}
    if(type==='hold'){s.name='買進持有範例';s.entry=[rule('always')];s.exit=[];}
    if(type==='formula'){s.name='我的公式策略';s.entry=[rule('formula')];s.exit=[{...rule('formula'),code:'param period = 20\nclose < SMA(close, period)'}];}
    return s;
  }
  function validate(s){
    if(!s||typeof s.name!=='string'||!s.name.trim()||s.name.length>60)throw Error('策略名稱請填寫 1～60 個字');
    for(const side of ['entry','exit']){
      if(!Array.isArray(s[side])||s[side].length>10||(side==='entry'&&!s[side].length)||!['all','any'].includes(s[side+'Mode']))throw Error('每組可設定 1～10 條條件；賣出條件可留空');
      for(const r of s[side]){const def=definitions[r.type];if(!def||!def.ops.includes(r.op)||(side==='exit'&&r.type==='always'))throw Error('條件類型或比較方式不支援');if(r.type==='formula'){try{formula.compile(r.code,r.params||{});}catch(e){throw Error((side==='entry'?'買進':'賣出')+'條件：'+e.message);}}for(const [k,f] of Object.entries(def.fields)){if(!Number.isFinite(r[k])||r[k]<f[2]||r[k]>f[3]||(!f[4]&&!Number.isInteger(r[k])))throw Error(def.name+'：'+f[0]+'設定無效');}if(['maPair','macd'].includes(r.type)&&r.fast>=r.slow)throw Error('短／快線週期必須小於長／慢線週期');}
    }
    const risk=s.risk||{};if(!Number.isFinite(risk.stop)||risk.stop<0||risk.stop>=100||!Number.isFinite(risk.take)||risk.take<0||risk.take>1000||!Number.isInteger(risk.maxBars)||risk.maxBars<0||risk.maxBars>1000)throw Error('停損、停利或最長持有天數無效');
    return true;
  }
  function describeRule(r){
    if(r.type==='formula')return '自訂公式：'+String(r.code||'尚未填寫').split('\n').filter(x=>x.trim()&&!x.trim().startsWith('#')).at(-1)+(Object.keys(r.params||{}).length?'；參數 '+Object.entries(r.params).map(([k,v])=>k+'='+v).join('、'):'');
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
    if(r.type==='formula')return formula.evaluate(data,r);
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
    const side=key=>{const checks=s[key].map(r=>{const v=cache.get(r),cross=r.op.startsWith('cross'),ready=r.type==='always'||i>=0&&Number.isFinite(v.left[i])&&Number.isFinite(v.right[i])&&(!cross||i>0&&Number.isFinite(v.left[i-1])&&Number.isFinite(v.right[i-1]));return {rule:describeRule(r),ready,matched:ready&&match(r,v,i),left:Number.isFinite(v.left[i])?v.left[i]:null,right:Number.isFinite(v.right[i])?v.right[i]:null,previousLeft:Number.isFinite(v.left[i-1])?v.left[i-1]:null,previousRight:Number.isFinite(v.right[i-1])?v.right[i-1]:null,...(v.formula?{formula:{parameters:v.formula.parameters.map(p=>({name:p.name,value:p.value})),variables:v.formula.variables.map(x=>({name:x.name,value:x.values[i]??null,previous:x.values[i-1]??null})),checks:v.formula.checks.map(x=>({expression:x.expression,left:x.left[i]??null,right:x.right[i]??null,value:x.values[i]??null,previousLeft:x.left[i-1]??null,previousRight:x.right[i-1]??null}))}}:{})};});return {mode:s[key+'Mode'],checks,ready:checks.every(c=>c.ready),matched:!!checks.length&&checks.every(c=>c.ready)&&(s[key+'Mode']==='all'?checks.every(c=>c.matched):checks.some(c=>c.matched))};};
    return {date:data[i]?.time||null,entry:side('entry'),exit:side('exit')};
  }
  function inspect(rows,s,date){validate(s);const data=prepare(rows).filter(x=>x.time<=date),i=data.findIndex(x=>x.time===date);if(i<0)throw Error('所選日期沒有日K資料');const cache=new Map([...s.entry,...s.exit].map(r=>[r,indicators(data,r)]));return inspectAt(data,s,i,cache);}
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
    const rules=[...s.entry,...s.exit],cache=new Map(rules.map(r=>[r,indicators(data.slice(0,last+1),r)]));
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
  window.AcademyStrategyEngine={VERSION,REPLAY_VERSIONS:['2.0.0',VERSION],formula,definitions,opNames,rule,template,validate,describeRule,summary,sma,ema,indicators,prepare,run,scan,inspect};
})();
