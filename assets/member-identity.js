/* Public Supabase client for the existing site. No service key or provider secret belongs here. */
(() => {
  'use strict';
  const config=()=>({url:typeof SIG_SB_URL!=='undefined'?SIG_SB_URL:'',key:typeof SIG_SB_ANON!=='undefined'?SIG_SB_ANON:''});
  const fields=['display_name','full_name','gender','city','birth_date','experience','markets','purpose','member_preferences','member_learning'];
  const providerId=provider=>provider==='line'?'custom:line-web':provider;
  // Public /settings omits custom providers. LINE was verified against /authorize.
  // Keep this explicit deployment configuration separate from built-in provider flags.
  const configuredCustomProviders=new Set(['custom:line-web']);
  const providerEnabled=(s,provider)=>configuredCustomProviders.has(providerId(provider))||!!s.external?.[providerId(provider)];
  function normalizePhone(value){
    let phone=String(value).trim().replace(/[\s()\-]/g,'');
    if(/^09\d{8}$/.test(phone))phone='+886'+phone.slice(1);
    if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('請填寫台灣手機 09xxxxxxxx，或含國碼的手機號碼');
    return phone;
  }
  let settingsPromise;
  function headers(auth=true){const c=config();if(!c.url||!c.key)throw Error('會員連線尚未設定，請重新整理頁面');const h={'apikey':c.key,'Content-Type':'application/json'};if(auth){const token=localStorage.getItem('sb_token');if(!token)throw Error('請先登入會員');h.Authorization='Bearer '+token;}return h;}
  async function request(path,{method='GET',body,auth=true,...rest}={}){
    if(!path.startsWith('/auth/v1/')&&window.AcademyPhoneGate&&!await window.AcademyPhoneGate.ensure())throw Error('請先完成手機驗證');
    let response;try{response=await fetch(config().url+path,{method,headers:headers(auth),...(body!==undefined?{body:JSON.stringify(body)}:{}),...rest});}catch(e){if(e.message.includes('尚未')||e.message.includes('請先'))throw e;throw Error('無法連上會員服務，請確認網路後重試');}
    if(response.status===204)return null;
    let d;try{d=await response.json();}catch{throw Error('會員服務回應異常，請稍後再試');}
    if(!response.ok){if(response.status===401&&auth){const error=Error('登入已過期，請重新登入');error.status=401;throw error;}if(path.startsWith('/auth/v1/')){const errors={otp_expired:'驗證碼錯誤或已過期，請重新輸入或重送',over_sms_send_rate_limit:'簡訊發送過於頻繁，請稍候再試',sms_send_failed:'簡訊發送失敗，請稍後重試',captcha_failed:'安全驗證未完成，請聯絡網站管理員',provider_disabled:'此登入方式尚未開通',manual_linking_disabled:'網站尚未開啟帳號綁定，請管理員啟用後再試',identity_already_exists:'此登入方式已綁定其他會員，請改用原帳號登入',email_exists:'此信箱已被其他會員使用',phone_exists:'此手機已被其他會員使用',reauthentication_needed:'請重新登入原帳號，再進行綁定',validation_failed:'輸入資料不正確，請檢查後重試'};const err=Error(errors[d.error_code||d.code]||'登入服務無法完成操作，請稍後再試');err.code=d.error_code||d.code;err.status=response.status;throw err;}if(response.status===429)throw Error('操作過於頻繁，請稍候再試');const messages={MEMBER_CODE_INVALID:'找不到這組代碼，請確認後再試',MEMBER_CODE_EXPIRED:'這組代碼已過期',MEMBER_CODE_LIMIT:'這組代碼已達使用上限',MEMBER_VERIFY_REQUIRED:'請先完成信箱或手機驗證',MEMBER_SELF_REFERRAL:'不能使用自己的邀請碼',MEMBER_REFERRAL_BOUND:'此帳號已綁定推薦人，無法重複設定',MEMBER_REWARD_EXPIRED:'這份禮遇已過期',MEMBER_REWARD_NOT_FOUND:'找不到這份禮遇',MEMBER_INPUT_INVALID:'資料格式不正確，請檢查後重試',MEMBER_RATE_LIMIT:'操作過於頻繁，請稍候再試'};const error=Error(messages[d.message]||'會員服務暫時無法完成操作，請稍後再試');error.code=d.error_code||d.code;error.status=response.status;throw error;}return d;
  }
  const serverPhone=value=>typeof value==='string'&&/^[1-9]\d{7,14}$/.test(value)?'+'+value:value;
  function project(user){const m=user.user_metadata||{},a=user.app_metadata||{};return {id:user.id,email:user.email,phone:serverPhone(user.phone),created_at:user.created_at,email_verified:!!user.email_confirmed_at,phone_verified:!!user.phone_confirmed_at,...Object.fromEntries(fields.map(k=>[k,m[k]||''])),display_name:m.display_name||m.full_name||'',avatar_url:m.avatar_url||m.picture||'',providers:[...new Set((user.identities||[]).map(i=>i.provider).filter(Boolean))],membership:{plan:a.membership_plan||'general',expires_at:a.membership_expires_at||null,features:Array.isArray(a.membership_features)?a.membership_features:[]}};}
  async function getProfile(){return project(await request('/auth/v1/user'));}
  async function updateProfile(input){const data=Object.fromEntries(fields.filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]));if(Object.hasOwn(data,'display_name')&&(!data.display_name.trim()||data.display_name.length>40))throw Error('暱稱請填寫 1～40 個字');if(Object.hasOwn(data,'gender')&&!['','女性','男性','非二元','不透露'].includes(data.gender))throw Error('請選擇有效的性別選項');if(data.birth_date){const d=new Date(data.birth_date+'T00:00:00Z'),today=new Date(),max=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');if(!/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==data.birth_date||data.birth_date<'1900-01-01'||data.birth_date>max)throw Error('請填寫有效的出生年月日，不能晚於今天');}return project(await request('/auth/v1/user',{method:'PUT',body:{data}}));}
  async function saveAvatar(blob){const user=await getProfile();const c=config(),path=user.id+'/avatar.webp';const h=headers();delete h['Content-Type'];h['Content-Type']='image/webp';h['x-upsert']='true';let r;try{r=await fetch(c.url+'/storage/v1/object/member-avatars/'+path,{method:'POST',headers:h,body:blob});}catch{throw Error('頭像上傳失敗，請確認網路後重試');}if(!r.ok){let detail={};try{detail=await r.json();}catch{}const message=String(detail.message||detail.error||'');if(r.status===401)throw Error('登入已過期，請重新登入後再儲存頭像');if(/bucket.*not found/i.test(message))throw Error('網站尚未建立頭像儲存空間，請聯絡管理員啟用 member-avatars；裁切預覽已保留');if(r.status===403||/row.level|policy|unauthorized/i.test(message))throw Error('頭像上傳權限尚未開通，請聯絡管理員設定本人專屬上傳權限；裁切預覽已保留');throw Error('頭像上傳失敗，圖片尚未儲存；請稍後重試或聯絡管理員');}const avatar_url=c.url+'/storage/v1/object/public/member-avatars/'+path+'?v='+Date.now();return project(await request('/auth/v1/user',{method:'PUT',body:{data:{avatar_url}}}));}
  function settings(){return settingsPromise||(settingsPromise=request('/auth/v1/settings',{auth:false}).catch(e=>{settingsPromise=null;throw e;}));}
  const b64=a=>btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function callback(){if(!['https:','http:'].includes(location.protocol))throw Error('社群登入需要從網站網址開啟，不能使用本機檔案網址');return location.origin+location.pathname;}
  async function startOAuth(provider){
    if(!['google','apple','facebook','line'].includes(provider))throw Error('不支援的登入方式');
    const s=await settings();if(!providerEnabled(s,provider))throw Error(({google:'Google',apple:'Apple',facebook:'Facebook',line:'LINE'})[provider]+' 登入尚未由網站管理員完成開通');
    const verifier=b64(crypto.getRandomValues(new Uint8Array(48))),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    sessionStorage.setItem('academy.oauth',JSON.stringify({verifier,created:Date.now(),returnHash:location.hash}));
    const q=new URLSearchParams({provider:providerId(provider),redirect_to:callback(),code_challenge:challenge,code_challenge_method:'s256'});
    // Authorize is a browser navigation endpoint, not a JSON API. Fetching it
    // follows the provider redirect and fails the provider's CORS policy.
    const target=new URL('/auth/v1/authorize',config().url);target.search=q.toString();
    if(target.protocol!=='https:')throw Error('登入網址異常');location.assign(target.href);
  }
  async function accept(session,expectedUser=null,expectedPhone=null){
    if(!session.access_token||!session.refresh_token)throw Error('登入驗證未完成，請重新操作');
    const c=config(),r=await fetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+session.access_token}});if(!r.ok)throw Error('登入驗證未完成，請重新操作');const user=await r.json();
    if(expectedPhone&&(!user.phone_confirmed_at||normalizePhone(serverPhone(user.phone)||'')!==expectedPhone))throw Error('手機驗證尚未完成，請重新操作');
    if(expectedUser&&user.id!==expectedUser)throw Error('授權帳號與原會員不一致，尚未切換帳號；請回會員中心重試');
    window._acceptMemberSession({...session,user});window.dispatchEvent(new Event('academy-auth-changed'));
  }
  async function consumeCallback(){const q=new URLSearchParams(location.search);if(!q.has('code')&&!q.has('error'))return;let saved;try{saved=JSON.parse(sessionStorage.getItem('academy.oauth')||'null');}catch{}if(!saved)return;
    sessionStorage.removeItem('academy.oauth');q.delete('code');const failure=q.has('error');['error','error_code','error_description'].forEach(k=>q.delete(k));const code=new URLSearchParams(location.search).get('code');history.replaceState(history.state,'',location.pathname+(q.size?'?'+q:'')+(saved.returnHash||''));
    if(!saved.verifier||!Number.isFinite(saved.created)||saved.created>Date.now())throw Error('登入驗證資料異常，請重試');if(failure)throw Error(saved.replacement?'新帳號尚未綁定，請使用其他已綁定方式登入，再重新操作':'你已取消登入，或登入服務未完成授權');if(Date.now()-saved.created>600000)throw Error('登入驗證已逾時，請重試');if(saved.intent==='link'){let owner;try{owner=JSON.parse(localStorage.getItem('sb_user')||'null')?.id;}catch{}if(!saved.userId||owner!==saved.userId||!localStorage.getItem('sb_token'))throw Error('會員登入狀態已變更，請重新登入原帳號後再綁定');}
    await accept(await request('/auth/v1/token?grant_type=pkce',{method:'POST',auth:false,body:{auth_code:code,code_verifier:saved.verifier}}),saved.intent==='link'?saved.userId:null);
    if(saved.intent==='link')window.dispatchEvent(new Event('academy-identity-linked'));
  }
  async function linkOAuth(provider){
    if(!['google','apple','facebook','line'].includes(provider))throw Error('不支援的綁定方式');
    const user=await getProfile(),s=await settings();
    if(!providerEnabled(s,provider))throw Error('此登入方式尚未開通，暫時無法綁定');
    callback();
    const verifier=b64(crypto.getRandomValues(new Uint8Array(48))),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const q=new URLSearchParams({provider:providerId(provider),redirect_to:callback(),code_challenge:challenge,code_challenge_method:'s256',skip_http_redirect:'true'});
    sessionStorage.setItem('academy.oauth',JSON.stringify({intent:'link',userId:user.id,verifier,created:Date.now(),returnHash:'#member/security'}));
    try{
      const result=await request('/auth/v1/user/identities/authorize?'+q),target=new URL(result?.url||'');
      if(target.protocol!=='https:'||target.username||target.password)throw Error('綁定網址異常，請稍後重試');
      location.assign(target.href);
    }catch(error){sessionStorage.removeItem('academy.oauth');throw error;}
  }
  async function replaceOAuth(provider){
    if(!['google','apple','facebook','line'].includes(provider))throw Error('不支援的綁定方式');
    const token=localStorage.getItem('sb_token'),user=await request('/auth/v1/user'),s=await settings(),identities=user.identities||[],same=i=>i.provider===providerId(provider)||(provider==='line'&&['custom:line','custom:line-web'].includes(i.provider));
    const target=identities.find(same),identityId=target?.identity_id||target?.id,other=i=>!same(i)&&((i.provider==='email'&&user.email_confirmed_at)||(i.provider==='phone'&&user.phone_confirmed_at)||['google','apple','facebook','line','custom:line','custom:line-web'].includes(i.provider));
    if(!providerEnabled(s,provider))throw Error('此登入方式尚未開通，暫時無法更改');
    if(!identityId||!identities.some(other))throw Error('請先綁定並驗證另一種登入方式，再更換這個帳號');
    callback();const verifier=b64(crypto.getRandomValues(new Uint8Array(48))),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const q=new URLSearchParams({provider:providerId(provider),redirect_to:callback(),code_challenge:challenge,code_challenge_method:'s256',skip_http_redirect:'true'});
    // Confirm manual linking is enabled before removing an existing identity.
    const result=await request('/auth/v1/user/identities/authorize?'+q),url=new URL(result?.url||'');if(url.protocol!=='https:'||url.username||url.password)throw Error('綁定網址異常，請稍後重試');
    const fresh=await request('/auth/v1/user');if(fresh.id!==user.id||localStorage.getItem('sb_token')!==token||!(fresh.identities||[]).some(i=>(i.identity_id||i.id)===identityId)||!(fresh.identities||[]).some(i=>!same(i)&&((i.provider==='email'&&fresh.email_confirmed_at)||(i.provider==='phone'&&fresh.phone_confirmed_at)||['google','apple','facebook','line','custom:line','custom:line-web'].includes(i.provider))))throw Error('會員狀態已變更，請重新開啟設定');
    await request('/auth/v1/user/identities/'+encodeURIComponent(identityId),{method:'DELETE'});
    sessionStorage.setItem('academy.oauth',JSON.stringify({intent:'link',replacement:provider,userId:user.id,verifier,created:Date.now(),returnHash:'#member/security'}));location.assign(url.href);
  }
  async function sendContactLink(kind,value){
    if(!['email','phone'].includes(kind))throw Error('不支援的驗證方式');
    const user=await getProfile(),s=await settings();
    if(kind==='phone'){if(!s.external?.phone)throw Error('手機綁定尚未完成簡訊服務開通');value=normalizePhone(value);}
    else {value=String(value).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('請填寫有效的 Email');}
    await request('/auth/v1/user',{method:'PUT',body:{[kind]:value}});
    return {userId:user.id,kind,value};
  }
  async function verifyContactLink(pending,token){
    if(!pending?.userId||!['email','phone'].includes(pending.kind))throw Error('請先傳送驗證碼');
    if(!/^\d{6}$/.test(token))throw Error('請填寫 6 位數驗證碼');
    const before=await getProfile();if(before.id!==pending.userId)throw Error('會員登入狀態已變更，請重新操作');
    await request('/auth/v1/verify',{method:'POST',body:{[pending.kind]:pending.value,token,type:pending.kind+'_change'}});
    const after=await getProfile();if(after.id!==pending.userId||after[pending.kind]!==pending.value||!after[pending.kind+'_verified'])throw Error('尚未完成驗證；變更信箱時可能需要同時確認新舊信箱');
    window.dispatchEvent(new Event('academy-identity-linked'));return after;
  }
  async function sendMemberEmail(action){
    const user=await getProfile();if(!user.email)throw Error('請先綁定 Email');
    if(action==='password'){
      if(!user.email_verified)throw Error('請先驗證 Email，再設定登入密碼');
      await request('/auth/v1/recover',{method:'POST',auth:false,body:{email:user.email,redirect_to:callback()}});
    }else if(action==='verify')await request('/auth/v1/resend',{method:'POST',auth:false,body:{type:'signup',email:user.email}});
    else throw Error('不支援的驗證操作');
  }
  async function sendPhone(phone){phone=normalizePhone(phone);if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('請填寫含國碼的手機號碼，例如 +886912345678');const s=await settings();if(!s.external?.phone)throw Error('手機登入尚未完成簡訊服務開通');return request('/auth/v1/otp',{method:'POST',auth:false,body:{phone,channel:'sms',create_user:true}});}
  async function verifyPhone(phone,token){phone=normalizePhone(phone);if(!/^\d{6}$/.test(token))throw Error('請填寫 6 位數驗證碼');await accept(await request('/auth/v1/verify',{method:'POST',auth:false,body:{phone,token,type:'sms'}}),null,phone);}
  async function memberResource(resource){const queries={feedback:'member_feedback_tickets?select=id,ticket_number,subject,status,created_at&order=created_at.desc&limit=30',rewards:'member_rewards?select=id,title,description,status,expires_at,kind&order=created_at.desc&limit=30',coupons:'member_coupons?select=id,title,description,status,expires_at&order=created_at.desc&limit=30',points:'member_point_ledger?select=id,description,points,created_at&order=created_at.desc&limit=100',referrals:'member_referral_summary?select=code,confirmed_count,rewarded_count,status&limit=1',events:'academy_events?select=id,title,description,starts_at,status,registration_url&status=eq.published&order=starts_at.asc&limit=20'};if(!queries[resource])throw Error('不支援的會員服務');try{let query=queries[resource];if(resource!=='events'){const user=await getProfile();query+='&user_id=eq.'+encodeURIComponent(user.id);}const rows=await request('/rest/v1/'+query);if(!Array.isArray(rows))throw Error('會員資料格式異常');return {ready:true,rows};}catch(e){if(e.status===404||e.code==='PGRST205'||e.code==='42P01')return{ready:false,rows:[]};throw e;}}
  const revokeOtherSessions=()=>request('/auth/v1/logout?scope=others',{method:'POST',body:{}});
  async function rpc(name,args){try{return await request('/rest/v1/rpc/'+name,{method:'POST',body:args});}catch(e){if(e.status===404||e.code==='PGRST202')throw Error('此服務尚未啟用，請稍後再試；填寫內容會保留');throw e;}}
  const ensureReferralCode=()=>rpc('ensure_member_referral_code',{});
  const redeemCode=code=>rpc('redeem_member_promo_code',{p_code:String(code).trim().toUpperCase()});
  const bindReferral=code=>rpc('bind_member_referral',{p_code:String(code).trim().toUpperCase()});
  const submitFeedback=data=>rpc('submit_member_feedback',data);
  const claimReward=id=>rpc('claim_member_reward',{p_reward_id:id});
  window.AcademyIdentity={normalizePhone,getProfile,updateProfile,saveAvatar,settings,providerEnabled,startOAuth,linkOAuth,replaceOAuth,sendContactLink,verifyContactLink,sendMemberEmail,sendPhone,verifyPhone,consumeCallback,memberResource,revokeOtherSessions,ensureReferralCode,redeemCode,bindReferral,submitFeedback,claimReward};
})();
