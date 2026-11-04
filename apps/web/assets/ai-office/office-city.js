/* A small architectural streetscape. Traffic and atmosphere are display-only. */
(function(){
  'use strict';
  window.ForesightCity={build:function({THREE,scene,box,cylinder,materials,reduced}){
    const group=new THREE.Group();group.name='financial-district';scene.add(group);
    const asphalt=new THREE.MeshStandardMaterial({color:0x63717a,roughness:.94});
    const pavement=new THREE.MeshStandardMaterial({color:0xb9c0bf,roughness:.9});
    const marking=new THREE.MeshStandardMaterial({color:0xd3c9a4,roughness:.8});
    const glass=new THREE.MeshStandardMaterial({color:0x7a98a7,metalness:.68,roughness:.32,transparent:true});
    const frame=new THREE.MeshStandardMaterial({color:0x7d8a90,metalness:.62,roughness:.42});
    const lampMaterial=new THREE.MeshStandardMaterial({color:0xe4d7b5,emissive:0xf3ca7b,emissiveIntensity:.1});
    box(group,0,-.55,0,100,.12,100,pavement).receiveShadow=true;
    [-17,17].forEach(z=>{box(group,0,-.38,z,94,.045,6,asphalt);for(let x=-43;x<44;x+=5)box(group,x,-.349,z,2,.012,.06,marking);});
    [-21,21].forEach(x=>{box(group,x,-.37,0,6,.04,94,asphalt);for(let z=-43;z<44;z+=5)box(group,x,-.34,z,.06,.012,2,marking);});
    // Recessed plaza, street crossings and regularly spaced bollards.
    [-13.4,13.4].forEach(x=>{box(group,x,-.3,0,1.8,.12,25,materials.stone);for(let z=-10;z<=10;z+=4)cylinder(group,x,-.15,z,.065,.38,materials.metal,10);});
    [-17,17].forEach(z=>{for(let k=0;k<8;k++)box(group,-11+k*.45,-.335,z,.23,.013,4.3,pavement);});
    function batch(parent,mat){const meshes=parent.children.filter(o=>o.isMesh&&o.material===mat&&o.geometry.type==='BoxGeometry');if(meshes.length<2)return;const instances=new THREE.InstancedMesh(meshes[0].geometry,mat,meshes.length);meshes.forEach((o,i)=>{o.updateMatrix();instances.setMatrixAt(i,o.matrix);parent.remove(o);});instances.instanceMatrix.needsUpdate=true;instances.receiveShadow=true;instances.castShadow=false;parent.add(instances);}
    const buildings=[];
    const positions=[[-34,-28,19,9,9],[-31,1,12,7,9],[-36,27,17,10,8],[32,-30,24,8,10],[34,-6,14,8,9],[35,27,11,10,8],[-12,-36,16,10,8],[11,-39,22,9,10],[-10,39,8,10,8],[14,37,10,9,8]];
    positions.forEach(([x,z,originalHeight,w,d],i)=>{
      const height=originalHeight*.7;
      const g=new THREE.Group();g.position.set(x,-.28,z);group.add(g);const skin=glass.clone(),trim=frame.clone(),windows=lampMaterial.clone(),mats=[skin,trim,windows];
      box(g,0,0,0,w,height,d,skin);box(g,0,height,0,w*.78,height*.16,d*.78,skin);box(g,0,height*1.16,0,w*.46,.45,d*.46,trim);
      for(let y=1;y<height;y+=1.3){box(g,0,y,d/2+.02,w,.028,.035,trim);box(g,w/2+.02,y,0,.035,.028,d,trim);}
      for(let k=0;k<=7;k++){box(g,-w/2+k*w/7,0,d/2+.035,.025,height,.035,trim);box(g,w/2+.035,0,-d/2+k*d/7,.035,height,.025,trim);}
      for(let row=1;row<height;row+=2.1)for(let col=0;col<5;col++){if((Math.round(row)*7+col*13+i*11)%17>2)continue;box(g,-w*.36+col*w*.18,row,d/2+.05,w*.09,.48,.012,windows);box(g,w/2+.05,row,-d*.36+col*d*.18,.012,.48,d*.09,windows);}
      if(i%3===0)cylinder(g,0,height*1.16,0,.025,1.9,trim,8);
      mats.forEach(m=>batch(g,m));buildings.push({g,mats,x,z});
    });
    [-14.1,14.1].forEach(z=>{for(let x=-14;x<=14;x+=7){cylinder(group,x,-.2,z,.045,2.1,materials.metal,10);box(group,x,1.87,z,.55,.06,.15,materials.metal);box(group,x,1.845,z,.45,.025,.12,lampMaterial);}});
    // Six compact vehicles, including a restrained yellow cab.
    const vehicles=[],carPaint=[0xc9a746,0x44525e,0x9aa8ad,0x263c4d,0xc9c5b8,0x747b83];
    const frontLight=new THREE.MeshStandardMaterial({color:0xf5e8c8,emissive:0xffe0a0,emissiveIntensity:.1});
    const tailLight=new THREE.MeshStandardMaterial({color:0xb75145,emissive:0xd65d49,emissiveIntensity:.1});
    carPaint.forEach((color,i)=>{const g=new THREE.Group();group.add(g);const paint=new THREE.MeshStandardMaterial({color,roughness:.3,metalness:.4});box(g,0,.02,0,.58,.25,1.3,paint);box(g,0,.27,-.06,.5,.22,.64,glass);box(g,0,.25,-.06,.51,.035,.66,paint);[-.31,.31].forEach(x=>[-.39,.39].forEach(z=>{const wheel=cylinder(g,x,.01,z,.12,.07,materials.screen,12);wheel.rotation.z=Math.PI/2;}));[-.2,.2].forEach(x=>{box(g,x,.13,.66,.13,.055,.02,frontLight);box(g,x,.13,-.66,.13,.055,.02,tailLight);});if(i===0)box(g,0,.5,-.06,.22,.06,.24,marking);vehicles.push({g,progress:i*24,speed:1.15+(i%3)*.23,pause:0,stopped:false});});
    [asphalt,pavement,marking,lampMaterial,materials.stone,materials.metal].forEach(m=>batch(group,m));
    const birds=document.createElement('div');birds.className='district-birds';birds.setAttribute('aria-hidden','true');birds.innerHTML='<svg viewBox="0 0 140 35"><path d="M8 18q8-10 16 0q8-10 16 0M56 8q6-7 12 0q6-7 12 0M97 24q7-8 14 0q7-8 14 0"/></svg>';document.querySelector('.office-sky').append(birds);
    const meteor=document.createElement('i');meteor.className='district-meteor';meteor.setAttribute('aria-hidden','true');document.querySelector('.office-sky').append(meteor);
    let dark=false,elapsed=0,nextMeteor=18,meteors=0;const perimeter=160;
    function route(distance){const d=(distance%perimeter+perimeter)%perimeter;if(d<44)return{x:-22+d,z:18,angle:Math.PI/2};if(d<80)return{x:22,z:18-(d-44),angle:Math.PI};if(d<124)return{x:22-(d-80),z:-18,angle:-Math.PI/2};return{x:-22,z:-18+(d-124),angle:0};}
    function theme(night){dark=night;asphalt.color.setHex(night?0x233240:0x63717a);pavement.color.setHex(night?0x354653:0xb9c0bf);glass.color.setHex(night?0x354d61:0x7a98a7);buildings.forEach(({mats},i)=>{mats[0].color.copy(glass.color).multiplyScalar(.84+(i%4)*.07);mats[2].emissiveIntensity=night?.9:.025;});lampMaterial.emissiveIntensity=night?1.3:.04;frontLight.emissiveIntensity=night?1.7:.07;tailLight.emissiveIntensity=night?.8:.05;}
    function tick(dt,angle,night){if(!reduced){elapsed+=dt;if(night&&elapsed>=nextMeteor){meteor.style.left=(48+(meteors*17)%34)+'%';meteor.style.top=(9+(meteors*7)%17)+'%';meteor.classList.remove('passing');void meteor.offsetWidth;meteor.classList.add('passing');meteors++;nextMeteor=elapsed+26+(meteors*11)%23;}vehicles.forEach((v,i)=>{if(v.pause>0){v.pause-=dt;}else{v.progress+=v.speed*dt;const nearEntrance=v.progress%perimeter>20&&v.progress%perimeter<22;if(i===0&&nearEntrance&&!v.stopped){v.pause=2.8;v.stopped=true;}if(v.progress%perimeter>30)v.stopped=false;}const p=route(v.progress);v.g.position.set(p.x,-.27,p.z);v.g.rotation.y=p.angle;});}
      buildings.forEach(({mats,x,z})=>{const near=x*Math.sin(angle)+z*Math.cos(angle)>0,center=Math.abs(x*Math.cos(angle)-z*Math.sin(angle))<13;const opacity=near&&center?.12:.76;mats.forEach(m=>{m.transparent=true;m.opacity=opacity;m.depthWrite=opacity>.5;});});
    }
    vehicles.forEach(v=>{const p=route(v.progress);v.g.position.set(p.x,-.27,p.z);v.g.rotation.y=p.angle;});
    return {group,theme,tick,get arriving(){return vehicles[0].pause>0;},get trafficPosition(){return vehicles[0].g.position.toArray();},get meteorCount(){return meteors;}};
  }};
})();
