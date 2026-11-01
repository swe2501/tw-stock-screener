/* Original stepped, three-wing financial tower and bronze plaza sculpture. All meshes are local. */
(()=>{'use strict';
window.ForesightArchitecture.build=function(ctx){
const {THREE,tower,material,box,cylinder,textPlane,roofY,dark,renderer}=ctx,g=new THREE.Group();tower.add(g);g.name='foresight-landmark';
// A bright sky reflection is essential: bare metallic surfaces reflect black without an environment.
const sky=document.createElement('canvas');sky.width=512;sky.height=256;const skyCtx=sky.getContext('2d'),skyGradient=skyCtx.createLinearGradient(0,0,0,256);skyGradient.addColorStop(0,'#7196b9');skyGradient.addColorStop(.38,'#d6e9f5');skyGradient.addColorStop(.55,'#f7fafc');skyGradient.addColorStop(1,'#a5b5bf');skyCtx.fillStyle=skyGradient;skyCtx.fillRect(0,0,512,256);skyCtx.fillStyle='#ffffff';skyCtx.fillRect(45,20,32,140);skyCtx.fillStyle='#e9f3fb';skyCtx.fillRect(290,40,72,120);
const skyTexture=new THREE.CanvasTexture(sky);skyTexture.mapping=THREE.EquirectangularReflectionMapping;skyTexture.colorSpace=THREE.SRGBColorSpace;const pmrem=new THREE.PMREMGenerator(renderer),reflection=pmrem.fromEquirectangular(skyTexture),envMap=reflection.texture;pmrem.dispose();skyTexture.dispose();g.userData.reflection=reflection;
const glass=new THREE.MeshPhysicalMaterial({color:0x7897ad,metalness:.69,roughness:.24,clearcoat:.35,clearcoatRoughness:.18,envMap,envMapIntensity:.22,emissive:0x6e92aa,emissiveIntensity:.015}),silver=new THREE.MeshStandardMaterial({color:0xc4d1d9,metalness:.88,roughness:.25,envMap,envMapIntensity:.55}),gold=new THREE.MeshStandardMaterial({color:0xc7ad79,metalness:.65,roughness:.3,envMap}),stone=material('stone'),lightWindow=new THREE.MeshStandardMaterial({color:0xc3dce5,emissive:0xffd697,emissiveIntensity:.15,transparent:true,opacity:.65});
const edgeLight=new THREE.MeshBasicMaterial({color:0xb0d9ec,transparent:true,opacity:.4});g.userData.lightWindow=lightWindow;g.userData.edgeLight=edgeLight;
function mesh(geometry,mat,x,y,z,parent=g){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function beam(points,r,mat,parent=g){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(10,points.length*6),r,6,false),mat,0,0,0,parent);}
// The skyline rises through staggered setbacks. Internal eight department floors remain unchanged.
const height=roofY+7.7,tiers=15,base=4.2,step=(height-base)/tiers;
for(let i=0;i<tiers;i++){
 const y=base+i*step,r=5.8*Math.pow(1-i/(tiers+1),.78),tier=new THREE.Group();tier.name='setback-'+i;g.add(tier);
 mesh(new THREE.CylinderGeometry(r*.66,r*.68,step,48),glass,0,y+step/2,0,tier);
 for(let wing=0;wing<3;wing++){
  const a=wing*Math.PI*2/3+(Math.floor(i/3)%3)*.055,len=r*(.8-(i%3)*.055),cx=Math.sin(a)*len*.56,cz=Math.cos(a)*len*.56,wr=r*.43;
  const body=mesh(new THREE.CylinderGeometry(wr*.98,wr,step,40),glass,cx,y+step/2,cz,tier);body.scale.z=1.32;body.rotation.y=a;
  // Closely spaced metallic rings and fluting create readable reflected light at every view angle.
  for(let row=0;row<5;row++){const ring=mesh(new THREE.TorusGeometry(wr+.025,.014,4,40),row===4?silver:silver,cx,y+(row+.15)*step/5,cz,tier);ring.rotation.x=Math.PI/2;ring.scale.y=1.32;ring.rotation.z=-a;}
  for(let k=0;k<16;k++){const theta=k*Math.PI*2/16,ex=Math.cos(theta)*wr,ez=Math.sin(theta)*wr*1.32,x=cx+ex*Math.cos(a)+ez*Math.sin(a),z=cz-ex*Math.sin(a)+ez*Math.cos(a);cylinder(tier,x,y,z,.016,step,k%4===0?edgeLight:silver,5);if((k*7+i*11+wing*3)%9<2){const win=mesh(new THREE.PlaneGeometry(wr*.18,step*.38),lightWindow,x,y+step*.59,z,tier);win.rotation.y=Math.atan2(x-cx,z-cz);}}
  const cap=mesh(new THREE.CylinderGeometry(wr,wr,.055,40),silver,cx,y+step+.025,cz,tier);cap.scale.z=1.32;cap.rotation.y=a;
 }
 const ring=mesh(new THREE.TorusGeometry(r*.68+.02,.025,5,48),silver,0,y+step,0,tier);ring.rotation.x=Math.PI/2;
}
// A long polished needle finishes the silhouette, rather than a flat rooftop.
mesh(new THREE.CylinderGeometry(.06,.49,6.4,24),silver,0,height+3.2,0);mesh(new THREE.ConeGeometry(.065,4,16),gold,0,height+8.4,0);
// Low ceremonial podium and a broad, unobstructed entrance boulevard.
for(let i=0;i<3;i++){const p=mesh(new THREE.CylinderGeometry(10.3-i*.7,10.5-i*.7,1.1,72),glass,0,.55+i*1.12,0);p.scale.z=.82;const ring=mesh(new THREE.TorusGeometry(10.4-i*.7,.06,6,72),silver,0,1.11+i*1.12,0);ring.rotation.x=Math.PI/2;ring.scale.y=.82;}
box(g,0,.02,11,20,.1,5,stone);for(let k=-3;k<=3;k++)box(g,k*2.4,.08,11,.025,.012,4.4,silver);
const entry=new THREE.MeshStandardMaterial({color:0xd3b880,emissive:0xffdda6,emissiveIntensity:.15,metalness:.6,roughness:.3});g.userData.entryLight=entry;box(g,0,3.25,8.3,6,.11,2.1,silver);box(g,0,3.31,8.3,5.8,.025,1.9,entry);textPlane(g,'先見  FORESIGHT',5,.7,0,2.4,8.3,65);
// Open-work metal owl: no board, no rectangular backing, no image plane.
const sign=window.ForesightOfficeRelief({THREE,parent:g,envMap});sign.position.set(0,roofY*.69,4.65);
// Two discreet standoffs meet solid portions of the sculpture, leaving all cutouts open.
[-1.85,1.85].forEach(x=>beam([[x,roofY*.69-.65,2],[x,roofY*.69-.65,4.48]],.055,silver));
g.userData.setTheme=isDark=>{glass.color.setHex(isDark?0x7394ad:0x7897ad);glass.envMapIntensity=isDark?.19:.22;glass.emissiveIntensity=isDark?.028:.015;silver.envMapIntensity=isDark?.32:.4;sign.userData.theme(isDark);};g.userData.setTheme(dark);
// Fine halo is screen-independent; no opaque billboard overlays the building.
const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,3,64,64,64);gradient.addColorStop(0,'rgba(246,218,154,.65)');gradient.addColorStop(.35,'rgba(220,219,183,.18)');gradient.addColorStop(1,'rgba(220,219,183,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);const glow=new THREE.CanvasTexture(canvas);
function halo(x,y,z,w,h,color,opacity){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color,transparent:true,opacity,depthWrite:false}));s.position.set(x,y,z);s.scale.set(w,h,1);g.add(s);return s;}
g.userData.halo=halo(0,roofY*.69+.2,5,12,9,0xffedbc,.28);g.userData.aura=halo(0,height*.5,0,19,height,0xa9d8ec,.1);
// Charging bronze bull, placed on its own plinth to the right of the entrance.
const bull=new THREE.Group();bull.name='bronze-bull';bull.position.set(6.2,.4,10.7);bull.rotation.y=-.38;bull.scale.setScalar(.84);g.add(bull);box(g,6.2,.08,10.7,4.9,.28,4.5,stone);
const bronze=new THREE.MeshStandardMaterial({color:0x92623b,metalness:.78,roughness:.34,envMap,envMapIntensity:.5,emissive:0x8d5828,emissiveIntensity:.065}),horn=new THREE.MeshStandardMaterial({color:0xb68c53,metalness:.85,roughness:.25}),black=new THREE.MeshStandardMaterial({color:0x2b211b,roughness:.38,metalness:.55});
function ell(x,y,z,rx,ry,rz,mat=bronze){const m=mesh(new THREE.SphereGeometry(1,32,24),mat,x,y,z,bull);m.scale.set(rx,ry,rz);return m;}
// A single smoothly blended anatomical surface replaces separate ball-shaped body parts.
const model=window.ForesightBullMesh;function decode(value,Type){return new Type(Uint8Array.from(atob(value),c=>c.charCodeAt(0)).buffer);}
const raw=decode(model.position,Int16Array),positions=Float32Array.from(raw,x=>x/model.scale),normal=decode(model.normal,Int8Array),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(Float32Array.from(normal,x=>x/127),3));geo.setIndex(new THREE.BufferAttribute(decode(model.index,model.indexBytes===2?Uint16Array:Uint32Array),1));mesh(geo,bronze,0,0,0,bull).name='continuous-bronze-anatomy';
function taperedHorn(side){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.44,1.59,1.88),new THREE.Vector3(side*.86,1.78,1.99),new THREE.Vector3(side*1.08,2.2,1.91),new THREE.Vector3(side*1.04,2.75,1.63)]),v=[],ix=[],steps=36,radial=12;for(let i=0;i<=steps;i++){const u=i/steps,p=curve.getPoint(u),t=curve.getTangent(u).normalize(),n=new THREE.Vector3(0,0,1).cross(t).normalize(),b=t.clone().cross(n),r=.16*Math.pow(1-u,.72)+.004;for(let k=0;k<radial;k++){const a=k/radial*Math.PI*2,q=p.clone().addScaledVector(n,Math.cos(a)*r).addScaledVector(b,Math.sin(a)*r);v.push(q.x,q.y,q.z);if(i<steps){const j=i*radial+k,l=i*radial+(k+1)%radial;ix.push(j,l,j+radial,l,l+radial,j+radial);}}}const h=new THREE.BufferGeometry();h.setAttribute('position',new THREE.Float32BufferAttribute(v,3));h.setIndex(ix);h.computeVertexNormals();mesh(h,horn,0,0,0,bull);}
[-1,1].forEach(side=>{ell(side*.29,.91,2.81,.085,.048,.025,black);ell(side*.51,1.49,2.17,.063,.035,.025,black);const brow=ell(side*.48,1.56,2.12,.19,.09,.1);brow.rotation.z=side*.22;ell(side*.7,1.64,1.48,.28,.09,.18);taperedHorn(side);for(const [x,z] of [[side*.92,1.38],[side*.72,-.98]]){ell(x,.1,z,.22,.1,.27,bronze);beam([[x,.15,z+.14],[x,.06,z+.26]],.012,black,bull);}});
beam([[.1,2,-1.25],[.35,2.45,-1.78],[.18,2.86,-1.93],[-.2,2.94,-1.7]],.065,bronze,bull);ell(-.22,2.94,-1.69,.13,.1,.23);g.userData.bull=bronze;
const bullLight=new THREE.PointLight(0xffc879,.7,9,2);bullLight.position.set(6.2,2,11.8);g.add(bullLight);
const flow={head:{value:-100},strength:{value:0},color:{value:new THREE.Color(0x95c7e4)}};let nextSweep=null,sweepStart=null;
glass.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{towerFlowHead:flow.head,towerFlowStrength:flow.strength,towerFlowColor:flow.color});shader.vertexShader='varying vec3 vTowerFlow;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvTowerFlow=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader='varying vec3 vTowerFlow;uniform float towerFlowHead;uniform float towerFlowStrength;uniform vec3 towerFlowColor;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat ribbon=exp(-pow((vTowerFlow.y+towerFlowHead+vTowerFlow.x*.7+vTowerFlow.z*.3)/.75,2.0));totalEmissiveRadiance+=towerFlowColor*ribbon*towerFlowStrength;');};glass.customProgramCacheKey=()=> 'tower-soft-flow-v1';g.userData.flow=flow;
function sweep(t,isDark){if(t===0){flow.strength.value=0;sweepStart=nextSweep=null;return;}if(nextSweep===null)nextSweep=t+2200;if(sweepStart===null&&t>=nextSweep){sweepStart=t;nextSweep=t+9500+Math.random()*10500;}flow.color.value.setHex(isDark?0xe4bf78:0x8fbfdd);if(sweepStart!==null){const u=(t-sweepStart)/2300;if(u>=1){sweepStart=null;flow.strength.value=0;}else{flow.head.value=10-u*(height+28);flow.strength.value=Math.sin(u*Math.PI)*(isDark?.32:.22);}}}
g.userData.tick=(t,isDark)=>{sign.userData.tick(t,isDark);sweep(t,isDark);bronze.emissiveIntensity=(isDark?.15:.065)+Math.sin(t*.0006)*.022;bullLight.intensity=isDark?.85:.32;};
g.userData.landmark={tiers,sign:sign.name,bull:bull.name,height:height+10.4};return g;
};})();
