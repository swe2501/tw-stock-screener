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
    input.addEventListener('change',function(){apply(input.checked,true);});
  }
  apply(read(),false);
  window.FqiGlassUI={enabled:read,setEnabled:function(v){apply(!!v,true);},mountSettings:mountSettings};
})();
