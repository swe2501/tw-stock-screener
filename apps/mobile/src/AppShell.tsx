import {useEffect,useState} from 'react';
import {Alert,Image,Pressable,ScrollView,StyleSheet,Text,useColorScheme,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import MarketHub from './MarketHub';
import ExploreScreen from './ExploreScreen';
import WatchlistScreen from './WatchlistScreen';
import StrategyScreen from './StrategyScreen';
import LocalBackup from './LocalBackup';
import MemberScreen from './MemberScreen';
import FeatureDirectory from './FeatureDirectory';
import NavigationIcon from './NavigationIcon';
import {palettes} from './appearance';
const tabs=['大盤','探索','自選','策略','我的'] as const;
const modes=['auto','light','dark'] as const;
export default function AppShell(){
 const system=useColorScheme(),[mode,setMode]=useState<typeof modes[number]>('auto'),[themeReady,setThemeReady]=useState(false),[tab,setTab]=useState<typeof tabs[number]>('大盤'),[tools,setTools]=useState(false),[focusCode,setFocusCode]=useState<string|null>(null),[visited,setVisited]=useState<string[]>(['大盤']);
 const dark=mode==='auto'?system==='dark':mode==='dark',c=palettes[dark?'dark':'light'];
 useEffect(()=>{let alive=true;void AsyncStorage.getItem('academy.mobile.appearance').then(value=>{if(alive&&modes.includes(value as typeof modes[number]))setMode(value as typeof modes[number]);}).catch(()=>{}).finally(()=>{if(alive)setThemeReady(true);});return()=>{alive=false;};},[]);
 function select(next:typeof tabs[number]){setVisited(current=>current.includes(next)?current:[...current,next]);setTab(next);}
 function explore(code?:string){setFocusCode(code||null);select('探索');}
 function theme(){if(!themeReady)return;const value=modes[(modes.indexOf(mode)+1)%modes.length];setMode(value);void AsyncStorage.setItem('academy.mobile.appearance',value).catch(()=>Alert.alert('外觀設定尚未儲存','本次仍可切換，重開 App 後可能回到先前設定。'));}
 const pane=(name:typeof tabs[number])=>({flex:tab===name?1:0,display:tab===name?'flex' as const:'none' as const});
 return <SafeAreaView style={{flex:1,backgroundColor:c.bg}}><StatusBar style={dark?'light':'dark'}/>
  <View style={[s.header,{backgroundColor:c.card,borderColor:c.border}]}><Image source={require('../assets/academy-mark.png')} style={s.logo} resizeMode="contain" accessibilityLabel="跟誰學標誌"/><View style={{flex:1}}><Text style={[s.brand,{color:c.text}]}>跟誰學</Text><Text style={[s.caption,{color:c.muted}]}>盤後研究院 · 手機研究工作台</Text></View><Pressable accessibilityRole="button" accessibilityLabel="開啟研究工具箱" onPress={()=>setTools(true)} style={[s.control,{backgroundColor:c.soft}]}><Text style={{color:c.accent,fontSize:20}}>⋮</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`外觀：${mode==='auto'?'跟隨系統':dark?'深色':'淺色'}，點擊切換`} onPress={theme} style={[s.control,{backgroundColor:c.soft}]}><Text style={{color:c.accent,fontSize:22}}>{mode==='auto'?'◐':dark?'☾':'☀'}</Text></Pressable></View>
  <View style={pane('大盤')}><MarketHub dark={dark} active={tab==='大盤'}/></View>
  {visited.includes('探索')&&<View style={pane('探索')}><ExploreScreen dark={dark} focusCode={focusCode} onFocusHandled={()=>setFocusCode(null)}/></View>}
  {visited.includes('自選')&&<View style={pane('自選')}><WatchlistScreen dark={dark} onExplore={explore}/></View>}
  {visited.includes('策略')&&<View style={pane('策略')}><StrategyScreen dark={dark} active={tab==='策略'}/></View>}
  {visited.includes('我的')&&<ScrollView style={pane('我的')} contentContainerStyle={s.member}><Text accessibilityRole="header" style={[s.heading,{color:c.text}]}>我的研究空間</Text><MemberScreen dark={dark}/><LocalBackup dark={dark}/><View style={[s.notice,{backgroundColor:c.card,borderColor:c.border}]}><Text style={[s.noticeTitle,{color:c.text}]}>本機資料與會員資料</Text><Text style={{color:c.muted,fontSize:15,lineHeight:27}}>自選、筆記與策略草稿已可保存在這台裝置；尚未與網站會員同步。原生會員登入、雲端備份與權限會在獨立測試環境完成驗證後接入。</Text><Pressable accessibilityRole="button" onPress={()=>setTools(true)} style={[s.toolsButton,{backgroundColor:c.soft}]}><Text style={{color:c.accent,fontWeight:'700'}}>瀏覽完整研究工具箱 →</Text></Pressable></View></ScrollView>}
  <View accessibilityRole="tablist" style={[s.nav,{backgroundColor:c.card,borderColor:c.border}]}>{tabs.map(name=><Pressable key={name} accessibilityRole="tab" accessibilityState={{selected:tab===name}} onPress={()=>select(name)} style={({pressed})=>[s.tab,{backgroundColor:tab===name?c.soft:'transparent',opacity:pressed?.65:1}]}><NavigationIcon name={name} color={tab===name?c.accent:c.muted}/><Text style={{fontSize:12,fontWeight:'700',color:tab===name?c.accent:c.muted}}>{name}</Text></Pressable>)}</View>
  <FeatureDirectory dark={dark} visible={tools} onClose={()=>setTools(false)}/>
 </SafeAreaView>;
}
const s=StyleSheet.create({header:{paddingHorizontal:16,paddingVertical:10,flexDirection:'row',gap:10,alignItems:'center',borderBottomWidth:1},logo:{width:36,height:43,borderRadius:10,backgroundColor:'#fff'},brand:{fontSize:22,fontWeight:'800',letterSpacing:2},caption:{fontSize:11,lineHeight:18},control:{minWidth:44,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center'},nav:{flexDirection:'row',gap:5,paddingHorizontal:10,paddingVertical:8,borderTopWidth:1},tab:{flex:1,minHeight:62,paddingVertical:8,borderRadius:16,alignItems:'center',justifyContent:'center',gap:5},member:{padding:20,gap:20,paddingBottom:36,maxWidth:1000,width:'100%',alignSelf:'center'},heading:{fontSize:27,fontWeight:'800',lineHeight:39},notice:{padding:22,borderWidth:1,borderRadius:24,gap:14},noticeTitle:{fontSize:20,fontWeight:'700',lineHeight:30},toolsButton:{minHeight:48,padding:14,borderRadius:14,alignItems:'center',justifyContent:'center'}});
