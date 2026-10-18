import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,Linking,Pressable,ScrollView,StyleSheet,Text,TextInput,useColorScheme,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import MemberScreen from './MemberScreen';
import {palettes} from './appearance';
import {searchNews,type NewsItem} from '../../../packages/shared/news-api';

const SITE=process.env.EXPO_PUBLIC_API_BASE_URL||'https://tw-stock-mobile-preview.vercel.app';
const WEBSITE='https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app';
const tabs=['總覽','研究搜尋','我的觀察','會員'] as const;
const symbols=['⌂','⌕','☆','♙'];
const modes=['auto','light','dark'] as const;
export default function AppShell(){
 const system=useColorScheme(),{width,fontScale}=useWindowDimensions();
 const [mode,setMode]=useState<typeof modes[number]>('auto');
 const dark=mode==='auto'?system==='dark':mode==='dark',wide=width>=768&&fontScale<1.5;
 const c=palettes[dark?'dark':'light'];
 const [tab,setTab]=useState<typeof tabs[number]>('總覽'),[query,setQuery]=useState(''),[items,setItems]=useState<NewsItem[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[searched,setSearched]=useState(false);
 const sequence=useRef(0),active=useRef<AbortController|null>(null),scroll=useRef<ScrollView>(null);
 useEffect(()=>()=>{++sequence.current;active.current?.abort();},[]);
 const text={color:c.text},muted={color:c.muted},card={backgroundColor:c.card,borderColor:c.border},accent={color:c.accent};
 function select(next:typeof tabs[number]){setTab(next);scroll.current?.scrollTo({y:0,animated:false});}
 async function open(url:string){try{await Linking.openURL(url);}catch{Alert.alert('無法開啟連結','請稍後再試。');}}
 async function search(value=query){
  if(value.trim().length<2){++sequence.current;active.current?.abort();setBusy(false);setItems([]);setMessage('請輸入至少兩個字，例如「半導體」。');return;}
  const id=++sequence.current;active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setSearched(true);setMessage('');setItems([]);
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{const r=await searchNews(SITE,value,{signal:controller.signal});if(id!==sequence.current)return;setItems(r.items);setMessage(r.partial?'部分來源暫時無法取得，下方僅呈現已取得的資料。':r.items.length?'':'沒有找到符合的資料，試試公司名稱或其他關鍵字。');}
  catch(e){if(id===sequence.current)setMessage(e instanceof Error&&e.name==='AbortError'?'連線逾時，請再試一次。':e instanceof Error?e.message:'搜尋暫時無法使用，請稍後重試。');}
  finally{clearTimeout(timeout);if(id===sequence.current)setBusy(false);}
 }
 const button=(label:string,onPress:()=>void,primary=false)=><Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[s.button,{backgroundColor:primary?c.accent:c.soft,opacity:pressed?.75:1}]}><Text style={[s.buttonText,{color:primary?(dark?'#142331':'#fff'):c.text}]}>{label}</Text></Pressable>;
 return <SafeAreaView style={[s.safe,{backgroundColor:c.bg}]}><StatusBar style={dark?'light':'dark'}/>
  <View style={[s.header,{backgroundColor:c.card,borderColor:c.border}]}>
   <View style={s.brandRow}><Image source={require('../assets/academy-mark.png')} style={s.logo} resizeMode="contain" accessibilityLabel="跟誰學標誌"/><View style={s.brandCopy}><Text style={[s.brand,text]}>跟誰學</Text><Text style={[s.caption,muted]}>盤後研究院 · MARKET ACADEMY</Text></View></View>
   <Pressable accessibilityRole="button" accessibilityLabel={`外觀：${mode==='auto'?'跟隨系統':dark?'深色':'淺色'}，點擊切換`} onPress={()=>setMode(modes[(modes.indexOf(mode)+1)%modes.length])} style={[s.theme,{backgroundColor:c.soft}]}><Text style={[s.themeIcon,accent]}>{mode==='auto'?'◐':dark?'☾':'☀'}</Text></Pressable>
  </View>
  <ScrollView ref={scroll} contentContainerStyle={[s.content,wide&&s.wide]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
   <View style={s.pageHeading}><View style={{flex:1}}><Text style={[s.eyebrow,accent]}>YOUR RESEARCH SPACE</Text><Text accessibilityRole="header" style={[s.title,text]}>{tab==='總覽'?'研究，從好奇開始。':tab}</Text></View><View style={[s.badge,{backgroundColor:c.soft}]}><Text style={[s.caption,muted]}>介面預覽</Text></View></View>
   {tab==='總覽'&&<>
    <View style={[s.hero,{backgroundColor:c.hero}]}><View pointerEvents="none" style={s.orbit}/><Text style={[s.eyebrow,{color:c.gold}]}>觀察 · 理解 · 驗證</Text><Text style={s.heroTitle}>把市場脈絡，{wide?'':'\n'}留在手邊。</Text><Text style={s.heroBody}>從產業事件到研究線索，慢慢建立自己的觀點。</Text>{button('探索研究線索  →',()=>select('研究搜尋'),true)}</View>
    <Text accessibilityRole="header" style={[s.sectionTitle,text]}>今天，從哪裡開始？</Text>
    <View style={[s.grid,wide&&s.columns]}>
     <Pressable accessibilityRole="button" accessibilityLabel="前往新聞與題材搜尋" onPress={()=>select('研究搜尋')} style={({pressed})=>[s.card,card,wide&&s.half,pressed&&s.pressed]}><Text style={[s.tileIcon,accent]}>⌕</Text><Text style={[s.subtitle,text]}>新聞與題材</Text><Text style={[s.body,muted]}>找公司、產業與事件，沿著來源繼續閱讀。</Text><Text style={[s.action,accent]}>開始搜尋  →</Text></Pressable>
     <Pressable accessibilityRole="link" accessibilityLabel="在瀏覽器開啟網站集團研究台" onPress={()=>void open(WEBSITE+'/#groupbook')} style={({pressed})=>[s.card,card,wide&&s.half,pressed&&s.pressed]}><Text style={[s.tileIcon,accent]}>▤</Text><Text style={[s.subtitle,text]}>集團研究台</Text><Text style={[s.body,muted]}>查看集團關係與季度研究；目前於網站開啟。</Text><Text style={[s.action,accent]}>開啟網站  ↗</Text></Pressable>
    </View>
    <View style={[s.card,card]}><Text style={[s.subtitle,text]}>讓每一個想法，都有依據</Text>{['找到感興趣的事件與公司','核對來源、日期與資料範圍','留下問題，再逐步驗證'].map((v,i)=><View key={v} style={s.step}><Text style={[s.stepNumber,{color:c.accent,backgroundColor:c.soft}]}>{'0'+(i+1)}</Text><Text style={[s.stepText,text]}>{v}</Text></View>)}</View>
   </>}
   {tab==='研究搜尋'&&<>
    <View style={[s.card,card]}><Text style={[s.subtitle,text]}>你想了解什麼？</Text><Text style={[s.body,muted]}>輸入公司、產業或事件。搜尋結果會保留來源與日期。</Text><TextInput accessibilityLabel="研究關鍵字" placeholder="例如：半導體、ETF" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={()=>void search()} maxLength={80} style={[s.input,{backgroundColor:c.bg,borderColor:c.border},text]}/><View style={s.chips}>{['半導體','ETF','AI 伺服器'].map(v=><Pressable key={v} accessibilityRole="button" onPress={()=>{setQuery(v);void search(v);}} style={[s.chip,{backgroundColor:c.soft}]}><Text style={[s.chipText,muted]}>{v}</Text></Pressable>)}</View>{button(busy?'重新搜尋':'搜尋研究資料',()=>void search(),true)}</View>
    {busy&&<View style={s.loading}><ActivityIndicator color={c.accent}/><Text style={muted}>正在整理研究線索…</Text></View>}
    {!!message&&<View style={[s.card,card]}><Text accessibilityRole="alert" style={[s.body,muted]}>{message}</Text>{searched&&!busy&&button('再試一次',()=>void search())}</View>}
    {!busy&&items.length>0&&<Text style={[s.sectionTitle,text]}>{items.length} 筆研究線索</Text>}
    {items.map((item,i)=><View key={item.url||item.title+i} style={[s.card,card]}><Text style={[s.caption,muted]}>{[item.source,item.date].filter(Boolean).join(' · ')}</Text><Text style={[s.subtitle,text]}>{item.title}</Text><Text style={[s.body,muted]}>{item.snippet}</Text>{item.url&&button('閱讀原始來源  ↗',()=>void open(item.url!))}</View>)}
    {!searched&&<Text style={[s.body,muted]}>先從一個關鍵字開始。預覽環境資料尚在建置，服務未就緒時會顯示實際狀態。</Text>}
   </>}
   {tab==='我的觀察'&&<View style={[s.card,card]}><Text style={[s.tileIcon,accent]}>☆</Text><Text style={[s.subtitle,text]}>把值得追蹤的想法留下來</Text><Text style={[s.body,muted]}>App 自選與同步尚在開發。現有收藏與交易紀錄請先至網站會員中心查看。</Text>{button('先找研究線索',()=>select('研究搜尋'),true)}<View style={{height:12}}/>{button('開啟網站會員中心  ↗',()=>void open(WEBSITE+'/#member/overview'))}</View>}
   {tab==='會員'&&<MemberScreen dark={dark}/>}
   <Text style={[s.footer,muted]}>研究資訊僅供參考。請核對來源與資料日期。</Text>
  </ScrollView>
  <View accessibilityRole="tablist" style={[s.nav,{backgroundColor:c.card,borderColor:c.border}]}>{tabs.map((item,i)=><Pressable key={item} accessibilityRole="tab" accessibilityState={{selected:tab===item}} onPress={()=>select(item)} style={({pressed})=>[s.tab,{backgroundColor:tab===item?c.soft:'transparent',opacity:pressed?.7:1}]}><Text accessible={false} style={[s.navIcon,{color:tab===item?c.accent:c.muted}]}>{symbols[i]}</Text><Text style={[s.navText,{color:tab===item?c.accent:c.muted}]}>{item}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({
 safe:{flex:1},header:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,flexDirection:'row',alignItems:'center',gap:12},brandRow:{flex:1,flexDirection:'row',alignItems:'center',gap:12},brandCopy:{flex:1},logo:{width:44,height:48,borderRadius:12,backgroundColor:'#fff'},brand:{fontSize:22,fontWeight:'800',letterSpacing:2},caption:{fontSize:11,lineHeight:18},theme:{minWidth:46,minHeight:46,borderRadius:16,alignItems:'center',justifyContent:'center'},themeIcon:{fontSize:25},
 content:{padding:20,paddingBottom:24,gap:16},wide:{width:'100%',maxWidth:1080,alignSelf:'center',padding:32},pageHeading:{flexDirection:'row',gap:10,alignItems:'center',marginBottom:4},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.6,marginBottom:8},title:{fontSize:27,lineHeight:38,fontWeight:'800'},badge:{paddingHorizontal:10,paddingVertical:7,borderRadius:10},hero:{padding:26,borderRadius:26,overflow:'hidden',gap:10},orbit:{position:'absolute',width:250,height:250,borderRadius:125,borderWidth:35,borderColor:'#ffffff09',right:-70,top:-50},heroTitle:{fontSize:32,lineHeight:46,fontWeight:'800',color:'#fff'},heroBody:{fontSize:16,lineHeight:27,color:'#dae7f1',maxWidth:460,marginBottom:8},grid:{gap:16},columns:{flexDirection:'row',flexWrap:'wrap'},half:{flexGrow:1,flexBasis:'45%'},card:{borderWidth:1,borderRadius:24,padding:22},pressed:{opacity:.75},tileIcon:{fontSize:32,marginBottom:12},sectionTitle:{fontSize:20,lineHeight:30,fontWeight:'700',marginTop:4},subtitle:{fontSize:21,lineHeight:31,fontWeight:'700',marginBottom:10},body:{fontSize:16,lineHeight:27,marginBottom:16},action:{fontSize:15,fontWeight:'700',paddingVertical:8},button:{minHeight:48,borderRadius:15,paddingHorizontal:18,paddingVertical:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'700',lineHeight:23},step:{flexDirection:'row',alignItems:'center',gap:12,marginTop:14},stepNumber:{fontSize:13,fontWeight:'800',padding:10,borderRadius:12,overflow:'hidden'},stepText:{flex:1,fontSize:15,lineHeight:25},input:{borderWidth:1,borderRadius:16,padding:16,fontSize:17,minHeight:54},chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:14},chip:{minHeight:44,paddingHorizontal:14,paddingVertical:12,borderRadius:14},chipText:{fontSize:14},loading:{flexDirection:'row',justifyContent:'center',gap:12,padding:16},footer:{fontSize:12,lineHeight:21,textAlign:'center',marginTop:10},nav:{flexDirection:'row',borderTopWidth:1,paddingHorizontal:12,paddingVertical:8,gap:6},tab:{flex:1,minHeight:60,alignItems:'center',justifyContent:'center',padding:6,borderRadius:16,gap:4},navIcon:{fontSize:24},navText:{fontSize:12,fontWeight:'700',textAlign:'center'},
});
