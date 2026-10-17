/* Run against the loopback-only authoring server with task-local model files.
 * Art review is separate: passing this test never approves a candidate. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const themes=['immortal','garden','mountain','space','castle','pet','ocean','gem','train'];
const personas=['female','male','neutral'],gestures=['pat','offer','play','care','cheer'];
const output=path.resolve(process.env.QA_OUTPUT||'work/companion-cast-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[],report=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.CAST_REVIEW_URL||'http://127.0.0.1:51763/');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  for(const theme of themes)for(const persona of personas)for(let stage=0;stage<5;stage++){
   await page.evaluate(args=>castReview.change(args),{theme,persona,stage});
   assert.equal(await page.locator('body').getAttribute('data-ready'),'true',`${theme}/${persona}/${stage}`);
   const result=await page.evaluate(({gestures})=>{
    const r=castReview,meshes=[];r.model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    const clips=Object.keys(r.clips),bones=meshes[0]?.skeleton.bones.length||0;
    let animated=0;
    for(const gesture of gestures){
     r.mixer.stopAllAction();const a=r.mixer.clipAction(r.clips['interact_'+gesture]);a.reset().play();r.mixer.setTime(.001);
     const before=meshes[0].skeleton.bones.map(b=>[...b.position,...b.rotation.toArray().slice(0,3),...b.scale]).flat();
     r.mixer.setTime(1.35);const after=meshes[0].skeleton.bones.map(b=>[...b.position,...b.rotation.toArray().slice(0,3),...b.scale]).flat();
     if(after.some((v,i)=>Math.abs(v-before[i])>.001))animated++;
     if(after.some(v=>!Number.isFinite(v)))throw Error('Non finite pose');
    }
    r.mixer.stopAllAction();r.mixer.clipAction(r.clips.idle).reset().play();r.mixer.setTime(.3);r.model.updateMatrixWorld(true);
    return {clips:clips.length,bones,meshes:meshes.length,animated};
   },{gestures});
   assert.ok(result.meshes>0);assert.ok(result.bones>0&&result.bones<60);assert.equal(result.clips,10);assert.equal(result.animated,5);
   report.push({id:`${theme}/${persona}/${stage}`,...result});
   if(persona==='neutral'&&stage===0){await page.getByRole('button',{name:'正面',exact:true}).click();assert.equal(await page.getByRole('button',{name:'正面',exact:true}).getAttribute('aria-pressed'),'true');await page.screenshot({path:path.join(output,theme+'-front.png')});await page.getByRole('button',{name:'側面',exact:true}).click();await page.screenshot({path:path.join(output,theme+'-side.png')});await page.getByRole('button',{name:'背面',exact:true}).click();await page.screenshot({path:path.join(output,theme+'-back.png')});}
  }
  await page.evaluate(()=>castReview.change({theme:'garden',persona:'neutral',stage:0}));
  // The refined fox must remain volumetric and its touch/feeding tools must
  // approach the exported, posed character geometry, not just hover nearby.
  const contacts=await page.evaluate(()=>{
   const r=castReview,meshes=[];r.model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
   function pose(name,time){r.mixer.stopAllAction();r.mixer.clipAction(r.clips[name]).reset().play();r.mixer.setTime(time);r.model.updateMatrixWorld(true);for(const m of meshes)m.skeleton.update();}
   function points(tool){const a=[];for(const m of meshes){const pos=m.geometry.attributes.position,si=m.geometry.attributes.skinIndex,sw=m.geometry.attributes.skinWeight;for(let i=0;i<pos.count;i++){if(sw.getX(i)<.99)continue;const bone=m.skeleton.bones[si.getX(i)].name,isTool=/^(tool_|drop|reply|light)/.test(bone);if(tool?bone!==tool:isTool)continue;const v=m.position.clone().fromBufferAttribute(pos,i);m.applyBoneTransform(i,v);m.localToWorld(v);a.push(v);}}return a;}
   function gap(tool){let min=Infinity;const body=points(null),tools=points(tool);for(const a of tools)for(let j=0;j<body.length;j+=2)min=Math.min(min,a.distanceTo(body[j]));return min;}
   pose('interact_pat',1.3);const pat=gap('tool_hand');pose('interact_offer',1.30);const water=gap('drop0');pose('interact_care',1.35);const care=gap('tool_brush');pose('interact_cheer',1.3);const cheer=gap('tool_hand');
   return {pat,water,care,cheer};
  });
  for(const [name,gap]of Object.entries(contacts))assert.ok(gap<.12,`${name} gap ${gap}`);
  for(const gesture of gestures){await page.evaluate(g=>{castReview.play('interact_'+g);castReview.mixer.update(3.1);},gesture);assert.equal(await page.locator('body').getAttribute('data-action'),'idle');}
  await page.setViewportSize({width:390,height:920});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'mobile.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>castReview.change({stage:1}));const time=await page.evaluate(()=>castReview.mixer.time);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>castReview.mixer.time),time);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'browser-audit.json'),JSON.stringify({scope:'135 draft load/rig/gesture checks; 9 angle triplets; refined fox contact samples. No art approval.',count:report.length,contacts,errors,models:report},null,2));console.log('PASS 135 draft combinations, 675 moving gesture poses, front/side/back views, refined fox contact samples, mobile and reduced motion. Not visual approval.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
