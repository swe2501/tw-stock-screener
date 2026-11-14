const {chromium}=require('playwright'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent('<main></main>');await page.addStyleTag({path:'apps/web/assets/forum-ads.css'});await page.addScriptTag({path:'apps/web/assets/site-ad-media.js'});
 for(const crop of [null,{x:.1,y:.1,w:.5,h:.5}]){
  await page.evaluate(crop=>{const root=document.querySelector('main');root.innerHTML=SiteAdMedia.html({slot:'home_card',title:'廣告',media_type:'video',media_url:'https://example.test/test.mp4',media_crop:crop});SiteAdMedia.bind(root);SiteAdMedia.bind(root);window.bubbled=0;root.onclick=()=>window.bubbled++;},crop);
  assert.equal(await page.locator('.site-ad-audio').count(),1);
  await page.locator('[data-video-volume]').fill('35');assert.equal(await page.locator('video').evaluate(v=>v.volume),.35);
  await page.getByRole('button',{name:'靜音廣告影片',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.muted),true);
  await page.getByRole('button',{name:'開啟廣告影片聲音',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.volume),.35);
  await page.locator('[data-video-volume]').fill('0');await page.getByRole('button',{name:'開啟廣告影片聲音',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.volume),.35);
  await page.locator('video').evaluate(v=>{v.volume=.6;v.muted=true;});await page.waitForFunction(()=>document.querySelector('[data-video-audio-toggle]').getAttribute('aria-pressed')==='true');
  assert.equal(await page.evaluate(()=>bubbled),0);
  const host=await page.locator('.site-ad-media').boundingBox(),audio=await page.locator('.site-ad-audio').boundingBox();assert(audio.x>=host.x&&audio.x+audio.width<=host.x+host.width+1);assert(audio.y>=host.y&&audio.y<host.y+30);
  assert.equal(await page.locator('.site-ad-crop-viewport .site-ad-audio').count(),0);
 }
 console.log('PASS home audio: native/cropped video, volume, mute/restore, zero-volume restore, external volume sync, no click-through and phone top-right bounds.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
