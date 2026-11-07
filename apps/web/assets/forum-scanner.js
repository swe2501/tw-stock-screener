/* Decode forum QR codes locally and use the existing server check-in flow. */
(() => {
 'use strict';
 const decoderUrl=new URL('vendor/jsqr-1.4.0.js',document.currentScript.src);
 let decoder,activeDialog;

 function loadDecoder(){
  if(window.jsQR)return Promise.resolve(window.jsQR);
  if(!decoder){
   decoder=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=decoderUrl.href;
    script.onload=()=>window.jsQR?resolve(window.jsQR):reject();
    script.onerror=reject;
    document.head.append(script);
   }).catch(error=>{decoder=null;throw error;});
  }
  return decoder;
 }

 function checkinCode(value){
  try{
   const url=new URL(value);
   if(!/^https?:$/.test(url.protocol)||url.origin!==location.origin)return null;
   const code=url.searchParams.get('checkin');
   return code&&/^[A-Z0-9-]{1,40}\.[A-Za-z0-9_-]{1,128}$/i.test(code)?code:null;
  }catch{return null;}
 }

 function open(){
  if(activeDialog?.open)return;
  const dialog=document.createElement('dialog');
  dialog.className='afa-modal fm-scanner';
  dialog.setAttribute('aria-label','掃描論壇簽到 QR');
  dialog.innerHTML=`<div class="afa-sheet"><div class="afa-sheet-hd"><b>掃描論壇簽到 QR</b><button type="button" class="afa-x" aria-label="關閉" data-close>×</button></div>
   <div class="afa-sheet-bd"><p>將報到桌的 QR 對準鏡頭，也可以從相簿選取 QR 照片。</p>
   <div class="fm-camera" hidden><video playsinline muted aria-label="相機預覽"></video><span aria-hidden="true"></span></div>
   <div class="afa-bar fm-scan-actions"><button type="button" class="afa-btn primary" data-camera>開啟相機</button>
   <button type="button" class="afa-btn" data-image>選取照片</button><input type="file" accept="image/*" hidden></div>
   <p class="afa-sub" role="status"></p></div></div>`;
  const video=dialog.querySelector('video'),camera=dialog.querySelector('[data-camera]');
  const file=dialog.querySelector('[type=file]'),status=dialog.querySelector('[role=status]');
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  let stream,timer,sequence=0;

  function stop(){
   sequence++;
   clearTimeout(timer);
   stream?.getTracks().forEach(track=>track.stop());
   stream=null;video.srcObject=null;
   video.parentElement.hidden=true;camera.disabled=false;
  }
  function close(){
   stop();
   if(dialog.open)dialog.close();
  }
  function frame(read,source,width,height,maxSize){
   const scale=Math.min(1,maxSize/Math.max(width,height));
   canvas.width=Math.max(1,Math.round(width*scale));
   canvas.height=Math.max(1,Math.round(height*scale));
   ctx.drawImage(source,0,0,canvas.width,canvas.height);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   return read(pixels.data,pixels.width,pixels.height)?.data;
  }
  function accept(value){
   const code=checkinCode(value);
   if(!code){status.textContent='請掃描本站報到桌顯示的論壇簽到 QR。';return false;}
   close();
   window.ForumMember.openPass(code);
   return true;
  }

  camera.onclick=async()=>{
   stop();
   const attempt=sequence;
   camera.disabled=true;status.textContent='正在開啟相機…';
   try{
    const read=await loadDecoder();
    if(attempt!==sequence)return;
    const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(attempt!==sequence){media.getTracks().forEach(track=>track.stop());return;}
    stream=media;video.srcObject=media;video.parentElement.hidden=false;
    await video.play();
    if(attempt!==sequence)return;
    status.textContent='將 QR 放入取景框。';
    function scan(){
     if(attempt!==sequence)return;
     if(video.readyState>=2&&video.videoWidth){
      const value=frame(read,video,video.videoWidth,video.videoHeight,640);
      if(value&&accept(value))return;
     }
     timer=setTimeout(scan,180);
    }
    scan();
   }catch{
    if(attempt!==sequence)return;
    stop();status.textContent='相機無法開啟。可確認瀏覽器權限，或改用「選取照片」。';
   }
  };

  dialog.querySelector('[data-image]').onclick=()=>file.click();
  file.onchange=async()=>{
   const photo=file.files[0];
   if(!photo)return;
   file.value='';stop();
   const attempt=sequence,url=URL.createObjectURL(photo);
   status.textContent='正在讀取照片…';
   try{
    const image=new Image();image.src=url;
    const [read]=await Promise.all([loadDecoder(),image.decode()]);
    if(attempt!==sequence)return;
    const value=frame(read,image,image.naturalWidth,image.naturalHeight,1600);
    if(value)accept(value);
    else status.textContent='照片裡沒有辨識到 QR。請選取較清楚、完整的照片。';
   }catch{
    if(attempt===sequence)status.textContent='無法讀取照片，請改選 JPG 或 PNG。';
   }finally{URL.revokeObjectURL(url);}
  };

  dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-close]'))close();});
  const stopWhenHidden=()=>{if(document.hidden){stop();status.textContent='相機已暫停，可重新開啟。';}};
  document.addEventListener('visibilitychange',stopWhenHidden);
  window.addEventListener('pagehide',close);
  window.addEventListener('academy-auth-changed',close);
  dialog.addEventListener('close',()=>{
   stop();dialog.remove();activeDialog=null;
   document.removeEventListener('visibilitychange',stopWhenHidden);
   window.removeEventListener('pagehide',close);
   window.removeEventListener('academy-auth-changed',close);
  },{once:true});
  activeDialog=dialog;document.body.append(dialog);dialog.showModal();
 }

 window.ForumScanner={open};
})();
