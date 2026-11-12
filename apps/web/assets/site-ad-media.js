/* Shared by the admin preview and actual placements. All media remains optional for old ads. */
(()=>{'use strict';
 const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const specs={
  top_bar:{label:'頁首公告條（全站）',size:'純文字',help:'主導覽下方的細公告列，所有頁面可見。',ratio:0},
  home_card:{label:'首頁卡片',size:'1200 × 600 px・2:1',help:'首頁市場摘要上方，可放圖片或影片。',ratio:2},
  results_top:{label:'選股結果上方',size:'1200 × 400 px・3:1',help:'掏金篩選器的結果表格上方。',ratio:3},
  member_center:{label:'會員中心',size:'1200 × 600 px・2:1',help:'會員中心頁面標題下方。',ratio:2},
  corner:{label:'右下角浮動卡',size:'640 × 480 px・4:3',help:'視窗右下角的小卡，可關閉，每天最多出現一次。',ratio:4/3}
 };
 function html(a,preview=false){
  if(!['image','video'].includes(a.media_type)||!a.media_url)return '';
  try{const u=new URL(a.media_url);if(u.protocol!=='https:'&&!(preview&&u.protocol==='blob:'))return '';}catch{return '';}
  const x=Number.isFinite(+a.media_x)?Math.max(0,Math.min(100,+a.media_x)):50;
  const y=Number.isFinite(+a.media_y)?Math.max(0,Math.min(100,+a.media_y)):50;
  const zoom=Number.isFinite(+a.media_zoom)?+a.media_zoom:100;
  let style=`object-fit:${zoom<100?'contain':'cover'};object-position:${x}% ${y}%;transform:scale(${Math.max(10,Math.min(300,zoom))/100});transform-origin:${x}% ${y}%`;
  const c=a.media_crop;
  if(a.media_type==='image'&&c&&['x','y','w','h'].every(k=>Number.isFinite(+c[k]))&&c.w>=.01&&c.h>=.01){style=`position:absolute;left:${-c.x/c.w*100}%;top:${-c.y/c.h*100}%;width:${100/c.w}%;height:${100/c.h}%;object-fit:fill;transform:none;`;}
  let media=a.media_type==='video'?`<video style="width:${Math.max(50,Math.min(100,zoom))}%;margin-inline:auto" controls playsinline preload="none" src="${esc(a.media_url)}" aria-label="${esc(a.media_alt||a.title)}"></video>`:
   `<img src="${esc(a.media_url)}" alt="${esc(a.media_alt||a.title)}" loading="lazy" style="${style}">`;
  if(c&&a.media_type==='image')media=`<div class="site-ad-crop-viewport" style="aspect-ratio:${specs[a.slot]?.ratio||2}">${media}</div>`;
  return `<div class="site-ad-media" style="--ad-ratio:${specs[a.slot]?.ratio||2}">${media}</div>`;
 }
 window.SiteAdMedia={specs,html};
})();
