import {useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Pressable,Text,View} from 'react-native';
import {configured,googleLogin,logout,restore,type Member} from './auth';
import {palettes} from './appearance';

export default function MemberScreen({dark}:{dark:boolean}){
 const [member,setMember]=useState<Member|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const c=palettes[dark?'dark':'light'],color=c.text;
 const preview=process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW==='1';
 async function run(work:()=>Promise<Member|null>){setBusy(true);setMessage('');try{setMember(await work());}catch(e){setMessage(e instanceof Error?e.message:'登入暫時無法完成');}finally{setBusy(false);}}
 useEffect(()=>{if(preview)return;void run(restore);const listener=AppState.addEventListener('change',state=>{if(state==='active')void run(restore);});return()=>listener.remove();},[preview]);
 if(preview)return <View style={{padding:24,gap:16,backgroundColor:c.card,borderColor:c.border,borderWidth:1,borderRadius:24}}>
  <Text accessibilityRole="header" style={{color,fontSize:22,fontWeight:'700'}}>你的研究，專屬的位置</Text>
  <Text style={{color:c.muted,fontSize:16,lineHeight:27}}>目前是 Expo Go 介面預覽。原生 Google 登入須使用獨立測試安裝版，這裡暫不開放登入。</Text>
  <View style={{padding:16,borderRadius:16,backgroundColor:c.soft}}><Text style={{color,fontSize:15,lineHeight:25}}>會員收藏與跨裝置同步將在登入驗證完成後接入；目前不會讀寫正式會員資料。</Text></View>
 </View>;
 return <View style={{padding:24,gap:16,backgroundColor:c.card,borderRadius:24}}>
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
