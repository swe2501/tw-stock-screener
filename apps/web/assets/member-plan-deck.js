/* Presentation only: product identity, availability and permissions remain catalog-owned. */
(()=>{'use strict';
 const spriteURL=new URL('membership-icons-glass.png',document.currentScript?.src||new URL('assets/',document.baseURI)).href;let spriteStarted=false,deckAudio=null,noiseBuffer=null,activeWhoosh=null,audioGeneration=0;
 const palette={free:'157,185,213',observation:'59,158,193',research:'122,113,201',advanced:'122,113,201',vip:'189,155,85'};
 function mount(host){
  if(!spriteStarted){spriteStarted=true;const sprite=new Image();sprite.onload=()=>document.documentElement.classList.add('mp-deck-icons-ready');sprite.src=spriteURL;}
  const box=host.querySelector('[data-payment-products]'),cards=[...(box?.querySelectorAll('.mp-product-choice')||[])];if(!cards.length)return;
  host._deckAbort?.abort();const abort=host._deckAbort=new AbortController(),options={signal:abort.signal};
  box.classList.add('mp-plan-deck');box.setAttribute('aria-label','左右選擇會員方案');box.tabIndex=0;
  box.parentElement.querySelector('.mp-deck-controls')?.remove();
  const controls=document.createElement('nav');controls.className='mp-deck-controls';controls.setAttribute('aria-label','方案切換');
  controls.innerHTML='<button type="button" data-deck-prev aria-label="上一個方案">←</button><div data-deck-dots></div><span data-deck-status aria-live="polite"></span><button type="button" data-deck-sound aria-label="切換音效">音效 開</button><button type="button" data-deck-next aria-label="下一個方案">→</button>';
  const usedLights=new Set();const softColor=index=>{const h=(index*137.508)%360,a=.38*.42;const channel=n=>{const k=(n+h/30)%12;return Math.round(255*(.58-a*Math.max(-1,Math.min(k-3,9-k,1))));};return[channel(0),channel(8),channel(4)].join(',');};
  cards.forEach((card,i)=>{const input=card.querySelector('[name=billing-product]'),product=window.AcademyMemberCatalog?.get()?.products?.find(p=>p.id===input.value);card.querySelector('.mp-product-symbol').dataset.deckIcon=String(({free:0,observation:1,research:2,advanced:2,vip:3})[product?.tier]??i%4);let glow=palette[product?.tier]||softColor(i);if(usedLights.has(glow))glow=softColor(i+4);usedLights.add(glow);card.style.setProperty('--deck-light',glow);const dot=document.createElement('button');dot.type='button';dot.dataset.deckIndex=i;dot.setAttribute('aria-label','選擇'+(product?.name||card.querySelector('strong').textContent));controls.querySelector('[data-deck-dots]').append(dot);});box.after(controls);
  let selected=0;
  function paint(){selected=Math.max(0,cards.findIndex(c=>c.querySelector('input').checked));cards.forEach((card,i)=>{const offset=i-selected;card.style.setProperty('--deck-offset',offset);card.dataset.deckPosition=offset===0?'current':Math.abs(offset)===1?'neighbor':'far';card.style.zIndex=String(cards.length-Math.abs(offset));card.inert=Math.abs(offset)>1;});controls.querySelector('[data-deck-prev]').disabled=selected===0;controls.querySelector('[data-deck-next]').disabled=selected===cards.length-1;controls.querySelectorAll('[data-deck-index]').forEach((dot,i)=>{dot.setAttribute('aria-pressed',String(i===selected));});controls.querySelector('[data-deck-status]').textContent=(selected+1)+' / '+cards.length;}
  let soundEnabled=true;try{soundEnabled=sessionStorage.getItem('foresight.deck.sound')!=='off';}catch{}
  const soundButton=controls.querySelector('[data-deck-sound]');
  function paintSound(){soundButton.textContent='音效 '+(soundEnabled?'開':'關');soundButton.setAttribute('aria-pressed',String(soundEnabled));}
  soundButton.onclick=()=>{soundEnabled=!soundEnabled;audioGeneration++;try{activeWhoosh?.stop();}catch{}try{sessionStorage.setItem('foresight.deck.sound',soundEnabled?'on':'off');}catch{}paintSound();};paintSound();
  function whoosh(direction){
    const duration=parseFloat(getComputedStyle(cards[selected]).transitionDuration)||0;if(!soundEnabled||!duration)return;
    const generation=++audioGeneration;try{activeWhoosh?.stop();}catch{}
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;deckAudio??=new Audio();const ready=deckAudio.state==='suspended'?deckAudio.resume():Promise.resolve();
      ready.then(()=>requestAnimationFrame(()=>{if(generation!==audioGeneration||abort.signal.aborted||!soundEnabled||deckAudio.state!=='running')return;
        const ctx=deckAudio,t=ctx.currentTime;if(!noiseBuffer){noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate),ctx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1);}
        const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=noiseBuffer;filter.type='bandpass';filter.Q.value=.55;filter.frequency.setValueAtTime(650,t);filter.frequency.exponentialRampToValueAtTime(2300,t+duration*.45);filter.frequency.exponentialRampToValueAtTime(550,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.035,t+duration*.35);gain.gain.exponentialRampToValueAtTime(.0001,t+duration*.95);source.connect(filter);filter.connect(gain);
        let pan=null;if(ctx.createStereoPanner){pan=ctx.createStereoPanner();pan.pan.setValueAtTime(direction*.25,t);pan.pan.linearRampToValueAtTime(-direction*.15,t+duration);gain.connect(pan);pan.connect(ctx.destination);}else gain.connect(ctx.destination);
        activeWhoosh=source;source.start(t);source.stop(t+duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();};
      })).catch(()=>{});
    }catch{}
  }
  function select(index){if(index<0||index>=cards.length)return;const direction=index>selected?1:-1,input=cards[index].querySelector('input'),changed=!input.checked;if(changed){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}paint();if(changed)whoosh(direction);}
  controls.querySelector('[data-deck-prev]').onclick=()=>select(selected-1);controls.querySelector('[data-deck-next]').onclick=()=>select(selected+1);controls.querySelector('[data-deck-dots]').onclick=e=>{const dot=e.target.closest('[data-deck-index]');if(dot)select(+dot.dataset.deckIndex);};
  box.addEventListener('change',e=>{const before=selected;paint();if(e.isTrusted&&before!==selected)whoosh(selected>before?1:-1);},options);box.addEventListener('click',e=>{if(e.target.closest('button,input,label,a')){const before=selected;paint();if(before!==selected)whoosh(selected>before?1:-1);return;}const card=e.target.closest('.mp-product-choice');if(card)select(cards.indexOf(card));},options);
  box.addEventListener('keydown',e=>{const target={ArrowLeft:selected-1,ArrowRight:selected+1,Home:0,End:cards.length-1}[e.key];if(target!==undefined){e.preventDefault();select(target);}},options);
  let pointer=null,suppressUntil=0;
  box.addEventListener('pointerdown',e=>{if(e.button!==0||!e.isPrimary||e.target.closest('button,input,a'))return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,index:cards.indexOf(e.target.closest('.mp-product-choice'))};box.setPointerCapture(e.pointerId);},options);
  box.addEventListener('pointerup',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,index=pointer.index;pointer=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4){suppressUntil=performance.now()+350;select(selected+(dx<0?1:-1));}else if(Math.abs(dx)<10&&Math.abs(dy)<10&&index>=0)select(index);},options);
  box.addEventListener('pointercancel',()=>{pointer=null;},options);box.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},{...options,capture:true});
  host._paintPlanDeck=paint;paint();
 }
 window.AcademyPlanDeck={mount};
})();
