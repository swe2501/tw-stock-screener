import {useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import MarketOverview from './MarketOverview';
import MarketHome from './MarketHome';
import {palettes} from './appearance';
export default function MarketHub({dark,active}:{dark:boolean;active:boolean}){
 const [report,setReport]=useState(false),[visited,setVisited]=useState(false),c=palettes[dark?'dark':'light'];
 function openReport(){setVisited(true);setReport(true);}
 return <View style={{flex:1}}><View style={[s.tabs,{backgroundColor:c.bg}]}>{['大盤摘要','完整報告'].map((label,i)=><Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:report===(i===1)}} onPress={()=>i?openReport():setReport(false)} style={[s.tab,{backgroundColor:report===(i===1)?c.card:'transparent',borderColor:report===(i===1)?c.border:'transparent'}]}><Text style={{color:report===(i===1)?c.accent:c.muted,fontSize:15,fontWeight:'700'}}>{label}</Text></Pressable>)}</View>
  <View style={{flex:report?0:1,display:report?'none':'flex'}}><MarketOverview dark={dark} active={active&&!report} onReport={openReport}/></View>
  {visited&&<View style={{flex:report?1:0,display:report?'flex':'none'}}><MarketHome dark={dark} active={active&&report}/></View>}
 </View>;
}
const s=StyleSheet.create({tabs:{flexDirection:'row',padding:12,gap:8},tab:{flex:1,minHeight:46,borderWidth:1,borderRadius:14,justifyContent:'center',alignItems:'center'}});
