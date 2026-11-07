/* Celebration reads an existing server receipt. It never grants points in the browser. */
(()=>{'use strict';
let generation=0,timer,dialog,owner='',checked='',running=false;
const token=()=>localStorage.getItem('sb_token')||'';
const rpc=(p_seen=false)=>window.AcademyIdentity.serviceRpc('member_birthday_status',{p_seen});
function close(){clearTimeout(timer);if(dialog){dialog.close();dialog.remove();dialog=null;}}
function show(receipt,captured,attempt=0){
 if(token()!==captured)return;
 if([...document.querySelectorAll('dialog[open],[aria-modal="true"]')].some(e=>e.getClientRects().length)||document.querySelector('body.fa-arrival-open')){
  if(attempt<120)timer=setTimeout(()=>show(receipt,captured,attempt+1),1000);return;
 }
 close();const previous=document.activeElement;dialog=document.createElement('dialog');dialog.className='mbday';
 dialog.setAttribute('aria-labelledby','mbday-title');
 dialog.innerHTML='<button type="button" class="mbday-close" aria-label="關閉生日祝福">×</button><div class="mbday-art" aria-hidden="true"><i class="mbday-orbit"></i><img class="mbday-owl" src="assets/brand/foresight-owl-light-book-light.png" alt=""><svg class="mbday-gift" viewBox="0 0 120 110" fill="none"><g stroke="currentColor" stroke-width="2"><path class="mbday-lid" d="M22 47h76V31H22zM60 31C24 31 32 3 46 12c9 6 14 19 14 19Zm0 0c36 0 28-28 14-19-9 6-14 19-14 19Z"/><path d="M29 48v44a6 6 0 0 0 6 6h50a6 6 0 0 0 6-6V48M60 48v50"/></g></svg><span class="mbday-star s1">✧</span><span class="mbday-star s2">✦</span><span class="mbday-star s3">✧</span></div><p class="mbday-eyebrow">A LITTLE WISH, JUST FOR YOU</p><h2 id="mbday-title">有一份小小的心意，想送給你。</h2><div class="mbday-message" hidden><p>生日快樂！</p><p>願今天的你，被喜歡的人事物溫柔包圍。<br>新的一歲，有安心的日常，也有心動的小驚喜。<br>謝謝你，讓先見成為研究路上的一位夥伴。</p><div class="mbday-points"><span>生日心意</span><strong>300 <small>點</small></strong><span data-birthday-expiry></span></div><p class="mbday-footnote">已自動存入你的點數帳戶，不需另外領取。</p></div><button type="button" class="mbday-action">略過動畫</button><button type="button" class="mbday-wallet" hidden>查看點數紀錄 ↗</button>';
 const d=dialog,action=d.querySelector('.mbday-action');let revealed=false;
 if(document.documentElement.dataset.theme!=='light')d.querySelector('.mbday-owl').src='assets/brand/foresight-owl-dark-book-light.png';
 function reveal(){if(revealed||dialog!==d)return;revealed=true;clearTimeout(timer);d.classList.add('is-ready');d.querySelector('h2').textContent='今天，為你留一份溫暖。';d.querySelector('.mbday-message').hidden=false;d.querySelector('.mbday-wallet').hidden=false;d.querySelector('[data-birthday-expiry]').textContent='有效至 '+new Date(receipt.expires_at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'});action.textContent='收下祝福';}
 const dismiss=()=>{close();if(previous?.isConnected)previous.focus({preventScroll:true});};
 d.querySelector('.mbday-close').onclick=dismiss;action.onclick=()=>revealed?dismiss():reveal();d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
 d.querySelector('.mbday-wallet').onclick=()=>{dismiss();if(window.openMemberCenter)window.openMemberCenter('wallet');else location.hash='#member/wallet';};
 document.body.append(d);d.showModal();
 // Cross-device acknowledgement is separate from the annual credit receipt.
 rpc(true).catch(()=>{});window.dispatchEvent(new Event('academy-rewards-changed'));
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)reveal();else timer=setTimeout(reveal,3200);
}
async function refresh(){const captured=token();if(captured===owner&&checked===captured)return;
 if(captured!==owner){generation++;close();checked='';owner=captured;}
 if(!captured||!window.AcademyIdentity?.serviceRpc||running)return;
 const ticket=generation;running=true;
 try{const s=await rpc();if(ticket!==generation||captured!==token())return;checked=captured;
  if(s?.version===6&&s.awarded===true&&s.points===300&&s.seen===false&&Number.isFinite(Date.parse(s.expires_at)))show(s,captured);
 }catch{/* Offline or older service: never show an unconfirmed reward. */}
 finally{running=false;if(token()!==captured)refresh();}
}
addEventListener('academy-auth-changed',refresh);addEventListener('storage',e=>{if(e.key==='sb_token')refresh();});
addEventListener('focus',()=>{if(!checked)refresh();});
if(document.readyState==='loading')addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})();
