/* Keep the heat-map inspector reachable while browsing long maps. */
(()=>{
 'use strict';
 const states=new WeakMap(), norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
 function attach(root,type){
  const ws=root.closest('.pro-heat-workspace');if(!ws)return;
  let state=states.get(root);
  if(!state){
   state={query:'',sideQuery:''};states.set(root,state);
   const bar=document.createElement('div');bar.className='heat-find';
   const label=document.createElement('label');label.textContent=type==='theme'?'搜尋題材':'搜尋產業';
   const input=document.createElement('input');input.type='search';input.placeholder=type==='theme'?'輸入題材名稱，例如 AI、半導體':'輸入產業名稱，例如 電子、金融';input.setAttribute('aria-label',label.textContent);
   const count=document.createElement('span');count.className='heat-find-count';label.append(input);bar.append(label,count);ws.before(bar);state.count=count;
   input.addEventListener('input',()=>{state.query=input.value;filter();});
   const detail=ws.querySelector('.tmx-detail,.sm-list');
   new MutationObserver(()=>{if(detail.textContent.trim()&&!detail.querySelector('.heat-switch'))switcher(detail);}).observe(detail,{childList:true});
   state.detail=detail;
  }
  function tiles(){return [...root.querySelectorAll('.tmx-cell,.sm-tile')];}
  function name(t){return t.dataset.sec||t.querySelector('.nm,:scope>span')?.textContent.trim()||'';}
  function filter(){
   const all=tiles(),q=norm(state.query);let found=0;
   all.forEach(t=>{const ok=norm(name(t)).includes(q);t.hidden=!ok;if(ok)found++;});
   root.querySelectorAll('.sm-group').forEach(g=>g.hidden=![...g.querySelectorAll('.sm-tile')].some(t=>!t.hidden));
   state.count.textContent=found+' / '+all.length+' 個'+(type==='theme'?'題材':'產業');
   let empty=ws.querySelector('.heat-find-empty');if(!empty){empty=document.createElement('p');empty.className='heat-find-empty';empty.textContent='沒有符合的分類，請換個關鍵字。';root.after(empty);}empty.hidden=found>0||!all.length;
  }
  function switcher(detail){
   const panel=document.createElement('div');panel.className='heat-switch';
   const label=document.createElement('label');label.textContent=type==='theme'?'切換題材':'切換產業';
   const input=document.createElement('input');input.type='search';input.placeholder='搜尋'+(type==='theme'?'題材':'產業');input.setAttribute('aria-label','名單內搜尋分類');input.value=state.sideQuery;
   const select=document.createElement('select');select.setAttribute('aria-label',label.textContent);
   function options(){select.replaceChildren(new Option('選擇其他'+(type==='theme'?'題材':'產業'),' '));tiles().filter(t=>norm(name(t)).includes(norm(input.value))).forEach((t,i)=>{const o=new Option(name(t),String(i));o._tile=t;o.selected=t.classList.contains('on');select.append(o);});}
   input.addEventListener('input',()=>{state.sideQuery=input.value;options();});
   select.addEventListener('change',()=>{const t=select.selectedOptions[0]?._tile;if(t&&!t.classList.contains('on'))t.click();});
   label.append(input);panel.append(label,select);detail.prepend(panel);state.refresh=options;options();
  }
  filter();if(state.detail.textContent.trim()&&!state.detail.querySelector('.heat-switch'))switcher(state.detail);else state.refresh?.();
 }
 window.AcademyHeatNavigator={attach};
 // Handles both initial page order and maps populated after navigation.
 function boot(){
  const views=['themesView','sectorView'].map(id=>document.getElementById(id)).filter(Boolean);
  const active=()=>document.body.classList.toggle('heat-map-active',views.some(v=>getComputedStyle(v).display!=='none'));
  views.forEach(v=>new MutationObserver(active).observe(v,{attributes:true,attributeFilter:['style','class']}));active();
  for(const [id,type] of [['tmxHeat','theme'],['smMap','sector']]){const root=document.getElementById(id);if(!root)continue;attach(root,type);new MutationObserver(()=>attach(root,type)).observe(root,{childList:true});}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
