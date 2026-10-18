import {useState} from 'react';
import {View} from 'react-native';
import MarketOverview from './MarketOverview';
import IndexDetail from './IndexDetail';
import FeatureGrid,{type Feature} from './FeatureGrid';
import {HubPage,PageHeader,PendingFeature,useModuleBack} from './ModuleLayout';
const features:Feature[]=[
 {id:'summary',title:'今日摘要',description:'指數漲跌與成交概況',icon:'summary'},
 {id:'index',title:'指數 K 圖',description:'日週月 K・均線與數值',icon:'chart'},
 {id:'institutions',title:'三大法人',description:'外資、投信與自營商',icon:'flow'},
 {id:'margin',title:'融資融券',description:'餘額與前日增減',icon:'layers'},
 {id:'breadth',title:'市場廣度',description:'上漲、下跌與參與程度',icon:'chart'},
 {id:'structure',title:'資金結構',description:'成交占比與期間變化',icon:'flow',pending:true},
 {id:'futures',title:'期貨籌碼',description:'法人留倉與結算成本',icon:'layers',pending:true},
 {id:'options',title:'選擇權',description:'留倉分布與履約價',icon:'chart',pending:true},
];
export default function MarketHub({dark,active}:{dark:boolean;active:boolean}){
 const [route,setRoute]=useState<string|null>(null),[indexOpen,setIndexOpen]=useState(false);
 const selected=features.find(f=>f.id===route);
 useModuleBack(active,!!route,()=>setRoute(null));
 const available=route&&['summary','institutions','margin','breadth'].includes(route);
 return <View style={{flex:1,minWidth:0}}><IndexDetail visible={indexOpen} dark={dark} onClose={()=>setIndexOpen(false)}/>
  <View style={{flex:route?0:1,display:route?'none':'flex'}}><HubPage dark={dark} kicker="MARKET ACADEMY / 01" title="先讀懂大盤。" description="選一個方向深入，每項研究都有自己的位置。"><FeatureGrid items={features} dark={dark} onSelect={id=>id==='index'?setIndexOpen(true):setRoute(id)}/></HubPage></View>
  {selected&&<View style={{flex:1,minWidth:0}}><PageHeader dark={dark} title={selected.title} onBack={()=>setRoute(null)}/>{available?<MarketOverview dark={dark} active={active} section={route as 'summary'|'institutions'|'margin'|'breadth'} onReport={()=>setRoute('structure')}/>:<PendingFeature dark={dark} title={selected.title} description={selected.description}/>}</View>}
 </View>;
}
