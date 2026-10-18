import {researchReading} from './hero-reading';

// These are the website's existing public sources, never the staging member store.
const WEB='https://tw-stock-screener-neon.vercel.app';
const PUBLIC='https://bruqrbvbjxntgoljxsne.supabase.co/rest/v1/';
const KEY='sb_publishable_KgYlaR-mqtx4uVre6kPD2A_qO6tdT1y';
const paths={chart:'/api/chart?code=%5ETWII&range=1mo&interval=1d',breadth:'/api/screen?stat=market',holidays:'/api/screen?stat=holidays',
 institutions:'inst_market_daily?select=trade_date,foreign_net,trust_net,dealer_net,total_net&order=trade_date.desc&limit=20',
 margin:'margin_market?select=date,fin_bal_k&order=date.desc&limit=6',turnover:'sector_turnover?select=date,total_amt&order=date.desc&limit=20',
 indicators:'market_indicators?select=date,futai_close,futai_prev,vix,vix_prev,usdtwd&order=date.desc&limit=1',
 topics:'hot_topics?select=sector,heat&order=heat.desc&limit=60'};
export type HeroData={date:string|null;snapshot:any;reading:ReturnType<typeof researchReading>;today:ReturnType<typeof todayReading>;topics:string[];indicators:any;quote:string;quoteDate:string|null;settlement:{date:string;days:number}|null;partial:boolean};
const numeric=(n:any):n is number=>typeof n==='number'&&Number.isFinite(n);
const day=(s:any)=>{const value=String(s||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;};
async function read(path:string,signal?:AbortSignal){
 const rest=!path.startsWith('/api/');
 const r=await fetch((rest?PUBLIC:WEB)+path,{signal,headers:rest?{apikey:KEY}:undefined});
 if(!r.ok||r.headers.get('content-type')?.includes('text/html'))throw Error('首頁來源暫時無法取得');
 const raw=await r.text();if(raw.length>2000000)throw Error('首頁來源回應異常');return JSON.parse(raw);
}
export function settlement(closed:unknown,now=Date.now()){
 if(!Array.isArray(closed)||!closed.length)return null;
 const d=new Date(now+8*3600000),today=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),dates=new Set(closed.filter(x=>typeof x==='string'));
 for(let k=0;k<3;k++){
  const first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+k,1));
  let target=Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),1+(3-first.getUTCDay()+7)%7+14);
  for(let i=0;i<15;i++,target+=86400000){const candidate=new Date(target),iso=candidate.toISOString().slice(0,10);if(!closed.some((x:any)=>String(x).startsWith(iso.slice(0,4))))return null;if(candidate.getUTCDay()>0&&candidate.getUTCDay()<6&&!dates.has(iso)){if(target>=today)return {date:iso,days:Math.round((target-today)/86400000)};break;}}
 }
 return null;
}
export function todayReading(s:any){
 if(!numeric(s.chg)||!numeric(s.upRatio))return null;
 const chg=s.chg,upRatio=s.upRatio,signal=numeric(s.instStrength)?s.instStrength:numeric(s.instYi)?s.instYi/250:null;
 let first,accent,tone,body;
 if(chg>=.7&&upRatio>=60){first='多方全面擴張，';accent='留意量能能否延續。';tone='多方全面擴張';body=(s.up?Number(s.up).toLocaleString()+' 家收高，':'')+'指數與市場廣度同步轉強。';}
 else if(chg<=-.7&&upRatio<=40){first='空方全面擴散，';accent='先觀察賣壓是否收斂。';tone='空方全面擴散';body=(s.down?Number(s.down).toLocaleString()+' 家收低，':'')+'指數與市場廣度同步轉弱。';}
 else if(chg>.15&&upRatio<45){first='權值股拉抬指數，';accent='市場廣度尚未跟上。';tone='權值拉抬';body='指數收高，但多數個股尚未形成同步攻勢。';}
 else if(chg<-.15&&upRatio>55){first='指數受到權值壓抑，';accent='個股結構仍有支撐。';tone='個股有撐';body='指數收低，但上漲家數仍占多數，內部結構未同步轉弱。';}
 else if(chg>.3&&upRatio>55||chg>0&&upRatio>=60){first='多方溫和占優，';accent='觀察攻勢能否擴散。';tone='多方溫和占優';body='指數與廣度偏多，但尚未達到全面擴張。';}
 else if(chg<-.3&&upRatio<45||chg<0&&upRatio<=40){first='空方溫和占優，';accent='留意支撐是否失守。';tone='空方溫和占優';body='指數與廣度偏弱，但尚未形成全面空方。';}
 else if(Math.abs(chg)<=.3&&upRatio>=45&&upRatio<=55&&signal!==null&&signal>=.4){first='指數仍在整理，';accent='法人買盤率先表態。';tone='整理偏多';body='盤面方向尚未明朗，但法人買盤強度已高於中性區。';}
 else if(Math.abs(chg)<=.3&&upRatio>=45&&upRatio<=55&&signal!==null&&signal<=-.4){first='指數仍在整理，';accent='法人賣壓率先升高。';tone='整理偏空';body='盤面方向尚未明朗，但法人賣壓強度已低於中性區。';}
 else{first='多空拉鋸，';accent='等待方向表態。';tone='多空拉鋸';body='漲跌互見，量能與族群輪動是關鍵。';}
 return {first,accent,tone,body};
}
export function buildHero(values:Record<string,any>,now=Date.now()):HeroData{
 const chart=Array.isArray(values.chart?.data)?values.chart.data.filter((r:any)=>day(r?.date||r?.time)&&numeric(r.close)&&r.close>0):[];
 const last=chart.at(-1),prev=chart.at(-2),date=day(last?.date||last?.time),ret=(count:number)=>last&&chart.length>count?(last.close/chart[chart.length-1-count].close-1)*100:null;
 const mean=(rows:any[],field:string)=>{const a=rows.map(r=>r[field]).filter(numeric);return a.length?a.reduce((a,b)=>a+b,0)/a.length:null;};
 const inst=Array.isArray(values.institutions)?values.institutions:[],margin=Array.isArray(values.margin)?values.margin:[],turn=Array.isArray(values.turnover)?values.turnover:[];
 const aligned=!!date&&inst[0]?.trade_date===date&&turn[0]?.date===date,ir=aligned?inst[0]:null;
 const m=values.breadth,breadthDate=String(m?.date||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
 const breadthOk=!!date&&breadthDate===date&&numeric(m.up)&&numeric(m.down)&&numeric(m.flat)&&m.up+m.down+m.flat>0;
 const total=breadthOk?m.up+m.down+m.flat:0,sum=(rows:any[],field:string,n:number)=>rows.slice(0,n).reduce((sum,r)=>sum+(numeric(r[field])?r[field]:0),0);
 const strength=(n:number)=>aligned&&inst.length>=n&&turn.length>=n&&inst.slice(0,n).every((r:any,i:number)=>r.trade_date===turn[i]?.date&&numeric(r.total_net)&&numeric(turn[i]?.total_amt))&&sum(turn,'total_amt',n)>0?sum(inst,'total_net',n)/sum(turn,'total_amt',n)*100:null;
 const mi=margin[0],oldMargin=margin[Math.min(5,margin.length-1)],margin5=mi?.date===date&&margin.length>=6&&numeric(mi.fin_bal_k)&&numeric(oldMargin?.fin_bal_k)&&oldMargin.fin_bal_k>0?(mi.fin_bal_k/oldMargin.fin_bal_k-1)*100:null;
 const ma5=mean(chart.slice(-5),'close'),ma20=mean(chart.slice(-20),'close'),vol20=mean(chart.slice(-21,-1),'volume');
 const leader=ir?Math.abs(ir.foreign_net||0)>=Math.max(Math.abs(ir.trust_net||0),Math.abs(ir.dealer_net||0))?'外資':Math.abs(ir.trust_net||0)>=Math.abs(ir.dealer_net||0)?'投信':'自營商':'—';
 const s={date,chg:last&&prev?(last.close/prev.close-1)*100:null,ret5:ret(5),close:last?.close??null,ma5,ma20,volumeRatio:last&&vol20&&numeric(last.volume)?last.volume/vol20:null,up:breadthOk?m.up:null,down:breadthOk?m.down:null,upRatio:total?m.up/total*100:null,breadthDiff:total?(m.up-m.down)/total*100:null,instYi:ir&&numeric(ir.total_net)?ir.total_net/1e8:null,instStrength:strength(1),inst3Strength:strength(3),inst5Strength:strength(5),leverage:margin5!==null&&ret(5)!==null?margin5-ret(5)!:null,leader};
 const topics:string[]=[];if(Array.isArray(values.topics))for(const row of values.topics){const topic=typeof row.sector==='string'?row.sector.trim():'';if(topic&&!topics.includes(topic))topics.push(topic);if(topics.length===6)break;}
 const quote=values.quote?.[0],quoteText=typeof quote?.line1==='string'?quote.line1+(quote.line2?'，'+quote.line2:'')+'。':'';
 const reading=typeof s.chg==='number'&&typeof s.upRatio==='number'?researchReading(s):null;
 return {date,snapshot:s,reading,today:todayReading(s),topics,indicators:values.indicators?.[0]||null,quote:quoteText,quoteDate:day(quote?.date),settlement:settlement(values.holidays?.closed,now),partial:!date||!breadthOk||!aligned||margin5===null||Object.values(values).some(value=>value===null)};
}
export async function fetchHero(signal?:AbortSignal):Promise<HeroData>{
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const entries=[...Object.entries(paths),['quote','daily_slogan?select=line1,line2,date&date=lte.'+today+'&order=date.desc&limit=1']];
 const values:Record<string,any>={};await Promise.all(entries.map(async([key,path])=>{try{values[key]=await read(path,signal);}catch(e){if(signal?.aborted)throw e;values[key]=null;}}));
 return buildHero(values);
}
export type StockName={code:string;name:string;market:string};
let namesCache:StockName[]|null=null;
export async function stockNames(signal?:AbortSignal){
 if(namesCache)return namesCache;
 const [listed,otc,etf,otcEtf]=await Promise.all([read('/api/screen?stat=names',signal),read('otc_names?select=code,name',signal),read('etf_products?select=code,name',signal),read('/api/screen?stat=otcetf',signal)]);
 const found=new Map<string,StockName>();
 const add=(code:any,name:any,market:string)=>{if(typeof code==='string'&&/^[0-9]{4,6}[A-Z]?$/.test(code)&&typeof name==='string')found.set(code,{code,name,market});};
 if(listed&&!listed.error)Object.entries(listed).forEach(([code,name])=>add(code,name,'上市'));
 if(Array.isArray(otc))otc.forEach(r=>add(r.code,r.name,'上櫃'));
 if(Array.isArray(etf))etf.forEach(r=>{if(!found.has(r.code))add(r.code,r.name,'上市 ETF');});
 if(otcEtf&&!otcEtf.error)Object.entries(otcEtf).forEach(([code,name])=>add(code,name,'上櫃 ETF'));
 if(!found.size)throw Error('股票名錄暫時無法取得');namesCache=[...found.values()];return namesCache;
}
export function matchStocks(items:StockName[],query:string){const q=query.trim().toLowerCase();if(!q)return [];const rank=(r:StockName)=>r.code===q?0:r.code.startsWith(q)?1:r.name.toLowerCase()===q?2:3;return items.filter(r=>r.code.includes(q)||r.name.toLowerCase().includes(q)).sort((a,b)=>rank(a)-rank(b)||a.code.localeCompare(b.code)).slice(0,8);}
