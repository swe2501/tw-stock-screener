import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,BackHandler,Linking,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {bridgeScript,chapters,routeKind,websiteOrigin} from './market-home';
import {palettes} from './appearance';

const WEBSITE=websiteOrigin(process.env.EXPO_PUBLIC_WEBSITE_URL||'https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app');
const HOME=WEBSITE+'/?view=home';
export default function MarketHome({dark,active}:{dark:boolean;active:boolean}){
 const c=palettes[dark?'dark':'light'],web=useRef<WebView>(null);
 const [menu,setMenu]=useState(false),[chapter,setChapter]=useState('summary'),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[back,setBack]=useState(false);
 const selected=chapters.find(item=>item.id===chapter)||chapters[0];
 useEffect(()=>{if(ready)web.current?.injectJavaScript(bridgeScript(WEBSITE,dark));},[dark,ready]);
 useEffect(()=>{if(Platform.OS!=='android'||!active)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(menu){setMenu(false);return true;}if(back&&!error){web.current?.goBack();return true;}return false;});return()=>sub.remove();},[active,back,error,menu]);
 useEffect(()=>{if(!loading)return;const timer=setTimeout(()=>{setLoading(false);setError('網站回應較慢，請檢查網路後重新載入。');},25000);return()=>clearTimeout(timer);},[loading]);
 function retry(){setError('');setReady(false);setLoading(true);web.current?.reload();}
 async function openWebsite(){try{await Linking.openURL(HOME);}catch{Alert.alert('無法開啟網站','請檢查網路後再試。');}}
 function jump(id:string){setMenu(false);web.current?.injectJavaScript(bridgeScript(WEBSITE,dark,id));}
 const action=(label:string,fn:()=>void)=><Pressable accessibilityRole="button" onPress={fn} style={[s.action,{backgroundColor:c.soft}]}><Text style={{color:c.accent,fontSize:15,fontWeight:'700'}}>{label}</Text></Pressable>;
 return <View style={{flex:1,backgroundColor:c.bg}}>
  <View style={[s.toolbar,{borderColor:c.border,backgroundColor:c.card}]}>
   {back&&<Pressable accessibilityRole="button" accessibilityLabel="返回上一頁" onPress={()=>web.current?.goBack()} style={s.small}><Text style={{color:c.accent,fontSize:22}}>‹</Text></Pressable>}
   <Pressable accessibilityRole="button" accessibilityLabel="選擇大盤報告章節" accessibilityState={{expanded:menu}} onPress={()=>setMenu(true)} style={s.select}><Text style={[s.kicker,{color:c.muted}]}>大盤研究 · 完整首頁</Text><Text style={[s.selection,{color:c.text}]}>{selected.title} <Text style={{color:c.accent}}>⌄</Text></Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="重新載入首頁" onPress={retry} style={s.small}><Text style={{fontSize:23,color:c.accent}}>↻</Text></Pressable>
  </View>
  <WebView ref={web} source={{uri:HOME}} style={{flex:1,backgroundColor:c.bg,display:error?'none':'flex'}}
   originWhitelist={['*']} mixedContentMode="never" allowFileAccess={false} javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
   sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowsBackForwardNavigationGestures allowsLinkPreview={false}
   injectedJavaScript={bridgeScript(WEBSITE,dark)}
   onShouldStartLoadWithRequest={request=>{const kind=routeKind(request.url,WEBSITE);if(kind==='internal')return true;if(request.isTopFrame!==false&&kind==='external'){if(new URL(request.url).hostname==='vercel.com'){setReady(false);setLoading(false);setError('這個測試網站有 Vercel 存取保護，尚未能在 App 載入內容。請使用瀏覽器確認網站授權。');}else Alert.alert('開啟外部網站','此連結會在瀏覽器開啟。',[{text:'取消',style:'cancel'},{text:'開啟',onPress:()=>void Linking.openURL(request.url).catch(()=>Alert.alert('無法開啟連結'))}]);}return false;}}
   onOpenWindow={({nativeEvent})=>{if(routeKind(nativeEvent.targetUrl,WEBSITE)!=='blocked')Alert.alert('開啟外部網站','此連結會在瀏覽器開啟。',[{text:'取消',style:'cancel'},{text:'開啟',onPress:()=>void Linking.openURL(nativeEvent.targetUrl).catch(()=>Alert.alert('無法開啟連結'))}]);}}
   onNavigationStateChange={state=>setBack(state.canGoBack)}
   onLoadStart={()=>{setLoading(true);setReady(false);}}
   onLoadEnd={()=>setLoading(false)}
   onMessage={({nativeEvent})=>{if(routeKind(nativeEvent.url,WEBSITE)!=='internal')return;try{const message=JSON.parse(nativeEvent.data);if(message.type==='ready'){setReady(true);setError('');}else if(message.type==='chapter'&&chapters.some(item=>item.id===message.id))setChapter(message.id);else if(message.type==='unavailable')setError('目前網址尚未提供研究首頁，可能需要網站授權。');else if(message.type==='missing')Alert.alert('章節正在更新','網站已調整此區內容，請先從頁面往下閱讀。');}catch{}}}
   onError={()=>{setLoading(false);setReady(false);setError('暫時無法連上研究首頁。請檢查網路後再試。');}}
   onHttpError={()=>{setLoading(false);setReady(false);setError('研究首頁暫時無法讀取，請稍後重新載入。');}}
   onContentProcessDidTerminate={retry} onRenderProcessGone={retry}
  />
  {loading&&!error&&<View pointerEvents="none" style={[s.loading,{backgroundColor:c.card}]}><ActivityIndicator color={c.accent}/><Text style={{color:c.muted}}>正在載入完整市場報告…</Text></View>}
  {!!error&&<ScrollView contentContainerStyle={s.empty}>
   <Text style={[s.kicker,{color:c.accent}]}>先看資金，再看故事。</Text><Text accessibilityRole="header" style={[s.title,{color:c.text}]}>首頁內容已安排，{ '\n'}正在等候網站連線。</Text>
   <Text accessibilityRole="alert" style={[s.body,{color:c.muted}]}>{error}</Text>
   <View style={s.actions}>{action('重新連線',retry)}{action('在瀏覽器開啟網站 ↗',()=>void openWebsite())}</View>
   <Text style={[s.body,{color:c.muted}]}>以下保留網站首頁的完整閱讀順序。取得網站存取權後，可從上方章節選單快速前往。</Text>
   {chapters.map((item,i)=><View key={item.id} style={[s.outline,{borderColor:c.border}]}><Text style={{color:c.accent,fontWeight:'700'}}>{String(i+1).padStart(2,'0')}</Text><View style={{flex:1}}><Text style={[s.selection,{color:c.text}]}>{item.title}</Text><Text style={{color:c.muted,fontSize:14,lineHeight:23}}>{item.hint}</Text></View></View>)}
  </ScrollView>}
  <Modal visible={menu&&active} transparent animationType="slide" onRequestClose={()=>setMenu(false)}>
   <View style={s.modal}><Pressable accessibilityRole="button" accessibilityLabel="關閉章節選單" onPress={()=>setMenu(false)} style={s.scrim}/><SafeAreaView edges={['bottom']} style={[s.sheet,{backgroundColor:c.card}]}>
    <View style={s.sheetHeading}><Text accessibilityRole="header" style={[s.title,{color:c.text}]}>從哪裡開始讀？</Text>{action('關閉',()=>setMenu(false))}</View>
    <Text style={[s.body,{color:c.muted}]}>先讀大盤，再依資金、參與度與槓桿逐步深入。</Text>
    <ScrollView>{chapters.map((item,i)=><Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:item.id===chapter,disabled:!ready}} disabled={!ready} onPress={()=>jump(item.id)} style={[s.chapter,{borderColor:c.border,backgroundColor:item.id===chapter?c.soft:c.card}]}><Text style={{color:c.accent,fontWeight:'700'}}>{String(i+1).padStart(2,'0')}</Text><View style={{flex:1}}><Text style={[s.selection,{color:c.text}]}>{item.title}</Text><Text style={{color:c.muted,fontSize:14,lineHeight:22}}>{item.hint}</Text></View><Text style={{color:c.accent}}>{ready?'→':'待連線'}</Text></Pressable>)}</ScrollView>
   </SafeAreaView></View>
  </Modal>
 </View>;
}
const s=StyleSheet.create({toolbar:{flexDirection:'row',alignItems:'center',paddingHorizontal:18,paddingVertical:10,borderBottomWidth:1,gap:8},select:{flex:1,minHeight:48,justifyContent:'center',gap:3},kicker:{fontSize:12,lineHeight:20,letterSpacing:.7},selection:{fontSize:17,lineHeight:25,fontWeight:'700'},small:{minWidth:44,minHeight:48,justifyContent:'center',alignItems:'center'},loading:{position:'absolute',top:85,left:20,right:20,borderRadius:16,padding:18,flexDirection:'row',gap:12},empty:{padding:24,gap:16,paddingBottom:40},title:{fontSize:24,lineHeight:35,fontWeight:'800'},body:{fontSize:16,lineHeight:27},actions:{gap:10,marginVertical:4},action:{minHeight:46,padding:14,borderRadius:14,alignItems:'center',justifyContent:'center'},outline:{flexDirection:'row',gap:16,alignItems:'center',borderTopWidth:1,paddingVertical:16},modal:{flex:1,justifyContent:'flex-end'},scrim:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#06121db3'},sheet:{maxHeight:'85%',borderTopLeftRadius:28,borderTopRightRadius:28,padding:22,gap:16},sheetHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},chapter:{minHeight:76,flexDirection:'row',gap:14,alignItems:'center',borderWidth:1,padding:14,borderRadius:17,marginBottom:10}});
