import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,useWindowDimensions,View} from 'react-native';
import {searchNews,type NewsItem} from '../../../packages/shared/news-api';
import {fetchMarketBrief,signed,type MarketBrief} from './home-api';

const topics=['台股','AI','半導體','光通訊'];
type Props={dark:boolean;base:string;onSearch:(query:string)=>void;onGroup:()=>void;onMember:()=>void;onOpen:(url:string)=>void};
export default function HomeScreen({dark,base,onSearch,onGroup,onMember,onOpen}:Props){
 const wide=useWindowDimensions().width>=768;
 const c=dark?{text:'#edf4fa',muted:'#b4c4d3',card:'#142438',border:'#30465a',accent:'#64c9f2',soft:'#17344a'}:{text:'#172b43',muted:'#536b70',card:'#fff',border:'#dae5ef',accent:'#087fae',soft:'#eaf5fb'};
 const [market,setMarket]=useState<MarketBrief|null>(null),[marketBusy,setMarketBusy]=useState(true),[marketError,setMarketError]=useState('');
 const [topic,setTopic]=useState('台股'),[news,setNews]=useState<NewsItem[]>([]),[newsBusy,setNewsBusy]=useState(true),[newsError,setNewsError]=useState(''),[partial,setPartial]=useState(false);
 const [refresh,setRefresh]=useState(0),[query,setQuery]=useState('');
 const marketSequence=useRef(0),newsSequence=useRef(0);
 useEffect(()=>{
  const id=++marketSequence.current,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  setMarketBusy(true);setMarketError('');
  void fetchMarketBrief(base,controller.signal).then(value=>{if(id===marketSequence.current)setMarket(value);}).catch(()=>{if(id===marketSequence.current)setMarketError('大盤暫時無法更新，請稍後重試。');}).finally(()=>{clearTimeout(timer);if(id===marketSequence.current)setMarketBusy(false);});
  return()=>{marketSequence.current++;controller.abort();clearTimeout(timer);};
 },[base,refresh]);
 useEffect(()=>{
  const id=++newsSequence.current,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  setNewsBusy(true);setNews([]);setNewsError('');setPartial(false);
  void searchNews(base,topic,{signal:controller.signal}).then(value=>{if(id===newsSequence.current){setNews(value.items.slice(0,4));setPartial(value.partial);}}).catch(()=>{if(id===newsSequence.current)setNewsError('研究快訊暫時無法取得，請稍後重試。');}).finally(()=>{clearTimeout(timer);if(id===newsSequence.current)setNewsBusy(false);});
  return()=>{newsSequence.current++;controller.abort();clearTimeout(timer);};
 },[base,topic,refresh]);
 const text={color:c.text},muted={color:c.muted},surface={backgroundColor:c.card,borderColor:c.border};
 const move=market?.change===0?'#e4eff7':market&&market.change>0?'#ffadab':'#8ce3bc';
 return <View style={s.page}>
  <View style={s.headingRow}><View style={s.grow}><Text style={[s.eyebrow,{color:c.accent}]}>YOUR RESEARCH DESK</Text><Text accessibilityRole="header" style={[s.heading,text]}>市場總覽</Text><Text style={[s.description,muted]}>先看市場，再找到值得追蹤的線索。</Text></View><Pressable accessibilityRole="button" accessibilityLabel="重新整理首頁資料" disabled={marketBusy||newsBusy} onPress={()=>setRefresh(value=>value+1)} style={[s.refresh,{borderColor:c.border,backgroundColor:c.card}]}><Text style={{color:c.accent,fontWeight:'700'}}>{marketBusy||newsBusy?'更新中':'重新整理'}</Text></Pressable></View>
  <View style={s.searchRow}><TextInput accessibilityLabel="首頁研究關鍵字" value={query} onChangeText={setQuery} placeholder="搜尋公司、產業或事件" placeholderTextColor={c.muted} maxLength={80} autoCorrect={false} returnKeyType="search" onSubmitEditing={()=>onSearch(query)} style={[s.input,surface,text]}/><Pressable accessibilityRole="button" accessibilityLabel="搜尋研究資料" onPress={()=>onSearch(query)} style={s.searchButton}><Text style={s.white}>搜尋</Text></Pressable></View>
  <View style={[s.mainGrid,wide&&s.twoColumns]}>
   <View style={[s.market,wide&&s.half]}>
    <View style={s.row}><Text style={s.marketLabel}>台灣加權指數</Text><Text style={s.badge}>盤後日資料</Text></View>
    {market?<>
     <Text style={s.price} adjustsFontSizeToFit minimumFontScale={0.75}>{market.close.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</Text>
     <Text accessibilityLabel={'較前一交易日'+signed(market.change)+'點，'+signed(market.percent)+'百分比'} style={[s.change,{color:move}]}>{signed(market.change)} 點　{signed(market.percent)}%</Text>
     <View style={s.marketBottom}><View style={s.grow}><Text style={s.marketMuted}>上市市場成交金額</Text><Text style={s.turnover}>{(market.turnover/1e8).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})}<Text style={s.unit}> 億元</Text></Text></View><View><Text style={s.marketMuted}>收盤資料日</Text><Text style={s.marketDate}>{market.date}</Text></View></View>
     <Text style={s.source}>{market.source} · 非即時報價{market.stale?' · 較舊快照':''}</Text>
    </>:marketBusy?<View style={s.loadingMarket}><ActivityIndicator color="#fff" accessibilityLabel="載入大盤資料"/><Text style={s.marketMuted}>正在取得收盤資料</Text></View>:<View style={s.loadingMarket}><Text style={s.marketLabel}>大盤資料暫時無法取得</Text><Text style={s.marketMuted}>請使用頁面上方的重新整理。</Text></View>}
    {!!marketError&&<Text accessibilityRole="alert" style={s.marketWarning}>{marketError}{market?' 目前顯示上次取得的資料。':''}</Text>}
   </View>
   <View style={[s.entry,surface,wide&&s.half]}>
    <Text style={[s.eyebrow,{color:c.accent}]}>EXPLORE & CONNECT</Text><Text accessibilityRole="header" style={[s.entryTitle,text]}>讓研究有個起點</Text>
    <Pressable accessibilityRole="button" onPress={()=>onSearch('')} style={[s.entryLink,{borderColor:c.border}]}><View style={s.grow}><Text style={[s.entryName,text]}>新聞與題材搜尋</Text><Text style={[s.small,muted]}>查公司、產業，回到原始來源。</Text></View><Text style={[s.arrow,{color:c.accent}]}>→</Text></Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel="在瀏覽器開啟網站集團作帳研究台" onPress={onGroup} style={[s.entryLink,{borderColor:c.border}]}><View style={s.grow}><Text style={[s.entryName,text]}>集團作帳研究</Text><Text style={[s.small,muted]}>前往網站查看完整集團資料。</Text></View><Text style={[s.arrow,{color:c.accent}]}>↗</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onMember} style={[s.memberLink,{backgroundColor:c.soft}]}><Text style={[s.small,{color:c.accent,fontWeight:'700'}]}>會員登入與帳號管理</Text><Text style={{color:c.accent}}>→</Text></Pressable>
   </View>
  </View>
  <View style={s.sectionHeader}><View><Text style={[s.eyebrow,{color:c.accent}]}>RESEARCH BRIEF</Text><Text accessibilityRole="header" style={[s.sectionTitle,text]}>研究快訊</Text></View><Pressable accessibilityRole="button" onPress={()=>onSearch(topic)} style={s.more}><Text style={{color:c.accent,fontWeight:'700'}}>查看更多 →</Text></Pressable></View>
  <Text style={[s.small,muted]}>依所選關鍵字搜尋站內收錄內容，日期以每則資料標示為準。</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{topics.map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:topic===value}} onPress={()=>setTopic(value)} style={[s.chip,{backgroundColor:topic===value?'#087fae':c.card,borderColor:topic===value?'#087fae':c.border}]}><Text style={{color:topic===value?'#fff':c.muted,fontWeight:'700'}}>{value}</Text></Pressable>)}</ScrollView>
  {newsBusy&&<View style={[s.newsState,surface]}><ActivityIndicator color={c.accent} accessibilityLabel="載入研究快訊"/><Text style={muted}>正在搜尋「{topic}」相關內容…</Text></View>}
  {!newsBusy&&newsError&&<View style={[s.newsState,surface]}><Text accessibilityRole="alert" style={muted}>{newsError}</Text></View>}
  {!newsBusy&&!newsError&&!news.length&&<View style={[s.newsState,surface]}><Text style={muted}>尚未找到「{topic}」相關內容，試試其他關鍵字。</Text></View>}
  {partial&&<Text accessibilityRole="alert" style={[s.small,muted]}>部分來源暫時無法取得，以下為目前可讀取的內容。</Text>}
  <View style={[s.newsGrid,wide&&s.twoColumns]}>{news.map((item,index)=><Pressable key={item.url||item.title+index} accessibilityRole="link" disabled={!item.url} onPress={()=>{if(item.url)onOpen(item.url);}} style={[s.newsCard,surface,wide&&s.half]}><View style={s.row}><Text style={[s.newsNumber,{color:c.accent}]}>{String(index+1).padStart(2,'0')}</Text><Text style={[s.small,muted]}>{item.date}</Text></View><Text style={[s.newsTitle,text]}>{item.title}</Text><Text numberOfLines={3} style={[s.newsSnippet,muted]}>{item.snippet}</Text><View style={s.row}><Text style={[s.small,muted]}>{item.source||'來源未標示'}</Text><Text style={{color:c.accent,fontWeight:'700'}}>原始來源 ↗</Text></View></Pressable>)}</View>
 </View>;
}
const s=StyleSheet.create({page:{gap:18},headingRow:{flexDirection:'row',gap:12,alignItems:'center'},grow:{flex:1,minWidth:0},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.6,marginBottom:7},heading:{fontSize:30,lineHeight:40,fontWeight:'800'},description:{fontSize:14,lineHeight:23,marginTop:4},refresh:{paddingHorizontal:12,paddingVertical:12,borderWidth:1,borderRadius:14,minHeight:44},searchRow:{flexDirection:'row',gap:10},input:{flex:1,minWidth:0,borderRadius:14,borderWidth:1,padding:14,fontSize:15},searchButton:{backgroundColor:'#087fae',borderRadius:14,paddingHorizontal:17,justifyContent:'center'},white:{color:'#fff',fontWeight:'700'},mainGrid:{gap:16},twoColumns:{flexDirection:'row',flexWrap:'wrap',alignItems:'stretch'},half:{flexGrow:1,flexBasis:'46%',minWidth:0},market:{backgroundColor:'#102f49',borderRadius:22,padding:22,gap:14},row:{flexDirection:'row',justifyContent:'space-between',gap:12,alignItems:'center'},marketLabel:{color:'#e8f4ff',fontSize:16,fontWeight:'700',flexShrink:1},badge:{color:'#c7e6f8',backgroundColor:'#254a65',fontSize:10,fontWeight:'700',paddingHorizontal:9,paddingVertical:6,borderRadius:8},price:{color:'#fff',fontSize:42,fontWeight:'800',letterSpacing:-1,fontVariant:['tabular-nums']},change:{fontSize:17,fontWeight:'700',fontVariant:['tabular-nums']},marketBottom:{borderTopWidth:1,borderColor:'#35546b',paddingTop:17,marginTop:2,flexDirection:'row',gap:12,alignItems:'flex-end',flexWrap:'wrap'},marketMuted:{fontSize:12,color:'#bdd1e1',lineHeight:21},turnover:{fontSize:24,color:'#fff',fontWeight:'700',marginTop:3,fontVariant:['tabular-nums']},unit:{fontSize:12,fontWeight:'400'},marketDate:{fontSize:15,color:'#fff',fontWeight:'600',marginTop:4},source:{fontSize:10,color:'#b6cedf',lineHeight:18},marketWarning:{color:'#ffdda1',fontSize:12,lineHeight:21},loadingMarket:{minHeight:150,justifyContent:'center',alignItems:'center',gap:14},entry:{borderWidth:1,borderRadius:22,padding:20},entryTitle:{fontSize:21,fontWeight:'700',lineHeight:31},entryLink:{flexDirection:'row',gap:10,borderBottomWidth:1,paddingVertical:15,alignItems:'center',minHeight:64},entryName:{fontSize:16,lineHeight:25,fontWeight:'700'},small:{fontSize:12,lineHeight:21,flexShrink:1},arrow:{fontSize:22},memberLink:{flexDirection:'row',justifyContent:'space-between',gap:10,borderRadius:12,padding:12,marginTop:16,minHeight:44,alignItems:'center'},sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:8},sectionTitle:{fontSize:23,lineHeight:32,fontWeight:'800'},more:{paddingVertical:12,minHeight:44,justifyContent:'center'},chips:{gap:9,paddingVertical:4},chip:{borderRadius:20,borderWidth:1,paddingHorizontal:19,paddingVertical:11,minHeight:44,justifyContent:'center'},newsGrid:{gap:12},newsCard:{borderWidth:1,borderRadius:18,padding:19,gap:12},newsNumber:{fontSize:16,fontWeight:'800',fontVariant:['tabular-nums']},newsTitle:{fontSize:18,lineHeight:28,fontWeight:'700'},newsSnippet:{fontSize:14,lineHeight:23},newsState:{borderWidth:1,borderRadius:18,padding:24,minHeight:100,alignItems:'center',justifyContent:'center',gap:12}});
