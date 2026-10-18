import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Pressable,Text,TextInput,View} from 'react-native';
import {configured,emailLogin,register,resendConfirmation,confirmRegistration,googleLogin,logout,restore,type Member} from './auth';

const oauthAvailable=process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW!=='1';
export default function MemberScreen({dark}:{dark:boolean}){
 const [member,setMember]=useState<Member|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [creating,setCreating]=useState(false),[confirmation,setConfirmation]=useState(false),[link,setLink]=useState(''),[cooldown,setCooldown]=useState(false);
 const running=useRef(false),mounted=useRef(true);
 const color=dark?'#e8eff6':'#172b43',backgroundColor=dark?'#142438':'#fff';
 async function run(work:()=>Promise<Member|null>){
  if(running.current)return;running.current=true;setBusy(true);setMessage('');
  try{const result=await work();if(mounted.current)setMember(result);}
  catch(e){if(mounted.current){const detail=e instanceof Error?e.message:'登入暫時無法完成';setMessage(detail);if((e as {code?:string}).code==='otp_expired'){setCreating(false);setConfirmation(false);setLink('');}Alert.alert('操作未完成',detail);}}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 async function signIn(){const value=password;setPassword('');await run(()=>emailLogin(email,value));}
 async function signUp(){const value=password;setPassword('');await run(async()=>{const result=await register(email,value);if(!result&&mounted.current){setConfirmation(true);setCooldown(true);setMessage('若此信箱可註冊，將收到驗證信。請查看收件匣與垃圾郵件。');}return result;});}
 async function resend(){await run(async()=>{await resendConfirmation(email);if(mounted.current){setCooldown(true);setMessage('若帳號仍待驗證，將收到新的驗證信，請使用最新一封。');}return null;});}
 async function verify(){const value=link;await run(async()=>{const result=await confirmRegistration(value);if(mounted.current)setLink('');return result;});}
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(false),60000);return()=>clearTimeout(timer);},[cooldown]);
 useEffect(()=>{mounted.current=true;void run(restore);const listener=AppState.addEventListener('change',state=>{if(state==='active')void run(restore);});return()=>{mounted.current=false;listener.remove();};},[]);
 const button={padding:16,backgroundColor:busy||!configured?'#697c8b':'#087fb9',borderRadius:12};
 const input={color,backgroundColor,padding:16,borderRadius:12,borderWidth:1,borderColor:dark?'#536b82':'#b2c3d2'};
 return <View style={{paddingVertical:20,gap:16}}>
  <Text accessibilityRole="header" style={{color,fontSize:20,fontWeight:'700'}}>測試環境會員登入</Text>
  <Text style={{color,lineHeight:24}}>此版本使用獨立測試帳號；網站正式會員資料不會帶入。</Text>
  {member?<><Text style={{color}}>已登入：{member.email||'測試會員'}</Text><Pressable disabled={busy} accessibilityRole="button" onPress={()=>void run(async()=>{await logout();return null;})} style={button}><Text style={{color:'#fff'}}>登出這台裝置</Text></Pressable></>:<>
   <TextInput accessibilityLabel="Email" placeholder="Email" placeholderTextColor={dark?'#a5b8cc':'#536b82'} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="email" value={email} onChangeText={setEmail} maxLength={254} editable={!busy} style={input}/>
   <TextInput accessibilityLabel="密碼" placeholder={creating?'設定密碼（至少 8 字元）':'密碼'} placeholderTextColor={dark?'#a5b8cc':'#536b82'} secureTextEntry textContentType={creating?'newPassword':'password'} autoComplete={creating?'new-password':'current-password'} autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} maxLength={4096} editable={!busy} returnKeyType="go" onSubmitEditing={()=>void (creating?signUp():signIn())} style={input}/>
   <Pressable disabled={busy||!configured||creating&&cooldown} accessibilityRole="button" accessibilityState={{disabled:busy||!configured||creating&&cooldown}} onPress={()=>void (creating?signUp():signIn())} style={button}><Text style={{color:'#fff'}}>{creating?'建立測試帳號':'Email 登入'}</Text></Pressable>
   <Pressable disabled={busy} accessibilityRole="button" onPress={()=>{setCreating(!creating);setPassword('');setMessage('');}}><Text style={{color:'#087fb9',padding:12}}>{creating?'已有帳號？回到登入':'還沒有測試帳號？註冊'}</Text></Pressable>
   <Pressable disabled={busy} accessibilityRole="button" onPress={()=>setConfirmation(!confirmation)}><Text style={{color:'#087fb9',padding:12}}>已收到驗證信／尚未完成信箱驗證</Text></Pressable>
   {confirmation&&<View style={{gap:12}}>
    <Text style={{color,lineHeight:24}}>若已點過信件連結，信箱可能已完成驗證，請先回到 Email 登入。尚未點過時，才長按信件驗證按鈕、複製連結並貼在下方。</Text>
    <Pressable disabled={busy} accessibilityRole="button" onPress={()=>{setCreating(false);setConfirmation(false);setLink('');setPassword('');setMessage('請輸入註冊時設定的密碼登入。');}}><Text style={{color:'#087fb9',padding:12}}>已驗證？改用 Email 與密碼登入</Text></Pressable>
    <TextInput accessibilityLabel="註冊驗證連結" placeholder="貼上信件中的驗證連結" placeholderTextColor={dark?'#a5b8cc':'#536b82'} secureTextEntry autoCapitalize="none" autoCorrect={false} value={link} onChangeText={setLink} editable={!busy} maxLength={4096} style={input}/>
    <Pressable disabled={busy||!configured||!link.trim()} accessibilityRole="button" onPress={()=>void verify()} style={button}><Text style={{color:'#fff'}}>驗證信箱並登入</Text></Pressable>
    <Pressable disabled={busy||!configured||cooldown} accessibilityRole="button" onPress={()=>void resend()}><Text style={{color:'#087fb9',padding:12}}>{cooldown?'請稍候 60 秒再寄送':'重寄驗證信到上方 Email'}</Text></Pressable>
   </View>}
   {oauthAvailable?<Pressable disabled={busy||!configured} accessibilityRole="button" onPress={()=>void run(googleLogin)} style={button}><Text style={{color:'#fff'}}>使用 Google 登入</Text></Pressable>:<Text style={{color,lineHeight:24}}>Google 登入需使用獨立 App 測試版；Expo Go 請先使用 Email 登入。</Text>}
  </>}
  {!configured&&<Text style={{color}}>尚未設定測試登入連線。</Text>}
  {busy&&<ActivityIndicator accessibilityLabel="登入處理中"/>}
  {!!message&&<Text accessibilityRole="alert" style={{color}}>{message}</Text>}
  <Pressable disabled={busy} accessibilityRole="button" onPress={()=>void run(restore)}><Text style={{color:'#087fb9',padding:12}}>重新檢查登入狀態</Text></Pressable>
 </View>;
}
