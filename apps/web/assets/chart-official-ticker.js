/* Official sources only. Market policy is context, never a claim about this security. */
(() => {
 'use strict';
 const modal=document.getElementById('chartModal'),header=modal?.querySelector('.modal-header');
 if(!header)return;
 const bar=document.createElement('section');bar.className='chart-official-ticker';bar.setAttribute('aria-label','K圖官方公告');
 const label=document.createElement('strong'),link=document.createElement('a'),meta=document.createElement('small'),controls=document.createElement('span');
 link.target='_blank';link.rel='noopener noreferrer';controls.className='cot-controls';
 const previous=document.createElement('button'),pause=document.createElement('button'),next=document.createElement('button');
 for(const [b,text,name] of [[previous,'‹','上一則官方公告'],[pause,'暫停','暫停公告輪播'],[next,'›','下一則官方公告']]){b.type='button';b.textContent=text;b.setAttribute('aria-label',name);controls.append(b);}
 bar.append(label,link,meta,controls);header.after(bar);
 let items=[],index=0,key='',owner='',stamp=0,generation=0,controller=null,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,hover=false;
 const token=()=>{try{return localStorage.getItem('sb_token')||'';}catch{return '';}};
 const code=()=>typeof currentCode!=='undefined'?String(currentCode):'';
 const visible=()=>modal.classList.contains('open')&&!document.hidden;
 function status(message){items=[];label.textContent='官方公告';link.removeAttribute('href');link.textContent=message;link.title=message;meta.textContent='';controls.hidden=true;}
 function paint(){
  const item=items[index];if(!item)return;
  label.textContent=item.scope==='security'?'本檔公告':'市場政策';
  link.textContent=item.title||'官方公告';link.title=link.textContent;
  let url;try{url=new URL(item.url);}catch{}if(url?.protocol==='https:')link.href=url.href;else link.removeAttribute('href');
  const date=item.time_precision==='second'&&item.published_at?new Date(item.published_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):item.published_date||'';
  meta.textContent=[date,item.source?.name,`${index+1}/${items.length}`].filter(Boolean).join(' · ');
  meta.title='近 7 日官方公告；市場政策不代表與本檔個股直接相關。點標題開啟官方原文。';
  controls.hidden=items.length<2;pause.textContent=paused?'播放':'暫停';pause.setAttribute('aria-label',paused?'播放公告輪播':'暫停公告輪播');pause.setAttribute('aria-pressed',String(paused));
 }
 function move(n){if(items.length){index=(index+n+items.length)%items.length;paint();}}
 previous.onclick=()=>move(-1);next.onclick=()=>move(1);pause.onclick=()=>{paused=!paused;paint();};
 bar.addEventListener('mouseenter',()=>hover=true);bar.addEventListener('mouseleave',()=>hover=false);
 async function refresh(){
  const auth=token(),stock=code();
  if(auth!==owner){owner=auth;key='';stamp=0;generation++;controller?.abort();status('請先登入查看官方公告');}
  if(!visible()){controller?.abort();return;}
  if(!auth){status('請先登入查看官方公告');return;}
  if(!/^[0-9]{4,6}[A-Z]?$/.test(stock)){status('此商品不提供個股公告');return;}
  if(key===stock&&Date.now()-stamp<300000)return;
  controller?.abort();controller=new AbortController();const active=++generation;key=stock;stamp=Date.now();status('讀取近 7 日公告…');
  try{
   const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify({action:'official_announcements',context:'chart',code:stock,limit:20}),cache:'no-store',signal:controller.signal});
   const data=await response.json();if(active!==generation||auth!==token()||stock!==code()||!visible())return;
   if(!response.ok)throw new Error('read failed');items=Array.isArray(data.items)?data.items:[];index=0;
   if(!items.length)status('近 7 日暫無本檔公告或市場政策');else paint();
  }catch(error){if(error.name==='AbortError'){if(active===generation)stamp=0;return;}if(active===generation){status('公告暫時無法讀取，稍後重試');stamp=Date.now()-240000;}}
 }
 new MutationObserver(refresh).observe(modal,{attributes:true,attributeFilter:['class']});
 const title=document.getElementById('modalTitle');if(title)new MutationObserver(refresh).observe(title,{childList:true,subtree:true,characterData:true});
 document.addEventListener('visibilitychange',refresh);window.addEventListener('storage',refresh);
 setInterval(refresh,15000);
 setInterval(()=>{if(visible()&&owner===token()&&!paused&&!hover&&!bar.contains(document.activeElement))move(1);},8000);
 refresh();
})();
