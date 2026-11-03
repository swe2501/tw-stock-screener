/* 真名八式（假跌破）／九式（假突破）：條件卡互動、送出參數、結果「?」提示。判斷規則在後端 api/screen.py zhenming8_at／zhenming9_at。 */
(()=>{'use strict';
const by=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAME={8:'真名八式',9:'真名九式'},SHORT={8:'八式',9:'九式'};
/* 每張卡三組選項：振幅（可自訂 1～50%）、整理期間（可自訂 20～240 交易日）、站回期限（10／21／30） */
const FIELDS={amp:{key:'Amp',def:10,lo:1,hi:50,label:'箱型振幅',unit:'%'},box:{key:'Box',def:60,lo:20,hi:240,label:'整理期間',unit:' 個交易日',int:true},within:{key:'Within',def:21}};
const cards=[8,9].map(n=>{const c={n,master:by('zhenming'+n),opts:by('zhenming'+n+'Options'),f:{}};
  Object.entries(FIELDS).forEach(([k,F])=>{c.f[k]={radios:[...document.querySelectorAll('input[name=zm'+n+F.key+']')],custom:by('zm'+n+F.key+'Custom')};});return c;}).filter(c=>c.master&&c.opts);
if(!cards.length)return;
const picked=g=>g.radios.find(r=>r.checked)?.value;
function sync(c){c.opts.hidden=!c.master.checked;Object.values(c.f).forEach(g=>{if(g.custom)g.custom.closest('.zm89-custom')?.classList.toggle('is-on',picked(g)==='custom');});}
cards.forEach(c=>{
  c.master.addEventListener('change',()=>sync(c));
  Object.values(c.f).forEach(g=>{
    g.radios.forEach(r=>r.addEventListener('change',()=>{sync(c);if(r.value==='custom'&&r.checked)g.custom?.focus();}));
    // 點或輸入自訂數字＝自動選「自訂」
    if(g.custom)['focus','input'].forEach(ev=>g.custom.addEventListener(ev,()=>{const r=g.radios.find(x=>x.value==='custom');if(r&&!r.checked){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));}}));
  });
  sync(c);
});
function valueOf(c,k){
  const F=FIELDS[k],g=c.f[k],v=picked(g);
  if(v==null)return F.def;
  if(v!=='custom')return Number(v);
  const x=Number(g.custom.value);
  if(!g.custom.value||!Number.isFinite(x)||x<F.lo||x>F.hi||(F.int&&x!==Math.round(x)))throw Error(NAME[c.n]+'的自訂'+F.label+'請填 '+F.lo+'～'+F.hi+(F.int?' 的整數':' 之間的數字')+'（'+F.unit.trim()+'）。');
  return F.int?x:Math.round(x*100)/100;
}
const ampOf=c=>valueOf(c,'amp');
function collect(){const out={};cards.forEach(c=>{out['zhenming'+c.n]=c.master.checked?{enabled:true,amp:valueOf(c,'amp'),box_days:valueOf(c,'box'),within:valueOf(c,'within')}:null;});return out;}
function summary(){return cards.filter(c=>c.master.checked).map(c=>{try{return SHORT[c.n]+' · '+valueOf(c,'box')+' 日箱型 ≤ '+valueOf(c,'amp')+'% · '+valueOf(c,'within')+' 天內';}catch{return SHORT[c.n]+' · 自訂未填';}});}
let localEndpoint=null;
async function endpoint(){
  const local=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname)||/\.localhost$/.test(location.hostname);
  if(!local)return window.__API||'';
  if(localEndpoint)return localEndpoint;
  for(const base of ['http://127.0.0.1:49675','http://127.0.0.1:49676']){
    try{const r=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),d=await r.json();if(r.ok&&d.zhenming89===true&&d.zhenming89_version>=2){localEndpoint=base;return base;}}catch{}
  }
  throw Error('本機八式／九式篩選服務尚未更新或未啟動，請重新啟動專案的「啟動本機預覽.cmd」後再試。');
}
const md=d=>String(d||'').slice(5).replace('-','/');
const QMARK='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.7 7.4a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.2.9-1.2 1.8v.3M10 14.3v.1"/></svg>';
function btn(lines,label){return '<button type="button" class="zm4-badge zm89-badge" aria-label="'+label+'" aria-expanded="false" data-zm4-tip="'+esc(lines.join('\n'))+'">'+QMARK+'</button>';}
function badge(s){
  let html='';
  const z8=s.zm8,z9=s.zm9;
  if(z8)html+=btn(['真名八式｜破底翻 · 第 '+z8.days+'／'+(z8.within||21)+' 天站回',
    '箱型：'+z8.lower+' ～ '+z8.upper+'（振幅 '+z8.amp+'%）','整理期間：'+(z8.box_days||60)+' 個交易日','跌破下緣：'+md(z8.break_date)+' 收盤跌破',
    '站回長紅：+'+z8.red_pct+'%','成交量：20 日均量 '+z8.vol_ratio+' 倍'+(z8.vol_ratio>=2?'（倍量）':''),
    '停損參考：'+z8.stop+'（破底以來最低）','第一目標：'+z8.target1+'（箱型上緣）','第二目標：'+z8.target2+'（等幅測量）',
    '!右側訊號：已帶量站回才成立，不要在剛跌破時猜底','!回測下緣縮量守住可加碼；再跌破低點＝真跌破，立即停損'],'查看真名八式條件');
  if(z9)html+=btn(['真名九式｜假突破 · 第 '+z9.days+'／'+(z9.within||21)+' 天跌回',
    '箱型：'+z9.lower+' ～ '+z9.upper+'（振幅 '+z9.amp+'%）','整理期間：'+(z9.box_days||60)+' 個交易日','突破上緣：'+md(z9.break_date)+' 收盤突破',
    '突破量：20 日均量 '+z9.break_vol_ratio+' 倍（量縮）','今日型態：'+(z9.long_black?'長黑跌回':z9.upper_shadow?'長上影線':'收盤跌回上緣下'),
    '停損參考：'+z9.stop+'（突破以來最高）','目標：'+z9.target+'（箱型下緣）',
    '!多單：收盤跌回上緣就是多頭陷阱，立即停損','!空方：反彈到上緣遇阻不過，是較佳的放空／減碼點'],'查看真名九式條件');
  return html;
}
window.AcademyZhenming89={collect,summary,endpoint,badge};
})();
