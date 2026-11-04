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
/* 結果表格：型態、跌破日、頸線、型態失效、回補季提醒 */
function info(z){
  const head=z.pattern?esc(z.pattern)+'跌破'+(z.day_n?'・第'+z.day_n+'天':'・當天'):'空頭啟動';
  const level=z.level!=null?'・頸線 '+esc(z.level):'';
  const tip=['真名六式：MA5 '+z.ma5+' < MA10 '+z.ma10+' < MA20 '+z.ma20+'，20MA 下彎','長黑 −'+z.black_pct+'%（型態失效＝長黑 K 高點 '+z.stop+'）',
    z.pattern?z.pattern+'：'+z.break_date+' 收盤跌破 '+z.level+'，之後未站回':'',z.cover_season?'目前在融券強制回補季附近（股東會 2～4 月／除權息 6～9 月）':''].filter(Boolean).join('\n');
  return '<div class="zm3-info zm6-info" title="'+esc(tip)+'">六式・'+head+'・長黑 −'+esc(z.black_pct)+'%<br>型態失效 '+esc(z.stop)+level+(z.cover_season?'・<b class="zm6-cover">回補季</b>':'')+'</div>';
}
/* 結果名稱旁的 ⓘ：與四式同一套提示卡；回補提醒寫在提示卡內，回補季另加小標籤 */
const COVER=[2,3,4,6,7,8,9];
function coverLines(z){
  const d=z.break_date?new Date(z.break_date+'T00:00:00'):new Date(),m=d.getMonth()+1;
  const kind=k=>k<=4?'股東會':'除權息';
  if(z.cover_season||COVER.includes(m))return ['!融券回補季：目前是'+kind(m)+'強制回補期（股東會 2～4 月、除權息 6～9 月）','!制度說明：融券最後回補日＝停止過戶日前第 6 個營業日','!實際日期以公司公告、證交所「停券預告表」為準'];
  const next=COVER.find(k=>k>m)||COVER[0];
  return ['!融券回補：下一波回補季 '+next+' 月起（'+kind(next)+'）','!制度說明：融券最後回補日＝停止過戶日前第 6 個營業日'];
}
const md=d=>String(d||'').slice(5).replace('-','/');
const QMARK='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.7 7.4a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.2.9-1.2 1.8v.3M10 14.3v.1"/></svg>';
function badge(z){
  const lines=['真名六式｜'+(z.pattern?z.pattern+'跌破 · '+(z.day_n?'第 '+z.day_n+' 天':'當天'):'空頭啟動'),
    '長黑：−'+z.black_pct+'%','型態失效：'+z.stop+'（長黑 K 高點）'];
  if(z.pattern&&z.level!=null)lines.push('頸線／下緣：'+z.level+'（'+md(z.break_date)+' 跌破）');
  lines.push('MA5／10／20：'+z.ma5+' / '+z.ma10+' / '+z.ma20,'20MA：下彎中');
  lines.push(...coverLines(z));
  return '<button type="button" class="zm4-badge zm6-badge'+(z.cover_season?' is-cover':'')+'" aria-label="查看真名六式條件與融券回補提醒" aria-expanded="false" data-zm4-tip="'+esc(lines.join('\n'))+'">'+QMARK+'</button>';
}
window.AcademyZhenmingSix={collect,summary,endpoint,info,badge,QMARK};sync();
})();
