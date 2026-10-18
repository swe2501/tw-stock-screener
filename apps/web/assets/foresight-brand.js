/* Decorate cloned brand marks too; never touch member/auth state. */
(() => {
  'use strict';
  const seen=new WeakSet();
  let artworkId=0;
  function sourceFor(theme,body=false){return 'assets/brand/foresight-owl-'+theme+(body?'-body':'')+'.png?v=fqi16';}
  function applyArtworkTheme(node){
    const theme=document.documentElement.dataset.theme==='light'?'light':'dark';
    const img=node.querySelector('.gs-mark>img'),svg=node.querySelector('.fqi-owl-art');
    if(img&&img.getAttribute('src')!==sourceFor(theme))img.setAttribute('src',sourceFor(theme));
    if(svg){svg.dataset.theme=theme;svg.querySelectorAll('image').forEach(image=>image.setAttribute('href',sourceFor(theme,image.classList.contains('fqi-owl-base'))));}
  }
  function artwork(node){
    const mark=node.querySelector('.gs-mark'),img=mark?.querySelector('img');
    if(!img)return;
    mark.querySelector('.fqi-owl-art')?.remove();
    const id='fqi-owl-'+(++artworkId);
    const left='M256 103 Q291 120 339 151 Q318 185 281 172 Q244 159 251 122 Z';
    const right='M464 103 Q429 120 381 151 Q402 185 439 172 Q476 159 469 122 Z';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 720 480');svg.setAttribute('aria-hidden','true');svg.classList.add('fqi-owl-art');
    svg.innerHTML=`<defs>
      <clipPath id="${id}-left"><path d="${left}"/></clipPath>
      <clipPath id="${id}-right"><path d="${right}"/></clipPath>
      <clipPath id="${id}-geometry"><path d="M361 396 L401 272 L481 224 L530 154 L642 146 L650 252 L565 286 L527 336 L443 313 Z"/></clipPath>
    </defs>
    <image class="fqi-owl-base" width="720" height="480"/>
    <g class="fqi-geometry" clip-path="url(#${id}-geometry)"><image width="720" height="480"/></g>
    <g class="fqi-eye fqi-eye-left"><image width="720" height="480" clip-path="url(#${id}-left)"/></g>
    <g class="fqi-eye fqi-eye-right"><image width="720" height="480" clip-path="url(#${id}-right)"/></g>`;
    mark.append(svg);applyArtworkTheme(node);
    const ready=()=>mark.classList.add('fqi-art-ready');
    if(img.complete&&img.naturalWidth)ready();else img.addEventListener('load',ready,{once:true});
  }
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(entry=>entry.target.classList.toggle('fqi-brand-inview',entry.isIntersecting));
  },{threshold:.1}):null;
  function register(root){
    const nodes=[];
    if(root.nodeType===1&&root.matches('.fqi-brand'))nodes.push(root);
    root.querySelectorAll?.('.fqi-brand').forEach(node=>nodes.push(node));
    nodes.forEach(node=>{if(seen.has(node))return;seen.add(node);artwork(node);
      const delay=(-(document.timeline.currentTime||0)%5600)+'ms';
      node.style.setProperty('--fqi-pulse-delay',delay);
      node.parentElement?.querySelector('.gs-edition')?.style.setProperty('--fqi-pulse-delay',delay);
      if(observer)observer.observe(node);else node.classList.add('fqi-brand-inview');});
  }
  function visibility(){document.documentElement.classList.toggle('fqi-brand-paused',document.hidden);}
  register(document);visibility();
  new MutationObserver(()=>document.querySelectorAll('.fqi-brand').forEach(applyArtworkTheme)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const header=document.querySelector('body>header:has(.fqi-brand)');
  if(header){
    const measureHeader=()=>document.documentElement.style.setProperty('--fqi-header-height',header.offsetHeight+'px');
    measureHeader();
    if('ResizeObserver' in window)new ResizeObserver(measureHeader).observe(header);
    else window.addEventListener('resize',measureHeader,{passive:true});
  }
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(register))).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',visibility);
  const switcher=document.querySelector('.fqi-standalone [data-fqi-theme]');
  if(switcher){
    function apply(theme){document.documentElement.dataset.theme=theme;switcher.setAttribute('aria-label',theme==='light'?'切換深色外觀':'切換淺色外觀');}
    try{apply(localStorage.getItem('theme')==='light'?'light':'dark');}catch{apply('dark');}
    switcher.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';apply(theme);try{localStorage.setItem('theme',theme);}catch{}});
  }
})();
