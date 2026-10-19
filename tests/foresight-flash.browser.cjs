/* Verify the complete brand flashes briefly, with readable steady states and no image filters. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),css=fs.readFileSync(path.join(root,'apps/web/assets/foresight-brand.css'),'utf8');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const theme of ['light','dark']){
  const p=await browser.newPage({viewport:{width:900,height:140}});
  const png=fs.readFileSync(path.join(root,'apps/web/assets/brand/foresight-owl-'+theme+'.png')).toString('base64');
  await p.setContent(`<style>${css}body{margin:0;background:${theme==='light'?'white':'#111c25'}}header{display:flex;gap:16px;padding:8px 20px}</style><header><a href="#" class="gs-brand fqi-brand"><span class="gs-mark"><img alt="品牌貓頭鷹" src="data:image/png;base64,${png}"></span><span class="gs-name"><b>先見量化智能</b><small>盤後研究院 · FORESIGHT QUANT</small></span></a><span class="gs-edition">ISSUE<br><b>DAILY</b></span></header>`);
  await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const phases=await p.evaluate(()=>[...document.querySelectorAll('a,.gs-edition')].map(el=>{
   const a=el.getAnimations().find(a=>a.animationName==='fqi-identity-signal');a.pause();
   const values=[];for(const t of [0,2800,4928,5040,5600]){a.currentTime=t;values.push({opacity:+getComputedStyle(el).opacity,filter:getComputedStyle(el).filter,shadow:getComputedStyle(el).filter});}
   return values;
  }));
  for(const values of phases){assert.equal(values[0].opacity,1);assert.equal(values[1].opacity,1);assert.equal(values[2].opacity,1,'original signal does not fade the identity');assert.equal(values[3].opacity,1);assert.equal(values[4].opacity,1);assert.notEqual(values[0].shadow,values[3].shadow);assert.equal(await p.locator('.gs-mark img').evaluate(el=>getComputedStyle(el).filter),'none','palette image must not use a runtime SVG filter');}
  await p.locator('a').hover();assert.equal(await p.locator('a').evaluate(el=>getComputedStyle(el).animationName),'fqi-identity-strike');assert.equal(await p.locator('.gs-edition').evaluate(el=>getComputedStyle(el).animationName),'fqi-identity-strike');
  assert.equal(await p.locator('a').evaluate(el=>getComputedStyle(el).animationDuration),'0.38s');
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('a').evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await p.locator('a').evaluate(el=>getComputedStyle(el).opacity),'1');await p.close();
 }
 console.log('PASS original 5.6s brand flash and 380ms hover response, stable precolored image and reduced motion.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
