/* 玻璃模式的數據動態：儀表弧線畫出、走勢線由左畫到右、大數字滾動、長條由底升起。
   只在玻璃模式、只改視覺；卡片捲進畫面才播放，每次進頁面每個圖只播一次（資料刷新不重播）。 */
(function(){
  'use strict';
  var root=document.documentElement,DUR=1000,BASE=220;
  var CARD='.card,.hx-card,.fc-card,.ov-card,.td-panel,.gb-card,.bx-card,.lu-card,.gd-wrap,.pf-glass,.bd-card,.bd-plain-card,.ef-wrap,.ed-wrap,.in-wrap,.eh-wrap,.ec-wrap,.eg-wrap,.usty-card,.gs-bdcard,.gs-futcard,.cb-pi,.cb-ovc,.gs-optcard,.ti-card,.md-card,.mc-card,.home-market-card,.pro-gauge-card,.sd-card,.tm-card,.gs-hero,.gs-today,[class*="-card"]';
  var SKIP='#fqiArrival,#chartModal,#siteGate,.kh-tip,.sic-pop,[data-no-glass-motion]';
  function on(){return root.getAttribute('data-ui-skin')==='glass'&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function easeOut(t){return 1-Math.pow(1-t,3.2);}
  /* 阻尼彈簧：衝過頭約 14% 再彈回，像影片裡「ㄉㄨㄞㄉㄨㄞ」的感覺 */
  function spring(t){if(t<=0)return 0;if(t>=1)return 1;return 1-Math.exp(-6.2*t)*Math.cos(9.4*t)*(1-t*.02);}
  function springFrames(fn){var f=[];for(var i=0;i<=24;i++){var t=i/24;f.push({transform:fn+'('+spring(t).toFixed(4)+')',offset:t});}f[24].transform='none';return f;}
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
    var box=svg.getBoundingClientRect(),lines=[],areas=[],dots=[],bars=[],donuts=[];
    [].forEach.call(svg.querySelectorAll('path,polyline,line,rect,circle'),function(el){
      if(el.closest('defs,clipPath,mask,pattern,marker'))return;
      var cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;
      var r=el.getBoundingClientRect();
      if(el.tagName==='circle'){if(cs.strokeDasharray!=='none'&&cs.stroke!=='none'&&r.width>40){donuts.push(el);return;}if(r.width<=16&&r.width>0)dots.push(el);return;}
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
    donuts.forEach(function(el,i){var cs=getComputedStyle(el),da=cs.strokeDasharray,first=parseFloat(da)||0,rest=da.split(/[ ,]+/).slice(1).join(' ')||'1000';
      el.animate([{strokeDasharray:'0 '+(first+parseFloat(rest||0)+1000)},{strokeDasharray:da}],{duration:DUR,delay:delay+i*90,easing:'cubic-bezier(.22,.8,.24,1)',fill:'backwards'});});
    if(bars.length>1){bars.sort(function(a,b){return a.getBoundingClientRect().left-b.getBoundingClientRect().left;});
      var horiz=bars.every(function(b){var r=b.getBoundingClientRect();return r.width>r.height*2.5;});
      var cnt={};bars.forEach(function(b){var r=b.getBoundingClientRect();(horiz?[r.left,r.right]:[r.top,r.bottom]).forEach(function(v){var k=Math.round(v);cnt[k]=(cnt[k]||0)+1;});});
      var base=+Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a];})[0];
      bars.forEach(function(el,i){var r=el.getBoundingClientRect();el.style.transformBox='fill-box';
        el.style.transformOrigin=horiz?(Math.abs(r.right-base)<2?'right center':'left center'):(Math.abs(r.top-base)<2&&Math.abs(r.bottom-base)>=2?'center top':'center bottom');
        el.animate(springFrames(horiz?'scaleX':'scaleY'),{duration:DUR,delay:delay+i*Math.min(80,DUR*.45/bars.length),easing:'linear',fill:'backwards'});});}
  }
  /* ── 大數字滾動 ── */
  var NUM=/^([^\d+\-−]{0,4}?)([+\-−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(.{0,12})$/;
  function countUp(el,delay,isSvg){
    var raw=el.textContent,m=raw.trim().match(NUM);if(!m||/\d/.test(m[5])||/\d/.test(m[1]))return;
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
    var r=el.getBoundingClientRect(),p=el.parentElement,pr=p?p.getBoundingClientRect():r,horiz=r.width>=r.height;
    var origin;
    if(horiz){var atRight=Math.abs(r.right-pr.right)<2&&r.left-pr.left>2,st=el.getAttribute('style')||'';
      if(!atRight&&/(^|;)\s*right\s*:/.test(st)&&!/(^|;)\s*left\s*:/.test(st))atRight=true;
      origin=atRight?'right center':'left center';}
    else{var atTop=Math.abs(r.top-pr.top)<2&&pr.bottom-r.bottom>2;origin=atTop?'center top':'center bottom';}
    el.style.transformOrigin=origin;
    el.animate(springFrames(horiz?'scaleX':'scaleY'),{duration:DUR,delay:delay,easing:'linear',fill:'backwards'});
  }
  function tiles(box,delay){
    var host=box,best=box;[].forEach.call(box.querySelectorAll('*'),function(e){if(e.children.length>best.children.length)best=e;});host=best;
    var kids=[].slice.call(host.children).filter(function(k){return k.getBoundingClientRect().width>0;});if(kids.length<4)return;
    kids.sort(function(a,b){var ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return (ra.top+ra.left)-(rb.top+rb.left);});
    kids.slice(0,120).forEach(function(k,i){k.animate([{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1.06)',offset:.55},{opacity:1,transform:'scale(.98)',offset:.8},{opacity:1,transform:'none'}],{duration:DUR*.8,delay:delay+Math.min(i*18,DUR*.6),easing:'cubic-bezier(.22,.8,.24,1)',fill:'backwards'});});
  }
  function play(el){
    if(!on())return;var kind=el.dataset.gmKind,k=keyOf(el,kind);if(played.has(k))return;played.add(k);
    var delay=BASE;
    if(kind==='tiles')tiles(el,delay);else if(kind==='gauge')gauge(el,delay);else if(kind==='chart')chart(el,delay);else if(kind==='num')countUp(el,delay);else if(kind==='bar')htmlBar(el,delay);
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
    [].forEach.call(rootEl.querySelectorAll('.tmx-heat,[class*="heatmap"],[class*="treemap"]'),function(h){if(!h.closest(SKIP)&&visibleBox(h))mark(h,'tiles');});
    [].forEach.call(rootEl.querySelectorAll(CARD),function(card){
      if(card.closest(SKIP))return;
      [].forEach.call(card.querySelectorAll('b,strong,span,div,p,h2,h3,h4,em'),function(el){
        if(el.childElementCount||el.closest('svg,button,a,input,select,label'))return;
        var t=el.textContent.trim();if(t.length<2||t.length>18||!NUM.test(t))return;
        if(parseFloat(getComputedStyle(el).fontSize)<20)return;mark(el,'num');
      });
    });
    [].forEach.call(rootEl.querySelectorAll('[style*="%"]'),function(el){
      if(el.closest(SKIP))return;
      var cls=(el.getAttribute('class')||'')+' '+(el.parentElement&&el.parentElement.getAttribute('class')||'')+' '+(el.parentElement&&el.parentElement.parentElement&&el.parentElement.parentElement.getAttribute('class')||'');
      if(!/bar|fill|meter|prog|track/i.test(cls))return;if(!/(width|height)\s*:\s*[\d.]+%/.test(el.getAttribute('style')||''))return;
      var r=visibleBox(el);if(!r||r.height>60&&r.width>60)return;mark(el,'bar');
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

