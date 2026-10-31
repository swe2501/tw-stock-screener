/* An actual extruded, open-work brand sculpture, preserving the source owl contours. */
window.ForesightOfficeRelief=function({THREE,parent,envMap}){
 const data=window.ForesightOwlReliefContours,group=new THREE.Group();group.name='openwork-owl-relief';parent.add(group);
 const charcoal=new THREE.MeshStandardMaterial({color:0x303b45,metalness:.48,roughness:.28,envMap,envMapIntensity:.35,emissive:0x354754,emissiveIntensity:.08});
 const gold=new THREE.MeshStandardMaterial({color:0xc99c3b,metalness:.68,roughness:.26,envMap,envMapIntensity:.45,emissive:0xe2ac43,emissiveIntensity:.15});
 const side=new THREE.MeshStandardMaterial({color:0xaabcc4,metalness:.65,roughness:.3,envMap,envMapIntensity:.455,emissive:0x7b9cb3,emissiveIntensity:.06});
 const scale=7.1/data.width;
 function path(points,Ctor){const p=new Ctor();points.forEach(([x,y],i)=>{const a=(x-data.width/2)*scale,b=(data.height/2-y)*scale;i?p.lineTo(a,b):p.moveTo(a,b);});p.closePath();return p;}
 let holeCount=0;
 data.layers.forEach(layer=>{const shapes=layer.shapes.map(raw=>{const shape=path(raw.outline,THREE.Shape);raw.holes.forEach(h=>{shape.holes.push(path(h,THREE.Path));holeCount++;});return shape;});const geometry=new THREE.ExtrudeGeometry(shapes,{depth:.2,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.012,bevelThickness:.018,curveSegments:1});geometry.translate(0,0,-.1);const mesh=new THREE.Mesh(geometry,[layer.name==='gold'?gold:charcoal,side]);mesh.name='owl-'+layer.name;mesh.castShadow=true;mesh.receiveShadow=false;group.add(mesh);});
 group.userData.holes=holeCount;
 group.userData.theme=dark=>{charcoal.color.setHex(dark?0x8c9fab:0x29333b);charcoal.emissiveIntensity=dark?.075:.025;side.color.setHex(dark?0xa8b7c1:0x899eaa);gold.emissiveIntensity=dark?.16:.07;};
 group.userData.tick=(t,dark)=>{gold.emissiveIntensity=(dark?.16:.07)+Math.sin(t*.0008)*.02;};
 return group;
};
