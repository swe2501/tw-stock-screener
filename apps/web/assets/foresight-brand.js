/* Decorate cloned brand marks too; never touch member/auth state. */
(() => {
  'use strict';
  const seen=new WeakSet();
  // Auth/member clones become visible later; keep their idle flash on the same clock.
  function alignSignal(node){
    node.getAnimations().forEach(animation=>{
      if(animation.animationName==='fqi-identity-signal'&&animation.playState==='running'){
        animation.startTime=-Number(animation.effect.getTiming().delay||0);
      }
    });
  }
  document.addEventListener('animationstart',event=>{
    if(event.animationName==='fqi-identity-signal')alignSignal(event.target);
  },true);
  let artworkId=0;
  function sourceFor(theme){return 'assets/brand/foresight-owl-'+theme+'-book-light.png?v=fqi33';}
  function applyArtworkTheme(node){
    const theme=document.documentElement.dataset.theme==='light'?'light':'dark';
    const img=node.querySelector('.gs-mark>img'),svg=node.querySelector('.fqi-owl-art');
    if(img&&img.getAttribute('src')!==sourceFor(theme))img.setAttribute('src',sourceFor(theme));
    if(svg){
      svg.dataset.theme=theme;
      svg.style.setProperty('--fqi-art-bg',theme==='light'?'#fff':'#08121f');
      svg.querySelectorAll('image').forEach(image=>image.setAttribute('href',sourceFor(theme)));
    }
  }
  function artwork(node){
    const mark=node.querySelector('.gs-mark'),img=mark?.querySelector('img');
    if(!img)return;
    mark.querySelector('.fqi-owl-art')?.remove();
    const id='fqi-owl-'+(++artworkId);
    const left='M760 150 Q900 180 1008 300 Q960 390 845 354 Q755 320 770 205 Z';
    const right='M1288 150 Q1148 180 1038 300 Q1088 390 1203 354 Q1293 320 1278 205 Z';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 1789 879');svg.setAttribute('aria-hidden','true');svg.classList.add('fqi-owl-art');
    svg.innerHTML=`<defs>
      <clipPath id="${id}-left"><path d="${left}"/></clipPath>
      <clipPath id="${id}-right"><path d="${right}"/></clipPath>
      <clipPath id="${id}-geometry"><path d="M1015 735 L1085 505 L1260 415 L1365 285 L1570 275 L1605 505 L1450 560 L1360 655 L1190 610 Z"/></clipPath>
    </defs>
    <image class="fqi-owl-base" width="1789" height="879"/>
    <path d="${left}" fill="var(--fqi-art-bg)"/>
    <path d="${right}" fill="var(--fqi-art-bg)"/>
    <g class="fqi-geometry" clip-path="url(#${id}-geometry)"><image width="1789" height="879"/></g>
    <g class="fqi-eye fqi-eye-left"><image width="1789" height="879" clip-path="url(#${id}-left)"/></g>
    <g class="fqi-eye fqi-eye-right"><image width="1789" height="879" clip-path="url(#${id}-right)"/></g>`;
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
  function visibility(){
    document.documentElement.classList.toggle('fqi-brand-paused',document.hidden);
    if(!document.hidden)requestAnimationFrame(()=>document.querySelectorAll('.fqi-brand,.gs-edition').forEach(alignSignal));
  }
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
