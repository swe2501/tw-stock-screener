import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Appearance,Platform,Image,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import MarketHub from './MarketHub';
import {ExploreHub,ResearchHub,StrategyHub,AccountHub} from './AppSections';
import NavigationIcon from './NavigationIcon';
import {FeatureIcon} from './FeatureGrid';
import {palettes} from './appearance';
const tabs=['大盤','探索','研究','策略','我的'] as const;
export default function AppShell(){
 const [mode,setMode]=useState<'light'|'dark'>('light'),[themeReady,setThemeReady]=useState(false),[tab,setTab]=useState<typeof tabs[number]>('大盤'),[focusCode,setFocusCode]=useState<string|null>(null),[visited,setVisited]=useState<string[]>(['大盤']);
 const writes=useRef(Promise.resolve()),{width,fontScale}=useWindowDimensions(),dark=mode==='dark',c=palettes[mode];
 useEffect(()=>{let alive=true;void AsyncStorage.getItem('academy.mobile.appearance').then(value=>{if(alive)setMode(value==='dark'?'dark':'light');}).catch(()=>{}).finally(()=>{if(alive)setThemeReady(true);});return()=>{alive=false;};},[]);
 useEffect(()=>{if(themeReady&&Platform.OS!=='web')Appearance.setColorScheme(mode);},[mode,themeReady]);
 function select(next:typeof tabs[number]){setVisited(current=>current.includes(next)?current:[...current,next]);setTab(next);}
 function explore(code?:string){setFocusCode(code||'');select('探索');}
 function appearance(value:'light'|'dark'){if(!themeReady)return;setMode(value);writes.current=writes.current.catch(()=>{}).then(()=>AsyncStorage.setItem('academy.mobile.appearance',value)).catch(()=>Alert.alert('外觀設定尚未儲存','本次仍可切換，重開 App 後可能回到先前設定。'));}
 const pane=(name:typeof tabs[number])=>({flex:tab===name?1:0,minWidth:0,display:tab===name?'flex' as const:'none' as const});
 if(!themeReady)return <SafeAreaView style={{flex:1,backgroundColor:c.bg,justifyContent:'center',alignItems:'center'}}><ActivityIndicator color={c.accent}/></SafeAreaView>;
 return <SafeAreaView style={{flex:1,backgroundColor:c.bg}}><StatusBar style={dark?'light':'dark'}/>
  <View style={[s.header,{backgroundColor:c.card,borderColor:c.border}]}><View style={s.brandGroup}><Image source={require('../assets/academy-mark.png')} style={s.logo} resizeMode="contain" accessibilityLabel="跟誰學標誌"/><View style={{flex:1,minWidth:0}}><Text style={[s.brand,{color:c.text}]}>跟誰學</Text>{width>=350&&fontScale<1.35&&<Text style={[s.caption,{color:c.muted}]}>盤後研究院 · MARKET ACADEMY</Text>}</View></View><Pressable accessibilityRole="button" accessibilityLabel={`外觀：${dark?'深色':'淺色'}，切換為${dark?'淺色':'深色'}`} onPress={()=>appearance(dark?'light':'dark')} style={({pressed})=>[s.control,{backgroundColor:c.soft,borderColor:c.border,opacity:pressed?.6:1}]}><FeatureIcon name={dark?'settings':'moon'} color={c.accent} size={22}/></Pressable></View>
  <View style={pane('大盤')}><MarketHub dark={dark} active={tab==='大盤'}/></View>
  {visited.includes('探索')&&<View style={pane('探索')}><ExploreHub dark={dark} active={tab==='探索'} focusCode={focusCode} onFocusHandled={()=>setFocusCode(null)}/></View>}
  {visited.includes('研究')&&<View style={pane('研究')}><ResearchHub dark={dark} active={tab==='研究'} onExplore={explore}/></View>}
  {visited.includes('策略')&&<View style={pane('策略')}><StrategyHub dark={dark} active={tab==='策略'}/></View>}
  {visited.includes('我的')&&<View style={pane('我的')}><AccountHub dark={dark} active={tab==='我的'} onAppearance={appearance}/></View>}
  <View accessibilityRole="tablist" style={[s.nav,{backgroundColor:c.card,borderColor:c.border}]}>{tabs.map(name=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{selected:tab===name}} onPress={()=>select(name)} style={({pressed})=>[s.tab,{backgroundColor:tab===name?c.soft:'transparent',opacity:pressed?.65:1}]}><NavigationIcon name={name==='研究'?'自選':name} color={tab===name?c.accent:c.muted}/><Text style={{fontSize:12,fontWeight:'700',textAlign:'center',color:tab===name?c.accent:c.muted}}>{name}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({header:{paddingHorizontal:20,paddingVertical:12,flexDirection:'row',gap:12,alignItems:'center',borderBottomWidth:1},brandGroup:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12},logo:{width:34,height:42,borderRadius:9,backgroundColor:'#fff'},brand:{fontSize:22,lineHeight:32,fontWeight:'800',letterSpacing:2,flexShrink:1},caption:{fontSize:10,lineHeight:17,letterSpacing:.6},control:{width:44,minHeight:44,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},nav:{flexDirection:'row',gap:4,paddingHorizontal:10,paddingVertical:8,borderTopWidth:1},tab:{flex:1,minWidth:0,minHeight:60,paddingVertical:8,borderRadius:15,alignItems:'center',justifyContent:'center',gap:5}});
