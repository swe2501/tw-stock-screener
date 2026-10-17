// Run: node tests/member-identity.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function setup(settings={external:{google:true,apple:true,'custom:line-web':true,phone:true}}){
  const calls=[],saved=new Map(),accepted=[];
  const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
  const context={SIG_SB_URL:'https://auth.example',SIG_SB_ANON:'public',URL,URLSearchParams,TextEncoder,crypto:webcrypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),Date,Event,
    location:{protocol:'https:',origin:'https://site.example',pathname:'/',search:'',hash:'',assign:url=>calls.push({redirect:url})},
    history:{replaceState(){}},localStorage:storage,sessionStorage:storage,
    window:{_acceptMemberSession:s=>accepted.push(s),dispatchEvent(){}},
    fetch:async(url,options)=>{calls.push({url,...options});let data=url.endsWith('/settings')?settings:url.endsWith('/user')?{id:'verified-user'}:{access_token:'access',refresh_token:'refresh'};if(url.includes('/authorize?'))data={url:'https://provider.example/authorize'};return {ok:true,status:200,json:async()=>data};}};
  vm.runInNewContext(fs.readFileSync('assets/member-identity.js','utf8'),context);
  return {api:context.window.AcademyIdentity,calls,saved,accepted,context};
}
test('Taiwan and international numbers normalize; invalid numbers rejected',()=>{
  const {api}=setup();assert.equal(api.normalizePhone('0912-345-678'),'+886912345678');assert.equal(api.normalizePhone('+1 (202) 555-0123'),'+12025550123');assert.throws(()=>api.normalizePhone('123'));
});
test('Google, Apple, LINE use PKCE and configured provider identifiers',async()=>{
  for(const provider of ['google','apple','line']){const {api,calls,saved}=setup();await api.startOAuth(provider);const target=new URL(calls.at(-1).redirect),q=target.searchParams;assert.equal(target.origin,'https://auth.example');assert.equal(target.pathname,'/auth/v1/authorize');assert.equal(q.get('provider'),provider==='line'?'custom:line-web':provider);assert.equal(q.get('code_challenge_method'),'s256');assert.equal(q.get('redirect_to'),'https://site.example/');assert.equal(q.has('skip_http_redirect'),false);assert.ok(JSON.parse(saved.get('academy.oauth')).verifier);assert.equal(calls.filter(x=>x.url?.includes('/authorize?')).length,0);}
});
test('disabled providers never start authorization',async()=>{
  const {api,calls}=setup({external:{}});await assert.rejects(api.startOAuth('google'),/尚未/);assert.equal(calls.length,1);
});
test('SMS payload normalizes number; session accepted only after user validation',async()=>{
  const {api,calls,accepted}=setup();await api.sendPhone('0912345678');assert.equal(JSON.parse(calls.at(-1).body).phone,'+886912345678');assert.equal(accepted.length,0);await assert.rejects(api.verifyPhone('0912345678','12'),/6 位/);await api.verifyPhone('0912345678','123456');assert.equal(accepted[0].user.id,'verified-user');assert.ok(calls.at(-1).url.endsWith('/user'));
});
test('expired OAuth callback does not exchange tokens',async()=>{
  const {api,saved,context,calls}=setup();saved.set('academy.oauth',JSON.stringify({verifier:'secret',created:Date.now()-700000}));context.location.search='?code=expired';await assert.rejects(api.consumeCallback(),/逾時/);assert.equal(calls.length,0);assert.equal(saved.has('academy.oauth'),false);
});

test('LINE stays available when public settings omit custom providers',async()=>{
  const {api,calls}=setup({external:{google:true}});assert.equal(api.providerEnabled({external:{}},'line'),true);await api.startOAuth('line');assert.equal(new URL(calls.at(-1).redirect).searchParams.get('provider'),'custom:line-web');
});
test('profile gender is optional and validated independently of goal appearance',async()=>{const {api,calls,saved}=setup();saved.set('sb_token','test');await api.updateProfile({gender:'女性'});assert.equal(JSON.parse(calls.at(-1).body).data.gender,'女性');await api.updateProfile({gender:''});assert.equal(JSON.parse(calls.at(-1).body).data.gender,'');await assert.rejects(api.updateProfile({gender:'arbitrary'}),/性別/);});


