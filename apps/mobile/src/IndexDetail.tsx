import {MARKET_API_BASE} from './config';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Linking,Modal,Pressable,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {palettes} from './appearance';
import {aggregateCandles,validateCandles,type CandleData,type ChartBar} from './chart-model';
import {chartDocument} from './chart-document';
import {marketOrigin} from './market-api';
import {useReducedMotion} from './Interaction';
const API=MARKET_API_BASE;
const number=(v:number)=>v.toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function IndexDetail({visible,onClose,dark,symbol='TAIEX',name='加權指數'}:{visible:boolean;onClose:()=>void;dark:boolean;symbol?:string;name?:string}){
 const c=palettes[dark?'dark':'light'],{height,width}=useWindowDimensions(),reduced=useReducedMotion();
 const [data,setData]=useState<CandleData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[period,setPeriod]=useState<'day'|'week'|'month'>('day'),[averages,setAverages]=useState([5,20]),[selected,setSelected]=useState<ChartBar|null>(null),[chartBusy,setChartBusy]=useState(true),[chartError,setChartError]=useState(false),[scrollEnabled,setScrollEnabled]=useState(true);
 const web=useRef<WebView>(null);
 useEffect(()=>{if(!visible)return;setScrollEnabled(true);setData(current=>current?.symbol===symbol?current:null);let alive=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);setBusy(true);setError('');
  void fetch(marketOrigin(API,__DEV__)+'/api/prices?action='+(symbol==='TAIEX'?'market_candles':'stock_candles&code='+encodeURIComponent(symbol)),{signal:controller.signal,credentials:'omit',redirect:'error',headers:{Accept:'application/json'}}).then(async r=>{if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('K 圖暫時無法取得，請稍後重試。');return validateCandles(await r.json(),symbol);}).then(result=>{if(alive)setData(result);}).catch(e=>{if(alive)setError(e.name==='AbortError'?'讀取逾時，請重試。':e.message||'讀取失敗。');}).finally(()=>{clearTimeout(timer);if(alive)setBusy(false);});
  return()=>{alive=false;clearTimeout(timer);controller.abort();};
 },[visible,attempt,symbol]);
 const bars=useMemo(()=>data&&data.symbol===symbol?aggregateCandles(data.candles,period):[],[data,period,symbol]);
 const html=useMemo(()=>chartDocument(bars,dark,averages),[bars,dark,averages]);
 useEffect(()=>{setSelected(bars.at(-1)||null);setChartBusy(true);setChartError(false);},[html,bars]);
 useEffect(()=>{if(!visible||!bars.length||!chartBusy)return;const timer=setTimeout(()=>{setChartBusy(false);setChartError(true);},10000);return()=>clearTimeout(timer);},[visible,bars,chartBusy]);
 const current=selected||bars.at(-1);
 return <Modal visible={visible} animationType={reduced?'none':'slide'} presentationStyle="fullScreen" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:c.bg}}>
  <View style={[s.header,{borderColor:c.border,backgroundColor:c.card}]}><Pressable accessibilityRole="button" accessibilityLabel={symbol==='TAIEX'?'返回大盤摘要':'返回個股詳情'} onPress={onClose} style={s.close}><Text style={{fontSize:24,color:c.accent}}>‹</Text></Pressable><View style={{flex:1}}><Text accessibilityRole="header" style={[s.title,{color:c.text}]}>{name}</Text><Text style={[s.meta,{color:c.muted}]}>官方盤後 K 線 · {symbol}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="重新讀取 K 線" disabled={busy} onPress={()=>setAttempt(attempt+1)} style={s.close}><Text style={{fontSize:23,color:c.accent}}>↻</Text></Pressable></View>
  <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={[s.content,width>=768&&{maxWidth:1200,width:'100%',alignSelf:'center'}]}>
   {busy&&<View style={s.loading}><ActivityIndicator color={c.accent}/><Text style={{color:c.muted}}>讀取官方開高低收…</Text></View>}
   {!!error&&<View style={[s.card,{backgroundColor:c.card,borderColor:c.border}]}><Text accessibilityRole="alert" style={[s.body,{color:c.muted}]}>{error}{data?' 下方為先前取得的資料。':''}</Text><Pressable accessibilityRole="button" onPress={()=>setAttempt(attempt+1)} style={s.close}><Text style={{color:c.accent}}>重試</Text></Pressable></View>}
   {!!bars.length&&<>
    <View style={[s.card,{backgroundColor:c.card,borderColor:c.border}]}><View style={s.row}><Text style={[s.big,{color:c.text}]}>{number(bars.at(-1)!.close)}<Text style={s.meta}> {symbol==='TAIEX'?'點':'元'}</Text></Text><Text style={[s.meta,{color:c.muted}]}>資料日 {data!.as_of}</Text></View>
     <View accessibilityRole="tablist" style={[s.segment,{backgroundColor:c.bg}]}>{([['day','日 K'],['week','週 K'],['month','月 K']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:period===value}} onPress={()=>setPeriod(value)} style={[s.period,{backgroundColor:period===value?c.card:'transparent',borderColor:period===value?c.border:'transparent'}]}><Text style={{color:period===value?c.accent:c.muted,fontWeight:'700',fontSize:15}}>{label}</Text></Pressable>)}</View>
     <View style={s.row}>{[5,10,20,60].map((p,i)=><Pressable key={p} accessibilityRole="checkbox" accessibilityState={{checked:averages.includes(p),disabled:bars.length<p}} disabled={bars.length<p} onPress={()=>setAverages(averages.includes(p)?averages.filter(v=>v!==p):[...averages,p].sort((a,b)=>a-b))} style={[s.ma,{borderColor:averages.includes(p)?['#c09b3c','#4f9df1','#bd7cba','#e08b51'][i]:c.border,opacity:bars.length<p?.4:1}]}><Text style={{fontSize:13,color:c.text}}>MA{p}{bars.length<p?' · 不足':''}</Text></Pressable>)}</View>
     <View style={{height:Math.max(300,Math.min(520,height*.47)),overflow:'hidden',borderRadius:12}}>
      <WebView key={symbol+(dark?'-dark':'-light')} ref={web} source={{html}} originWhitelist={['*']} onShouldStartLoadWithRequest={request=>request.url==='about:blank'} javaScriptEnabled scrollEnabled={false} allowFileAccess={false} mixedContentMode="never" setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false} onTouchStart={()=>setScrollEnabled(false)} onTouchEnd={()=>setScrollEnabled(true)} onTouchCancel={()=>setScrollEnabled(true)} style={{backgroundColor:c.card}}
       onMessage={({nativeEvent})=>{try{const m=JSON.parse(nativeEvent.data);if(m.type==='ready')setChartBusy(false);if(m.type==='error'){setChartBusy(false);setChartError(true);}if(m.type==='bar'){const bar=bars.find(b=>b.time===m.time);if(bar)setSelected(bar);}}catch{}}}
       onError={()=>{setChartBusy(false);setChartError(true);}}/>
      {chartBusy&&<View pointerEvents="none" style={s.chartLoading}><ActivityIndicator color={c.accent}/></View>}
      {chartError&&<View style={[s.chartLoading,{backgroundColor:c.card}]}><Text accessibilityRole="alert" style={{color:c.muted}}>圖表載入失敗</Text><Pressable onPress={()=>{setChartError(false);setChartBusy(true);web.current?.reload();}} style={s.close}><Text style={{color:c.accent}}>重新載入圖表</Text></Pressable></View>}
     </View>
     {current&&<View style={[s.readout,{backgroundColor:c.bg}]}><Text style={[s.meta,{color:c.muted}]}>{current.firstDate}{current.lastDate!==current.firstDate?' — '+current.lastDate:''} · {current.sessions} 個交易日</Text><View style={s.row}>{[['開',current.open],['高',current.high],['低',current.low],['收',current.close]].map(([label,value])=><View key={label} style={{minWidth:95,flexGrow:1}}><Text style={[s.meta,{color:c.muted}]}>{label}</Text><Text style={{color:c.text,fontWeight:'700',fontSize:16,lineHeight:27}}>{number(value as number)}</Text></View>)}</View></View>}
     <Text style={[s.meta,{color:c.muted}]}>左右拖曳移動 · 雙指縮放 · 長按圖表查看數值</Text>
    </View>
    <View style={[s.card,{backgroundColor:c.card,borderColor:c.border}]}><Text style={[s.title,{color:c.text}]}>先確認你看到的範圍</Text><Text style={[s.body,{color:c.muted}]}>{data!.candles[0].date} 至 {data!.as_of}，共 {data!.candles.length} 個日交易資料；目前顯示 {bars.length} 根{period==='day'?'日':period==='week'?'週':'月'} K。{data!.partial?'部分月份無法取得，圖表範圍可能有缺口。':''}{data!.stale?'這份資料尚待更新。':''}</Text><Text style={[s.body,{color:c.muted}]}>{data!.notice} 均線以目前 K 棒週期計算，資料不足不繪製，未補造開高低收或缺少的交易日。</Text>
     <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://www.tradingview.com/').catch(()=>Alert.alert('無法開啟連結'))} style={s.credit}><Text style={[s.meta,{color:c.accent}]}>圖表：TradingView Lightweight Charts ↗</Text></Pressable>
    </View>
   </>}
  </ScrollView>
 </SafeAreaView></Modal>;
}
const s=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,padding:12},close:{minWidth:46,minHeight:46,alignItems:'center',justifyContent:'center'},title:{fontSize:20,lineHeight:30,fontWeight:'700'},meta:{fontSize:12,lineHeight:21},content:{padding:16,gap:16,paddingBottom:32},loading:{padding:20,flexDirection:'row',gap:12,justifyContent:'center'},card:{borderRadius:22,borderWidth:1,padding:16,gap:15},body:{fontSize:15,lineHeight:26},row:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center',justifyContent:'space-between'},big:{fontSize:28,lineHeight:40,fontWeight:'800'},segment:{flexDirection:'row',padding:4,borderRadius:15,gap:4},period:{flex:1,minHeight:46,borderWidth:1,borderRadius:12,alignItems:'center',justifyContent:'center'},ma:{minHeight:44,paddingHorizontal:10,borderWidth:1,borderRadius:11,justifyContent:'center'},readout:{borderRadius:14,padding:14,gap:10},chartLoading:{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center'},credit:{minHeight:44,justifyContent:'center'}});
