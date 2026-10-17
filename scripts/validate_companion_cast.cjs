/* Mechanical audit of authored candidates. Does not approve production art. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||''),output=process.argv[3];
if(!process.argv[2])throw Error('Usage: node scripts/validate_companion_cast.cjs MODEL_DIRECTORY [report.json]');
const themes=['immortal','garden','mountain','space','castle','pet','ocean','gem','train'],personas=['female','male','neutral'];
const clips=['enter','idle','interact','evolve','celebrate','interact_pat','interact_offer','interact_play','interact_care','interact_cheer'];
const models=[],errors=[],warnings=[],hashes=new Set();
for(const theme of themes)for(const persona of personas)for(let stage=0;stage<5;stage++){
 const id=`${theme}/${persona}/${stage}`;
 try{
  const file=path.join(root,id+'.glb'),bytes=fs.readFileSync(file);
  if(bytes.length<20||bytes.length>12*1024*1024||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Invalid embedded GLB 2.0');
  const j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  if(j.buffers?.some(b=>b.uri)||j.images?.some(i=>i.uri)||j.extensionsRequired?.length)throw Error('External resource or decoder extension');
  const bones=Math.max(0,...(j.skins||[]).map(s=>s.joints.length));
  if(!bones||bones>60||!j.nodes.some(n=>n.mesh!==undefined&&n.skin!==undefined))throw Error('Missing/oversized actual skin');
  for(const name of clips){const a=j.animations?.find(a=>a.name===name);if(!a?.channels?.length||!a.samplers?.some(s=>(j.accessors[s.input]?.max?.[0]||0)>0))throw Error('Missing/empty clip '+name);}
  let triangles=0;for(const m of j.meshes||[])for(const p of m.primitives){if(p.mode!==undefined&&p.mode!==4)throw Error('Non triangle primitive');triangles+=(j.accessors[p.indices]?.count||0)/3;}
  if(triangles>50000)warnings.push(id+': '+triangles+' triangles exceeds preferred 50k');
  if(j.materials.length>8)warnings.push(id+': '+j.materials.length+' materials exceeds preferred 8');
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hashes.has(hash))throw Error('Duplicate whole GLB');hashes.add(hash);
  models.push({id,bytes:bytes.length,triangles,bones,materials:j.materials.length,clips:j.animations.length,sha256:hash});
 }catch(e){errors.push(id+': '+e.message);}
}
const report={scope:'Mechanical candidate audit; not visual approval or full animation-collision certification',required:135,exported:models.length,approvedProductionModels:0,errors,warnings,maxBytes:Math.max(0,...models.map(m=>m.bytes)),maxTriangles:Math.max(0,...models.map(m=>m.triangles)),models};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,models:undefined},null,2));process.exitCode=errors.length?1:0;
