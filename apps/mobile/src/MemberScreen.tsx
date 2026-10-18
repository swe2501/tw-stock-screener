import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Pressable,Text,TextInput,View} from 'react-native';
import {configured,emailLogin,googleLogin,logout,restore,type Member} from './auth';

const oauthAvailable=process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW!=='1';
export default function MemberScreen({dark}:{dark:boolean}){
 const [member,setMember]=useState<Member|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const running=useRef(false),mounted=useRef(true);
 const color=dark?'#e8eff6':'#172b43',backgroundColor=dark?'#142438':'#fff';
 async function run(work:()=>Promise<Member|null>){
  if(running.current)return;running.current=true;setBusy(true);setMessage('');
  try{const result=await work();if(mounted.current)setMember(result);}
  catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'登入暫時無法完成');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 async function signIn(){const value=password;setPassword('');await run(()=>emailLogin(email,value));}
 useEffect(()=>{mounted.current=true;void run(restore);const listener=AppState.addEventListener('change',state=>{if(state==='active')void run(restore);});return()=>{mounted.current=false;listener.remove();};},[]);
 const button={padding:16,backgroundColor:busy||!configured?'#697c8b':'#087fb9',borderRadius:12};
 const input={color,backgroundColor,padding:16,borderRadius:12,borderWidth:1,borderColor:dark?'#536b82':'#b2c3d2'};
 return <View style={{paddingVertical:20,gap:16}}>
  <Text accessibilityRole="header" style={{color,fontSize:20,fontWeight:'700'}}>測試環境會員登入</Text>
  <Text style={{color,lineHeight:24}}>此版本使用獨立測試帳號；網站正式會員資料不會帶入。</Text>
  {member?<><Text style={{color}}>已登入：{member.email||'測試會員'}</Text><Pressable disabled={busy} accessibilityRole="button" onPress={()=>void run(async()=>{await logout();return null;})} style={button}><Text style={{color:'#fff'}}>登出這台裝置</Text></Pressable></>:<>
   <TextInput accessibilityLabel="Email" placeholder="Email" placeholderTextColor={dark?'#a5b8cc':'#536b82'} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="email" value={email} onChangeText={setEmail} maxLength={254} editable={!busy} style={input}/>
   <TextInput accessibilityLabel="密碼" placeholder="密碼" placeholderTextColor={dark?'#a5b8cc':'#536b82'} secureTextEntry textContentType="password" autoComplete="current-password" autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} maxLength={4096} editable={!busy} returnKeyType="go" onSubmitEditing={()=>void signIn()} style={input}/>
   <Pressable disabled={busy||!configured} accessibilityRole="button" accessibilityState={{disabled:busy||!configured}} onPress={()=>void signIn()} style={button}><Text style={{color:'#fff'}}>Email 登入</Text></Pressable>
   {oauthAvailable?<Pressable disabled={busy||!configured} accessibilityRole="button" onPress={()=>void run(googleLogin)} style={button}><Text style={{color:'#fff'}}>使用 Google 登入</Text></Pressable>:<Text style={{color,lineHeight:24}}>Google 登入需使用獨立 App 測試版；Expo Go 請先使用 Email 登入。</Text>}
  </>}
  {!configured&&<Text style={{color}}>尚未設定測試登入連線。</Text>}
  {busy&&<ActivityIndicator accessibilityLabel="登入處理中"/>}
  {!!message&&<Text accessibilityRole="alert" style={{color}}>{message}</Text>}
  <Pressable disabled={busy} accessibilityRole="button" onPress={()=>void run(restore)}><Text style={{color:'#087fb9',padding:12}}>重新檢查登入狀態</Text></Pressable>
 </View>;
}
