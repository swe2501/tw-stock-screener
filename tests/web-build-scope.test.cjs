const {test}=require('node:test'),assert=require('node:assert/strict');
const {decision,needsWebBuild}=require('../scripts/should_build_web.cjs');
test('App-only releases skip web while web/API/shared or unknown files build',()=>{
 assert.equal(needsWebBuild(['apps/mobile/App.tsx','docs/app/notes.md','tests/mobile/search.cjs']),false);
 for(const file of ['apps/web/index.html','api/auth.py','lib/member_phone.py','packages/shared/news-api.js','vercel.json','.vercelignore'])assert.equal(needsWebBuild(['apps/mobile/App.tsx',file]),true);
});
test('missing deployment history or git failure builds; compare previous deployment, not HEAD parent',()=>{
 assert.equal(decision({}),1);const env={VERCEL_GIT_PREVIOUS_SHA:'last-deployed',VERCEL_GIT_COMMIT_SHA:'current'};
 assert.equal(decision(env,()=>({status:1})),1);
 assert.equal(decision(env,(cmd,args)=>{assert.deepEqual(args.slice(3,5),['last-deployed','current']);return {status:0,stdout:'apps/mobile/App.tsx\0'}}),0);
 assert.equal(decision(env,()=>({status:0,stdout:'apps/mobile/App.tsx\0apps/web/index.html\0'})),1);
});
