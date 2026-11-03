/* 真名八式（假跌破）／九式（假突破）：條件卡互動、送出參數、結果「?」提示。判斷規則在後端 api/screen.py zhenming8_at／zhenming9_at。 */
(()=>{'use strict';
const by=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAME={8:'真名八式',9:'真名九式'},SHORT={8:'八式',9:'九式'};
const cards=[8,9].map(n=>({n,master:by('zhenming'+n),opts:by('zhenming'+n+'Options'),custom:by('zm'+n+'AmpCustom'),radios:[...document.querySelectorAll('input[name=zm'+n+'Amp]')]})).filter(c=>c.master&&c.opts);
if(!cards.length)return;
function picked(c){return c.radios.find(r=>r.checked)?.value||'10';}
function sync(c){c.opts.hidden=!c.master.checked;const custom=picked(c)==='custom';c.custom.closest('.zm89-custom')?.classList.toggle('is-on',custom);}
cards.forEach(c=>{
  c.master.addEventListener('change',()=>sync(c));
  c.radios.forEach(r=>r.addEventListener('change',()=>{sync(c);if(r.value==='custom'&&r.checked)c.custom.focus();}));
  // 點或輸入自訂數字＝自動選「自訂」
  ['focus','input'].forEach(ev=>c.custom.addEventListener(ev,()=>{const r=c.radios.find(x=>x.value==='custom');if(r&&!r.checked){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));}}));
  sync(c);
});
function ampOf(c){
  const v=picked(c);if(v!=='custom')return Number(v);
  const x=Number(c.custom.value);
  if(!c.custom.value||!Number.isFinite(x)||x<1||x>50)throw Error(NAME[c.n]+'的自訂箱型振幅請填 1～50 之間的數字（%）。');
  return Math.round(x*100)/100;
}
function collect(){const out={};cards.forEach(c=>{out['zhenming'+c.n]=c.master.checked?{enabled:true,amp:ampOf(c)}:null;});return out;}
function summary(){return cards.filter(c=>c.master.checked).map(c=>{let a;try{a=ampOf(c)+'%';}catch{a='振幅未填';}return SHORT[c.n]+' · 箱型 ≤ '+a;});}
let localEndpoint=null;
async function endpoint(){
  const local=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname)||/\.localhost$/.test(location.hostname);
  if(!local)return window.__API||'';
  if(localEndpoint)return localEndpoint;
  for(const base of ['http://127.0.0.1:49675','http://127.0.0.1:49676']){
    try{const r=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),d=await r.json();if(r.ok&&d.zhenming89===true){localEndpoint=base;return base;}}catch{}
  }
  throw Error('本機八式／九式篩選服務尚未更新或未啟動，請重新啟動專案的「啟動本機預覽.cmd」後再試。');
}
const md=d=>String(d||'').slice(5).replace('-','/');
const QMARK='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.7 7.4a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.2.9-1.2 1.8v.3M10 14.3v.1"/></svg>';
function btn(lines,label){return '<button type="button" class="zm4-badge zm89-badge" aria-label="'+label+'" aria-expanded="false" data-zm4-tip="'+esc(lines.join('\n'))+'">'+QMARK+'</button>';}
function badge(s){
  let html='';
  const z8=s.zm8,z9=s.zm9;
  if(z8)html+=btn(['真名八式｜破底翻 · 第 '+z8.days+' 天站回',
    '箱型：'+z8.lower+' ～ '+z8.upper+'（振幅 '+z8.amp+'%）','跌破下緣：'+md(z8.break_date)+' 收盤跌破',
    '站回長紅：+'+z8.red_pct+'%','成交量：20 日均量 '+z8.vol_ratio+' 倍'+(z8.vol_ratio>=2?'（倍量）':''),
    '停損參考：'+z8.stop+'（破底以來最低）','第一目標：'+z8.target1+'（箱型上緣）','第二目標：'+z8.target2+'（等幅測量）',
    '!右側訊號：已帶量站回才成立，不要在剛跌破時猜底','!回測下緣縮量守住可加碼；再跌破低點＝真跌破，立即停損'],'查看真名八式條件');
  if(z9)html+=btn(['真名九式｜假突破 · 第 '+z9.days+' 天跌回',
    '箱型：'+z9.lower+' ～ '+z9.upper+'（振幅 '+z9.amp+'%）','突破上緣：'+md(z9.break_date)+' 收盤突破',
    '突破量：20 日均量 '+z9.break_vol_ratio+' 倍（量縮）','今日型態：'+(z9.long_black?'長黑跌回':z9.upper_shadow?'長上影線':'收盤跌回上緣下'),
    '停損參考：'+z9.stop+'（突破以來最高）','目標：'+z9.target+'（箱型下緣）',
    '!多單：收盤跌回上緣就是多頭陷阱，立即停損','!空方：反彈到上緣遇阻不過，是較佳的放空／減碼點'],'查看真名九式條件');
  return html;
}
window.AcademyZhenming89={collect,summary,endpoint,badge};
})();
