import {useRef,useState} from 'react';
import {ActivityIndicator,Alert,Linking,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,useColorScheme,useWindowDimensions,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {searchNews,type NewsItem} from '../../../packages/shared/news-api';

const SITE=process.env.EXPO_PUBLIC_API_BASE_URL||'https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app';
const tabs=['總覽','研究搜尋','我的觀察','會員'] as const;
export default function AppShell(){
 const dark=useColorScheme()==='dark',wide=useWindowDimensions().width>=768;
 const c=dark?{bg:'#0c1725',card:'#142438',text:'#e8eff6',muted:'#a5b8cc',border:'#2c4259'}:{bg:'#f3f7fb',card:'#fff',text:'#172b43',muted:'#536b82',border:'#d6e3ee'};
 const [tab,setTab]=useState<typeof tabs[number]>('總覽'),[query,setQuery]=useState(''),[items,setItems]=useState<NewsItem[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const sequence=useRef(0),active=useRef<AbortController|null>(null);
 const text={color:c.text},muted={color:c.muted},card={backgroundColor:c.card,borderColor:c.border};
 async function open(url:string){try{await Linking.openURL(url)}catch{Alert.alert('無法開啟連結','請稍後再試')}}
 async function search(){const id=++sequence.current;active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setMessage('');setItems([]);const timeout=setTimeout(()=>controller.abort(),15000);
  try{const r=await searchNews(SITE,query,{signal:controller.signal});if(id!==sequence.current)return;setItems(r.items);setMessage(r.partial?'部分資料來源暫時無法取得。':r.items.length?'':'沒有找到符合的研究資料，請換個關鍵字。')}
  catch(e){if(id===sequence.current)setMessage(e instanceof Error&&e.name==='AbortError'?'連線逾時，請重試。':e instanceof Error?e.message:'搜尋失敗，請重試。')}
  finally{clearTimeout(timeout);if(id===sequence.current)setBusy(false)}}
 return <SafeAreaView style={[s.safe,{backgroundColor:c.bg}]}><StatusBar style={dark?'light':'dark'}/>
  <View style={[s.header,{borderColor:c.border}]}><Text style={[s.brand,text]}>跟誰學</Text><Text style={[s.caption,muted]}>盤後研究院 · App 開發版</Text></View>
  <ScrollView contentContainerStyle={[s.content,wide&&s.wide]} keyboardShouldPersistTaps="handled">
   <Text accessibilityRole="header" style={[s.title,text]}>{tab==='總覽'?'把市場脈絡，留在手邊。':tab}</Text>
   <Text style={[s.body,muted]}>從新聞與產業事件開始，整理自己的研究方向。</Text>
   {tab==='總覽'&&<View style={[s.grid,wide&&s.columns]}>
    <Pressable accessibilityRole="button" accessibilityLabel="前往研究搜尋" onPress={()=>setTab('研究搜尋')} style={[s.card,card,wide&&s.half]}><Text style={s.eyebrow}>RESEARCH</Text><Text style={[s.subtitle,text]}>找到下一個研究問題</Text><Text style={[s.body,muted]}>搜尋站內已收錄的新聞與題材，查看來源與資料日期。</Text><Text style={s.action}>開始研究 →</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="在瀏覽器開啟集團研究" onPress={()=>void open(SITE+'/#groupbook')} style={[s.card,card,wide&&s.half]}><Text style={s.eyebrow}>GROUP INSIGHTS</Text><Text style={[s.subtitle,text]}>集團作帳研究</Text><Text style={[s.body,muted]}>先在網站研究台查看完整資料。原生集團頁將另行開發。</Text><Text style={s.action}>開啟網站研究台 ↗</Text></Pressable>
   </View>}
   {tab==='研究搜尋'&&<View><Text style={[s.subtitle,text]}>新聞與題材</Text><View style={s.search}><TextInput accessibilityLabel="研究關鍵字" placeholder="公司、產業或事件" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={()=>void search()} maxLength={80} style={[s.input,card,text]}/><Pressable accessibilityRole="button" onPress={()=>void search()} disabled={busy} style={s.button}><Text style={s.white}>搜尋</Text></Pressable></View>
    {busy&&<ActivityIndicator accessibilityLabel="搜尋中" color="#087fb9"/>}{!!message&&<Text accessibilityRole="alert" style={[s.body,muted]}>{message}</Text>}
    {items.map((item,i)=><View key={item.url||item.title+i} style={[s.card,card]}><Text style={[s.caption,muted]}>{item.source} · {item.date}</Text><Text style={[s.subtitle,text]}>{item.title}</Text><Text style={[s.body,muted]}>{item.snippet}</Text>{item.url&&<Pressable accessibilityRole="link" onPress={()=>void open(item.url!)}><Text style={s.action}>閱讀原始來源 ↗</Text></Pressable>}</View>)}
   </View>}
   {tab==='我的觀察'&&<View style={[s.card,card]}><Text style={[s.subtitle,text]}>建立你的觀察清單</Text><Text style={[s.body,muted]}>原生自選與同步尚在開發。現有收藏與交易紀錄請先在網站使用。</Text><Pressable accessibilityRole="link" onPress={()=>void open(SITE+'/#member/overview')}><Text style={s.action}>前往網站會員中心 ↗</Text></Pressable></View>}
   {tab==='會員'&&<View style={[s.card,card]}><Text style={[s.subtitle,text]}>沿用你的會員帳號</Text><Text style={[s.body,muted]}>原生登入尚未接通。完成安全憑證保存與 Google／LINE 回呼驗證後，再開放 App 登入。</Text></View>}
   <Text style={[s.caption,muted]}>研究資訊僅供參考，不構成投資建議。請留意資料日期。</Text>
  </ScrollView>
  <View accessibilityRole="tablist" style={[s.nav,{backgroundColor:c.card,borderColor:c.border}]}>{tabs.map(item=><Pressable key={item} accessibilityRole="tab" accessibilityState={{selected:tab===item}} onPress={()=>setTab(item)} style={s.tab}><Text style={{color:tab===item?'#087fb9':c.muted,fontWeight:'700'}}>{item}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1},header:{padding:24,borderBottomWidth:1},brand:{fontSize:24,fontWeight:'800'},caption:{fontSize:12,lineHeight:21},content:{padding:24,paddingBottom:40},wide:{width:'100%',maxWidth:1100,alignSelf:'center'},title:{fontSize:30,fontWeight:'800',lineHeight:42,marginBottom:12},grid:{gap:16},columns:{flexDirection:'row',flexWrap:'wrap'},half:{flexGrow:1,flexBasis:'45%'},card:{borderWidth:1,borderRadius:20,padding:22,marginBottom:16},eyebrow:{color:'#087fb9',fontSize:11,fontWeight:'800',letterSpacing:2,marginBottom:14},subtitle:{fontSize:20,lineHeight:30,fontWeight:'700',marginBottom:8},body:{fontSize:15,lineHeight:25,marginBottom:18},action:{color:'#087fb9',fontSize:15,fontWeight:'700',paddingVertical:10},search:{flexDirection:'row',gap:10,marginBottom:20},input:{flex:1,minWidth:0,borderWidth:1,borderRadius:14,padding:14,fontSize:16},button:{justifyContent:'center',backgroundColor:'#087fb9',borderRadius:14,paddingHorizontal:18},white:{color:'#fff',fontWeight:'700'},nav:{flexDirection:'row',borderTopWidth:1,paddingVertical:12},tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,paddingHorizontal:4}});
