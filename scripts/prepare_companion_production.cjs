/* Prepare asset requests from the actual illustrated stage references. No uploads or paid calls. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),output=process.argv[2];
if(!output)throw Error('Usage: node scripts/prepare_companion_production.cjs <output.json>');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/member-goal-art.js'),'utf8'),ctx,{timeout:1000});
const art=ctx.window.AcademyGoalArt,clips=['enter','idle','interact','evolve','celebrate','interact_pat','interact_offer','interact_play','interact_care','interact_cheer'];
const jobs=[];
for(const [theme,name]of Object.entries(art.themes))for(const [row,gender]of ['female','male','neutral'].entries())for(let stage=0;stage<5;stage++){
 const file=theme==='immortal'?'immortal-evolution-alpha.png':theme+'-genders-v2.png';
 const custom=theme==='train'||theme==='immortal'&&stage<3||theme==='gem'&&stage===0;
 jobs.push({id:`${theme}/${gender}/${stage}`,theme,name,gender,stage,stageName:art.spec[theme].stages[stage],
  status:'awaiting_model',reference:{atlas:`assets/goal-art/${file}`,rectNormalized:Array.from(art.spriteRect(theme,row,stage)),
   output:`references/${theme}/${gender}/${stage}.png`},
  rig:{route:custom?'custom_required':'compatibility_check_first',suggestedType:custom?null:theme==='space'?'biped':theme==='ocean'?'aquatic':['castle','gem'].includes(theme)?'quadruped_or_avian':'quadruped'},
  interactions:Array.from(art.interactions(theme,stage)),requiredClips:clips,
  output:`assets/goal-models/${theme}/${gender}/${stage}.glb`,
  constraints:{maxBytes:12*1024*1024,embeddedResources:true,referenceIdentityRequired:true,commercialLicenseRequired:true,manualVisualApprovalRequired:true},
  notes:custom?'Custom rig/animation required; do not send to humanoid auto-rig blindly.':'Rig-check before rigging; a matching category does not guarantee usable deformation.'});
}
const report={version:1,generatedAt:new Date().toISOString(),source:'assets/member-goal-art.js',readinessNotEvaluated:true,required:jobs.length,
 warning:'References are 2D input art, not completed 3D models. No generation or approval is performed by this script.',jobs};
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Prepared ${jobs.length} requests: nine themes, three personas, five stages. No network or credits used.`);
