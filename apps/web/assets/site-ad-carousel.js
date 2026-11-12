/* Homepage ads: manual controls remain available when motion is paused. */
(()=>{'use strict';
 let userPaused=null;
 function mount(ads){
  const home=document.getElementById('homeView'),hero=home?.querySelector(':scope > .gs-hero'),adSlides=home?[...home.querySelectorAll(':scope > .site-ad--home_card')]:[];
  const slides=hero?[hero,...adSlides]:adSlides;
  const settings=hero?[{slide_seconds:5,wheel_enabled:ads.some(a=>a.wheel_enabled)},...ads]:ads;
  if(slides.length<2)return ()=>{};
  const root=document.createElement('section');root.className='site-ad-carousel'+(hero?' has-market-slide':'');root.setAttribute('aria-label','首頁廣告輪播');root.setAttribute('aria-roledescription','輪播');
  home.prepend(root);slides.forEach((slide,i)=>{root.append(slide);slide.setAttribute('aria-label',(i+1)+' / '+slides.length);});
  const controls=document.createElement('div');controls.className='site-ad-carousel-controls';controls.innerHTML='<button type="button" data-prev aria-label="上一則廣告"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><span data-count aria-live="polite"></span><button type="button" data-next aria-label="下一則廣告"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button><button type="button" data-pause aria-label="暫停廣告輪播" aria-pressed="false">Ⅱ</button>';
  root.append(controls);let transition=null;let index=0,timer=null,paused=userPaused??matchMedia('(prefers-reduced-motion: reduce)').matches,hover=false,focused=false,lastWheel=0;
  const pause=controls.querySelector('[data-pause]');
  function schedule(){clearTimeout(timer);const video=slides[index].querySelector('video');if(paused||hover||focused||document.hidden||(video&&!video.paused&&!video.ended))return;timer=setTimeout(()=>show(index+1),Math.max(3,Math.min(5,Number(settings[index]?.slide_seconds)||5))*1000);}
  function show(next){const previous=index;transition?.cancel();slides[index]?.querySelector('video')?.pause();index=(next+slides.length)%slides.length;slides.forEach((slide,i)=>{slide.hidden=i!==index;slide.inert=i!==index;slide.setAttribute('aria-hidden',String(i!==index));});if(previous!==index&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const direction=next>previous?1:-1;transition=slides[index].animate([{opacity:.35,transform:'translateX('+(direction*20)+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});}
  controls.querySelector('[data-count]').textContent=(index+1)+' / '+slides.length;pause.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(paused?'<path d="m9 5 10 7-10 7z"/>':'<path d="M9 6v12M15 6v12"/>')+'</svg>';pause.setAttribute('aria-label',paused?'播放廣告輪播':'暫停廣告輪播');pause.setAttribute('aria-pressed',String(paused));schedule();}
  controls.querySelector('[data-prev]').onclick=()=>show(index-1);controls.querySelector('[data-next]').onclick=()=>show(index+1);pause.onclick=()=>{paused=!paused;userPaused=paused;show(index);};
  root.onmouseenter=()=>{hover=true;schedule();};root.onmouseleave=()=>{hover=false;schedule();};root.onfocusin=()=>{focused=true;schedule();};root.onfocusout=e=>{focused=root.contains(e.relatedTarget);schedule();};
  root.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|VIDEO/.test(e.target.tagName))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1));}});
  root.addEventListener('wheel',e=>{if((root.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable=true]'))||!settings[index]?.wheel_enabled||e.ctrlKey||e.target.closest('video')||Math.abs(e.deltaY)+Math.abs(e.deltaX)<8)return;e.preventDefault();if(Date.now()-lastWheel<600)return;lastWheel=Date.now();show(index+((Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)>0?1:-1));},{passive:false});
  slides.forEach(slide=>{const video=slide.querySelector('video');if(video){video.addEventListener('play',schedule);video.addEventListener('pause',schedule);video.addEventListener('ended',schedule);}});
  const visibility=()=>schedule();document.addEventListener('visibilitychange',visibility);show(0);
  return ()=>{document.removeEventListener('visibilitychange',visibility);root.querySelectorAll('video').forEach(v=>v.pause());clearTimeout(timer);transition?.cancel();if(hero){hero.hidden=false;hero.inert=false;hero.removeAttribute('aria-label');hero.removeAttribute('aria-hidden');root.before(hero);}root.remove();};
 }
 window.SiteAdCarousel={mount};
})();
