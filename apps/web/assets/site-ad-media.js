/* Shared by the admin preview and actual placements. All media remains optional for old ads. */
(()=>{'use strict';
 const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const specs={
  top_bar:{label:'頁首公告條（全站）',size:'純文字',help:'主導覽下方的細公告列，所有頁面可見。',ratio:0},
  home_card:{label:'首頁卡片',size:'1200 × 600 px・2:1',help:'首頁市場判讀首屏內，與市場判讀輪播，可放圖片或影片。',ratio:2},
  results_top:{label:'選股結果上方',size:'1200 × 400 px・3:1',help:'掏金篩選器的結果表格上方。',ratio:3},
  member_center:{label:'會員中心',size:'1200 × 600 px・2:1',help:'會員中心頁面標題下方。',ratio:2},
  corner:{label:'右下角浮動卡',size:'640 × 480 px・4:3',help:'視窗右下角的小卡，可關閉，關閉後當天不再顯示同一則。',ratio:4/3}
 };
 function html(a,preview=false){
  if(!['image','video'].includes(a.media_type)||!a.media_url)return '';
  try{const u=new URL(a.media_url);if(u.protocol!=='https:'&&!(preview&&u.protocol==='blob:'))return '';}catch{return '';}
  const x=Number.isFinite(+a.media_x)?Math.max(0,Math.min(100,+a.media_x)):50;
  const y=Number.isFinite(+a.media_y)?Math.max(0,Math.min(100,+a.media_y)):50;
  const zoom=Number.isFinite(+a.media_zoom)?+a.media_zoom:100;
  let style=`object-fit:${zoom<100?'contain':'cover'};object-position:${x}% ${y}%;transform:scale(${Math.max(10,Math.min(300,zoom))/100});transform-origin:${x}% ${y}%`;
  const c=a.media_crop;
  if(c&&['x','y','w','h'].every(k=>Number.isFinite(+c[k]))&&c.w>=.01&&c.h>=.01){style=`position:absolute;left:${-c.x/c.w*100}%;top:${-c.y/c.h*100}%;width:${100/c.w}%;height:${100/c.h}%;object-fit:fill;transform:none;`;}
  const custom=a.media_type==='video'&&(!!c||zoom!==100);
  let media=a.media_type==='video'?`<video style="${custom?style:'width:100%;margin-inline:auto'}" ${custom?'':'controls'} playsinline preload="none" src="${esc(a.media_url)}" aria-label="${esc(a.media_alt||a.title)}"></video>`:
   `<img src="${esc(a.media_url)}" alt="${esc(a.media_alt||a.title)}" loading="lazy" style="${style}">`;
  if(c||custom)media=`<div class="site-ad-crop-viewport" style="aspect-ratio:${specs[a.slot]?.ratio||2}">${media}</div>`;
  if(custom)media+='<div class="site-ad-video-controls"><button type="button" data-video-play aria-label="播放影片">▶</button><input type="range" data-video-seek min="0" max="100" step="0.1" value="0" aria-label="影片播放進度"><button type="button" data-video-mute aria-label="靜音影片">靜音</button><button type="button" data-video-full aria-label="全螢幕影片">⛶</button><span data-video-status role="status"></span></div>';
  if(a.media_type==='video'&&a.slot==='home_card')media+='<div class="site-ad-audio" role="group" aria-label="廣告影片音量"><button type="button" data-video-audio-toggle aria-label="靜音廣告影片" aria-pressed="false"></button><input type="range" data-video-volume min="0" max="100" step="1" value="100" aria-label="廣告影片音量" aria-valuetext="100%"></div>';
  return `<div class="site-ad-media" style="--ad-ratio:${specs[a.slot]?.ratio||2}">${media}</div>`;
 }
 function bind(root){root.querySelectorAll('.site-ad-media:has(.site-ad-video-controls)').forEach(host=>{if(host.dataset.videoBound)return;host.dataset.videoBound='1';const video=host.querySelector('video'),play=host.querySelector('[data-video-play]'),seek=host.querySelector('[data-video-seek]'),mute=host.querySelector('[data-video-mute]'),status=host.querySelector('[data-video-status]');const sync=()=>{play.textContent=video.paused?'▶':'Ⅱ';play.setAttribute('aria-label',video.paused?'播放影片':'暫停影片');if(Number.isFinite(video.duration)&&video.duration>0)seek.value=video.currentTime/video.duration*100;};play.onclick=()=>video.paused?video.play().catch(()=>status.textContent='無法播放，請確認影片網址與格式。'):video.pause();seek.oninput=()=>{if(Number.isFinite(video.duration))video.currentTime=video.duration*Number(seek.value)/100;};mute.onclick=()=>{video.muted=!video.muted;mute.textContent=video.muted?'開聲':'靜音';mute.setAttribute('aria-label',video.muted?'開啟影片聲音':'靜音影片');};host.querySelector('[data-video-full]').onclick=()=>host.requestFullscreen?.().catch(()=>{});for(const name of ['play','pause','ended','timeupdate','loadedmetadata'])video.addEventListener(name,sync);video.addEventListener('error',()=>status.textContent='影片無法載入，請確認網址與格式。');sync();});}
 const speaker=muted=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/>'+(muted?'<path d="m16 9 6 6m0-6-6 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>')+'</svg>';
 function bindAudio(root){root.querySelectorAll('.site-ad-media:has(.site-ad-audio)').forEach(host=>{
  if(host.dataset.audioBound)return;host.dataset.audioBound='1';
  const video=host.querySelector('video'),box=host.querySelector('.site-ad-audio'),toggle=box.querySelector('button'),volume=box.querySelector('input');let lastVolume=video.volume||1;
  const sync=()=>{const silent=video.muted||video.volume===0,value=Math.round(video.volume*100);toggle.innerHTML=speaker(silent);toggle.setAttribute('aria-label',silent?'開啟廣告影片聲音':'靜音廣告影片');toggle.setAttribute('aria-pressed',String(silent));toggle.title=silent?'開啟聲音':'靜音';volume.value=silent?0:value;volume.setAttribute('aria-valuetext',(silent?0:value)+'%'+(silent?'（靜音）':''));};
  toggle.onclick=()=>{if(video.muted||video.volume===0){if(video.volume===0)video.volume=lastVolume;video.muted=false;}else{lastVolume=video.volume;video.muted=true;}sync();};
  volume.oninput=()=>{const value=Number(volume.value)/100;video.volume=value;video.muted=value===0;if(value>0)lastVolume=value;sync();};
  for(const name of ['click','pointerdown','keydown','wheel'])box.addEventListener(name,event=>event.stopPropagation());
  video.addEventListener('volumechange',sync);sync();
 });}
 window.SiteAdMedia={specs,html,bind(root){bind(root);bindAudio(root);}};
})();
