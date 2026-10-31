const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/i.test(m.text()))errors.push(m.text());});
 await p.addInitScript(()=>{let build;Object.defineProperty(window,'ForesightOfficeRelief',{configurable:true,get:()=>build,set:fn=>{build=options=>{const group=fn(options);window.testRelief=group;return group;};}});});
 await p.goto(pathToFileURL(path.resolve(__dirname,'../apps/web/ai-office.html')).href);
 await p.waitForFunction(()=>window.testRelief&&window.ForesightOffice);
 const geometry=await p.evaluate(()=>{const m=testRelief.children.filter(x=>x.isMesh);return{holes:testRelief.userData.holes,types:m.map(x=>x.geometry.type),box:new THREE.Box3().setFromObject(testRelief).getSize(new THREE.Vector3()).toArray(),boards:testRelief.parent.children.filter(x=>x.name==='illuminated-brand-sign').length};});
 assert.ok(geometry.holes>=8);assert.deepEqual(geometry.types,['ExtrudeGeometry','ExtrudeGeometry']);assert.ok(geometry.box[2]>.2);assert.equal(geometry.boards,0);
 for(const theme of ['light','dark']){if(await p.locator('body').getAttribute('data-theme')!==theme)await p.locator('#theme').click();await p.waitForTimeout(600);await p.screenshot({path:path.resolve(process.env.QA_OUTPUT||require('node:os').tmpdir(),`silver-tower-${theme}.png`)});}

 const sculpture=await p.evaluate(()=>{const g=testRelief.parent,bull=g.getObjectByName('bronze-bull'),b=new THREE.Box3().setFromObject(bull);return{maxZ:b.max.z,body:bull.getObjectByName('continuous-bronze-anatomy').geometry.index.count};});assert.ok(sculpture.maxZ<14,'Bull must clear road edge at z=14');assert.ok(sculpture.body>10000);
 await p.evaluate(()=>{const g=testRelief.parent;g.userData.tick(0,false);g.userData.tick(1000,false);g.userData.tick(4000,false);g.userData.tick(5000,false);});
 const sweep=await p.evaluate(()=>testRelief.parent.userData.flow.strength.value);assert.ok(sweep>0&&sweep<.3);
 await p.evaluate(()=>testRelief.parent.userData.tick(0,false));assert.equal(await p.evaluate(()=>testRelief.parent.userData.flow.strength.value),0);
 // Inspect the actual smooth sculpture from a close architectural detail camera.
 await p.evaluate(()=>{const source=testRelief.parent.getObjectByName('bronze-bull'),bull=source.clone(true),s=new THREE.Scene();s.background=new THREE.Color(0xdce6ec);bull.position.set(0,0,0);bull.rotation.y=-.25;bull.scale.setScalar(1);s.add(bull);s.add(new THREE.HemisphereLight(0xf0f7ff,0x77716a,2));const light=new THREE.DirectionalLight(0xffe5be,3);light.position.set(-4,8,5);s.add(light);const camera=new THREE.PerspectiveCamera(34,1.3,.1,100);camera.position.set(6,3.8,9);camera.lookAt(0,1.4,.4);const r=new THREE.WebGLRenderer({antialias:true});r.setSize(780,600);r.domElement.id='bull-detail-test';Object.assign(r.domElement.style,{position:'fixed',inset:'20px',zIndex:99999});document.body.append(r.domElement);r.render(s,camera);});
 await p.locator('#bull-detail-test').screenshot({path:path.resolve(process.env.QA_OUTPUT||require('node:os').tmpdir(),'bronze-bull-detail.png')});await p.locator('#bull-detail-test').evaluate(e=>e.remove());
 await p.locator('#zoomIn').click();await p.locator('#rotateRight').click();await p.waitForTimeout(600);assert.equal(await p.locator('#fallback').isVisible(),false);assert.deepEqual(errors,[]);
 console.log('PASS true extruded source-logo contours with holes and depth, no signboard, light/dark themes and orbit');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
