// Vercel ignored-build convention: 0 = skip, 1 = build. Unknown state builds.
const {spawnSync}=require('node:child_process');
function needsWebBuild(paths){return paths.some(p=>!p.startsWith('apps/mobile/')&&!p.startsWith('docs/')&&!p.startsWith('tests/mobile/'));}
function decision(env=process.env,git=spawnSync){
 if(env.VERCEL_FORCE_WEB_BUILD==='1'||!env.VERCEL_GIT_PREVIOUS_SHA||!env.VERCEL_GIT_COMMIT_SHA)return 1;
 const result=git('git',['diff','--name-only','-z',env.VERCEL_GIT_PREVIOUS_SHA,env.VERCEL_GIT_COMMIT_SHA,'--'],{encoding:'utf8'});
 if(result.status!==0)return 1;
 return needsWebBuild(result.stdout.split('\0').filter(Boolean))?1:0;
}
if(require.main===module){const code=decision();console.log(code?'Build website/backend: changed or unknown deployment baseline.':'Skip website: only App/docs changed since previous deployment.');process.exitCode=code;}
module.exports={needsWebBuild,decision};
