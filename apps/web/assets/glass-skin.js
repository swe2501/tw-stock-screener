(function(){
  'use strict';
  var KEY='fqi_glass_ui';
  var root=document.documentElement;
  function read(){try{return localStorage.getItem(KEY)==='1';}catch(_){return root.getAttribute('data-ui-skin')==='glass';}}
  function apply(enabled,announce){
    root.toggleAttribute('data-ui-skin',!!enabled);
    if(enabled)root.setAttribute('data-ui-skin','glass');
    try{enabled?localStorage.setItem(KEY,'1'):localStorage.removeItem(KEY);}catch(_){}
    document.querySelectorAll('[data-glass-ui-switch]').forEach(function(input){input.checked=!!enabled;});
    document.querySelectorAll('[data-glass-ui-state]').forEach(function(label){label.textContent=enabled?'已開啟':'已關閉';});
    if(announce)window.dispatchEvent(new CustomEvent('fqi-glass-ui-changed',{detail:{enabled:!!enabled}}));
  }
  function mountSettings(container){
    var host=container.querySelector('.ob-settings-card')||container;
    if(host.querySelector('[data-glass-ui-setting]'))return;
    var row=document.createElement('div');
    row.className='glass-setting-block';
    row.setAttribute('data-glass-ui-setting','');
    row.innerHTML='<div class="glass-setting-copy"><span class="glass-setting-icon" aria-hidden="true"><i></i></span><span><strong>全站玻璃介面</strong><small>切換圓潤、通透的高級玻璃質感；網站功能與內容不變。</small></span></div><label class="glass-setting-control"><span data-glass-ui-state></span><input data-glass-ui-switch type="checkbox" role="switch" aria-label="全站玻璃介面"><i aria-hidden="true"></i></label>';
    host.append(row);
    var input=row.querySelector('[data-glass-ui-switch]');
    input.checked=read();
    row.querySelector('[data-glass-ui-state]').textContent=input.checked?'已開啟':'已關閉';
    input.addEventListener('change',function(){var on=input.checked;var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(document.startViewTransition&&!reduce){document.startViewTransition(function(){apply(on,true);});}else apply(on,true);});
  }
  /* 換頁進場動畫：只在玻璃模式，對目前顯示的頁面內容依序浮現 */
  var enterTimer=0;
  function visible(el){return el&&el.offsetParent!==null&&getComputedStyle(el).display!=='none';}
  function animateEnter(){
    if(root.getAttribute('data-ui-skin')!=='glass')return;
    if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var views=window._VIEWS||{},target=null;
    Object.keys(views).some(function(k){var e=document.getElementById(views[k].el);if(visible(e)){target=e;return true;}return false;});
    if(!target){var ps=document.getElementById('proScreenLayout');if(visible(ps))target=ps;}
    if(!target)return;
    document.querySelectorAll('.glass-enter').forEach(function(e){e.classList.remove('glass-enter');});
    var kids=[].slice.call(target.children).filter(visible).slice(0,10);
    kids.forEach(function(k,i){k.style.setProperty('--gi',i);});
    void target.offsetWidth;target.classList.add('glass-enter');
    clearTimeout(enterTimer);enterTimer=setTimeout(function(){target.classList.remove('glass-enter');kids.forEach(function(k){k.style.removeProperty('--gi');});},1400);
  }
  window.addEventListener('academy-public-navigation',function(){requestAnimationFrame(animateEnter);});
  if(document.readyState!=='loading')setTimeout(animateEnter,60);else document.addEventListener('DOMContentLoaded',function(){setTimeout(animateEnter,60);});
  document.addEventListener('DOMContentLoaded',function(){new MutationObserver(function(muts){muts.forEach(function(mu){if(mu.attributeName==='class'&&document.body.classList.contains('mc-open')&&!(mu.oldValue||'').includes('mc-open')){var m=document.querySelector('.member-page .mc-shell');if(m&&root.getAttribute('data-ui-skin')==='glass'){m.classList.remove('glass-enter-self');void m.offsetWidth;m.classList.add('glass-enter-self');}}});}).observe(document.body,{attributes:true,attributeFilter:['class'],attributeOldValue:true});});
  apply(read(),false);
  window.FqiGlassUI={enabled:read,setEnabled:function(v){apply(!!v,true);},mountSettings:mountSettings};
})();
