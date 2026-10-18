import {useRef} from 'react';
import {Animated,Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import Svg,{Path} from 'react-native-svg';
import {palettes} from './appearance';
import {useReducedMotion} from './Interaction';
export type Feature={id:string;title:string;description:string;icon?:string;pending?:boolean};
const paths:Record<string,string>={moon:'M20 15a9 9 0 0 1-11-12 9 9 0 1 0 11 12z',summary:'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',chart:'M4 4v16h16 M7 15l4-6 4 3 5-7',flow:'M4 7h15l-3-3 M20 17H5l3 3 M19 7l-3 3 M5 17l3-3',layers:'M12 3L3 8l9 5 9-5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',watch:'M5 4h14v17l-7-4-7 4V4z',note:'M4 4h10 M4 4v16h16V10 M9 15l2-5 7-7 3 3-7 7-5 2z',strategy:'M5 5h5v5H5z M14 14h5v5h-5z M10 7h7v7 M7 10v7h7',account:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-3a8 6 0 0 1 16 0v3',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',chat:'M4 4h16v12H9l-5 4V4z M8 9h8 M8 12h5',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z M8 12l3 3 5-6'};
export function FeatureIcon({name='summary',color,size=23}:{name?:string;color:string;size?:number}){return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={paths[name]||paths.layers} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>;}
function FeatureButton({item,dark,onSelect,reduced}:{item:Feature;dark:boolean;onSelect:(id:string)=>void;reduced:boolean}){
 const c=palettes[dark?'dark':'light'],scale=useRef(new Animated.Value(1)).current;
 function animate(value:number){if(!reduced)Animated.spring(scale,{toValue:value,useNativeDriver:true,speed:25,bounciness:2}).start();}
 return <Animated.View style={{flex:1,minWidth:0,transform:[{scale}]}}><Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={()=>onSelect(item.id)} onPressIn={()=>animate(.975)} onPressOut={()=>animate(1)} style={({pressed})=>[s.tile,{backgroundColor:pressed?c.soft:c.card,borderColor:pressed?c.accent:c.border}]}><View style={s.top}><View style={[s.icon,{backgroundColor:c.soft}]}><FeatureIcon name={item.icon} color={c.accent}/></View><Text style={{color:c.muted,fontSize:22}}>›</Text></View><Text style={[s.title,{color:c.text}]}>{item.title}</Text><Text style={[s.description,{color:c.muted}]}>{item.description}</Text>{item.pending&&<Text style={[s.status,{color:c.muted}]}>規劃中</Text>}</Pressable></Animated.View>;
}
export default function FeatureGrid({items,dark,onSelect}:{items:Feature[];dark:boolean;onSelect:(id:string)=>void}){
 const {width,fontScale}=useWindowDimensions(),c=palettes[dark?'dark':'light'],reduced=useReducedMotion();
 const columns=fontScale>=1.35||width<350?1:width>=850?3:2;
 const rows=Array.from({length:Math.ceil(items.length/columns)},(_,i)=>items.slice(i*columns,(i+1)*columns));
 return <View style={s.grid}>{rows.map((row,index)=><View key={index} style={s.row}>{Array.from({length:columns},(_,i)=>row[i]?<FeatureButton key={row[i].id} item={row[i]} dark={dark} onSelect={onSelect} reduced={reduced}/>:<View key={'empty'+i} style={{flex:1,minWidth:0}}/>)}</View>)}</View>;
}
const s=StyleSheet.create({grid:{gap:12},row:{flexDirection:'row',gap:12},tile:{flex:1,minWidth:0,borderWidth:1,borderRadius:21,padding:17,gap:9},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:5},icon:{width:42,height:42,borderRadius:13,justifyContent:'center',alignItems:'center'},title:{fontSize:17,fontWeight:'700',lineHeight:27,flexShrink:1},description:{fontSize:13,lineHeight:22,flexShrink:1},status:{fontSize:11,lineHeight:18,marginTop:2}});
