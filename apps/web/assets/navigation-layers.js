/* Navigation owns page history; transient layers close before their source page. */
(() => {
 'use strict';
 const records=new Map();let stack=[],sequence=0,restoring=false,pending=false,baseURL=location.href;
 window.AcademyNavigationLayers={handlesPop:()=>location.href===baseURL&&(stack.length>0||(history.state?.academyLayers||[]).some(id=>records.has(id)))};
 const state=()=>({...history.state,academyLayers:stack.slice()});
 function enter(key,open,close,isOpen,origin){
  if(restoring||!isOpen())return;
  const existing=stack.find(id=>records.get(id)?.key===key);
  if(existing){Object.assign(records.get(existing),{open,close,isOpen});return;}
  const id='layer-'+Date.now()+'-'+(++sequence);
  records.set(id,{key,open,close,isOpen,focus:origin?.focus||document.activeElement,scroll:origin?.scroll||{x:scrollX,y:scrollY},member:origin?.member,memberTop:origin?.memberTop});
  if(!stack.length)baseURL=location.href;
  stack.push(id);history.pushState(state(),'',location.href);
 }
 function requestClose(id){
  if(pending)return;
  if(stack.at(-1)===id&&history.state?.academyLayers?.at(-1)===id){pending=true;history.back();}
  else records.get(id)?.close();
 }
 function clear(){
  restoring=true;try{for(const id of [...stack].reverse())records.get(id)?.close();stack=[];pending=false;}finally{restoring=false;}
 }
 addEventListener('academy-public-navigation',clear);
 addEventListener('academy-member-navigation',clear);
 addEventListener('popstate',e=>{
  const desired=(e.state?.academyLayers||[]).filter(id=>records.has(id));
  if(!stack.length&&!desired.length)return;
  const samePage=location.href===baseURL;pending=false;restoring=true;
  try{
   for(const id of [...stack].reverse())if(!desired.includes(id)){
    const r=records.get(id);r?.close();
    if(samePage&&r){requestAnimationFrame(()=>{if(r.focus?.isConnected)r.focus.focus({preventScroll:true});scrollTo(r.scroll.x,r.scroll.y);if(r.member?.isConnected)r.member.scrollTop=r.memberTop;requestAnimationFrame(()=>{if(r.member?.isConnected)r.member.scrollTop=r.memberTop;});});}
   }
   stack=stack.filter(id=>desired.includes(id));
   for(const id of desired)if(!stack.includes(id)){const r=records.get(id);r.open();if(r.isOpen())stack.push(id);}
   if(stack.length!==desired.length)history.replaceState(state(),'',location.href);
  }finally{restoring=false;}
  // A layer entry has the same source URL. Do not rerender its underlying page.
  if(samePage){e.stopImmediatePropagation();}
 },true);
 function bind(key,openNames,closeName,isOpen){
  const rawClose=window[closeName];if(typeof rawClose!=='function')return;
  const close=()=>rawClose.call(window);
  window[closeName]=function(...args){
   const id=stack.find(id=>records.get(id)?.key===key);
   if(id&&!restoring){requestClose(id);return;}
   return rawClose.apply(this,args);
  };
  for(const name of openNames){const rawOpen=window[name];if(typeof rawOpen!=='function')continue;
   window[name]=function(...args){const member=document.querySelector('.member-page:not([hidden])');const origin={focus:document.activeElement,scroll:{x:scrollX,y:scrollY},member,memberTop:member?.scrollTop};const result=rawOpen.apply(this,args);enter(key,()=>rawOpen.apply(window,args),close,isOpen,origin);return result;};
  }
 }
 bind('theme',['_openThemeDrawer','_openSectorDrawer'],'_closeTheme',()=>document.getElementById('themeDrawer')?.classList.contains('open'));
 bind('etf',['_etxOpen'],'_etxCloseDrawer',()=>{const el=document.getElementById('etxDrawer');return !!el&&el.style.display!=='none';});
 bind('group',['_openGroupDrawer'],'_closeGroupDrawer',()=>document.getElementById('gbDetail')?.classList.contains('on'));
 bind('chart',['openChart'],'closeChart',()=>{const el=document.getElementById('chartModal');return !!el&&el.classList.contains('open')&&!el.classList.contains('etx-embedded');});
 // Native dialogs keep their existing validation, close cleanup and focus behavior.
 const dialogs=new WeakMap();
 function syncDialogs(){
  for(const d of document.querySelectorAll('dialog[open]')){
   if(!dialogs.has(d))dialogs.set(d,'dialog-'+(++sequence));
   enter(dialogs.get(d),()=>{if(d.isConnected&&!d.open)d.showModal();},()=>{if(d.open)d.close();},()=>d.isConnected&&d.open);
  }
  if(!restoring&&!pending){const id=stack.at(-1),r=records.get(id);if(r&&!r.isOpen())requestClose(id);}
 }
 new MutationObserver(syncDialogs).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 addEventListener('keydown',e=>{if(e.key!=='Escape'||!stack.length)return;e.preventDefault();e.stopImmediatePropagation();requestClose(stack.at(-1));},true);
 syncDialogs();
})();
