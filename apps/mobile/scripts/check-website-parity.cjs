// Read the latest fetched website baseline without merging its SDK into this preview.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..');
const result=spawnSync('git',['show','origin/uat:apps/web/assets/member-strategy-engine.js'],{cwd:repo,encoding:'utf8'});
if(result.status!==0){console.error('Cannot read origin/uat; fetch the repository before checking website parity.');process.exit(1);}
const source=result.stdout.replace(/\r\n/g,'\n'),digest=crypto.createHash('sha256').update(source).digest('hex');
const native=fs.readFileSync(path.resolve(__dirname,'../src/vendor/strategy-engine.js'),'utf8');
if(!native.includes('Source SHA256: '+digest)){console.error('Website formula engine changed. Review and update the App snapshot with parity tests; do not merge the SDK 57 preview into UAT.');process.exit(1);}
console.log('PASS: App formula engine matches latest fetched UAT website baseline.');
