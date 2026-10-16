/* Mechanical asset audit only. No visual-quality certification. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),assetRoot=path.join(root,'assets','goal-models'),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(assetRoot,'manifest.js'),'utf8'),context,{timeout:1000});
const manifest=context.window.AcademyCompanionModels,required=['enter','idle','interact','evolve','celebrate','interact_pat','interact_offer','interact_play','interact_care','interact_cheer'],missing=[],errors=[];let count=0;
for(const theme of ['immortal','garden','mountain','space','castle','pet','ocean','gem','train'])for(const gender of ['female','male','neutral']){
 const cfg=manifest?.version===1?manifest.themes?.[theme]?.[gender]:null;
 if(!cfg){missing.push(theme+'/'+gender);continue;}
 if(cfg.approved!==true||!cfg.license?.trim()||!Array.isArray(cfg.stages)||cfg.stages.length!==5){errors.push(theme+'/'+gender+': approval/license/five stages required');continue;}
 for(const [stage,file]of cfg.stages.entries())try{
  if(typeof file!=='string'||!file.endsWith('.glb')||/[?#]/.test(file))throw Error('local .glb path required');
  const target=path.resolve(root,file);if(!target.startsWith(assetRoot+path.sep))throw Error('model outside asset directory');
  const b=fs.readFileSync(target);if(b.length<20||b.length>12*1024*1024||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.readUInt32LE(16)!==0x4e4f534a)throw Error('invalid GLB');
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString('utf8'));
  if(json.buffers?.some(x=>x.uri)||json.images?.some(x=>x.uri))throw Error('embedded resources required');
  if(!json.skins?.some(x=>x.joints?.length)||!json.nodes?.some(x=>x.mesh!==undefined&&x.skin!==undefined))throw Error('skinned mesh required');
  if(required.some(name=>!json.animations?.some(x=>x.name===name&&x.channels?.length)))throw Error('five lifecycle and five interaction clips required');
  count++;
 }catch(error){errors.push(theme+'/'+gender+'/'+stage+': '+error.message);}
}
console.log(JSON.stringify({readyStages:count,requiredStages:135,missingPersonas:missing,errors},null,2));process.exitCode=missing.length||errors.length?1:0;
