const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const ts=require(path.join(root,'apps/mobile/node_modules/typescript'));
const source=ts.transpileModule(fs.readFileSync(path.join(root,'apps/mobile/src/auth.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const store=new Map(),calls=[],state={url:'academy-mobile://auth/callback?code=one',logoutFail:false,enabled:true,cancel:false};
 const modules={
  'expo-secure-store':{WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device-only',getItemAsync:async k=>store.get(k)||null,setItemAsync:async(k,v)=>store.set(k,v),deleteItemAsync:async k=>store.delete(k)},
  'expo-crypto':{getRandomBytes:()=>new Uint8Array(32).fill(3),digestStringAsync:async()=>'+/abc=',CryptoDigestAlgorithm:{SHA256:'SHA256'},CryptoEncoding:{BASE64:'BASE64'}},
  'expo-web-browser':{openAuthSessionAsync:async()=>state.cancel?{type:'cancel'}:{type:'success',url:state.url}},
 };
 const context={exports:{},require:n=>modules[n],process:{env:{EXPO_PUBLIC_STAGING_SUPABASE_KEY:'sb_publishable_test'}},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,
 fetch:async(url,options)=>{calls.push({url,options});let status=200,data={};
  if(url.endsWith('/settings'))data={external:{google:state.enabled}};
  else if(url.includes('/token?'))data={access_token:'access',refresh_token:'refresh',expires_in:3600};
  else if(url.endsWith('/user'))data={id:'test-user',email:'test@example.test'};
  else if(url.includes('/logout')){if(state.logoutFail)status=503;}
  else throw Error('unexpected request');
  return {status,ok:status===200,json:async()=>data};
 }};
 vm.runInNewContext(source,context);return {auth:context.exports,store,calls,state};
}
test('PKCE validates user, stores refresh only, local logout revokes before clearing',async()=>{
 const {auth,store,calls,state}=setup();
 assert.equal((await auth.googleLogin()).id,'test-user');
 assert.deepEqual([...store.values()],['refresh']);
 const exchange=calls.find(c=>c.url.includes('grant_type=pkce'));
 assert.equal(JSON.parse(exchange.options.body).code_verifier.length,64);
 assert.ok(calls.every(c=>c.url.startsWith('https://ebwtkcsmpvgyjvosbofx.supabase.co/auth/v1/')));
 state.logoutFail=true;await assert.rejects(auth.logout());assert.equal(store.size,1);
 state.logoutFail=false;await auth.logout();assert.equal(store.size,0);
 assert.ok(calls.some(c=>c.url.endsWith('/logout?scope=local')));
});
test('rejects callback substitution and token fragments before code exchange',async()=>{
 for(const url of ['evil://auth/callback?code=x','academy-mobile://other/callback?code=x','academy-mobile://auth/callback?code=x&code=y','academy-mobile://auth/callback?code=x#access_token=bad']){
  const {auth,state,calls,store}=setup();state.url=url;
  await assert.rejects(auth.googleLogin());assert.equal(store.size,0);assert.equal(calls.filter(c=>c.url.includes('/token?')).length,0);
 }
});
test('disabled provider and browser cancellation never create a session',async()=>{
 const a=setup();a.state.enabled=false;await assert.rejects(a.auth.googleLogin());assert.equal(a.store.size,0);
 const b=setup();b.state.cancel=true;assert.equal(await b.auth.googleLogin(),null);assert.equal(b.store.size,0);
});
