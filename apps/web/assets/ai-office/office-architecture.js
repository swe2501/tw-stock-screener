/* Original procedural architecture and display-only people. No AI execution. */
(function(){
  'use strict';
  window.ForesightArchitecture={
    build:function(ctx){
      const {THREE,scene,tower,material,materials,box,cylinder,textPlane,roofY,dark}=ctx;
      const shell=new THREE.Group();tower.add(shell);
      const glass=material('glass',{roughness:.18,metalness:.78});
      const silver=material('metal',{roughness:.23,metalness:.86});
      const gold=material('trim',{roughness:.25,metalness:.8});
      const windowMat=new THREE.MeshStandardMaterial({color:0xd9dcce,emissive:0xf1c985,emissiveIntensity:dark?.8:.07,roughness:.4,metalness:.2});
      shell.userData.lightWindow=windowMat;
      const h=roofY-4.5;
      function dims(t){return{w:11.8-t*3.3,d:9.2-t*2.0};}
      function perimeter(w,d){const a=[];const bevel=.75;[[w/2-bevel,d/2],[w/2,d/2-bevel],[w/2,-d/2+bevel],[w/2-bevel,-d/2],[-w/2+bevel,-d/2],[-w/2,-d/2+bevel],[-w/2,d/2-bevel],[-w/2+bevel,d/2]].forEach(p=>a.push(p));return a;}
      const verts=[],indices=[];
      for(let level=0;level<=32;level++){const t=level/32,{w,d}=dims(t);perimeter(w,d).forEach(([x,z])=>verts.push(x,4.5+h*t,z));}
      for(let j=0;j<32;j++)for(let k=0;k<8;k++){const a=j*8+k,b=j*8+(k+1)%8,c=(j+1)*8+(k+1)%8,d=(j+1)*8+k;indices.push(a,b,d,b,c,d);}
      const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geom.setIndex(indices);geom.computeVertexNormals();const skin=new THREE.Mesh(geom,glass);skin.material.side=THREE.DoubleSide;skin.castShadow=true;skin.receiveShadow=true;shell.add(skin);
      function beam(a,b,r,mat){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),mat);mesh.position.copy(av).add(bv).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());shell.add(mesh);return mesh;}
      const lo=dims(0),hi=dims(1);
      // Vertical silver fins give the tower a continuous, slender silhouette.
      for(let k=0;k<=14;k++){const u=k/14-.5;[-1,1].forEach(s=>beam([u*lo.w,4.5,s*(lo.d/2+.04)],[u*hi.w,roofY,s*(hi.d/2+.04)],k%7===0?.055:.023,k%7===0?gold:silver));}
      for(let k=0;k<=10;k++){const u=k/10-.5;[-1,1].forEach(s=>beam([s*(lo.w/2+.04),4.5,u*lo.d],[s*(hi.w/2+.04),roofY,u*hi.d],.023,silver));}
      // Fine horizontal window joints, without projecting residential balconies.
      for(let row=0;row<=32;row++){const t=row/32,{w,d}=dims(t),y=4.5+h*t;const p=perimeter(w+.03,d+.03);for(let k=0;k<8;k++)beam([p[k][0],y,p[k][1]],[p[(k+1)%8][0],y,p[(k+1)%8][1]],row%4===0?.024:.012,silver);}
      for(let row=0;row<32;row++)for(let col=0;col<12;col++){if((row*17+col*11)%13>2)continue;const t=(row+.5)/32,{w,d}=dims(t),x=(col/12-.46)*w;box(shell,x,4.5+row/32*h+.12,d/2+.025,w/12*.65,h/32*.63,.015,windowMat);}
      // Champagne structural ribbons echo financial landmark architecture.
      for(let j=0;j<4;j++){const ta=j/4,tb=(j+1)/4,a=dims(ta),b=dims(tb),s=j%2?1:-1;beam([s*a.w*.48,4.5+h*ta,a.d/2+.06],[-s*b.w*.48,4.5+h*tb,b.d/2+.06],.035,gold);}
      // Wave-shaped three-storey podium, formed from a continuous outline.
      function podiumOutline(scale){const s=new THREE.Shape();s.moveTo(-10*scale,-5*scale);s.bezierCurveTo(-11*scale,-1*scale,-8*scale,2*scale,-9*scale,6*scale);s.bezierCurveTo(-3*scale,9*scale,1*scale,4*scale,6*scale,7*scale);s.bezierCurveTo(11*scale,8*scale,13*scale,2*scale,10*scale,-5*scale);s.lineTo(-10*scale,-5*scale);return s;}
      for(let level=0;level<3;level++){const shape=podiumOutline(1-level*.035),pg=new THREE.ExtrudeGeometry(shape,{depth:1.12,bevelEnabled:false,steps:1,curveSegments:36});pg.rotateX(-Math.PI/2);const p=new THREE.Mesh(pg,glass);p.position.y=.3+level*1.2;p.castShadow=true;p.receiveShadow=true;shell.add(p);const edge=shape.getPoints(100);for(let k=0;k<edge.length-1;k++)beam([edge[k].x,.32+level*1.2,-edge[k].y],[edge[k+1].x,.32+level*1.2,-edge[k+1].y],.035,silver);}
      // Entrance portal and subtle architectural lighting.
      [-3.2,3.2].forEach(x=>box(shell,x,.25,8.2,.19,3.1,.3,gold));box(shell,0,3.25,8.2,6.6,.15,.3,gold);box(shell,0,3.15,8.8,7.6,.12,2.8,silver);textPlane(shell,'先見  FORESIGHT',6.4,.85,0,2.65,8.4,63);
      box(shell,0,-.2,0,25,.2,20,materials.stone);box(shell,0,-.3,10.1,12,.1,1.2,materials.stone);
      // Open architectural crown, with the original owl centred above the skyline.
      const top=roofY,capVerts=[],capIndices=[];const crownBase=perimeter(hi.w,hi.d),crownTop=perimeter(2.8,2.4);crownBase.forEach(([x,z])=>capVerts.push(x,top,z));crownTop.forEach(([x,z])=>capVerts.push(x-.5,top+4.8,z));for(let k=0;k<8;k++){const n=(k+1)%8;capIndices.push(k,n,k+8,n,n+8,k+8);beam([crownBase[k][0],top,crownBase[k][1]],[crownTop[k][0]-.5,top+4.8,crownTop[k][1]],.045,k%2?gold:silver);}const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(capVerts,3));cg.setIndex(capIndices);cg.computeVertexNormals();shell.add(new THREE.Mesh(cg,glass));beam([-.5,top+4.8,0],[-.5,top+7.1,0],.04,gold);
      const texture=new THREE.TextureLoader().load(window.FORESIGHT_OFFICE_LOGO);texture.colorSpace=THREE.SRGBColorSpace;const logo=new THREE.Mesh(new THREE.PlaneGeometry(3.65,2.75),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));logo.position.set(0,top+1.75,3.1);logo.userData.brandLogo=true;shell.add(logo);textPlane(shell,'先見',3.8,.7,0,top+.75,hi.d/2+.06,85);
      // Slender halo at the crown; opacity breathes gently, never a hard flash.
      const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=128;const hc=haloCanvas.getContext('2d'),gradient=hc.createRadialGradient(64,64,4,64,64,64);gradient.addColorStop(0,'rgba(237,211,151,.45)');gradient.addColorStop(.4,'rgba(237,211,151,.13)');gradient.addColorStop(1,'rgba(237,211,151,0)');hc.fillStyle=gradient;hc.fillRect(0,0,128,128);const haloTexture=new THREE.CanvasTexture(haloCanvas);const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTexture,transparent:true,depthWrite:false,opacity:dark?.55:.24}));halo.position.set(0,top+3.2,0);halo.scale.set(11,11,1);shell.add(halo);shell.userData.halo=halo;
      return shell;
    },
    person:function(ctx){
      const {THREE,parent,x,z,color,variant,box,cylinder}=ctx;
      const figure=new THREE.Group();figure.position.set(x,.12,z);parent.add(figure);
      const skins=[0xf0d3bc,0xd9b18a,0xb9815e,0x754d3e,0xe2bfa6,0x9d694c];
      const skin=new THREE.MeshStandardMaterial({color:skins[variant%skins.length],roughness:.78});
      const suit=new THREE.MeshStandardMaterial({color:variant%3===0?0x263d54:variant%3===1?0x626975:0xddd5c5,roughness:.77});
      const hair=new THREE.MeshStandardMaterial({color:[0x28282c,0x4d382e,0x65564b,0x201c20][variant%4],roughness:.88});
      const shirt=new THREE.MeshStandardMaterial({color:0xe7eceb,roughness:.8});
      const head=new THREE.Mesh(new THREE.SphereGeometry(.145,20,16),skin);head.position.set(0,1.23,0);head.scale.set(.87,1.1,.91);figure.add(head);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.151,20,14,0,Math.PI*2,0,Math.PI*.6),hair);cap.position.set(0,1.26,-.01);figure.add(cap);
      if(variant%2===1){const long=new THREE.Mesh(new THREE.SphereGeometry(.15,16,12),hair);long.position.set(0,1.11,-.09);long.scale.set(.9,1.8,.5);figure.add(long);}
      const torso=cylinder(figure,0,.64,0,.17,.43,suit,16);torso.scale.set(1.05,1,.68);box(figure,0,.88,.115,.075,.17,.025,shirt);box(figure,0,.77,.14,.025,.19,.015,color);
      [-.1,.1].forEach(a=>{cylinder(figure,a,.13,0,.056,.5,suit,12);box(figure,a,.1,.035,.12,.07,.24,hair);});
      [-1,1].forEach(s=>{const arm=cylinder(figure,s*.215,.72,.04,.045,.31,suit,12);arm.rotation.z=s*.22;const hand=new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),skin);hand.position.set(s*.245,.74,.13);figure.add(hand);});
      return figure;
    }
  };
})();
