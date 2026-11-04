/* Route local four-style scans only to a backend that explicitly supports them. */
(function(){'use strict';
async function endpoint(){
 const local=location.protocol==='file:'||['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
 if(!local)return window.__API||'';
 for(const base of ['http://127.0.0.1:49675','http://127.0.0.1:49676']){try{const response=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),data=await response.json();if(!response.ok||data.zhenming4!==true||data.zhenming4_rules_version!==2)throw Error();return base;}
 catch{} }
 throw Error('本機四式篩選服務尚未更新或未啟動，請重新啟動專案的本機預覽後再試。');
}
function badge(v){const n=x=>Number.isFinite(Number(x))?Number(x):'—';const tip=`真名四式｜型態候選\n進度：第 ${n(v.day_n)}／12 天\n守低：${n(v.support_low)}\n五日線：${n(v.ma5)}${v.first_volume_ratio?'\n首根放量：'+n(v.first_volume_ratio)+' 倍':''}\n!僅為型態條件說明，是否成立需後續 K 棒確認`;return `<button type="button" class="zm4-badge" aria-label="查看四式型態條件" aria-expanded="false" data-zm4-tip="${tip}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.7 7.4a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.2.9-1.2 1.8v.3M10 14.3v.1"/></svg></button>`;}
const tip=document.createElement('div');tip.className='zm4-tip';tip.id='zm4-hover-tip';tip.role='tooltip';tip.hidden=true;document.body.append(tip);let active=null;
/* 提示卡排版：第一行「標題｜標籤」；含「：」的行＝左標籤右數值；「!」開頭＝提醒區塊；其餘＝說明文字 */
function render(text){tip.replaceChildren();const lines=String(text||'').split('\n').filter(Boolean);if(!lines.length)return;
 const head=document.createElement('div');head.className='zm4-tip-head';const [title,tag]=lines[0].split('｜');const st=document.createElement('strong');st.textContent=title;head.append(st);if(tag){const sp=document.createElement('span');sp.className='zm4-tip-tag';sp.textContent=tag;head.append(sp);}tip.append(head);
 let kv=null,note=null;
 lines.slice(1).forEach(line=>{
  if(line[0]==='!'){kv=null;if(!note){note=document.createElement('div');note.className='zm4-tip-note';tip.append(note);}const p=document.createElement('div');p.textContent=line.slice(1);note.append(p);return;}
  note=null;const k=line.indexOf('：');
  if(k>0){if(!kv){kv=document.createElement('dl');kv.className='zm4-tip-kv';tip.append(kv);}const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=line.slice(0,k);dd.textContent=line.slice(k+1);kv.append(dt,dd);return;}
  kv=null;const p=document.createElement('div');p.className='zm4-tip-text';p.textContent=line;tip.append(p);
 });const foot=document.createElement('div');foot.className='zm4-tip-foot';foot.textContent='篩選條件說明，不構成投資建議';tip.append(foot);}
function hide(){if(active){active.setAttribute('aria-expanded','false');active.removeAttribute('aria-describedby');}active=null;tip.hidden=true;}
function show(b){hide();active=b;b.setAttribute('aria-expanded','true');b.setAttribute('aria-describedby',tip.id);render(b.dataset.zm4Tip);tip.className='zm4-tip'+(b.classList.contains('is-cover')?' is-cover':'');tip.hidden=false;tip.classList.remove('is-in');requestAnimationFrame(()=>tip.classList.add('is-in'));const r=b.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.left))+'px';tip.style.top=(r.bottom+tip.offsetHeight+14<innerHeight?r.bottom+8:Math.max(8,r.top-tip.offsetHeight-8))+'px';}
document.addEventListener('pointerover',e=>{const b=e.target.closest?.('.zm4-badge');if(b)show(b);});
document.addEventListener('pointerout',e=>{if(active?.contains(e.target)&&!active.contains(e.relatedTarget))hide();});
document.addEventListener('focusin',e=>{const b=e.target.closest?.('.zm4-badge');if(b)show(b);});
document.addEventListener('focusout',e=>{if(active?.contains(e.target))hide();});
document.addEventListener('click',e=>{const b=e.target.closest?.('.zm4-badge');if(b){if(b.classList.contains('zm-filter-help'))e.preventDefault();e.stopPropagation();show(b);}else hide();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});window.addEventListener('scroll',()=>{if(active?.matches(':focus'))show(active);else hide();},true);window.addEventListener('resize',hide);
window.AcademyZhenmingFour={endpoint,badge};
})();
