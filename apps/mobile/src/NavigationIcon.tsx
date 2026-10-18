import Svg,{Circle,Path} from 'react-native-svg';
export default function NavigationIcon({name,color}:{name:string;color:string}){
 const common={fill:'none',stroke:color,strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 return <Svg width={23} height={23} viewBox="0 0 24 24" accessible={false}>
  {name==='大盤'&&<><Path {...common} d="M3 4v16h18M6 14l4-4 4 3 6-7"/><Path {...common} d="M16 6h4v4"/></>}
  {name==='探索'&&<><Circle {...common} cx={12} cy={12} r={9}/><Path {...common} d="m16 8-3 5-5 3 3-5 5-3Z"/></>}
  {name==='自選'&&<Path {...common} d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>}
  {name==='策略'&&<><Path {...common} d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3M8 14h8"/><Circle cx={11} cy={17} r={1} fill={color}/></>}
  {name==='我的'&&<><Circle {...common} cx={12} cy={8} r={4}/><Path {...common} d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></>}
 </Svg>;
}
