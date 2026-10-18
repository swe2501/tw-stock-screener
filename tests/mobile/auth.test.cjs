const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const ts=require(path.join(root,'apps/mobile/node_modules/typescript'));
const source=ts.transpileModule(fs.readFileSync(path.join(root,'apps/mobile/src/auth.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const store=new Map(),calls=[],state={url:'academy-mobile://auth/callback?code=one',logoutFail:false,enabled:true,cancel:false,passwordError:null};
 const modules={
  'expo-secure-store':{WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device-only',getItemAsync:async k=>store.get(k)||null,setItemAsync:async(k,v)=>store.set(k,v),deleteItemAsync:async k=>store.delete(k)},
  'expo-crypto':{getRandomBytes:()=>new Uint8Array(32).fill(3),digestStringAsync:async()=>'+/abc=',CryptoDigestAlgorithm:{SHA256:'SHA256'},CryptoEncoding:{BASE64:'BASE64'}},
  'expo-web-browser':{openAuthSessionAsync:async()=>state.cancel?{type:'cancel'}:{type:'success',url:state.url}},
 };
 const context={exports:{},require:n=>modules[n],process:{env:{EXPO_PUBLIC_STAGING_SUPABASE_KEY:'sb_publishable_test'}},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,
 fetch:async(url,options)=>{calls.push({url,options});let status=200,data={};
  if(url.endsWith('/settings'))data={external:{google:state.enabled}};
  else if(url.includes('grant_type=password')&&state.passwordError){status=400;data={error_code:state.passwordError};}
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
test('email login validates on server and persists only refresh; logout clears session',async()=>{
 const {auth,calls,store}=setup();
 assert.equal((await auth.emailLogin('  test@example.test  ','secret-value')).id,'test-user');
 const login=calls.find(c=>c.url.endsWith('grant_type=password'));
 assert.deepEqual(JSON.parse(login.options.body),{email:'test@example.test',password:'secret-value'});
 assert.equal(login.options.headers.Authorization,undefined);
 assert.deepEqual([...store.values()],['refresh']);
 assert.equal((await auth.restore()).id,'test-user');
 await auth.logout();assert.equal(await auth.restore(),null);
});
test('bad credentials and unconfirmed emails never save a session or echo secrets',async()=>{
 for(const [code,message] of [['invalid_credentials','Email 或密碼不正確'],['email_not_confirmed','請先完成信箱驗證，再回來登入']]){
  const {auth,state,store}=setup();state.passwordError=code;
  await assert.rejects(auth.emailLogin('test@example.test','secret-value'),e=>e.message===message);
  assert.equal(store.size,0);
 }
 const {auth,calls}=setup();await assert.rejects(auth.emailLogin('invalid','secret-value'));assert.equal(calls.length,0);
});
