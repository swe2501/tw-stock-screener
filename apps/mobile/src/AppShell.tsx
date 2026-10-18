import {useEffect,useRef,useState,type ComponentRef} from 'react';
import {ActivityIndicator,Alert,Image,Linking,Platform,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,useColorScheme,useWindowDimensions,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {StatusBar} from 'expo-status-bar';
import MemberScreen from './MemberScreen';
import HomeScreen from './HomeHero';
import {searchNews,type NewsItem} from '../../../packages/shared/news-api';

const SITE=process.env.EXPO_PUBLIC_API_BASE_URL||'https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app';
const WEBSITE='https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app';
const tabs=['總覽','研究搜尋','我的觀察','會員'] as const;
export default function AppShell(){
 const systemTheme=useColorScheme(),[theme,setTheme]=useState<'light'|'dark'|null>(null),themeTouched=useRef(false);
 const dark=(theme||systemTheme)==='dark',wide=useWindowDimensions().width>=768;
 useEffect(()=>{let alive=true;void SecureStore.getItemAsync('academy.display.theme').then(value=>{if(alive&&!themeTouched.current&&(value==='light'||value==='dark'))setTheme(value);}).catch(()=>{});return()=>{alive=false;};},[]);
 function toggleTheme(){themeTouched.current=true;const value=dark?'light':'dark';setTheme(value);void SecureStore.setItemAsync('academy.display.theme',value).catch(()=>{});}
 const c=dark?{bg:'#0c1725',card:'#142438',text:'#e8eff6',muted:'#a5b8cc',border:'#2c4259'}:{bg:'#f3f7fb',card:'#fff',text:'#172b43',muted:'#536b82',border:'#d6e3ee'};
 const [tab,setTab]=useState<typeof tabs[number]>('總覽'),[query,setQuery]=useState(''),[items,setItems]=useState<NewsItem[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const sequence=useRef(0),active=useRef<AbortController|null>(null);
 const scroll=useRef<ComponentRef<typeof ScrollView>>(null);
 function navigate(next:typeof tabs[number]){setTab(next);scroll.current?.scrollTo({y:0,animated:false});}
 const text={color:c.text},muted={color:c.muted},card={backgroundColor:c.card,borderColor:c.border};
 async function open(url:string){try{await Linking.openURL(url)}catch{Alert.alert('無法開啟連結','請稍後再試')}}
 async function search(value=query){const id=++sequence.current;active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setMessage('');setItems([]);const timeout=setTimeout(()=>controller.abort(),15000);
  try{const r=await searchNews(SITE,value,{signal:controller.signal});if(id!==sequence.current)return;setItems(r.items);setMessage(r.partial?'部分資料來源暫時無法取得。':r.items.length?'':'沒有找到符合的研究資料，請換個關鍵字。')}
  catch(e){if(id===sequence.current)setMessage(e instanceof Error&&e.name==='AbortError'?'連線逾時，請重試。':e instanceof Error?e.message:'搜尋失敗，請重試。')}
  finally{clearTimeout(timeout);if(id===sequence.current)setBusy(false)}}
 return <SafeAreaView style={[s.safe,{backgroundColor:c.bg}]}><StatusBar style={dark?'light':'dark'}/>
  <View style={[s.header,{borderColor:c.border,backgroundColor:c.card}]}><View style={s.brandRow}><Image source={dark?require('../assets/brand/foresight-owl-dark.png'):require('../assets/brand/foresight-owl-light.png')} style={[s.logo,{borderColor:c.border}]} accessibilityLabel="先見量化智能標誌"/><View style={s.brandCopy}><Text style={[s.brand,text]}>先見量化智能</Text><Text style={[s.brandSub,muted]}>市場洞察 · 量化研究</Text><Text style={[s.english,muted]}>FORESIGHT QUANT INTELLIGENCE</Text></View></View><View style={s.edition}><Text style={[s.editionText,text]}>ISSUE　DAILY</Text><Text style={[s.caption,muted]}>盤後研究手札</Text><Pressable accessibilityRole="switch" accessibilityState={{checked:dark}} accessibilityLabel={dark?'切換至明亮介面':'切換至深色介面'} onPress={toggleTheme} style={[s.theme,{borderColor:c.border}]}><Text style={[s.themeText,text]}>{dark?'☀ 明亮':'☾ 深色'}</Text></Pressable></View></View>
  <ScrollView ref={scroll} contentContainerStyle={[s.content,wide&&s.wide]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
   {tab!=='總覽'&&<><Text accessibilityRole="header" style={[s.title,text]}>{tab}</Text><Text style={[s.body,muted]}>從新聞與產業事件開始，整理自己的研究方向。</Text></>}
   <View style={{display:tab==='總覽'?'flex':'none'}}><HomeScreen dark={dark} base={SITE} onSearch={value=>{setQuery(value);navigate('研究搜尋');if(value.trim().length>=2)void search(value);else{sequence.current++;active.current?.abort();setBusy(false);setItems([]);setMessage(value.trim()?'請輸入 2～80 個字的關鍵字':'');}}} onGroup={()=>void open(WEBSITE+'/#groupbook')} onMember={()=>navigate('會員')} onOpen={url=>void open(url)}/></View>
   {tab==='研究搜尋'&&<View><Text style={[s.subtitle,text]}>新聞與題材</Text><View style={s.search}><TextInput accessibilityLabel="研究關鍵字" placeholder="公司、產業或事件" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={()=>void search()} maxLength={80} style={[s.input,card,text]}/><Pressable accessibilityRole="button" onPress={()=>void search()} disabled={busy} style={s.button}><Text style={s.white}>搜尋</Text></Pressable></View>
    {busy&&<ActivityIndicator accessibilityLabel="搜尋中" color="#087fb9"/>}{!!message&&<Text accessibilityRole="alert" style={[s.body,muted]}>{message}</Text>}
    {items.map((item,i)=><View key={item.url||item.title+i} style={[s.card,card]}><Text style={[s.caption,muted]}>{item.source} · {item.date}</Text><Text style={[s.subtitle,text]}>{item.title}</Text><Text style={[s.body,muted]}>{item.snippet}</Text>{item.url&&<Pressable accessibilityRole="link" onPress={()=>void open(item.url!)}><Text style={s.action}>閱讀原始來源 ↗</Text></Pressable>}</View>)}
   </View>}
   {tab==='我的觀察'&&<View style={[s.card,card]}><Text style={[s.subtitle,text]}>建立你的觀察清單</Text><Text style={[s.body,muted]}>原生自選與同步尚在開發。現有收藏與交易紀錄請先在網站使用。</Text><Pressable accessibilityRole="link" onPress={()=>void open(WEBSITE+'/#member/overview')}><Text style={s.action}>前往網站會員中心 ↗</Text></Pressable></View>}
   {tab==='會員'&&<MemberScreen dark={dark}/>}
   <Text style={[s.caption,muted]}>研究資訊僅供參考，不構成投資建議。請留意資料日期。</Text>
  </ScrollView>
  <View accessibilityRole="tablist" style={[s.nav,{backgroundColor:c.card,borderColor:c.border}]}>{tabs.map(item=><Pressable key={item} accessibilityRole="tab" accessibilityState={{selected:tab===item}} onPress={()=>navigate(item)} style={s.tab}><Text style={{color:tab===item?'#087fb9':c.muted,fontWeight:'700'}}>{item}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1},header:{paddingHorizontal:18,paddingTop:16,paddingBottom:12,borderBottomWidth:1},brandRow:{flexDirection:'row',alignItems:'center',gap:10},logo:{width:43,height:43,borderWidth:1,borderRadius:11,resizeMode:'contain'},brandCopy:{flex:1,minWidth:0},brand:{fontFamily:Platform.OS==='ios'?'Songti TC':'serif',fontSize:22,lineHeight:31,fontWeight:'800'},brandSub:{fontSize:9,lineHeight:16,letterSpacing:1},english:{fontSize:7,lineHeight:12,letterSpacing:.5,fontWeight:'600'},theme:{marginLeft:'auto',borderWidth:1,borderRadius:10,paddingHorizontal:9,minHeight:44,justifyContent:'center'},themeText:{fontSize:12,fontWeight:'600'},edition:{flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'center',borderLeftWidth:2,borderColor:'#079fed',paddingLeft:10,marginTop:10},editionText:{fontSize:10,fontWeight:'800',letterSpacing:1.1},caption:{fontSize:12,lineHeight:21,flexShrink:1},content:{padding:14,paddingTop:22,paddingBottom:40},wide:{width:'100%',maxWidth:1100,alignSelf:'center'},title:{fontSize:30,fontWeight:'800',lineHeight:42,marginBottom:12},grid:{gap:16},columns:{flexDirection:'row',flexWrap:'wrap'},half:{flexGrow:1,flexBasis:'45%'},card:{borderWidth:1,borderRadius:20,padding:22,marginBottom:16},eyebrow:{color:'#087fb9',fontSize:11,fontWeight:'800',letterSpacing:2,marginBottom:14},subtitle:{fontSize:20,lineHeight:30,fontWeight:'700',marginBottom:8},body:{fontSize:15,lineHeight:25,marginBottom:18},action:{color:'#087fb9',fontSize:15,fontWeight:'700',paddingVertical:10},search:{flexDirection:'row',gap:10,marginBottom:20},input:{flex:1,minWidth:0,borderWidth:1,borderRadius:14,padding:14,fontSize:16},button:{justifyContent:'center',backgroundColor:'#087fb9',borderRadius:14,paddingHorizontal:18},white:{color:'#fff',fontWeight:'700'},nav:{flexDirection:'row',borderTopWidth:1,paddingVertical:12},tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,paddingHorizontal:4}});