test('identity linking requires an existing authenticated member',async()=>{const {api,calls}=setup();await assert.rejects(api.linkOAuth('google'),/請先登入/);assert.equal(calls.length,0);});
test('identity linking uses authenticated user endpoint with PKCE and original member intent',async()=>{
 const {api,calls,saved}=setup();saved.set('sb_token','original-token');await api.linkOAuth('google');
 const call=calls.find(c=>c.url?.includes('/user/identities/authorize?'));assert.ok(call);assert.equal(call.headers.Authorization,'Bearer original-token');
 const q=new URL(call.url).searchParams;assert.equal(q.get('skip_http_redirect'),'true');assert.equal(q.get('code_challenge_method'),'s256');
 const state=JSON.parse(saved.get('academy.oauth'));assert.equal(state.intent,'link');assert.equal(state.userId,'verified-user');assert.equal(state.returnHash,'#member/security');assert.ok(state.verifier);
 assert.equal(calls.some(c=>c.url?.includes('/signup')||c.url?.includes('/otp')),false);
});
test('manual linking disabled fails clearly and clears pending verifier',async()=>{
 const {api,saved,context}=setup();saved.set('sb_token','original-token');const base=context.fetch;
 context.fetch=async(url,options)=>url.includes('/identities/authorize?')?{ok:false,status:400,json:async()=>({error_code:'manual_linking_disabled'})}:base(url,options);
 await assert.rejects(api.linkOAuth('google'),/尚未開啟帳號綁定/);assert.equal(saved.has('academy.oauth'),false);
});
test('link callback rejects a changed local member before token exchange',async()=>{
 const {api,saved,context,calls,accepted}=setup();saved.set('sb_token','test');saved.set('sb_user',JSON.stringify({id:'other-user'}));saved.set('academy.oauth',JSON.stringify({intent:'link',userId:'original-user',verifier:'secret',created:Date.now()}));context.location.search='?code=valid';await assert.rejects(api.consumeCallback(),/登入狀態已變更/);assert.equal(calls.length,0);assert.equal(accepted.length,0);
});
test('link callback rejects a returned session for another user without replacing the original session',async()=>{
 const {api,saved,context,accepted}=setup();saved.set('sb_token','original-token');saved.set('sb_user',JSON.stringify({id:'original-user'}));saved.set('academy.oauth',JSON.stringify({intent:'link',userId:'original-user',verifier:'secret',created:Date.now()}));context.location.search='?code=valid';await assert.rejects(api.consumeCallback(),/原會員不一致/);assert.equal(accepted.length,0);assert.equal(saved.get('sb_token'),'original-token');
});
test('same member link callback accepts only the server verified identity',async()=>{
 const {api,saved,context,accepted}=setup();saved.set('sb_token','original-token');saved.set('sb_user',JSON.stringify({id:'verified-user'}));saved.set('academy.oauth',JSON.stringify({intent:'link',userId:'verified-user',verifier:'secret',created:Date.now()}));context.location.search='?code=valid';await api.consumeCallback();assert.equal(accepted[0].user.id,'verified-user');assert.equal(saved.has('academy.oauth'),false);
});
test('phone linking updates authenticated user, never creates a new OTP member',async()=>{
 const {api,saved,calls}=setup();saved.set('sb_token','original-token');const pending=await api.sendContactLink('phone','0912345678');assert.equal(pending.userId,'verified-user');assert.equal(pending.value,'+886912345678');const call=calls.find(c=>c.method==='PUT');assert.ok(call.url.endsWith('/auth/v1/user'));assert.equal(call.headers.Authorization,'Bearer original-token');assert.equal(JSON.parse(call.body).phone,'+886912345678');assert.equal(calls.some(c=>c.url?.includes('/otp')),false);
});
test('contact verification cannot claim success until the server reports the same member and verified contact',async()=>{
 const {api,saved,context}=setup();saved.set('sb_token','original-token');await assert.rejects(api.verifyContactLink({userId:'verified-user',kind:'phone',value:'+886912345678'},'123456'),/尚未完成驗證/);
 const base=context.fetch;context.fetch=async(url,options)=>url.endsWith('/user')?{ok:true,status:200,json:async()=>({id:'verified-user',phone:'+886912345678',phone_confirmed_at:'2026-10-17'})}:base(url,options);
 const profile=await api.verifyContactLink({userId:'verified-user',kind:'phone',value:'+886912345678'},'123456');assert.equal(profile.phone_verified,true);
});
