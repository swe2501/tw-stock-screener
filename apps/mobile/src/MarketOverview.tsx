import MarketContext from './MarketContext';
import {MARKET_API_BASE} from './config';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Linking,Pressable,RefreshControl,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {loadMarket,type MarketData} from './market-api';
import IndexDetail from './IndexDetail';
import {InteractiveCard} from './Interaction';
import {palettes} from './appearance';

const API=MARKET_API_BASE;
const fmt=(n:number,digits=2)=>n.toLocaleString('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const signed=(n:number,digits=2)=>(n>0?'+':'')+fmt(n,digits);
export default function MarketOverview({dark,onReport,active=true}:{dark:boolean;onReport:()=>void;active?:boolean}){
 const c=palettes[dark?'dark':'light'],{width,fontScale}=useWindowDimensions();
 const [data,setData]=useState<MarketData|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[all,setAll]=useState(false),[indexOpen,setIndexOpen]=useState(false);
 const requestRef=useRef<AbortController|null>(null),sequence=useRef(0);
 async function refresh(){
  const id=++sequence.current;requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;setBusy(true);setError('');
  const timer=setTimeout(()=>controller.abort(),15000);
  try{const result=await loadMarket(API,{development:__DEV__,signal:controller.signal});if(sequence.current===id)setData(result);}
  catch(e){if(sequence.current===id)setError(e instanceof Error&&e.name==='AbortError'?'連線逾時，請稍後再試。':e instanceof Error?e.message:'資料暫時無法取得。');}
  finally{clearTimeout(timer);if(sequence.current===id)setBusy(false);}
 }
 useEffect(()=>{void refresh();return()=>{++sequence.current;requestRef.current?.abort();};},[]);
 const card={backgroundColor:c.card,borderColor:c.border},text={color:c.text},muted={color:c.muted};
 const changeColor=data?(data.latest.change>0?(dark?'#ff9c92':'#be433b'):data.latest.change<0?(dark?'#7fdbac':'#26794f'):c.muted):c.text;
 return <><IndexDetail visible={indexOpen} onClose={()=>setIndexOpen(false)} dark={dark}/><ScrollView contentContainerStyle={[s.content,width>=768&&s.wide]} refreshControl={<RefreshControl refreshing={busy&&!!data} onRefresh={()=>void refresh()} tintColor={c.accent}/>}>
  <View><Text style={[s.kicker,{color:c.accent}]}>MARKET FIELD NOTES</Text><Text accessibilityRole="header" style={[s.heading,text]}>先讀懂大盤。</Text><Text style={[s.body,muted]}>從價格與成交開始，再看資金、參與度與槓桿。</Text></View>
  {busy&&!data&&<View style={[s.card,card]}><ActivityIndicator color={c.accent}/><Text style={[s.body,muted]}>正在讀取證交所盤後資料…</Text></View>}
  {!!error&&<View style={[s.card,card]}><Text accessibilityRole="alert" style={[s.body,muted]}>{error}{data?' 下方保留上次取得的資料，尚未成功更新。':''}</Text><Pressable accessibilityRole="button" onPress={()=>void refresh()} style={[s.button,{backgroundColor:c.soft}]}><Text style={{color:c.accent,fontWeight:'700'}}>重新讀取</Text></Pressable></View>}
  {data&&<>
   <InteractiveCard onPress={()=>setIndexOpen(true)} label="開啟加權指數 K 圖" glow={active} color={c.accent} style={[card,{borderWidth:1,borderRadius:24}]}>
    <View style={s.row}><Text style={[s.subtitle,text]}>加權指數</Text><Text style={[s.badge,{color:c.accent,backgroundColor:c.soft}]}>盤後 · 日盤</Text></View>
    <Text style={[s.price,text]}>{fmt(data.latest.close)}<Text style={[s.unit,muted]}> 點</Text></Text>
    <Text style={[s.change,{color:changeColor}]}>{signed(data.latest.change)} 點　{signed(data.latest.change_percent)}%</Text>
    <Text style={[s.meta,muted]}>資料日 {data.as_of} · 非即時報價</Text>
    {(data.stale||error)&&<Text style={[s.warning,{color:dark?'#efd17b':'#8c621b',backgroundColor:c.soft}]}>資料尚待更新，請以標示日期為準。</Text>}
    <Text style={{color:c.accent,fontSize:15,fontWeight:'700'}}>點入查看 K 圖與均線 →</Text>
   </InteractiveCard>
   <View style={[s.grid,fontScale>=1.5&&{flexDirection:'column'}]}>
    <View style={[s.metric,card]}><Text style={[s.meta,muted]}>上市成交金額</Text><Text style={[s.metricValue,text]}>{fmt(data.latest.trade_value_twd/1e8)}<Text style={s.unit}> 億元</Text></Text></View>
    <View style={[s.metric,card]}><Text style={[s.meta,muted]}>上市成交股數</Text><Text style={[s.metricValue,text]}>{fmt(data.latest.trade_volume_shares/1e8)}<Text style={s.unit}> 億股</Text></Text></View>
   </View>
   <MarketContext dark={dark} date={data.as_of}/>
   <View style={[s.card,card]}><Text accessibilityRole="header" style={[s.subtitle,text]}>今天的價格變化</Text><Text style={[s.body,text]}>加權指數較前一交易日{data.latest.change>0?'上漲':data.latest.change<0?'下跌':'持平'}{data.latest.change===0?'':` ${fmt(Math.abs(data.latest.change))} 點`}。這只描述指數變化，還需要搭配市場廣度與資金占比，才能理解股票的參與情況。</Text>
    <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(!expanded)} style={[s.explain,{borderColor:c.border}]}><Text style={{color:c.accent,fontSize:15,fontWeight:'700'}}>{expanded?'收起':'展開'}資料怎麼算　{expanded?'−':'＋'}</Text></Pressable>
    {expanded&&<Text style={[s.body,muted]}>漲跌幅＝漲跌點數 ÷ 前一交易日收盤 × 100%。前收由官方收盤減去官方漲跌點數取得。成交金額為上市市場整體成交金額，不是資金淨流入，也不是電子股成交占比。</Text>}
   </View>
   <View style={[s.card,card]}><View style={s.row}><Text accessibilityRole="header" style={[s.subtitle,text]}>近期交易日</Text><Pressable accessibilityRole="button" onPress={()=>setAll(!all)} style={s.historyToggle}><Text style={{color:c.accent,fontSize:14}}>{all?'顯示近 5 日':`查看全部 ${data.history.length} 日`}</Text></Pressable></View><Text style={[s.meta,muted]}>官方目前提供 {data.history[0].date} 至 {data.as_of}</Text>
    {(all?data.history:data.history.slice(-5)).slice().reverse().map(row=><View key={row.date} style={[s.historyRow,{borderColor:c.border},fontScale>=1.5&&{flexDirection:'column',alignItems:'flex-start'}]}><Text style={[s.meta,muted]}>{row.date}</Text><View style={s.historyValues}><Text style={[s.historyPrice,text]}>{fmt(row.close)}</Text><Text style={{fontSize:14,color:row.change>0?(dark?'#ff9c92':'#be433b'):row.change<0?(dark?'#7fdbac':'#26794f'):c.muted}}>{signed(row.change_percent)}%</Text></View></View>)}
   </View>
   <View style={[s.source,{borderColor:c.border}]}><Text style={[s.meta,muted]}>{data.notice}</Text><Text style={[s.meta,muted]}>來源：{data.source.name}{data.cached?' · 快取資料':''}</Text><Text style={[s.meta,muted]}>取得時間：{new Date(data.retrieved_at).toLocaleString('zh-TW')}</Text><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(data.source.url).catch(()=>Alert.alert('無法開啟來源'))} style={s.historyToggle}><Text style={{color:c.accent,fontSize:15}}>核對官方來源 ↗</Text></Pressable></View>
  </>}
  <View style={[s.card,card]}><Text accessibilityRole="header" style={[s.subtitle,text]}>接著，深入市場結構</Text><Text style={[s.body,muted]}>完整報告保留法人、融資融券、廣度、資金結構、期貨與選擇權。網站測試環境目前需要存取授權。</Text><Pressable accessibilityRole="button" onPress={onReport} style={[s.button,{backgroundColor:c.accent}]}><Text style={{color:dark?'#142331':'#fff',fontSize:16,fontWeight:'700'}}>開啟完整報告 →</Text></Pressable></View>
 </ScrollView></>;
}
const s=StyleSheet.create({content:{padding:20,gap:18,paddingBottom:36},wide:{width:'100%',maxWidth:1000,alignSelf:'center',padding:32},kicker:{fontSize:11,fontWeight:'800',letterSpacing:1.7,marginBottom:8},heading:{fontSize:30,lineHeight:42,fontWeight:'800',marginBottom:8},body:{fontSize:16,lineHeight:27},card:{borderWidth:1,borderRadius:24,padding:22,gap:12},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8},subtitle:{fontSize:20,fontWeight:'700',lineHeight:30},badge:{fontSize:12,fontWeight:'700',padding:8,borderRadius:10,overflow:'hidden'},price:{fontSize:38,fontWeight:'800',lineHeight:52,fontVariant:['tabular-nums']},unit:{fontSize:14,fontWeight:'500'},change:{fontSize:18,lineHeight:28,fontWeight:'700'},meta:{fontSize:13,lineHeight:22},grid:{flexDirection:'row',gap:12},metric:{flex:1,borderWidth:1,borderRadius:20,padding:16,gap:8},metricValue:{fontSize:21,fontWeight:'700',lineHeight:31},button:{minHeight:50,borderRadius:15,padding:15,alignItems:'center',justifyContent:'center'},explain:{minHeight:48,borderTopWidth:1,justifyContent:'center'},historyToggle:{minHeight:44,justifyContent:'center'},historyRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,paddingTop:13,gap:8},historyValues:{alignItems:'flex-end',gap:4},historyPrice:{fontSize:17,fontWeight:'700',fontVariant:['tabular-nums']},source:{borderTopWidth:1,paddingTop:16,gap:5},warning:{fontSize:14,lineHeight:23,padding:12,borderRadius:12}});
