/* 真名六式（空頭啟動）：條件卡互動、送出參數、結果標記。判斷規則在後端 api/screen.py zhenming6_at。 */
(()=>{'use strict';
const by=id=>document.getElementById(id),master=by('zhenming6'),opts=by('zhenming6Options'),use=by('zm6UsePattern'),sel=by('zm6Pattern');
if(!master||!opts||!use||!sel)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sync(){opts.hidden=!master.checked;sel.disabled=!use.checked;sel.closest('label')?.classList.toggle('is-disabled',!use.checked);}
master.addEventListener('change',sync);use.addEventListener('change',sync);
function collect(){if(!master.checked)return null;return {enabled:true,pattern:use.checked?(sel.value||'all'):'none'};}
function summary(){if(!master.checked)return '';return '六式'+(use.checked?' · '+sel.options[sel.selectedIndex].text:' · 不限型態');}
let localEndpoint=null;
async function endpoint(){
  const local=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname)||/\.localhost$/.test(location.hostname);
  if(!local)return window.__API||'';
  if(localEndpoint)return localEndpoint;
  for(const base of ['http://127.0.0.1:49675','http://127.0.0.1:49676']){
    try{const r=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),d=await r.json();if(r.ok&&d.zhenming6===true){localEndpoint=base;return base;}}catch{}
  }
  throw Error('本機六式篩選服務尚未更新或未啟動，請重新啟動專案的「啟動本機預覽.cmd」後再試。');
}
/* 結果表格：型態、跌破日、頸線、停損、回補季提醒 */
function info(z){
  const head=z.pattern?esc(z.pattern)+'跌破'+(z.day_n?'・第'+z.day_n+'天':'・當天'):'空頭啟動';
  const level=z.level!=null?'・頸線 '+esc(z.level):'';
  const tip=['真名六式：MA5 '+z.ma5+' < MA10 '+z.ma10+' < MA20 '+z.ma20+'，20MA 下彎','長黑 −'+z.black_pct+'%（停損參考＝長黑最高 '+z.stop+'）',
    z.pattern?z.pattern+'：'+z.break_date+' 收盤跌破 '+z.level+'，之後未站回':'',z.cover_season?'目前在融券強制回補季附近（股東會 2～4 月／除權息 6～9 月），波段放空留意回補日程':''].filter(Boolean).join('\n');
  return '<div class="zm3-info zm6-info" title="'+esc(tip)+'">六式・'+head+'・長黑 −'+esc(z.black_pct)+'%<br>停損 '+esc(z.stop)+level+(z.cover_season?'・<b class="zm6-cover">回補季</b>':'')+'</div>';
}
window.AcademyZhenmingSix={collect,summary,endpoint,info};sync();
})();
