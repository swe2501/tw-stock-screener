/* Original stepped, three-wing financial tower and bronze plaza sculpture. All meshes are local. */
(()=>{'use strict';
window.ForesightArchitecture.build=function(ctx){
const {THREE,tower,material,box,cylinder,textPlane,roofY,dark}=ctx,g=new THREE.Group();tower.add(g);g.name='foresight-landmark';
const glass=material('glass',{metalness:.83,roughness:.2}),silver=new THREE.MeshStandardMaterial({color:0xb5cbd6,metalness:.88,roughness:.24}),gold=new THREE.MeshStandardMaterial({color:0xc7ad79,metalness:.78,roughness:.3}),stone=material('stone'),lightWindow=new THREE.MeshStandardMaterial({color:0xc3dce5,emissive:0xffd697,emissiveIntensity:.15,transparent:true,opacity:.65});
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
box(g,0,.02,12.6,20,.1,12,stone);for(let k=-3;k<=3;k++)box(g,k*2.4,.08,12.7,.025,.012,11,silver);
const entry=new THREE.MeshStandardMaterial({color:0xd3b880,emissive:0xffdda6,emissiveIntensity:.15,metalness:.6,roughness:.3});g.userData.entryLight=entry;box(g,0,3.25,8.3,6,.11,2.1,silver);box(g,0,3.31,8.3,5.8,.025,1.9,entry);textPlane(g,'先見  FORESIGHT',5,.7,0,2.4,8.3,65);
// Raised illuminated sign: physical bronze depth, clear glass face and the original coloured owl.
const sign=new THREE.Group();sign.name='illuminated-brand-sign';sign.position.set(0,roofY*.69,4.65);g.add(sign);const back=new THREE.MeshStandardMaterial({color:0x203b4b,metalness:.82,roughness:.22,emissive:0x284351,emissiveIntensity:.2});box(sign,0,-1.95,-.26,6.8,4.4,.36,back);[-3.4,3.4].forEach(x=>box(sign,x,-1.95,-.03,.045,4.4,.08,gold));[-1.95,2.45].forEach(y=>box(sign,0,y,-.03,6.8,.045,.08,gold));
const texture=new THREE.TextureLoader().load(window.FORESIGHT_OFFICE_LOGO);texture.colorSpace=THREE.SRGBColorSpace;
const logo=mesh(new THREE.PlaneGeometry(6.35,4.2),new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.85,transparent:true,roughness:.18,metalness:.15,side:THREE.DoubleSide,depthWrite:false}),0,.24,.04,sign);logo.userData.brandLogo=true;
// Visible standoffs connect the raised advertising face to the tower's structural spine.
[-2.5,2.5].forEach(x=>{beam([[x,roofY*.69-1,2],[x,roofY*.69-1,4.4]],.085,silver);beam([[x,roofY*.69+1.7,2],[x,roofY*.69+1.7,4.4]],.085,silver);});
// Fine halo is screen-independent; no opaque billboard overlays the building.
const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,3,64,64,64);gradient.addColorStop(0,'rgba(246,218,154,.65)');gradient.addColorStop(.35,'rgba(220,219,183,.18)');gradient.addColorStop(1,'rgba(220,219,183,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);const glow=new THREE.CanvasTexture(canvas);
function halo(x,y,z,w,h,color,opacity){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color,transparent:true,opacity,depthWrite:false}));s.position.set(x,y,z);s.scale.set(w,h,1);g.add(s);return s;}
g.userData.halo=halo(0,roofY*.69+.2,5,12,9,0xffedbc,.28);g.userData.aura=halo(0,height*.5,0,19,height,0xa9d8ec,.1);
// Charging bronze bull, placed on its own plinth to the right of the entrance.
const bull=new THREE.Group();bull.name='bronze-bull';bull.position.set(7.8,.65,13.2);bull.rotation.y=-.6;g.add(bull);box(g,7.8,.08,13.2,6.4,.5,4.5,stone);
const bronze=new THREE.MeshStandardMaterial({color:0x92623b,metalness:.9,roughness:.29,emissive:0x8d5828,emissiveIntensity:.065}),horn=new THREE.MeshStandardMaterial({color:0xb68c53,metalness:.85,roughness:.25}),black=new THREE.MeshStandardMaterial({color:0x2b211b,roughness:.38,metalness:.55});
function ell(x,y,z,rx,ry,rz,mat=bronze){const m=mesh(new THREE.SphereGeometry(1,32,24),mat,x,y,z,bull);m.scale.set(rx,ry,rz);return m;}
ell(0,1.65,.15,.92,.88,1.65);ell(0,1.86,1,.96,1.02,.92);ell(0,1.2,1.8,.69,.78,.82);ell(0,.84,2.4,.58,.36,.47);ell(0,.69,2.55,.44,.16,.3);[-1,1].forEach(s=>{ell(s*.29,.94,2.79,.09,.055,.035,black);ell(s*.55,1.57,2.08,.08,.065,.05,black);ell(s*.77,1.6,1.35,.31,.12,.2);beam([[s*.47,1.65,1.88],[s*.87,1.97,1.93],[s*1.08,2.45,1.76],[s*1.1,2.76,1.52]],.105,horn,bull);const tip=mesh(new THREE.ConeGeometry(.11,.54,16),horn,s*1.08,2.65,1.64,bull);tip.rotation.x=-.42;tip.rotation.z=-s*.2;});
for(const [x,z,k] of [[-.72,.85,1],[.72,.7,-1],[-.65,-1,1],[.65,-1.12,-1]]){ell(x,1.02,z,.25,.62,.31);const knee=ell(x+k*.13,.55,z+.24,.15,.49,.18);knee.rotation.x=-.25;ell(x+k*.15,.14,z+.37,.25,.14,.33,black);}
beam([[.1,2,-1.25],[.35,2.45,-1.78],[.18,2.86,-1.93],[-.2,2.94,-1.7]],.065,bronze,bull);ell(-.22,2.94,-1.69,.13,.1,.23);g.userData.bull=bronze;
const bullLight=new THREE.PointLight(0xffc879,.7,9,2);bullLight.position.set(7.8,2,14);g.add(bullLight);
g.userData.tick=(t,isDark)=>{logo.material.emissiveIntensity=(isDark?.9:.65)+Math.sin(t*.0008)*.1;bronze.emissiveIntensity=(isDark?.09:.04)+Math.sin(t*.0006)*.014;bullLight.intensity=isDark?.85:.32;};
g.userData.landmark={tiers,sign:sign.name,bull:bull.name,height:height+10.4};return g;
};})();
