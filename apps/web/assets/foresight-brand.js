/* Decorate cloned brand marks too; never touch member/auth state. */
(() => {
  'use strict';
  const seen=new WeakSet();
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(entry=>entry.target.classList.toggle('fqi-brand-inview',entry.isIntersecting));
  },{threshold:.1}):null;
  function register(root){
    const nodes=[];
    if(root.nodeType===1&&root.matches('.fqi-brand'))nodes.push(root);
    root.querySelectorAll?.('.fqi-brand').forEach(node=>nodes.push(node));
    nodes.forEach(node=>{if(seen.has(node))return;seen.add(node);if(observer)observer.observe(node);else node.classList.add('fqi-brand-inview');});
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
