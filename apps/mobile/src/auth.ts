import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

// This development build must never silently use the production member project.
const BASE='https://ebwtkcsmpvgyjvosbofx.supabase.co';
const KEY=process.env.EXPO_PUBLIC_STAGING_SUPABASE_KEY||'';
export const redirectTo='academy-mobile://auth/callback';
export const configured=KEY.startsWith('sb_publishable_');
const STORE='academy.staging.ebwtkcsmpvgyjvosbofx.refresh';
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export type Member={id:string;email?:string};
let access='',expires=0,epoch=0,pending=false;
let currentMember:Member|null=null;

async function request(path:string,body?:unknown,token?:string){
 if(!configured)throw Error('尚未設定 App 測試登入連線');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(BASE+'/auth/v1'+path,{method:body===undefined?'GET':'POST',signal:controller.signal,
   headers:{apikey:KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=r.status===204?{}:await r.json();
  if(!r.ok){const message=data.error_code==='email_not_confirmed'?'請先完成信箱驗證，再回來登入':r.status===429?'嘗試次數過多，請稍後再試':path==='/verify'?'驗證連結已失效或已使用，請重新登入或重寄驗證信':path==='/signup'?'無法建立帳號，請確認 Email、密碼及寄信限制後重試':path.includes('grant_type=password')&&(r.status===400||r.status===401)?'Email 或密碼不正確':r.status===400||r.status===401?'登入已過期，請重新登入':'登入服務暫時無法使用';const e=Error(message) as Error&{status:number};e.status=r.status;throw e;}
  return data;
 }catch(e){if(e instanceof Error&&e.name==='AbortError')throw Error('登入連線逾時，請重試');throw e;}
 finally{clearTimeout(timer);}
}

async function accept(data:any,run:number):Promise<Member>{
 if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string'||data.refresh_token.length>1800)throw Error('登入回應格式異常');
 const user=await request('/user',undefined,data.access_token);
 if(!user.id||run!==epoch)throw Error('登入操作已取消');
 // Persist only the short refresh credential. Provider tokens and profile are not stored.
 await SecureStore.setItemAsync(STORE,data.refresh_token,options);
 access=data.access_token;expires=Date.now()+Number(data.expires_in||3600)*1000;
 currentMember={id:user.id,email:user.email};return currentMember;
}

export async function restore():Promise<Member|null>{
 if(pending)return currentMember;
 pending=true;const run=epoch;
 try{
  if(access&&expires>Date.now()+60000){const user=await request('/user',undefined,access);currentMember={id:user.id,email:user.email};return currentMember;}
  const refresh=await SecureStore.getItemAsync(STORE,options);
  if(!refresh)return null;
  return await accept(await request('/token?grant_type=refresh_token',{refresh_token:refresh}),run);
 }catch(e){
  if((e as {status?:number}).status===400||(e as {status?:number}).status===401){access='';expires=0;currentMember=null;await SecureStore.deleteItemAsync(STORE,options);return null;}
  throw e;
 }finally{pending=false;}
}

function validEmail(email:string){
 const address=email.trim();
 if(address.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('請輸入有效的 Email');
 return address;
}

export async function register(email:string,password:string):Promise<Member|null>{
 if(pending)throw Error('登入處理中，請稍候');
 const address=validEmail(email);
 if(password.length<8||password.length>4096)throw Error('密碼請至少設定 8 個字元');
 pending=true;const run=++epoch;
 try{
  const data=await request('/signup',{email:address,password});
  return data.access_token?await accept(data,run):null;
 }finally{pending=false;}
}

export async function resendConfirmation(email:string):Promise<void>{
 if(pending)throw Error('登入處理中，請稍候');
 const address=validEmail(email);pending=true;
 try{await request('/resend',{email:address,type:'signup'});}finally{pending=false;}
}

// Expo Go cannot receive our custom scheme. Consume the copied confirmation
// token directly on its issuing server; never navigate to the pasted URL.
export async function confirmRegistration(link:string):Promise<Member>{
 if(pending)throw Error('登入處理中，請稍候');
 let token='';
 try{
  if(link.length>4096)throw Error();
  const url=new URL(link.trim());
  const tokens=url.searchParams.getAll('token'),types=url.searchParams.getAll('type');
  if(url.origin!==BASE||url.pathname!=='/auth/v1/verify'||url.username||url.password||url.hash||tokens.length!==1||types.length!==1||!['signup','email'].includes(types[0])||! /^[a-zA-Z0-9_-]{32,256}$/.test(tokens[0]))throw Error();
  token=tokens[0];
 }catch{throw Error('請貼上這個測試環境寄出的完整註冊驗證連結');}
 pending=true;const run=++epoch;
 try{return await accept(await request('/verify',{token_hash:token,type:'email'}),run);}
 finally{pending=false;}
}

export async function emailLogin(email:string,password:string):Promise<Member>{
 if(pending)throw Error('登入處理中，請稍候');
 const address=validEmail(email);
 if(!password||password.length>4096)throw Error('請輸入有效的密碼');
 pending=true;const run=++epoch;
 try{return await accept(await request('/token?grant_type=password',{email:address,password}),run);}
 finally{pending=false;}
}

export async function googleLogin():Promise<Member|null>{
 if(pending)throw Error('登入處理中，請稍候');
 pending=true;const run=++epoch;
 try{
  const settings=await request('/settings');
  if(!settings.external?.google)throw Error('測試環境的 Google 登入尚未設定');
  const verifier=Array.from(Crypto.getRandomBytes(32),b=>b.toString(16).padStart(2,'0')).join('');
  const challenge=(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,verifier,{encoding:Crypto.CryptoEncoding.BASE64})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const q=new URLSearchParams({provider:'google',redirect_to:redirectTo,code_challenge:challenge,code_challenge_method:'s256'});
  const result=await WebBrowser.openAuthSessionAsync(BASE+'/auth/v1/authorize?'+q,redirectTo);
  if(result.type!=='success')return null;
  const url=new URL(result.url);
  if(url.protocol!=='academy-mobile:'||url.hostname!=='auth'||url.pathname!=='/callback'||url.hash||url.username||url.password)throw Error('登入回呼網址不符');
  if(url.searchParams.has('error'))throw Error('Google 登入未完成，請重試');
  const codes=url.searchParams.getAll('code');
  if(codes.length!==1||!codes[0]||run!==epoch)throw Error('登入驗證未完成，請重試');
  return await accept(await request('/token?grant_type=pkce',{auth_code:codes[0],code_verifier:verifier}),run);
 }finally{pending=false;}
}

export async function logout(){
 if(pending)throw Error('登入處理中，請稍候');
 pending=true;
 try{
  if(!access){const refresh=await SecureStore.getItemAsync(STORE,options);if(refresh)await accept(await request('/token?grant_type=refresh_token',{refresh_token:refresh}),epoch);}
  if(access){try{await request('/logout?scope=local',{},access);}catch(e){if((e as {status?:number}).status!==401)throw e;}}
  await SecureStore.deleteItemAsync(STORE,options);access='';expires=0;currentMember=null;epoch++;
 }finally{pending=false;}
}
