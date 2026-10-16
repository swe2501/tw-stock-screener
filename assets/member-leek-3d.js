/* Original, procedural 3D art study. Opt-in preview; not an approved replacement for the illustrated cast. */
(() => {'use strict';
let library;
function create(host,options){
 const layer=host.querySelector('.mt-character-layer'),canvas=document.createElement('canvas');canvas.className='mt-companion-canvas mt-leek-canvas';canvas.setAttribute('aria-hidden','true');layer.append(canvas);
 const media=matchMedia('(prefers-reduced-motion: reduce)'),style=['calm','playful','cinematic'].includes(options.sceneStyle)?options.sceneStyle:'calm';
 let T,renderer,scene,camera,plant,body,arms=[],leaves=[],eyes=[],halo,cloak,collar,clouds,particles,pedestal,ground,key,fill,frame=0,dead=false,visible=false,started=false,last=0,elapsed=0,growth=0,targetGrowth=0,action='enter',actionStart=0,yaw=0,orbit=0,pointerX=0,pointerY=0,smoothX=0,smoothY=0,fallback=null,degrading=false;
 let sage,sageEyes=[],sageArms=[],sageHair=[],landscape,skyOrb,shrine,tree,ascension,night=false;
 const resources={geometry:new Set(),material:new Set()},moving=()=>options.mode!=='static'&&!media.matches;
 function material(color,extra={}){const m=new T.MeshStandardMaterial({color,roughness:.5,...extra});resources.material.add(m);return m;}
 function mesh(geometry,mat,parent=plant){resources.geometry.add(geometry);const obj=new T.Mesh(geometry,mat);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
 function ball(radius,mat,parent=plant,scale=[1,1,1]){const obj=mesh(new T.SphereGeometry(radius,32,24),mat,parent);obj.scale.set(...scale);return obj;}
 function tube(points,radius,mat,parent=plant){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(new T.TubeGeometry(curve,32,radius,8,false),mat,parent);}
 function leaf(length,width,bend,angle,green){const group=new T.Group();group.rotation.y=angle;group.position.set(0,.42,0);plant.add(group);const positions=[],colors=[],indices=[],segments=28,across=8;
  for(let i=0;i<=segments;i++){const t=i/segments,w=Math.pow(Math.sin(Math.PI*t),.72)*width;for(let j=0;j<=across;j++){const s=j/across*2-1;positions.push(s*w,t*length,bend*t*t+Math.sin(Math.PI*t)*.055+s*s*.08*Math.sin(Math.PI*t));const color=new T.Color('#d4daa0').lerp(new T.Color(green),Math.min(1,t*3));color.multiplyScalar(1-Math.abs(s)*.11);colors.push(color.r,color.g,color.b);if(i<segments&&j<across){const a=i*(across+1)+j,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,material('#ffffff',{vertexColors:true,side:T.DoubleSide,roughness:.43}),group);
  tube(Array.from({length:18},(_,i)=>{const t=i/17;return [0,t*length,bend*t*t+Math.sin(Math.PI*t)*.055+.006];}),.006,material('#c7d98d',{roughness:.4}),group);group.userData={phase:angle,length};leaves.push(group);return group;
 }
 function buildWorld(){
  landscape=new T.Group();scene.add(landscape);
  const jade=material('#547d80',{roughness:.95}),distant=material('#92aeb0',{roughness:1}),stone=material('#d2d4be',{roughness:.82}),gold=material('#d9bd80',{metalness:.65,roughness:.32});
  // Actual scenery behind the companion, with layered silhouettes and parallax on orbit.
  for(let i=0;i<11;i++){const back=i<6,x=back?(i-2.5)*1.8:(i-8)*2.1,h=back?2.4+(i%3)*.7:1.9+(i%2)*1.0;
   const peak=mesh(new T.ConeGeometry(back?.95:.65,h,7),back?distant:jade,landscape);peak.position.set(x,-1.1+h/2,back?-6:-3.8);peak.rotation.y=i*.7;peak.scale.z=.65;
   const cap=mesh(new T.ConeGeometry(back?.25:.19,h*.25,7),stone,landscape);cap.position.copy(peak.position);cap.position.y+=h*.38;cap.rotation.y=peak.rotation.y;cap.scale.z=.65;
  }
  const mistMat=material('#e4eeea',{transparent:true,opacity:.32,roughness:1,depthWrite:false});
  for(let i=0;i<9;i++){const cloud=ball(.8,mistMat,landscape,[2.5,.15,.45]);cloud.position.set((i%3-1)*2.7,-.10+Math.floor(i/3)*.60,-2.4-Math.floor(i/3)*1.5);cloud.userData.cloud=true;cloud.userData.origin=cloud.position.x;}
  skyOrb=ball(.39,material('#fff0c7',{emissive:'#e9c88b',emissiveIntensity:.7,roughness:1}),landscape);skyOrb.position.set(2.25,2.35,-4.8);
  shrine=new T.Group();landscape.add(shrine);shrine.position.set(-1.8,-.72,-2.2);shrine.rotation.y=.22;
  for(let i=0;i<3;i++){const step=mesh(new T.CylinderGeometry(.55-i*.07,.57-i*.07,.08,8),stone,shrine);step.position.y=i*.08;}
  for(const x of [-.31,.31])for(const z of [-.26,.26]){const pillar=mesh(new T.CylinderGeometry(.025,.035,.7,12),gold,shrine);pillar.position.set(x,.57,z);}
  for(let i=0;i<2;i++){const roof=mesh(new T.ConeGeometry(.68-i*.15,.27,4),jade,shrine);roof.rotation.y=Math.PI/4;roof.scale.z=.9;roof.position.y=1.03+i*.24;}
  const finial=ball(.045,gold,shrine);finial.position.y=1.47;
  tree=new T.Group();landscape.add(tree);tree.position.set(1.8,-.77,-1.8);
  const bark=material('#6c625d',{roughness:.85}),bloom=material('#dcbfc9',{roughness:.8});
  tube([[0,0,0],[-.1,.6,0],[.03,1.1,.03],[-.09,1.4,.02]],.045,bark,tree);
  for(let i=0;i<5;i++){const a=i*2.4;const end=[Math.cos(a)*(.32+i*.02),.85+i*.11,Math.sin(a)*.23];tube([[0,.5,0],[end[0]*.5,end[1]-.1,end[2]*.5],end],.018,bark,tree);const tuft=ball(.22,bloom,tree,[1.3,.55,1]);tuft.position.set(...end);}
  ascension=new T.Group();scene.add(ascension);const glow=material('#efdba4',{emissive:'#e1b25a',emissiveIntensity:1.1,transparent:true,opacity:.65,depthWrite:false});
  for(let i=0;i<3;i++){const ring=mesh(new T.TorusGeometry(.85+i*.16,.009,8,100),glow,ascension);ring.rotation.x=Math.PI/2+i*.18;ring.position.y=-.4+i*.55;}
 }
 function buildSage(){
  sage=new T.Group();scene.add(sage);
  const skin=material('#f4dcc0',{roughness:.48}),hair=material(options.row===1?'#344d50':'#e1e3d7',{roughness:.57}),robe=material(options.row===0?'#b9acd3':options.row===1?'#6698a8':'#8eafa0',{roughness:.58}),ivory=material('#eee8d5',{roughness:.65}),gold=material('#dabd7e',{metalness:.67,roughness:.3}),ink=material('#293b3b',{roughness:.18}),white=material('#fff6df');
  const head=ball(.32,skin,sage,[.95,1.08,.88]);head.position.set(0,.67,.025);
  const crown=ball(.33,hair,sage,[1, .76,.84]);crown.position.set(0,.85,-.045);
  const bun=ball(.13,hair,sage,[.9,1.2,.9]);bun.position.set(0,1.13,-.08);const pin=mesh(new T.CylinderGeometry(.012,.012,.48,10),gold,sage);pin.position.set(0,1.12,-.06);pin.rotation.z=1.45;
  const jewel=ball(.037,gold,sage);jewel.position.set(0,.91,.274);
  const aureole=mesh(new T.TorusGeometry(.48,.008,8,96),gold,sage);aureole.position.set(0,.74,-.29);
  for(const side of [-1,1]){
   const lock=new T.Group();sage.add(lock);lock.position.set(side*.27,.8,-.04);tube([[0,0,0],[side*.05,-.43,-.04],[side*.13,-.82,-.10]],.055,hair,lock);sageHair.push(lock);
   const fringe=ball(.15,hair,sage,[1.0,.65,.35]);fringe.position.set(side*.15,.89,.20);fringe.rotation.z=side*.32;
   const eye=ball(.047,ink,sage,[.86,1.15,.5]);eye.position.set(side*.119,.68,.275);sageEyes.push(eye);const dot=ball(.013,white,eye);dot.position.set(-.011,.019,.032);
   const cheek=ball(.045,material('#e8a39e',{transparent:true,opacity:.50}),sage,[1,.45,.12]);cheek.position.set(side*.21,.57,.23);
   const sleeve=new T.Group();sage.add(sleeve);sleeve.position.set(side*.22,.26,0);const fabric=mesh(new T.CylinderGeometry(.10,.18,.42,40,1,false),robe,sleeve);fabric.position.set(side*.12,-.12,0);fabric.rotation.z=side*.62;const hand=ball(.052,skin,sleeve);hand.position.set(side*.25,-.28,.065);sageArms.push(sleeve);
  }
  tube([[-.045,.55,.29],[0,.535,.296],[.045,.55,.29]],.008,ink,sage);
  const dress=mesh(new T.CylinderGeometry(.19,.44,.83,64),robe,sage);dress.position.y=-.19;
  const inner=mesh(new T.ConeGeometry(.34,.88,48),ivory,sage);inner.position.set(0,-.18,.09);inner.scale.z=.6;
  for(const side of [-1,1])tube([[side*.14,.28,.15],[0,.05,.25],[side*.16,-.46,.34],[side*.24,-.60,.31]],.014,gold,sage);
  const belt=mesh(new T.TorusGeometry(.235,.022,10,64),gold,sage);belt.rotation.x=Math.PI/2;belt.position.y=-.03;
  const hem=mesh(new T.TorusGeometry(.44,.012,8,80),gold,sage);hem.rotation.x=Math.PI/2;hem.position.y=-.60;
  // One small jade shoot recalls the original companion after the human transformation.
  for(const side of [-1,1]){const sprout=ball(.09,material('#86aa75',{roughness:.5}),sage,[.35,1,.3]);sprout.position.set(side*.04,1.28,-.08);sprout.rotation.z=side*-.4;}
 }
 function build(){
  const cream=material('#fbf0d3',{roughness:.38}),rootMat=material('#c2ab70'),dark=material('#25201f',{roughness:.16}),shine=material('#ffffff',{roughness:.1}),pink=material('#e9a08c',{transparent:true,opacity:.57}),gold=material('#d8b876',{metalness:.7,roughness:.28}),accent=material(options.row===0?'#9479b4':options.row===1?'#477c8d':'#6e9a7e',{roughness:.56});
  plant=new T.Group();scene.add(plant);
  const outline=[[.025,-.48],[.17,-.44],[.32,-.30],[.40,-.08],[.395,.16],[.31,.36],[.18,.52],[.105,.59]].map(([x,y])=>new T.Vector2(x,y));const profile=new T.CatmullRomCurve3(outline.map(v=>new T.Vector3(v.x,v.y,0)));body=mesh(new T.LatheGeometry(profile.getPoints(80).map(v=>new T.Vector2(Math.max(.005,v.x),v.y)),80),cream);
  for(const side of [-1,1]){const eye=ball(.077,dark,plant,[.76,1.15,.43]);eye.position.set(side*.155,.12,.358);eyes.push(eye);const glint=ball(.022,shine,eye,[1,1,.8]);glint.position.set(-.023,.029,.068);const glint2=ball(.009,shine,eye);glint2.position.set(.021,-.025,.068);const cheek=ball(.058,pink,plant,[1,.5,.13]);cheek.position.set(side*.27,-.015,.307);
   const arm=new T.Group();arm.position.set(side*.32,-.12,.025);plant.add(arm);tube([[0,0,0],[side*.14,-.065,.06],[side*.15,-.16,.11]],.035,cream,arm);const hand=ball(.05,cream,arm,[1,.8,1]);hand.position.set(side*.15,-.16,.11);arms.push(arm);
   tube([[side*.12,-.4,0],[side*.18,-.55,.05],[side*.16,-.66,.11],[side*.24,-.68,.17]],.018,rootMat);
   for(let i=0;i<3;i++)tube([[side*.07,-.44,-.04],[side*(.06+i*.04),-.59,-.05],[side*(.09+i*.07),-.67,-.08]],.006,rootMat);
  }
  tube([[-.075,-.065,.38],[0,-.11,.398],[.075,-.065,.38]],.011,dark);const nose=ball(.022,cream,plant,[1,.65,1]);nose.position.set(0,.005,.397);
  leaf(1.25,.13,-.26,-.2,'#5b8d45').rotation.z=-.27;leaf(1.46,.105,-.17,1.1,'#83ab4e').rotation.z=.04;leaf(1.10,.14,-.50,2.2,'#548b5b').rotation.z=.39;leaf(.94,.13,-.37,3.6,'#a6b95f').rotation.z=-.4;leaf(1.17,.115,-.19,4.7,'#608e42').rotation.z=.19;
  collar=new T.Group();plant.add(collar);const scarf=mesh(new T.TorusGeometry(.27,.043,12,64),accent,collar);scarf.rotation.x=Math.PI/2;scarf.position.y=-.19;const pendant=ball(.046,gold,collar,[.7,1,.35]);pendant.position.set(0,-.25,.32);tube([[.02,-.2,.21],[.10,-.35,.26],[.18,-.48,.24]],.038,accent,collar);
  cloak=new T.Group();plant.add(cloak);const skirt=mesh(new T.CylinderGeometry(.27,.51,.54,64,1,true),material('#668a79',{side:T.DoubleSide,roughness:.7}),cloak);skirt.position.set(0,-.32,-.035);const trim=mesh(new T.TorusGeometry(.50,.014,8,64),gold,cloak);trim.rotation.x=Math.PI/2;trim.position.y=-.59;
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;tube([[Math.cos(a)*.28,-.07,Math.sin(a)*.28],[Math.cos(a)*.37,-.3,Math.sin(a)*.37],[Math.cos(a)*.5,-.58,Math.sin(a)*.5]],.006,gold,cloak);}
  halo=new T.Group();halo.position.set(0,.88,-.22);plant.add(halo);const ring=mesh(new T.TorusGeometry(.58,.014,10,100),gold,halo);ring.rotation.x=.12;for(let i=0;i<12;i++){const a=i/12*Math.PI*2,o=ball(.023,gold,halo);o.position.set(Math.cos(a)*.58,Math.sin(a)*.58,0);}
  clouds=new T.Group();scene.add(clouds);const cloudMat=material('#f4f4de',{roughness:.85});for(let i=0;i<9;i++){const a=i/9*Math.PI*2,o=ball(.23,cloudMat,clouds,[1.2,.55,1]);o.position.set(Math.cos(a)*.52,-.64+Math.sin(a*2)*.04,Math.sin(a)*.34);}
  pedestal=new T.Group();scene.add(pedestal);const stone=mesh(new T.CylinderGeometry(1.12,1.18,.16,96),material('#668c7d',{roughness:.85}),pedestal);stone.position.y=-.85;const moss=mesh(new T.CylinderGeometry(1.08,1.10,.055,96),material('#8ca279',{roughness:.94}),pedestal);moss.position.y=-.75;const rim=mesh(new T.TorusGeometry(1.13,.012,8,96),gold,pedestal);rim.rotation.x=Math.PI/2;rim.position.y=-.80;
  const rock=material('#b0b3a4',{roughness:.95});for(let i=0;i<13;i++){const a=i*2.39996,o=ball(.06+(i%3)*.02,rock,pedestal,[1.4,.6,1]);o.position.set(Math.cos(a)*(.8+(i%2)*.12),-.69,Math.sin(a)*(.8+(i%2)*.12));}
  const fern=material('#658e69',{roughness:.77,side:T.DoubleSide});for(let i=0;i<9;i++){const a=i/9*Math.PI*2;for(let j=0;j<3;j++){const o=ball(.1,fern,pedestal,[.34,1.5,.20]);o.position.set(Math.cos(a)*.93,-.6+j*.02,Math.sin(a)*.93);o.rotation.set(.2+j*.23,a,j*.5);}}
  const particleGeometry=new T.SphereGeometry(.012,8,6);resources.geometry.add(particleGeometry);const particleMat=material('#f6d899',{emissive:'#ba9c3a',emissiveIntensity:1.2,roughness:.2});particles=new T.Group();scene.add(particles);for(let i=0;i<32;i++){const o=mesh(particleGeometry,particleMat,particles);o.userData={angle:i*2.39996,height:(i%13)/13*2.8-.6,radius:.8+(i%7)*.12};}
 }
 function palette(){if(!renderer)return;night=document.documentElement.dataset.theme==='dark'||document.body.classList.contains('dark');scene.background=new T.Color(night?'#0d242b':'#dfebe4');scene.fog=new T.Fog(scene.background,7,15);if(ground)ground.material.color.set(night?'#1b383a':'#b6c9ba');key.intensity=night?3.6:3.2;fill.intensity=night?1.6:1.1;render(performance.now(),true);}
 function resize(){if(!renderer||dead)return;const r=layer.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,options.mode==='lite'?1:1.5));renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render(performance.now(),true);}
 async function initialize(){if(started||dead)return;started=true;try{library||=import('./vendor/three-0.180.0/three.module.min.js');T=await library;if(dead)return;renderer=new T.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'low-power'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;renderer.shadowMap.enabled=options.mode!=='lite';renderer.shadowMap.type=T.PCFSoftShadowMap;
  scene=new T.Scene();camera=new T.PerspectiveCamera(34,1,.1,30);camera.position.set(0,.72,5.7);camera.lookAt(0,.49,0);scene.add(new T.HemisphereLight('#e5f3ff','#40523e',2.25));key=new T.DirectionalLight('#ffefcf',3.2);key.position.set(-2.4,4.5,3.5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=4;key.shadow.camera.bottom=-2;key.shadow.normalBias=.035;scene.add(key);fill=new T.DirectionalLight('#a6e6e0',1.1);fill.position.set(3,2,-2);scene.add(fill);
  ground=mesh(new T.PlaneGeometry(200,200),material('#b6c9ba',{roughness:1}),scene);ground.rotation.x=-Math.PI/2;ground.position.y=-.95;ground.castShadow=false;build();buildSage();buildWorld();palette();host.dataset.renderer='leek-3d-study';host.classList.add('mt-rig-ready','mt-leek-ready');resize();schedule();
 }catch{downgrade();}}
 function render(now,forced=false){if(dead||!renderer||!forced&&(!visible||document.hidden))return;const dt=last?Math.min(.06,(now-last)/1000):0;last=now;const move=moving();if(move)elapsed+=dt;const t=elapsed,blend=move?1-Math.exp(-dt/.18):1;smoothX+=(pointerX-smoothX)*blend;smoothY+=(pointerY-smoothY)*blend;growth+=(targetGrowth-growth)*(move?1-Math.exp(-dt/1.1):1);
  const life=move?1:0,phase=(now-actionStart)/1000,duration=['evolve','celebrate'].includes(action)?3.5:2.4,active=move&&phase<duration?Math.sin(Math.PI*Math.max(0,phase)/duration):0;if(phase>=duration&&action!=='idle'){action='idle';host.dataset.modelAction='idle';}
  const playful=style==='playful',cinematic=style==='cinematic',ambient=playful?Math.max(0,Math.sin(t*.63))**12:0,breath=Math.sin(t*1.7)*.013*life;
  const becoming=T.MathUtils.smoothstep(growth,.52,.96),remaining=Math.max(.001,1-becoming);
  plant.visible=becoming<.999;plant.scale.set((1+breath*.35)*remaining,(1+breath)*remaining,(1+breath*.35)*remaining);plant.position.y=life*(Math.sin(t*.8)*.012+ambient*.085)+(action==='enter'&&move?-(1-Math.min(1,Math.max(0,phase)/1.6))*.20:0);plant.rotation.y=smoothX*.15+(playful?Math.sin(t*.45)*.10:Math.sin(t*.2)*.025)*life;
  sage.visible=becoming>.001;sage.scale.setScalar(Math.max(.001,becoming));sage.position.y=.10*becoming+Math.sin(t*.8)*.025*life;sage.rotation.y=plant.rotation.y;
  sageEyes.forEach(e=>{e.scale.y=1.15*(.13+.87*(move?Math.min(1,Math.abs(Math.sin(t*.66))/.045):1));});
  sageArms.forEach((a,i)=>{a.rotation.z=(i===0?1:-1)*(Math.sin(t*.8)*.035*life+active*(action==='interact'?.48:action==='celebrate'?.75:.12));});sageHair.forEach((h,i)=>{h.rotation.z=Math.sin(t*.8+i)*.04*life;});
  shrine.scale.setScalar(.55+growth*.45);tree.scale.setScalar(.65+growth*.35);skyOrb.material.emissiveIntensity=.5+growth*.7;tree.rotation.z=Math.sin(t*.5)*.014*life;
  landscape.children.forEach(o=>{if(o.userData.cloud)o.position.x=o.userData.origin+Math.sin(t*.12+o.userData.origin)*.16*life;});
  ascension.visible=growth>.35||active>.1;ascension.rotation.y=t*.23*life;ascension.scale.setScalar(.65+growth*.35+active*.12);ascension.children.forEach((r,i)=>{r.rotation.z=t*(.1+i*.07)*life;r.material.opacity=.16+becoming*.18+active*.32;});
  scene.background.set(night?'#0d242b':'#dfebe4').lerp(new T.Color(night?'#1b203f':'#e9e0eb'),becoming);scene.fog.color.copy(scene.background);
  host.dataset.modelForm=becoming>.98?'immortal':becoming>.02?'ascending':'leek';host.dataset.modelWorld=growth>.8?'celestial':growth>.35?'cloud-mountains':'garden';
  leaves.forEach((l,i)=>{l.rotation.x=Math.sin(t*1.25+i*.8)*.035*life+smoothY*.025;l.rotation.y=l.userData.phase+Math.sin(t*.84+i)*.045*life;});
  eyes.forEach(e=>{const blink=move?Math.min(1,Math.abs(Math.sin(t*.66))/.045):1;e.scale.y=1.15*(.13+.87*blink);});
  arms.forEach((a,i)=>{a.rotation.z=(i===0?1:-1)*(Math.sin(t*1.1)*.025*life+ambient*.18+(action==='interact'?active*Math.sin(phase*6)*.45:action==='celebrate'?active*.7:0));});
  const reveal=(group,start)=>{const k=T.MathUtils.smoothstep(growth,start,start+.18);group.visible=k>.001;group.scale.setScalar(Math.max(.001,k));};reveal(collar,.08);reveal(cloak,.33);reveal(halo,.61);reveal(clouds,.65);halo.rotation.z=t*.10*life;halo.position.y=.88+Math.sin(t*.9)*.025*life;clouds.rotation.y=t*.05*life;
  particles.children.forEach((o,i)=>{const d=o.userData,a=d.angle+t*(.08+i%3*.025)*life;o.position.set(Math.cos(a)*d.radius,d.height+Math.sin(t*.7+i)*.08*life,Math.sin(a)*d.radius-.35);o.scale.setScalar(.7+Math.sin(t*1.5+i)*.25*life);});
  yaw+=(orbit-yaw)*blend;const cameraArc=life*(cinematic?Math.sin(t*.18)*.22:Math.sin(t*.13)*.035),angle=yaw+cameraArc+smoothX*.035,dist=(camera.aspect<.9?6.2:5.7)+(action==='evolve'?-active*.32:action==='interact'?-active*.13:0);camera.position.set(Math.sin(angle)*dist,.72+smoothY*.055+Math.sin(t*.17)*.025*life,Math.cos(angle)*dist);camera.lookAt(0,.49,0);renderer.render(scene,camera);host.dataset.sceneStyle=style;host.dataset.modelStage=String(Math.round(targetGrowth*4));
 }
 function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
 function schedule(){if(frame||dead||!renderer||!visible||!moving()||document.hidden)return;let previous=0;const tick=now=>{frame=0;if(dead||!visible||document.hidden)return;if(options.mode!=='lite'||now-previous>=32){render(now);previous=now;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}
 function release(){stop();for(const g of resources.geometry)g.dispose();for(const m of resources.material)m.dispose();resources.geometry.clear();resources.material.clear();renderer?.dispose();renderer?.forceContextLoss();renderer=null;}
 function downgrade(){if(dead||degrading||fallback)return;degrading=true;release();canvas.remove();host.classList.remove('mt-rig-ready','mt-leek-ready');host.dataset.renderer='illustrated';fallback=window.AcademyCompanionRig?.create(host,options);fallback?.setStage(Math.floor(targetGrowth*4),false);fallback?.setVisible(visible);const caption=host.querySelector('.mt-interaction-caption');if(caption)caption.textContent='3D 暫時無法顯示，已保留原插畫互動。';}
 const contextLost=e=>{e.preventDefault();downgrade();};canvas.addEventListener('webglcontextlost',contextLost);
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(layer);const preference=()=>{stop();if(!moving()){pointerX=pointerY=smoothX=smoothY=orbit=yaw=0;}render(performance.now(),true);schedule();};media.addEventListener('change',preference);const visibility=()=>{if(document.hidden)stop();else if(visible){last=0;schedule();}};document.addEventListener('visibilitychange',visibility);const themeObserver=new MutationObserver(palette);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});themeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 return {setVisible(v){visible=v;if(fallback){fallback.setVisible(v);return;}if(v){initialize();last=0;render(performance.now(),true);schedule();}else stop();},setStage(v){if(fallback)fallback.setStage(v);targetGrowth=Math.max(0,Math.min(1,v/4));if(!moving())render(performance.now(),true);},setProgress(v){if(fallback)fallback.setStage(Math.floor(v*4));targetGrowth=Math.max(0,Math.min(1,v));if(!moving())render(performance.now(),true);},react(name){if(fallback){fallback.react(name);return;}action=name;actionStart=performance.now();host.dataset.modelAction=name;render(performance.now(),true);schedule();},pointer(x,y){if(fallback)fallback.pointer(x,y);if(moving()){pointerX=x;pointerY=y;}},orbit(delta){if(moving())orbit=Math.max(-.85,Math.min(.85,orbit+delta));},destroy(){if(dead)return;dead=true;stop();canvas.removeEventListener('webglcontextlost',contextLost);fallback?.destroy();resizeObserver.disconnect();themeObserver.disconnect();media.removeEventListener('change',preference);document.removeEventListener('visibilitychange',visibility);release();canvas.remove();host.classList.remove('mt-rig-ready','mt-leek-ready');delete host.dataset.renderer;}};
}
window.AcademyLeek3D={create};
})();
