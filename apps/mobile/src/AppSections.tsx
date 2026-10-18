import {useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import FeatureGrid,{type Feature} from './FeatureGrid';
import {FeatureIcon} from './FeatureGrid';
import {HubPage,PageHeader,PendingFeature,useModuleBack} from './ModuleLayout';
import ExploreScreen from './ExploreScreen';
import WatchlistScreen from './WatchlistScreen';
import StrategyScreen from './StrategyScreen';
import MemberScreen from './MemberScreen';
import LocalBackup from './LocalBackup';
import {palettes} from './appearance';
const exploreFeatures:Feature[]=[
 {id:'stocks',title:'股票搜尋',description:'查代號、價格與個股 K 圖',icon:'search'},
 {id:'etf',title:'ETF 探索',description:'尋找上市 ETF 與盤後資料',icon:'layers'},
 {id:'screen',title:'條件選股',description:'以價格與成交條件篩選',icon:'strategy'},
 {id:'topics',title:'熱門題材',description:'了解事件與關聯股票',icon:'flow',pending:true},
 {id:'sectors',title:'產業族群',description:'從產業找到研究方向',icon:'layers',pending:true},
 {id:'groups',title:'集團研究',description:'企業關係與季度研究',icon:'chart',pending:true},
 {id:'news',title:'市場新聞',description:'事件、來源與相關公司',icon:'summary',pending:true},
];
const researchFeatures:Feature[]=[
 {id:'watch',title:'自選清單',description:'追蹤你關注的公司',icon:'watch'},
 {id:'notes',title:'研究筆記',description:'集中查看已寫下的想法',icon:'note'},
 {id:'journal',title:'交易工作台',description:'交易紀錄與事後檢討',icon:'chart',pending:true},
 {id:'alerts',title:'價格提醒',description:'管理條件與通知',icon:'settings',pending:true},
];
const strategyFeatures:Feature[]=[
 {id:'library',title:'我的策略',description:'找到已儲存的策略與參數',icon:'watch'},
 {id:'editor',title:'編寫規則',description:'公式、中文條件與風控',icon:'strategy'},
 {id:'guide',title:'聊聊策略',description:'讓小書靈陪你整理想法',icon:'chat'},
];
const accountFeatures:Feature[]=[
 {id:'account',title:'登入與安全',description:'會員與登入連線狀態',icon:'shield'},
 {id:'appearance',title:'外觀設定',description:'選擇淺色或深色',icon:'settings'},
 {id:'backup',title:'資料與備份',description:'保存自選、筆記與策略',icon:'layers'},
 {id:'sync',title:'同步狀態',description:'了解本機與雲端的範圍',icon:'flow'},
 {id:'notification',title:'通知設定',description:'研究提醒與推播偏好',icon:'settings',pending:true},
 {id:'invite',title:'邀請分享',description:'邀請朋友與解鎖進度',icon:'account',pending:true},
];
type Props={dark:boolean;active:boolean};
export function ExploreHub({dark,active,focusCode,onFocusHandled}:{focusCode:string|null;onFocusHandled:()=>void}&Props){
 const [route,setRoute]=useState<string|null>(null),[last,setLast]=useState('stocks'),[visited,setVisited]=useState(false);
 const selected=exploreFeatures.find(f=>f.id===route),available=['stocks','etf','screen'].includes(route||'');
 function select(id:string){setRoute(id);if(['stocks','etf','screen'].includes(id)){setVisited(true);setLast(id);}}
 useEffect(()=>{if(focusCode!==null)select('stocks');},[focusCode]);useModuleBack(active,!!route,()=>setRoute(null));
 return <View style={s.fill}><View style={{flex:route?0:1,display:route?'none':'flex'}}><HubPage dark={dark} kicker="MARKET ACADEMY / 02" title="找到研究的起點。" description="先選研究方式，再深入公司、題材與產業。"><FeatureGrid items={exploreFeatures} dark={dark} onSelect={select}/></HubPage></View>{selected&&<PageHeader dark={dark} title={selected.title} onBack={()=>setRoute(null)}/>} {visited&&<View style={{flex:available?1:0,display:available?'flex':'none',minWidth:0}}><ExploreScreen dark={dark} focusCode={focusCode} onFocusHandled={onFocusHandled} initialKind={last==='etf'?'etf':'all'} screening={last==='screen'}/></View>}{selected&&!available&&<PendingFeature dark={dark} title={selected.title} description={selected.description}/>}</View>;
}
export function ResearchHub({dark,active,onExplore}:Props&{onExplore:(code?:string)=>void}){
 const [route,setRoute]=useState<string|null>(null),[last,setLast]=useState('watch'),[visited,setVisited]=useState(false),selected=researchFeatures.find(f=>f.id===route),available=route==='watch'||route==='notes';
 useModuleBack(active,!!route,()=>setRoute(null));
 return <View style={s.fill}><View style={{flex:route?0:1,display:route?'none':'flex'}}><HubPage dark={dark} kicker="MARKET ACADEMY / 03" title="讓研究，累積成判斷。" description="自選、筆記與交易檢討，回到這裡就找得到。"><FeatureGrid items={researchFeatures} dark={dark} onSelect={id=>{setRoute(id);if(id==='watch'||id==='notes'){setVisited(true);setLast(id);}}}/></HubPage></View>{selected&&<PageHeader dark={dark} title={selected.title} onBack={()=>setRoute(null)}/>} {visited&&<View style={{flex:available?1:0,display:available?'flex':'none',minWidth:0}}><WatchlistScreen dark={dark} onExplore={onExplore} notesOnly={last==='notes'}/></View>}{selected&&!available&&<PendingFeature dark={dark} title={selected.title} description={selected.description}/>}</View>;
}
export function StrategyHub({dark,active}:Props){
 const [route,setRoute]=useState<string|null>(null),[last,setLast]=useState<'library'|'editor'|'guide'>('library'),[visited,setVisited]=useState(false),selected=strategyFeatures.find(f=>f.id===route);
 useModuleBack(active,!!route,()=>setRoute(null));
 return <View style={s.fill}><View style={{flex:route?0:1,display:route?'none':'flex'}}><HubPage dark={dark} kicker="MARKET ACADEMY / 04" title="把想法，變成可驗證的規則。" description="建立、儲存、驗算與回測，依照自己的步調研究。"><FeatureGrid items={strategyFeatures} dark={dark} onSelect={id=>{setRoute(id);setLast(id as typeof last);setVisited(true);}}/></HubPage></View>{selected&&<PageHeader dark={dark} title={selected.title} onBack={()=>setRoute(null)}/>} {visited&&<View style={{flex:route?1:0,display:route?'flex':'none',minWidth:0}}><StrategyScreen dark={dark} active={active&&!!route} entryPoint={last}/></View>}</View>;
}
export function AccountHub({dark,active,onAppearance}:Props&{onAppearance:(mode:'light'|'dark')=>void}){
 const [route,setRoute]=useState<string|null>(null),selected=accountFeatures.find(f=>f.id===route),c=palettes[dark?'dark':'light'];useModuleBack(active,!!route,()=>setRoute(null));
 return <View style={s.fill}>{!selected?<HubPage dark={dark} kicker="MARKET ACADEMY / 05" title="你的研究空間。" description="帳號、外觀與資料設定，各自清楚管理。"><FeatureGrid items={accountFeatures} dark={dark} onSelect={setRoute}/></HubPage>:<><PageHeader dark={dark} title={selected.title} onBack={()=>setRoute(null)}/>{selected.pending?<PendingFeature dark={dark} title={selected.title} description={selected.description}/>:<HubPage dark={dark} kicker="PREFERENCES" title={selected.title} description={selected.description}>
  {route==='account'&&<MemberScreen dark={dark}/>}{route==='backup'&&<LocalBackup dark={dark}/>}
  {route==='appearance'&&<>{(['light','dark'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:dark===(value==='dark')}} accessibilityLabel={value==='light'?'使用淺色外觀':'使用深色外觀'} onPress={()=>onAppearance(value)} style={[s.choice,{backgroundColor:c.card,borderColor:dark===(value==='dark')?c.accent:c.border}]}><View style={[s.swatch,{backgroundColor:palettes[value].bg,borderColor:palettes[value].border}]}><View style={{width:'65%',height:7,borderRadius:4,backgroundColor:palettes[value].accent}}/><View style={{width:'85%',height:5,borderRadius:4,backgroundColor:palettes[value].border}}/></View><View style={{flex:1,minWidth:0}}><Text style={[s.label,{color:c.text}]}>{value==='light'?'淺色・清澈藍白':'深色・靜謐金色'}</Text><Text style={[s.body,{color:c.muted}]}>{value==='light'?'明亮環境，清楚閱讀':'降低明亮背景，專注研究'}</Text></View><Text style={{color:c.accent,fontSize:21}}>{dark===(value==='dark')?'●':'○'}</Text></Pressable>)}<Text style={[s.body,{color:c.muted}]}>選擇會套用到整個 App，並保留在這台裝置。上方日夜圖示也能直接切換。</Text></>}
  {route==='sync'&&<View style={[s.notice,{backgroundColor:c.card,borderColor:c.border}]}><FeatureIcon name="shield" color={c.accent}/><Text style={[s.label,{color:c.text}]}>目前保存在這台裝置</Text><Text style={[s.body,{color:c.muted}]}>自選、研究筆記、策略草稿與外觀設定會保留在本機。會員雲端同步尚未接入，換裝置前請到「資料與備份」匯出保存。</Text></View>}
 </HubPage>}</>}</View>;
}
const s=StyleSheet.create({fill:{flex:1,minWidth:0},choice:{borderWidth:1,borderRadius:22,padding:17,flexDirection:'row',alignItems:'center',gap:14},swatch:{width:58,height:70,borderWidth:1,borderRadius:12,padding:9,justifyContent:'center',gap:10},label:{fontSize:17,fontWeight:'700',lineHeight:27,flexShrink:1},body:{fontSize:14,lineHeight:24,flexShrink:1},notice:{padding:22,borderWidth:1,borderRadius:23,gap:14}});
