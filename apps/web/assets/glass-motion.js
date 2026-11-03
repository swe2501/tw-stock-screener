/* 玻璃模式的數據動態：儀表弧線畫出、走勢線由左畫到右、大數字滾動、長條由底升起。
   只在玻璃模式、只改視覺；卡片捲進畫面才播放，每次進頁面每個圖只播一次（資料刷新不重播）。 */
(function(){
  'use strict';
  var root=document.documentElement,DUR=800,BASE=200;
  var CARD='.card,.hx-card,.fc-card,.ov-card,.td-panel,.gb-card,.bx-card,.lu-card,.gd-wrap,.pf-glass,.bd-card,.bd-plain-card,.ef-wrap,.ed-wrap,.in-wrap,.eh-wrap,.ec-wrap,.eg-wrap,.usty-card,.gs-bdcard,.gs-futcard,.cb-pi,.cb-ovc,.gs-optcard,.ti-card,.md-card,.mc-card,.home-market-card,.pro-gauge-card,.sd-card,.tm-card,.gs-hero,.gs-today,[class*="-card"]';
  var SKIP='#fqiArrival,#chartModal,#siteGate,.kh-tip,.sic-pop,[data-no-glass-motion]';
  function on(){return root.getAttribute('data-ui-skin')==='glass'&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function easeOut(t){return 1-Math.pow(1-t,3.2);}
  var played=new Set(),io=null,scanTimer=0;
  function keyOf(el,kind){
    var parts=[],e=el,d=0;
    while(e&&e!==document.body&&d<8){var pe=e.parentElement,i=pe?[].indexOf.call(pe.children,e):0;parts.push((e.id?'#'+e.id:(e.getAttribute('class')||e.tagName).toString().trim().split(/\s+/).slice(0,2).join('.'))+':'+i);if(e.id)break;e=pe;d++;}
    return kind+'|'+parts.join('<');
  }
  function visibleBox(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0?r:null;}

  /* ── 半圓儀表 ── */
  function gauge(svg,delay){
    var v=svg.querySelector('.pro-gauge-value');if(!v)return;
    var m=String(v.getAttribute('stroke-dasharray')||'').match(/([\d.]+)/);var end=m?+m[1]:0;
    v.animate([{strokeDasharray:'0 100'},{strokeDasharray:end+' 100'}],{duration:DUR,delay:delay,easing:'cubic-bezier(.22,.8,.24,1)',fill:'backwards'});
    var dots=[].slice.call(svg.querySelectorAll('.pro-gauge-halo,.pro-gauge-runner'));
    if(dots.length){var t0=performance.now()+delay;
      dots.forEach(function(c){c.dataset.gx=c.getAttribute('cx');c.dataset.gy=c.getAttribute('cy');});
      (function step(now){var t=Math.min(1,Math.max(0,(now-t0)/DUR)),f=easeOut(t)*end/100,a=Math.PI*f;
        dots.forEach(function(c){if(t>=1){c.setAttribute('cx',c.dataset.gx);c.setAttribute('cy',c.dataset.gy);return;}c.setAttribute('cx',(80-60*Math.cos(a)).toFixed(2));c.setAttribute('cy',(72-60*Math.sin(a)).toFixed(2));});
        if(t<1)requestAnimationFrame(step);})(performance.now());}
    var txt=svg.querySelector('.pro-gauge-num');if(txt)countUp(txt,delay,true);
  }
  /* ── 走勢線、面積、端點、長條 ── */
  function chart(svg,delay){
    var box=svg.getBoundingClientRect(),lines=[],areas=[],dots=[],bars=[];
    [].forEach.call(svg.querySelectorAll('path,polyline,line,rect,circle'),function(el){
      if(el.closest('defs,clipPath,mask,pattern,marker'))return;
      var cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;
      var r=el.getBoundingClientRect();
      if(el.tagName==='circle'){if(r.width<=16&&r.width>0)dots.push(el);return;}
      if(el.tagName==='rect'){if(cs.fill!=='none'&&r.height>3&&r.width>=2&&r.width<box.width*.22&&r.height<box.height*.98)bars.push(el);return;}
      if(el.tagName==='line')return;
      var stroked=cs.stroke!=='none'&&parseFloat(cs.strokeWidth)>0,filled=cs.fill!=='none'&&cs.fill!=='transparent'&&!/rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/.test(cs.fill);
      if(stroked&&!filled&&cs.strokeDasharray==='none'&&r.height>3&&r.width>24)lines.push(el);
      else if(filled&&r.width>box.width*.4&&r.height>4)areas.push(el);
    });
    lines.forEach(function(el){var len=el.getAttribute('pathLength')?+el.getAttribute('pathLength'):(el.getTotalLength?el.getTotalLength():0);if(!len)return;
      el.animate([{strokeDasharray:len+' '+len,strokeDashoffset:len},{strokeDasharray:len+' '+len,strokeDashoffset:0}],{duration:DUR,delay:delay,easing:'cubic-bezier(.45,.05,.25,1)',fill:'backwards'});});
    areas.forEach(function(el){el.animate([{opacity:0},{opacity:1}],{duration:DUR*.7,delay:delay+DUR*.35,easing:'ease',fill:'backwards'});});
    if(lines.length)dots.forEach(function(el){el.style.transformBox='fill-box';el.style.transformOrigin='center';
      el.animate([{opacity:0,transform:'scale(.2)'},{opacity:1,transform:'scale(1.35)',offset:.65},{opacity:1,transform:'scale(1)'}],{duration:420,delay:delay+DUR*.85,easing:'ease-out',fill:'backwards'});});
    if(bars.length>1){bars.sort(function(a,b){return a.getBoundingClientRect().left-b.getBoundingClientRect().left;});
      var horiz=bars.every(function(b){var r=b.getBoundingClientRect();return r.width>r.height*2.5;});
      bars.forEach(function(el,i){el.style.transformBox='fill-box';el.style.transformOrigin=horiz?'left center':'center bottom';
        el.animate([{transform:horiz?'scaleX(0)':'scaleY(0)'},{transform:'none'}],{duration:DUR*.85,delay:delay+i*Math.min(60,DUR*.45/bars.length),easing:'cubic-bezier(.2,.9,.25,1.05)',fill:'backwards'});});}
  }
  /* ── 大數字滾動 ── */
  var NUM=/^([^\d+\-−]{0,4}?)([+\-−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(.{0,12})$/;
  function countUp(el,delay,isSvg){
    var raw=el.textContent,m=raw.trim().match(NUM);if(!m)return;
    var intPart=m[3],dec=m[4]||'',digits=dec?dec.length-1:0,comma=intPart.indexOf(',')>=0;
    var target=parseFloat(intPart.replace(/,/g,'')+dec);if(!isFinite(target)||target===0)return;
    var from=target<1000?0:target*.9,lead=raw.slice(0,raw.indexOf(raw.trim()));
    function fmt(v){var s=v.toFixed(digits);if(comma){var p=s.split('.');p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');s=p.join('.');}return lead+m[1]+m[2]+s+m[5];}
    var last=fmt(from),t0=performance.now()+delay;el.textContent=last;
    (function step(now){
      if(el.textContent!==last)return; /* 網站自己更新了數字：交還控制，不覆蓋 */
      var t=Math.min(1,Math.max(0,(now-t0)/DUR));last=t>=1?raw:fmt(from+(target-from)*easeOut(t));el.textContent=last;
      if(t<1)requestAnimationFrame(step);})(performance.now());
  }
  /* ── HTML 進度條（寬度或高度用百分比的長條） ── */
  function htmlBar(el,delay){
    if(getComputedStyle(el).transform!=='none')return;
    var horiz=/width\s*:\s*[\d.]+%/.test(el.getAttribute('style')||'');
    el.style.transformOrigin=horiz?'left center':'center bottom';
    el.animate([{transform:horiz?'scaleX(0)':'scaleY(0)'},{transform:'none'}],{duration:DUR,delay:delay,easing:'cubic-bezier(.22,.8,.24,1)',fill:'backwards'});
  }

  function play(el){
    if(!on())return;var kind=el.dataset.gmKind,k=keyOf(el,kind);if(played.has(k))return;played.add(k);
    var delay=BASE;
    if(kind==='gauge')gauge(el,delay);else if(kind==='chart')chart(el,delay);else if(kind==='num')countUp(el,delay);else if(kind==='bar')htmlBar(el,delay);
  }
  function ensureIO(){if(io)return io;io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);play(e.target);}});},{threshold:.3});return io;}
  function viewRoot(){var views=window._VIEWS||{},t=null;Object.keys(views).some(function(k){var e=document.getElementById(views[k].el);if(e&&e.offsetParent!==null){t=e;return true;}return false;});return t||document.body;}
  function mark(el,kind){if(el.dataset.gmKind)return;if(played.has(keyOf(el,kind)))return;el.dataset.gmKind=kind;ensureIO().observe(el);}
  function scan(){
    if(!on())return;var rootEl=viewRoot();
    [].forEach.call(rootEl.querySelectorAll('svg'),function(svg){
      if(svg.closest(SKIP))return;var r=visibleBox(svg);if(!r||r.width<70||r.height<24)return;
      mark(svg,svg.classList.contains('pro-gauge-svg')?'gauge':'chart');
    });
    [].forEach.call(rootEl.querySelectorAll(CARD),function(card){
      if(card.closest(SKIP))return;
      [].forEach.call(card.querySelectorAll('b,strong,span,div,p,h2,h3,h4,em'),function(el){
        if(el.childElementCount||el.closest('svg,button,a,input,select,label'))return;
        var t=el.textContent.trim();if(t.length<2||t.length>18||!NUM.test(t))return;
        if(parseFloat(getComputedStyle(el).fontSize)<20)return;mark(el,'num');
      });
      [].forEach.call(card.querySelectorAll('[style*="%"]'),function(el){
        var cls=(el.getAttribute('class')||'')+' '+(el.parentElement&&el.parentElement.getAttribute('class')||'');
        if(!/bar|fill|meter|prog|track/i.test(cls))return;if(!/(width|height)\s*:\s*[\d.]+%/.test(el.getAttribute('style')||''))return;
        var r=visibleBox(el);if(!r)return;mark(el,'bar');
      });
    });
  }
  function scheduleScan(ms){clearTimeout(scanTimer);scanTimer=setTimeout(function(){requestAnimationFrame(scan);},ms||160);}
  function reset(){played.clear();if(io){io.disconnect();io=null;}document.querySelectorAll('[data-gm-kind]').forEach(function(e){delete e.dataset.gmKind;});scheduleScan(60);}
  window.addEventListener('academy-public-navigation',reset);
  window.addEventListener('fqi-glass-ui-changed',function(e){if(e.detail&&e.detail.enabled)reset();});
  function boot(){scheduleScan(400);new MutationObserver(function(ms){if(!on())return;for(var i=0;i<ms.length;i++){if(ms[i].addedNodes.length){scheduleScan(220);return;}}}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.FqiGlassMotion={rescan:scheduleScan,reset:reset};
})();
