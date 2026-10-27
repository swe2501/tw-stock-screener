(()=>{'use strict';
const by=id=>document.getElementById(id),master=by('zhenming_hidden'),card=by('zhenmingHiddenCard');if(!master||!card)return;
const calendarIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2"/></svg>';
for(const [id,label] of [['zhStart','選擇開始日期'],['zhEnd','選擇結束日期']]){const input=by(id),field=document.createElement('span');field.className='zh-date-field';input.before(field);field.append(input);const button=document.createElement('button');button.type='button';button.className='zh-date-trigger';button.setAttribute('aria-label',label);button.title=label;button.innerHTML=calendarIcon;button.onclick=e=>{e.preventDefault();e.stopPropagation();try{input.showPicker();}catch{input.focus();}};field.append(button);}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());by('zhStart').max=today;by('zhEnd').max=today;by('zhStart').addEventListener('change',()=>{by('zhEnd').min=by('zhStart').value;});
function sync(){by('zhenmingHiddenOptions').hidden=!master.checked;const mode=by('zhPeriod').value;by('zhCustomWrap').hidden=mode!=='custom';by('zhDateWrap').hidden=mode!=='dates';}
master.addEventListener('change',sync);by('zhPeriod').addEventListener('change',sync);
// Keep the hidden form last even when future named strategies are appended.
const grid=card.parentElement;new MutationObserver(()=>{if(grid.lastElementChild!==card)grid.append(card);}).observe(grid,{childList:true});
function collect(){if(!master.checked)return null;const metrics=[by('zhMa').checked?'ma':null,by('zhReturn').checked?'return':null].filter(Boolean);if(!metrics.length)throw Error('真名隱藏式請至少勾選一種比較方式。');const side=card.querySelector('[name=zhSide]:checked')?.value;if(!side)throw Error('請選擇強於大盤或弱於大盤。');const period=by('zhPeriod').value,out={enabled:true,side,metrics,mode:period==='dates'?'dates':'days'};
if(out.mode==='days'){const raw=period==='custom'?by('zhDays').value:period;if(!/^\d+$/.test(raw)||+raw<1||+raw>760)throw Error('自訂週期需為 1～760 個交易日。');out.days=+raw;}else{out.start=by('zhStart').value;out.end=by('zhEnd').value;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(!out.start||!out.end||out.start>out.end||out.end>today)throw Error('請設定有效的起訖日期，結束日期不可在未來。');}return out;}
function summary(){if(!master.checked)return '';const side=by('zhWeak').checked?'弱於大盤':'強於大盤',period=by('zhPeriod').value,range=period==='1'?'今天':period==='dates'?(by('zhStart').value||'起日')+'～'+(by('zhEnd').value||'訖日'):(period==='custom'?by('zhDays').value:period)+'交易日',metrics=[by('zhMa').checked?'均線':null,by('zhReturn').checked?'漲跌幅':null].filter(Boolean);return side+' · '+range+' · '+(metrics.join('＋')||'未選比較方式');}
let localEndpoint=null;
async function endpoint(){const local=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname)||/\.localhost$/.test(location.hostname);if(!local)return window.__API||'';
 if(localEndpoint)return localEndpoint;
 const base='http://127.0.0.1:49675';try{const response=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),data=await response.json();if(!response.ok||data.zhenming_hidden!==true)throw Error();localEndpoint=base;return base;}catch{throw Error('本機篩選服務未連線，請從專案的「啟動本機預覽.cmd」開啟網站後再試。');}}
window.AcademyZhenmingHidden={collect,summary,endpoint};sync();
})();
