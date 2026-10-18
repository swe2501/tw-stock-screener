/* Decorate cloned brand marks too; never touch member/auth state. */
(() => {
  'use strict';
  const seen=new WeakSet();
  let artworkId=0;
  function artwork(node){
    const mark=node.querySelector('.gs-mark'),img=mark?.querySelector('img');
    if(!img||mark.querySelector('.fqi-owl-art'))return;
    const id='fqi-owl-'+(++artworkId);
    const left='M256 103 Q291 120 339 151 Q318 185 281 172 Q244 159 251 122 Z';
    const right='M464 103 Q429 120 381 151 Q402 185 439 172 Q476 159 469 122 Z';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 720 480');svg.setAttribute('aria-hidden','true');svg.classList.add('fqi-owl-art');
    svg.innerHTML=`<defs>
      <clipPath id="${id}-left"><path d="${left}"/></clipPath>
      <clipPath id="${id}-right"><path d="${right}"/></clipPath>
      <mask id="${id}-body" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="480"><rect width="720" height="480" fill="white"/><path d="${left}" fill="black"/><path d="${right}" fill="black"/></mask>
      <clipPath id="${id}-geometry"><path d="M361 396 L401 272 L481 224 L530 154 L642 146 L650 252 L565 286 L527 336 L443 313 Z"/></clipPath>
      <clipPath id="${id}-book"><rect x="100" y="416" width="520" height="64"/></clipPath>
      <filter id="${id}-gold" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 4 0 -2.2" result="whiteParts"/><feComposite in="whiteParts" in2="SourceAlpha" operator="in" result="lineMask"/><feFlood flood-color="#e6bc62"/><feComposite in2="lineMask" operator="in"/></filter>
    </defs>
    <image class="fqi-owl-base" width="720" height="480" mask="url(#${id}-body)"/>
    <image class="fqi-book-trim" width="720" height="480" clip-path="url(#${id}-book)"/>
    <g class="fqi-geometry" clip-path="url(#${id}-geometry)"><image width="720" height="480" filter="url(#${id}-gold)"/></g>
    <g class="fqi-eye fqi-eye-left"><image width="720" height="480" clip-path="url(#${id}-left)"/></g>
    <g class="fqi-eye fqi-eye-right"><image width="720" height="480" clip-path="url(#${id}-right)"/></g>`;
    svg.querySelectorAll('image').forEach(image=>image.setAttribute('href',img.getAttribute('src')));
    // Keep the accessible raster fallback until the same source has decoded.
    const ready=()=>{if(!mark.contains(svg))mark.append(svg);mark.classList.add('fqi-art-ready');};
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
      const delay=(-(document.timeline.currentTime||0)%2800)+'ms';
      node.style.setProperty('--fqi-pulse-delay',delay);
      node.parentElement?.querySelector('.gs-edition')?.style.setProperty('--fqi-pulse-delay',delay);
      if(observer)observer.observe(node);else node.classList.add('fqi-brand-inview');});
  }
  function visibility(){document.documentElement.classList.toggle('fqi-brand-paused',document.hidden);}
  register(document);visibility();
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(register))).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',visibility);
  const switcher=document.querySelector('.fqi-standalone [data-fqi-theme]');
  if(switcher){
    function apply(theme){document.documentElement.dataset.theme=theme;switcher.setAttribute('aria-label',theme==='light'?'切換深色外觀':'切換淺色外觀');}
    try{apply(localStorage.getItem('theme')==='light'?'light':'dark');}catch{apply('dark');}
    switcher.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';apply(theme);try{localStorage.setItem('theme',theme);}catch{}});
  }
})();
