const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const url=pathToFileURL(path.resolve(__dirname,'../apps/web/ai-office.html')).href+'?embedded=1&theme=light';
const out=path.join(os.tmpdir(),'foresight-ai-office');
fs.mkdirSync(out,{recursive:true});
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
    for(const viewport of [{width:1440,height:650},{width:1100,height:740},{width:390,height:844}]){
      await p.setViewportSize(viewport);await p.goto(url);await p.waitForFunction(()=>window.ForesightOffice?.trafficPosition.length===3);await p.waitForTimeout(500);
      const floor=await p.locator('#floorNav').boundingBox(),tabs=await p.locator('.explore-tabs').boundingBox(),tools=await p.locator('.view-controls').boundingBox(),detail=await p.locator('#detail').boundingBox();
      assert.equal(intersects(floor,tabs),false,'Floor navigation must clear tabs');
      assert.equal(intersects(floor,tools),false,'Floor navigation must clear view tools');
      assert.equal(intersects(floor,detail),false,'Floor navigation must clear detail');
      assert.equal(intersects(tools,detail),false,'View tools must clear detail');
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const canvas=await p.locator('#stage').boundingBox();const x=canvas.x+canvas.width*.34,y=canvas.y+canvas.height*.42;
      await p.mouse.move(x,y);for(let i=0;i<3;i++){await p.mouse.wheel(0,-120);await p.waitForTimeout(65);}await p.waitForTimeout(350);
      const zoomed=await p.evaluate(()=>ForesightOffice.cameraView);assert.ok(zoomed.zoom>1.4,'Wheel must zoom');
      await p.locator('#cameraPan').click();const beforePan=await p.evaluate(()=>ForesightOffice.cameraView);
      await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+70,y+50,{steps:8});await p.mouse.up();await p.waitForTimeout(450);
      const afterPan=await p.evaluate(()=>ForesightOffice.cameraView);assert.notDeepEqual(afterPan.target,beforePan.target,'Pan must move focus after zoom');assert.equal(afterPan.mode,'pan');
      await p.locator('#cameraOrbit').click();const beforeRotate=await p.evaluate(()=>ForesightOffice.cameraView.angle);
      await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+110,y-20,{steps:10});await p.mouse.up();await p.waitForTimeout(450);
      assert.ok(Math.abs(await p.evaluate(()=>ForesightOffice.cameraView.angle)-beforeRotate)>.3,'Rotate must remain available after zoom and pan');
      assert.equal(await p.evaluate(()=>ForesightOffice.viewMode),'tower');
      await p.locator('#overview').click();await p.waitForTimeout(600);
      assert.ok(Math.abs(await p.evaluate(()=>ForesightOffice.cameraView.zoom)-1)<.03);
      await p.screenshot({path:path.join(out,'district-'+viewport.width+'x'+viewport.height+'.png')});
    }
    await p.setViewportSize({width:1440,height:900});await p.goto(url);await p.waitForFunction(()=>window.ForesightOffice?.trafficPosition.length===3);
    const vehicle=await p.evaluate(()=>ForesightOffice.trafficPosition);await p.waitForTimeout(400);assert.notDeepEqual(await p.evaluate(()=>ForesightOffice.trafficPosition),vehicle,'Traffic should move without interaction');
    assert.notEqual(await p.locator('.district-birds').evaluate(e=>getComputedStyle(e).animationName),'none');
    await p.locator('#theme').click();assert.equal(await p.locator('.moon-disc').evaluate(e=>getComputedStyle(e).display),'block');assert.equal(await p.locator('#officeStars i').count(),62);
    await p.locator('.district-meteor.passing').waitFor({state:'attached',timeout:30000});
    assert.ok(await p.evaluate(()=>ForesightOffice.meteorCount)>0);
    await p.screenshot({path:path.join(out,'district-night.png')});
    await p.emulateMedia({reducedMotion:'reduce'});await p.reload();await p.waitForFunction(()=>window.ForesightOffice?.trafficPosition.length===3);const still=await p.evaluate(()=>ForesightOffice.trafficPosition);await p.waitForTimeout(350);assert.deepEqual(await p.evaluate(()=>ForesightOffice.trafficPosition),still,'Reduced motion must pause traffic');
    assert.equal(await p.locator('.district-meteor').evaluate(e=>getComputedStyle(e).display),'none');
    assert.deepEqual(errors,[]);await p.close();console.log('PASS: no overlapping UI at 3 sizes; zoom, pan, orbit, reset; moving traffic, day birds, night meteor, reduced-motion support.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
