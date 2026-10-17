/* Original lightweight habitats, or contact shadows over the existing painted
 * world atlas. Painted scenery never substitutes for the actual 3D hero rig. */
export const habitats={
 immortal:{name:'雲間修習',sky:'#d9e7df',horizon:'#719b8b',ground:'#688f7c',key:'#fff0d2',fog:'#b5cec1'},
 garden:{name:'晨光花園',sky:'#e3ebce',horizon:'#88aa75',ground:'#719359',key:'#fff0c9',fog:'#bdcdaa'},
 mountain:{name:'山徑遠望',sky:'#d5e4ea',horizon:'#809b99',ground:'#758173',key:'#fff0d8',fog:'#c0d2d0'},
 space:{name:'星際航線',sky:'#09162d',horizon:'#263f68',ground:'#24364b',key:'#daeaff',fog:'#152b48'},
 castle:{name:'王國庭園',sky:'#eee1d5',horizon:'#b0a095',ground:'#879578',key:'#ffe7bb',fog:'#dac9bd'},
 pet:{name:'森林微光',sky:'#dce7df',horizon:'#91aca5',ground:'#718e82',key:'#fff2db',fog:'#bccfc2'},
 ocean:{name:'珊瑚淺海',sky:'#5cbbcb',horizon:'#245f85',ground:'#aaa478',key:'#ddfcff',fog:'#55a7b5'},
 gem:{name:'晶洞柔光',sky:'#28213e',horizon:'#5e537e',ground:'#655b78',key:'#ebddff',fog:'#504466'},
 train:{name:'綠野鐵道',sky:'#e9e5d5',horizon:'#9aaf91',ground:'#83926b',key:'#ffebc7',fog:'#c9cfaf'}
};
export function createHabitat(T,theme,stage,accent='#8cae9a',painted=false){
 const cfg=habitats[theme]||habitats.garden,group=new T.Group();group.name='Habitat '+theme;
 // The original painted worlds match the approved art direction. They are
 // explicitly scenery, never a flat image substituted for the 3D character.
 if(painted){
  const geometry=new T.PlaneGeometry(40,40),material=new T.ShadowMaterial({opacity:.18}),floor=new T.Mesh(geometry,material);floor.rotation.x=-Math.PI/2;floor.position.y=-.965;floor.receiveShadow=true;group.add(floor);
  return {group,cfg,update(){},dispose(){geometry.dispose();material.dispose();}};
 }
 let serial=0;const seed=theme.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+stage*73;
 const rand=()=>{const x=Math.sin(++serial*12.9898+seed)*43758.5453;return x-Math.floor(x);};
 const material=(color,roughness=.92)=>new T.MeshStandardMaterial({color,roughness});
 const mats={ground:material(cfg.ground),stone:material('#7b8984'),leaf:material(theme==='ocean'?'#438c87':'#577e61'),trunk:material('#76684d'),gold:material('#bca879',.6),accent:material(accent),cloud:material(theme==='gem'?'#7e7099':'#e2e8dc')};
 function mesh(g,m,pos,scale){const o=new T.Mesh(g,m);o.position.set(...pos);if(scale)o.scale.set(...scale);o.receiveShadow=true;group.add(o);return o;}
 const sphere=(pos,scale,m=mats.leaf)=>mesh(new T.SphereGeometry(1,20,12),m,pos,scale);
 const cylinder=(a,b,r,m=mats.trunk)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start);const o=mesh(new T.CylinderGeometry(r*.70,r,d.length,8),m,start.clone().add(end).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;};
 const ground=mesh(new T.CircleGeometry(18,64),mats.ground,[0,-.965,0]);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
 // Keep the foreground open and place the scenery behind the hero.
 if(['garden','pet','train','castle'].includes(theme)){
  for(let i=0;i<8;i++){const x=(i-3.5)*1.7,z=-3.6-rand()*4;sphere([x,-1.05,z],[2.0,.65+rand()*.7,1.7],i%2?mats.leaf:mats.ground);}
 }
 if(theme==='garden'||theme==='pet'){
  for(let i=0;i<5+stage;i++){
   const side=i%2?1:-1,x=side*(2.6+rand()*2.5),z=-3.5-rand()*3,h=1.2+rand()*1.8;
   cylinder([x,-.94,z],[x,h-.9,z],.09);sphere([x,h-.35,z],[.45,.65,.42],mats.leaf);
   cylinder([x,h-1.2,z],[x+.26,h-.6,z],.045);sphere([x+.25,h-.50,z],[.32,.42,.30],mats.leaf);
   if(theme==='garden')for(let j=0;j<2+stage;j++)sphere([x+(rand()-.5),-.63+rand()*.25,z+.8+rand()],[.05,.045,.05],j%2?mats.accent:mats.cloud);
  }
 }
 if(theme==='mountain'||theme==='immortal'){
  for(let row=0;row<2;row++)for(let i=0;i<7;i++){
   const x=(i-3)*2.3+(row?1:0),h=2+rand()*3,z=-5-row*4;
   const mountain=mesh(new T.ConeGeometry(2.6,h,5),row?mats.cloud:mats.stone,[x,-.95+h/2,z]);mountain.rotation.y=rand();
   if(theme==='mountain')mesh(new T.ConeGeometry(.60,h*.24,5),mats.cloud,[x,-.95+h*.88,z]);
  }
  if(theme==='immortal')for(let i=0;i<12;i++)sphere([(rand()-.5)*10,.2+rand()*1.8,-3-rand()*5],[.8+rand(),.16,.3],mats.cloud);
 }
 if(theme==='space'){
  ground.material=mats.stone;ground.scale.setScalar(.65);
  for(let i=0;i<4;i++)sphere([(i%2?1:-1)*(1.9+rand()*2),.6+rand()*2.3,-4-rand()*4],[.4+rand()*.4,.4+rand()*.4,.4+rand()*.4],i%2?mats.accent:mats.stone);
  const orbit=mesh(new T.TorusGeometry(2.0,.012,6,80),mats.gold,[0,.4,-5]);orbit.rotation.x=.8;orbit.rotation.y=.4;
 }
 if(theme==='castle'){
  const wall=material('#cabd9f'),roof=material(accent);
  for(let i=0;i<3+stage;i++){
   const x=(i-(2+stage)/2)*.8,h=1.0+(i%2)*.7;
   mesh(new T.CylinderGeometry(.25,.27,h,12),wall,[x,-.95+h/2,-4]);mesh(new T.ConeGeometry(.36,.65,12),roof,[x,-.95+h+.32,-4]);
  }
  for(let i=0;i<6;i++)sphere([(i-2.5)*1.4,-.6,-2.8],[.55,.35,.45],mats.leaf);
 }
 if(theme==='ocean'){
  for(let i=0;i<8+stage;i++){
   const x=(i%2?1:-1)*(1.5+rand()*3),z=-1.8-rand()*4;
   sphere([x,-.87,z],[.5,.15,.4],mats.stone);
   for(let j=0;j<3;j++){const h=.3+rand()*.6,end=[x+(j-1)*.13,-.90+h,z];cylinder([x,-.94,z],end,.025,j%2?mats.accent:mats.cloud);}
  }
 }
 if(theme==='gem'){
  for(let i=0;i<9+stage;i++){
   const x=(i%2?1:-1)*(1.4+rand()*3),z=-2-rand()*4,h=.5+rand()*1.8;
   const crystal=mesh(new T.CylinderGeometry(0,.16+rand()*.15,h,5),i%2?mats.accent:mats.cloud,[x,-.9+h/2,z]);crystal.rotation.z=(rand()-.5)*.35;
  }
  for(let i=0;i<8;i++){const a=i*Math.PI/7;sphere([Math.cos(a)*3.6,-.8+Math.sin(a)*4,-5],[.7,1,.6],mats.stone);}
 }
 if(theme==='train'){
  for(const x of [-.43,.43])mesh(new T.BoxGeometry(.035,.035,14),mats.gold,[x,-.935,-4]);
  for(let i=0;i<30;i++)mesh(new T.BoxGeometry(1.16,.025,.10),mats.trunk,[0,-.95,1.4-i*.43]);
  if(stage>=2){mesh(new T.BoxGeometry(.9,.70,.65),mats.cloud,[2.3,-.60,-3.2]);mesh(new T.ConeGeometry(.8,.45,4),mats.accent,[2.3,-.03,-3.2]).rotation.y=Math.PI/4;}
 }
 const positions=new Float32Array(80*3);for(let i=0;i<80;i++){positions[i*3]=(rand()-.5)*12;positions[i*3+1]=-.4+rand()*6;positions[i*3+2]=-2-rand()*8;}
 const geom=new T.BufferGeometry();geom.setAttribute('position',new T.BufferAttribute(positions,3));
 const points=new T.Points(geom,new T.PointsMaterial({color:theme==='space'?'#e6e9ff':theme==='ocean'?'#c6ffff':'#f6e4b0',size:theme==='space'?.027:.018,transparent:true,opacity:theme==='space'?.8:.35,depthWrite:false}));group.add(points);
 return {group,cfg,update(time){points.rotation.y=Math.sin(time*.06)*.025;},dispose(){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of new Set([...Object.values(mats),...materials]))m.dispose();}};
}
