import {useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Pressable,Text,View} from 'react-native';
import {configured,googleLogin,logout,restore,type Member} from './auth';

export default function MemberScreen({dark}:{dark:boolean}){
 const [member,setMember]=useState<Member|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const color=dark?'#e8eff6':'#172b43';
 async function run(work:()=>Promise<Member|null>){setBusy(true);setMessage('');try{setMember(await work());}catch(e){setMessage(e instanceof Error?e.message:'登入暫時無法完成');}finally{setBusy(false);}}
 useEffect(()=>{void run(restore);const listener=AppState.addEventListener('change',state=>{if(state==='active')void run(restore);});return()=>listener.remove();},[]);
 return <View style={{paddingVertical:20,gap:16}}>
  <Text style={{color,fontSize:20,fontWeight:'700'}}>測試環境會員登入</Text>
  <Text style={{color,lineHeight:24}}>此版本使用獨立測試帳號；網站正式會員資料不會帶入。</Text>
  {member?<><Text style={{color}}>{member.email||'已登入測試會員'}</Text><Pressable disabled={busy} accessibilityRole="button" onPress={()=>void run(async()=>{await logout();return null;})} style={{padding:16,backgroundColor:'#087fb9',borderRadius:12}}><Text style={{color:'#fff'}}>登出這台裝置</Text></Pressable></>:
   <Pressable disabled={busy||!configured} accessibilityRole="button" accessibilityState={{disabled:busy||!configured}} onPress={()=>void run(googleLogin)} style={{padding:16,backgroundColor:configured?'#087fb9':'#697c8b',borderRadius:12}}><Text style={{color:'#fff'}}>使用 Google 登入</Text></Pressable>}
  {!configured&&<Text style={{color}}>尚未設定測試登入連線。</Text>}
  {busy&&<ActivityIndicator accessibilityLabel="登入處理中"/>}
  {!!message&&<Text accessibilityRole="alert" style={{color}}>{message}</Text>}
  <Pressable disabled={busy} accessibilityRole="button" onPress={()=>void run(restore)}><Text style={{color:'#087fb9',padding:12}}>重新檢查登入狀態</Text></Pressable>
 </View>;
}
