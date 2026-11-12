/* Authenticated, read-only official bulletin. Never exposes backend credentials. */
(function(){
'use strict';
let panel,busy=false,last=0,owner='',timer;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>localStorage.getItem('sb_token')||'';
const visible=()=>{const view=document.getElementById('newsView');return view&&getComputedStyle(view).display!=='none'&&!document.hidden;};
function stamp(item){
 if(item.time_precision==='second'&&item.published_at){const d=new Date(item.published_at);if(Number.isFinite(+d))return d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});}
 return item.published_date?item.published_date+' · 未提供發布時刻':'發布日期待核對';
}
function link(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
function mount(){
 const view=document.getElementById('newsView');if(!view||panel)return;
 panel=document.createElement('section');panel.className='official-bulletin';panel.setAttribute('aria-label','官方重大公告');
 panel.innerHTML='<header><div><span class="official-kicker">OFFICIAL BULLETIN</span><h2>官方重大公告</h2><p>追蹤市場政策、景氣數據與產業措施，保留官方原文。</p></div><div class="official-actions"><label>公告來源<select aria-label="官方公告來源"><option value="">全部來源</option></select></label><button type="button">更新公告</button></div></header><p class="official-status" role="status" aria-live="polite">開啟頁面後讀取公告</p><div class="official-list"></div><footer>盤前、盤中依來源輪詢更新；標記為研究候選，不代表漲跌預測。未提供發布時刻的公告僅標日期。</footer>';
 const controls=view.querySelector('.nw-ctrl');if(controls)controls.before(panel);else view.prepend(panel);
 panel.querySelector('button').onclick=()=>load(true);panel.querySelector('select').onchange=()=>load(true);
}
async function load(force=false){
 mount();if(!panel||!visible()||busy)return;
 const current=token(),status=panel.querySelector('.official-status'),list=panel.querySelector('.official-list');
 if(!current){owner='';last=0;list.replaceChildren();status.textContent='登入後可查看官方公告';return;}
 if(!force&&current===owner&&Date.now()-last<300000)return;
 if(current!==owner)list.replaceChildren();owner=current;busy=true;status.textContent='正在核對官方公告…';panel.querySelector('button').disabled=true;
 try{
  const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current},body:JSON.stringify({action:'official_announcements',source:panel.querySelector('select').value,limit:30}),cache:'no-store'});
  const data=await response.json();if(current!==token())return;
  if(!response.ok)throw Error(data.error||'官方公告暫時無法讀取');
  const select=panel.querySelector('select'),selected=select.value;
  select.innerHTML='<option value="">全部來源</option>'+(data.sources||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');select.value=selected;
  const items=data.items||[];
  list.innerHTML=items.length?items.map(item=>{const url=link(item.url);return '<article><div class="official-meta"><b>'+esc(item.source?.name||'官方來源')+'</b><time>'+esc(stamp(item))+'</time></div><h3>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+'</a>':esc(item.title))+'</h3>'+(item.summary?'<details><summary>公告摘要</summary><p>'+esc(item.summary)+'</p></details>':'')+(item.other_sources?.length?'<details><summary>其他官方來源</summary>'+item.other_sources.map(s=>{const u=link(s.url);return u?'<p><a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a></p>':'';}).join('')+'</details>':'')+(item.effective_date?'<small>生效日期 '+esc(item.effective_date)+'</small>':'')+'</article>';}).join(''):'<p class="official-empty">近七天沒有符合此來源的重大公告候選。</p>';
  const errors=(data.sources||[]).filter(s=>s.state==='error'||s.state==='pending');
  status.textContent='近七天 · '+items.length+' 則'+(data.limited?'（顯示最新 30 則，可切換來源）':'')+' · 畫面更新 '+new Date().toLocaleTimeString('zh-TW',{hour12:false})+(errors.length?' · '+errors.length+' 個來源更新異常，部分資訊可能延遲':'');
  last=Date.now();
 }catch(error){if(current===token()){last=Date.now();list.replaceChildren();status.textContent=error.message+'；請稍後按「更新公告」重試。';}}
 finally{busy=false;panel.querySelector('button').disabled=false;}
}
function check(){if(panel&&owner&&token()!==owner){panel.querySelector('.official-list').replaceChildren();last=0;owner='';}if(visible())load();}
mount();const view=document.getElementById('newsView');if(view)new MutationObserver(check).observe(view,{attributes:true,attributeFilter:['style','class']});
document.addEventListener('visibilitychange',check);addEventListener('hashchange',check);addEventListener('storage',check);
timer=setInterval(check,30000);addEventListener('pagehide',()=>clearInterval(timer));check();
})();
