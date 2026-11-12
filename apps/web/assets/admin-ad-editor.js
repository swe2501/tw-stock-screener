/* Media editor uses the normal admin API and direct, signed Storage uploads. */
(()=>{'use strict';
 function open({ad,slot,meta,post,modal,close,onSaved,esc}){
  const specs=SiteAdMedia.specs;
  const a={slot:slot||'home_card',audience:'not_attended',cta:'查看場次',url:'?forum=1',priority:50,enabled:false,media_type:'text',media_x:50,media_y:50,media_zoom:100,slide_seconds:5,wheel_enabled:false,...ad};
  const options=(items,value)=>Object.entries(items).map(([id,text])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(text)}</option>`).join('');
  const b=modal(ad?'編輯站內廣告':'新增站內廣告',`<div class="afa-ad-steps"><span>1 選擇版位</span><strong>2 編輯內容</strong><span>3 預覽確認</span></div><div class="afa-ad-editor"><form class="afa-form" data-editor>
   <fieldset class="full afa-media-tabs"><legend>內容類型</legend>${[['text','純文字'],['image','圖片'],['video','影片']].map(([id,text])=>`<label><input type="radio" name="media_type" value="${id}" ${a.media_type===id?'checked':''}>${text}</label>`).join('')}</fieldset>
   <label>版位<select name="slot">${options(meta.slots,a.slot)}</select></label><label>受眾<select name="audience">${options(meta.audiences,a.audience)}</select></label>
   <p class="afa-sub full afa-placement-info" data-size></p><p class="afa-sub full" data-format-note></p><button type="button" class="afa-btn full" data-media-slot>我要刊登圖片／影片 → 改用首頁卡片</button>
   <section class="afa-media-upload full" data-media><label>上傳素材<input type="file" name="file" accept="image/jpeg,image/png,image/webp"></label><p class="afa-sub" data-file-hint></p><span class="afa-sub" data-file-name></span>
   <label>或使用 HTTPS 素材網址<input type="url" name="media_url" maxlength="1500" placeholder="https://…" value="${esc(a.media_url||'')}"></label>
   <label>素材說明<input name="media_alt" maxlength="120" placeholder="供無法看見圖片的使用者閱讀" value="${esc(a.media_alt||'')}"></label>
   <div class="afa-crop" data-crop><label>裁切位置・左右<input type="range" name="media_x" min="0" max="100" value="${a.media_x}"></label><label>上下<input type="range" name="media_y" min="0" max="100" value="${a.media_y}"></label></div>
   <label><span data-zoom-label>圖片縮放</span><input type="range" name="media_zoom" min="10" max="300" step="5" value="${a.media_zoom}"><output data-zoom-value></output></label><div class="afa-bar" data-image-tools><button type="button" class="afa-btn" data-fit>顯示完整圖片</button><button type="button" class="afa-btn" data-open-crop>自訂裁切框</button><button type="button" class="afa-btn ghost" data-reset-crop>重設裁切</button></div><section class="full" data-crop-editor hidden><p class="afa-sub">拖曳框內移動；拖曳右下角調整大小，比例固定為版位比例。方向鍵微調位置，Shift＋方向鍵調整大小。</p><div class="afa-crop-stage" data-crop-stage><img data-crop-source alt="裁切原圖"><div class="afa-crop-frame" data-crop-frame tabindex="0" role="group" aria-label="裁切範圍，可拖曳或用方向鍵調整"><span data-crop-handle aria-hidden="true"></span></div></div><button type="button" class="afa-btn primary" data-apply-crop>套用裁切</button></section><p class="afa-sub" data-upload-state role="status"></p><button type="button" class="afa-btn ghost" data-remove-media>移除素材</button></section>
   <label class="full">內部名稱<input name="name" maxlength="60" value="${esc(a.name||'')}" placeholder="僅管理端顯示"></label>
   <label class="full">標題<input name="title" maxlength="60" required value="${esc(a.title||'')}"></label>
   <label class="full">說明<textarea name="text" rows="2" maxlength="200">${esc(a.text||'')}</textarea></label>
   <label>點擊後開啟<select name="destination">${options({forum:'論壇活動',home:'首頁',screen:'掏金篩選器',member:'會員中心',custom:'自訂網址'},({'?forum=1':'forum','#home':'home','#screen':'screen','#member':'member'})[a.url]||'custom')}</select></label>
   <label>按鈕文字（可自訂，最多 20 字）<input name="cta" maxlength="20" value="${esc(a.cta)}"></label>
   <label class="full" data-link>連結<input name="url" maxlength="400" value="${esc(a.url)}" placeholder="https://… 或 #站內頁面"></label>
   <label>開始（台灣時間）<input type="datetime-local" name="starts" value="${esc(a.starts?.length===10?a.starts+'T00:00':a.starts||'')}"></label>
   <label>結束（台灣時間）<input type="datetime-local" name="ends" value="${esc(a.ends?.length===10?a.ends+'T23:59':a.ends||'')}"></label>
   <section class="full afa-media-upload" data-carousel-options><b>首頁廣告輪播</b><label>本則停留秒數（3–5 秒）<input type="number" name="slide_seconds" min="3" max="5" step="1" value="${a.slide_seconds}"></label><label class="chk"><input type="checkbox" name="wheel_enabled" ${a.wheel_enabled?'checked':''}>游標在本則廣告上時，可用滾輪切換</label><p class="afa-sub">市場判讀首頁保留為第一頁（停留 5 秒），符合受眾與刊登時間的首頁廣告依優先度接續輪播。沒有廣告時不輪播；影片播放、滑鼠停留或鍵盤操作時暫停。</p></section><label>優先度<input name="priority" type="number" min="0" max="99" value="${a.priority}"></label><label class="chk"><input type="checkbox" name="enabled" ${a.enabled?'checked':''}>開啟刊登</label>
   <p class="afa-sub full">圖片建議將文字放在中央安全範圍，避免靠邊。影片由使用者點選播放，保留原比例。請先確認素材與音樂的使用權。</p>
   <div class="afa-foot full"><button type="button" class="afa-btn ghost" data-close>取消</button><button type="submit" class="afa-btn primary">預覽確認</button></div>
  </form><aside class="afa-ad-live"><div class="afa-bar"><b>刊登預覽</b><div role="group" aria-label="預覽裝置"><button type="button" class="afa-btn" data-device="desktop" aria-pressed="true">桌機</button><button type="button" class="afa-btn" data-device="mobile" aria-pressed="false">手機</button></div></div><div class="afa-ad-browser" data-browser><div class="afa-browser-head">先見 FORESIGHT</div><div class="afa-browser-nav">首頁　選股　題材族群</div><p class="afa-sub" data-location></p><div class="afa-bar"><button type="button" class="afa-btn" data-replay-placement>▶ 播放位置示範</button><span class="afa-sub" data-motion-status role="status">可播放動畫查看廣告位置</span></div><div data-preview></div><div class="afa-page-context" data-page-context></div></div><p class="afa-sub">圖片可用左右、上下控制調整裁切。預覽比例與實際版位共用設定。</p></aside></div>
  <section class="afa-ad-review" data-review hidden><h3>確認刊登內容</h3><div data-final-preview></div><dl data-summary></dl><div class="afa-foot"><button type="button" class="afa-btn ghost" data-back>返回編輯</button><button type="button" class="afa-btn" data-draft>儲存草稿</button><button type="button" class="afa-btn primary" data-save>確認儲存</button></div></section><p class="afa-err" data-message role="status"></p>`,true);
  b.closest('.afa-sheet').classList.add('afa-ad-sheet');
  const f=b.querySelector('form'),msg=b.querySelector('[data-message]'),review=b.querySelector('[data-review]');
  let file=null,objectUrl='',uploaded='',busy=false,data=null,crop=a.media_crop||null,rect=null;
  const type=()=>f.elements.media_type.value;
  const destination=()=>({forum:'?forum=1',home:'#home',screen:'#screen',member:'#member'})[f.elements.destination.value]||f.elements.url.value.trim();
  function read(){
   const e=f.elements;
   return {id:ad?.id||'',name:e.name.value,slot:e.slot.value,audience:e.audience.value,title:e.title.value,text:e.text.value,
    cta:e.cta.value,url:destination(),starts:e.starts.value,ends:e.ends.value,priority:+e.priority.value,enabled:e.enabled.checked,
    media_type:type(),media_url:file?(uploaded||objectUrl):e.media_url.value.trim(),media_alt:e.media_alt.value,
    media_x:+e.media_x.value,media_y:+e.media_y.value,media_zoom:+e.media_zoom.value,media_crop:type()==='image'?crop:null,slide_seconds:+e.slide_seconds.value,wheel_enabled:e.wheel_enabled.checked};
  }
  function preview(host,d){
   host.className='site-ad site-ad--'+d.slot+' site-ad--preview';
   host.innerHTML=SiteAdMedia.html(d,true)+`<div class="site-ad-copy"><b>${esc(d.title||'廣告標題')}</b><span class="site-ad-t">${esc(d.text)}</span><span class="site-ad-cta">${esc(d.cta||'了解更多')} ↗</span></div>`;
  }
  let placementAnimations=[],lastPlacement='';
  function stopPlacement(){placementAnimations.forEach(animation=>animation.cancel());placementAnimations=[];}
  function animatePlacement(){
   stopPlacement();const context=b.querySelector('[data-page-context]'),target=context.querySelector('.afa-placement-target'),status=b.querySelector('[data-motion-status]');if(!target)return;
   const slot=context.dataset.slot;
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){status.textContent='已依減少動畫設定顯示靜態位置。';return;}
   status.textContent=slot==='home_card'?'示範：市場判讀 → 廣告 → 市場判讀，同一輪播區。':'示範：廣告從標示位置出現。';
   if(slot==='home_card'){
    const market=context.querySelector('.afa-mini-market');placementAnimations.push(market.animate([{opacity:1,offset:0},{opacity:1,offset:.25},{opacity:0,offset:.34},{opacity:0,offset:.75},{opacity:1,offset:.85},{opacity:1,transform:'translateX(0)',offset:1}],{duration:5600,easing:'ease-in-out'}));
    placementAnimations.push(target.animate([{opacity:0,transform:'translateX(14px)',offset:0},{opacity:0,transform:'translateX(14px)',offset:.25},{opacity:1,transform:'translateX(0)',offset:.34},{opacity:1,transform:'translateX(0)',offset:.75},{opacity:0,transform:'translateX(-14px)',offset:.85},{opacity:0,offset:1}],{duration:5600,easing:'ease-in-out'}));
   }else placementAnimations.push(target.animate([{opacity:.1,transform:slot==='corner'?'translate(18px,18px)':slot==='top_bar'?'translateY(-10px)':'translateY(10px)'},{opacity:1,transform:'translate(0,0)',offset:.45},{opacity:1,transform:'translate(0,0)'}],{duration:1600,easing:'cubic-bezier(.22,1,.36,1)'}));
   const active=placementAnimations[placementAnimations.length-1];active.finished.then(()=>{if(b.isConnected)status.textContent='示範完成，可重播；這裡不會刊登或儲存廣告。';}).catch(()=>{});
  }
  b.querySelector('[data-replay-placement]').onclick=animatePlacement;
  b.closest('dialog').addEventListener('close',stopPlacement,{once:true});
  function update(){
   stopPlacement();
   b.querySelector('[data-carousel-options]').hidden=f.elements.slot.value!=='home_card';
   const textOnly=f.elements.slot.value==='top_bar';
   if(textOnly&&type()!=='text')f.querySelector('[name=media_type][value=text]').checked=true;
   f.querySelectorAll('[name=media_type]').forEach(input=>{input.disabled=textOnly&&input.value!=='text';});
   b.querySelector('[data-format-note]').textContent=textOnly?'此版位是細公告條，僅支援純文字。圖片或影片請改選其他版位。':'此版位支援純文字、圖片與影片；選擇內容類型後即可上傳或填入 HTTPS 素材網址。';
   b.querySelector('[data-media-slot]').hidden=!textOnly;
   const video=type()==='video';f.elements.media_zoom.min=video?'50':'10';f.elements.media_zoom.max=video?'100':'300';
   b.querySelector('[data-zoom-label]').textContent=video?'影片顯示尺寸（保留完整畫面與控制列）':'圖片縮小／放大（10–300%）';
   b.querySelector('[data-zoom-value]').textContent=f.elements.media_zoom.value+'%';
   b.querySelector('[data-upload-state]').textContent=file?'已選取素材；完成「預覽確認 → 確認儲存」才會上傳並保存。':f.elements.media_url.value?'已保存或已填入素材網址；選檔欄顯示未選擇檔案不影響既有素材。':'尚未選擇素材。';
   b.querySelector('[data-image-tools]').hidden=type()!=='image';
   const d=read(),spec=specs[d.slot];
   b.querySelector('[data-size]').textContent=spec.help+'　建議 '+spec.size;
   const context=b.querySelector('[data-page-context]'),adPreview=b.querySelector('[data-preview]');
   const market='<section class="afa-mini-market"><div><small>FIELD NOTE・盤後研究手札</small><h3>先看資金，<br>再看故事。</h3><p>市場結構・法人動向</p><div class="afa-mini-search">⌕ 輸入股票、指數名稱或代號</div></div><aside><b>今日判讀</b><p>大盤・市場廣度</p><div class="afa-mini-kpis"><span>大盤走勢</span><span>法人動向</span></div></aside></section>';
   const table='<section class="afa-mini-results"><b>掏金篩選器</b><p>篩選條件　產業　研究策略</p><table><thead><tr><th>股票</th><th>股價</th><th>漲跌</th></tr></thead><tbody><tr><td>股票 A</td><td>—</td><td>—</td></tr><tr><td>股票 B</td><td>—</td><td>—</td></tr></tbody></table></section>';
   const member='<section class="afa-mini-member"><b>會員中心</b><p>我的權益　點數與使用券　自選筆記</p><div class="afa-mini-kpis"><span>會員權益</span><span>我的點數</span></div></section>';
   adPreview.remove();context.replaceChildren();context.dataset.slot=d.slot;
   const holder=document.createElement('div');holder.className='afa-placement-target';holder.innerHTML='<span class="afa-target-label">廣告實際顯示區</span>';holder.append(adPreview);
   if(d.slot==='top_bar'){context.append(holder);context.insertAdjacentHTML('beforeend',market+table);}
   else if(d.slot==='home_card'){context.insertAdjacentHTML('beforeend',market);const caption=document.createElement('p');caption.className='afa-sub';caption.textContent='首頁首屏輪播：市場判讀 ⇄ 此則廣告（同一區塊）';const carousel=document.createElement('div');carousel.className='afa-mini-carousel';carousel.append(context.querySelector('.afa-mini-market'),holder);context.append(caption,carousel);context.insertAdjacentHTML('beforeend','<div class="afa-mini-below">行情圖表・每日籌碼報告（輪播下方）</div>');}
   else if(d.slot==='results_top'){context.insertAdjacentHTML('beforeend','<div class="afa-mini-below">掏金篩選器・篩選條件</div>');context.append(holder);context.insertAdjacentHTML('beforeend',table);}
   else if(d.slot==='member_center'){context.insertAdjacentHTML('beforeend','<div class="afa-mini-below"><b>會員中心</b>　我的帳號</div>');context.append(holder);context.insertAdjacentHTML('beforeend',member);}
   else{context.insertAdjacentHTML('beforeend',market+table);context.append(holder);}
   b.querySelector('[data-location]').textContent='位置：'+spec.help;
   b.querySelector('[data-media]').hidden=type()==='text';b.querySelector('[data-crop]').hidden=type()!=='image'||!!crop;
   f.elements.file.accept=type()==='video'?'video/mp4':'image/jpeg,image/png,image/webp';
   b.querySelector('[data-file-hint]').textContent=type()==='video'?'MP4・上限 30 MB，建議 H.264 影像／AAC 音訊；影片不自動播放。':'JPG、PNG、WebP・上限 5 MB。依版位比例裁切，原始檔保留完整。';
   b.querySelector('[data-link]').hidden=f.elements.destination.value!=='custom';preview(b.querySelector('[data-preview]'),d);
   if(lastPlacement!==d.slot){lastPlacement=d.slot;animatePlacement();}
  }
  function clearFile(resetPicker=true){crop=null;b.querySelector('[data-crop-editor]').hidden=true;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';file=null;uploaded='';if(resetPicker)f.elements.file.value='';b.querySelector('[data-file-name]').textContent='';}
  b.closest('dialog').addEventListener('close',clearFile,{once:true});
  b.querySelector('[data-media-slot]').onclick=()=>{f.elements.slot.value='home_card';update();f.querySelector('[name=media_type][value=image]').focus();};
  b.querySelector('[data-fit]').onclick=()=>{crop=null;f.elements.media_zoom.value=95;f.elements.media_x.value=50;f.elements.media_y.value=50;b.querySelector('[data-crop-editor]').hidden=true;update();};
  b.querySelector('[data-reset-crop]').onclick=()=>{crop=null;f.elements.media_zoom.value=100;b.querySelector('[data-crop-editor]').hidden=true;update();};
  f.elements.media_zoom.addEventListener('input',()=>{crop=null;b.querySelector('[data-crop-editor]').hidden=true;});
  const stage=b.querySelector('[data-crop-stage]'),frame=b.querySelector('[data-crop-frame]'),source=b.querySelector('[data-crop-source]');
  const drawRect=()=>{frame.style.cssText='left:'+rect.x*100+'%;top:'+rect.y*100+'%;width:'+rect.w*100+'%;height:'+rect.h*100+'%';};
  b.querySelector('[data-open-crop]').onclick=()=>{const url=read().media_url;if(!url){msg.textContent='請先選取圖片或填入 HTTPS 素材網址。';return;}source.onload=()=>{const relativeRatio=(source.naturalWidth/source.naturalHeight)/(specs[f.elements.slot.value]?.ratio||2);const w=Math.min(1,1/relativeRatio),h=w*relativeRatio;rect=crop?{...crop}:{x:(1-w)/2,y:(1-h)/2,w,h};drawRect();b.querySelector('[data-crop-editor]').hidden=false;frame.focus();};source.onerror=()=>{msg.textContent='無法載入裁切原圖，請確認圖片網址或重新選檔。';};source.src=url;};
  let drag=null;
  frame.onpointerdown=e=>{if(!rect)return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY,rect:{...rect},resize:!!e.target.closest('[data-crop-handle]'),bounds:stage.getBoundingClientRect()};frame.setPointerCapture(e.pointerId);};
  frame.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const dx=(e.clientX-drag.x)/drag.bounds.width,dy=(e.clientY-drag.y)/drag.bounds.height,r=drag.rect;if(drag.resize){const ratio=r.h/r.w;const wanted=r.w+(Math.abs(dx)>Math.abs(dy/ratio)?dx:dy/ratio);const w=Math.max(Math.max(.01,.01/ratio),Math.min(wanted,1-r.x,(1-r.y)/ratio));rect={...r,w,h:w*ratio};}else rect={...r,x:Math.max(0,Math.min(1-r.w,r.x+dx)),y:Math.max(0,Math.min(1-r.h,r.y+dy))};drawRect();};
  frame.onpointerup=frame.onpointercancel=()=>{drag=null;};
  frame.onkeydown=e=>{if(!rect||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const direction=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;if(e.shiftKey){const ratio=rect.h/rect.w,w=Math.max(Math.max(.01,.01/ratio),Math.min(rect.w+direction*.01,1-rect.x,(1-rect.y)/ratio));rect={...rect,w,h:w*ratio};}else if(['ArrowLeft','ArrowRight'].includes(e.key))rect.x=Math.max(0,Math.min(1-rect.w,rect.x+direction*.01));else rect.y=Math.max(0,Math.min(1-rect.h,rect.y+direction*.01));drawRect();};
  b.querySelector('[data-apply-crop]').onclick=()=>{if(!rect)return;crop={...rect};f.elements.media_zoom.value=100;b.querySelector('[data-crop-editor]').hidden=true;update();};
  f.oninput=update;
  f.elements.media_type.forEach(input=>input.addEventListener('change',()=>{clearFile();f.elements.media_url.value='';f.elements.media_zoom.value=100;msg.textContent='';update();}));
  f.elements.file.onchange=async()=>{
   const chosen=f.elements.file.files[0];if(!chosen)return;
   const expected=type(),allowed=expected==='video'?['video/mp4']:['image/jpeg','image/png','image/webp'];
   if(!allowed.includes(chosen.type)||chosen.size>(expected==='video'?30:5)*1024*1024){msg.textContent='素材格式或大小不符，請依上方說明重新選擇。';f.elements.file.value='';return;}
   clearFile(false);file=chosen;objectUrl=URL.createObjectURL(chosen);f.elements.media_url.value='';msg.textContent='';b.querySelector('[data-file-name]').textContent=chosen.name+'・'+(chosen.size/1024/1024).toFixed(2)+' MB';update();
  };
  f.elements.slot.addEventListener('change',()=>{crop=null;b.querySelector('[data-crop-editor]').hidden=true;update();});
  f.elements.media_url.addEventListener('change',()=>{clearFile();update();});
  b.querySelector('[data-remove-media]').onclick=()=>{clearFile();f.elements.media_url.value='';update();};
  b.querySelectorAll('[data-device]').forEach(button=>button.onclick=()=>{b.querySelector('[data-browser]').classList.toggle('mobile',button.dataset.device==='mobile');b.querySelectorAll('[data-device]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));});
  f.onsubmit=event=>{
   event.preventDefault();data=read();msg.textContent='';
   if(data.media_type!=='text'&&!data.media_url){msg.textContent='請先上傳素材或填入素材網址。';return;}
   if(!file&&data.media_type!=='text'&&!/^https:\/\//i.test(data.media_url)){msg.textContent='素材網址需使用 HTTPS。';return;}
   if(data.starts&&data.ends&&data.starts>=data.ends){msg.textContent='結束時間需晚於開始時間。';return;}
   if(data.url&&!/^(https:\/\/|\/(?!\/)|#|\?)/i.test(data.url)){msg.textContent='請填寫 HTTPS 或站內連結。';return;}
   preview(b.querySelector('[data-final-preview]'),data);
   b.querySelector('[data-summary]').innerHTML=[['版位',meta.slots[data.slot]],['按鈕文字',data.cta||'了解更多'],['受眾',meta.audiences[data.audience]],['時間（台灣）',(data.starts||'立即')+' ～ '+(data.ends||'不限')],['點擊後開啟',data.url||'論壇活動'],['狀態',data.enabled?'依設定時間刊登':'草稿・未開啟']].map(([key,value])=>`<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`).join('');
   b.querySelector('.afa-ad-editor').hidden=true;review.hidden=false;b.scrollTop=0;b.querySelector('[data-back]').focus();
  };
  b.querySelector('[data-back]').onclick=()=>{review.hidden=true;b.querySelector('.afa-ad-editor').hidden=false;update();};
  async function persist(draft){
   if(busy)return;busy=true;b.querySelectorAll('button').forEach(x=>x.disabled=true);msg.textContent=file&&!uploaded?'上傳素材中…':'儲存中…';
   try{
    if(file&&!uploaded&&data.media_type!=='text'){
     const signed=await post('admin_ads_media_upload',{content_type:file.type,size:file.size});
     if(signed.error)throw Error(signed.error);
     const response=await fetch(signed.upload_url,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
     if(!response.ok)throw Error('素材上傳未完成，請重試。表單內容已保留。');uploaded=signed.public_url;
    }
    if(!b.isConnected)return;
    const result=await post('admin_ads_save',{ad:{...data,media_url:file?uploaded:data.media_url,enabled:!draft&&data.enabled}});
    if(result.error)throw Error(result.error);close();dispatchEvent(new Event('site-ads-changed'));onSaved();
   }catch(error){if(b.isConnected)msg.textContent=error.message||'儲存失敗，請重試。';}
   finally{busy=false;if(b.isConnected)b.querySelectorAll('button').forEach(x=>x.disabled=false);}
  }
  b.querySelector('[data-save]').onclick=()=>persist(false);b.querySelector('[data-draft]').onclick=()=>persist(true);update();
 }
 window.AdminAdEditor={open};
})();
