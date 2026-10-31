/* Route local four-style scans only to a backend that explicitly supports them. */
(function(){'use strict';
async function endpoint(){
 const local=location.protocol==='file:'||['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
 if(!local)return window.__API||'';
 for(const base of ['http://127.0.0.1:49675','http://127.0.0.1:49676']){try{const response=await fetch(base+'/api/screen?stat=hidden-capability',{signal:AbortSignal.timeout(5000)}),data=await response.json();if(!response.ok||data.zhenming4!==true||data.zhenming4_rules_version!==2)throw Error();return base;}
 catch{} }
 throw Error('本機四式篩選服務尚未更新或未啟動，請重新啟動專案的本機預覽後再試。');
}
function badge(v){const n=x=>Number.isFinite(Number(x))?Number(x):'—';const tip=`四式・第 ${n(v.day_n)}／12 天\n守低 ${n(v.support_low)} · 五日線 ${n(v.ma5)}${v.first_volume_ratio?'\n首根放量 '+n(v.first_volume_ratio)+' 倍':''}`;return `<button type="button" class="zm4-badge" aria-label="查看四式提示" aria-expanded="false" data-zm4-tip="${tip}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5m0-9v1"/></svg></button>`;}
const tip=document.createElement('div');tip.className='zm4-tip';tip.id='zm4-hover-tip';tip.role='tooltip';tip.hidden=true;document.body.append(tip);let active=null;
function hide(){if(active){active.setAttribute('aria-expanded','false');active.removeAttribute('aria-describedby');}active=null;tip.hidden=true;}
function show(b){hide();active=b;b.setAttribute('aria-expanded','true');b.setAttribute('aria-describedby',tip.id);tip.replaceChildren();b.dataset.zm4Tip.split('\n').forEach((line,i)=>{const e=document.createElement(i?'div':'strong');e.textContent=line;tip.append(e);});tip.hidden=false;const r=b.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.left))+'px';tip.style.top=(r.bottom+tip.offsetHeight+14<innerHeight?r.bottom+8:Math.max(8,r.top-tip.offsetHeight-8))+'px';}
document.addEventListener('pointerover',e=>{const b=e.target.closest?.('.zm4-badge');if(b)show(b);});
document.addEventListener('pointerout',e=>{if(active?.contains(e.target)&&!active.contains(e.relatedTarget))hide();});
document.addEventListener('focusin',e=>{const b=e.target.closest?.('.zm4-badge');if(b)show(b);});
document.addEventListener('focusout',e=>{if(active?.contains(e.target))hide();});
document.addEventListener('click',e=>{const b=e.target.closest?.('.zm4-badge');if(b){e.stopPropagation();show(b);}else hide();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});window.addEventListener('scroll',()=>{if(active?.matches(':focus'))show(active);else hide();},true);window.addEventListener('resize',hide);
window.AcademyZhenmingFour={endpoint,badge};
})();
