import {validState as valid} from './workspace-model';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
export type WatchItem={code:string;name:string;note:string;addedAt:string};
export type Draft={id:string;name:string;entry:string;exit:string;updatedAt:string;risk?:{stop:number;take:number;maxBars:number}};
type State={watch:WatchItem[];drafts:Draft[]};
const KEY='academy.mobile.local-workspace.v1',empty:State={watch:[],drafts:[]};
const Context=createContext<{state:State;ready:boolean;error:string;save:(value:State)=>Promise<void>}|null>(null);
export function WorkspaceProvider({children}:{children:ReactNode}){
 const [state,setState]=useState<State>(empty),[ready,setReady]=useState(false),[error,setError]=useState('');
 const queue=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{let mounted=true;void AsyncStorage.getItem(KEY).then(raw=>{if(!mounted)return;if(raw){const data=JSON.parse(raw);if(!valid(data))throw Error('本機資料格式無法讀取，尚未覆寫原檔。');setState(data);}setReady(true);}).catch(()=>{if(mounted)setError('本機研究資料無法讀取，為保留原資料，目前暫停儲存。');});return()=>{mounted=false;};},[]);
 async function save(next:State){if(!ready)throw Error('本機資料尚未準備完成。');if(!valid(next))throw Error('最多 100 檔自選、30 個草稿；筆記最多 2000 字。');const pending=queue.current.catch(()=>{}).then(()=>AsyncStorage.setItem(KEY,JSON.stringify(next)));queue.current=pending;try{await pending;setState(next);setError('');}catch{setError('本機儲存失敗，請重試。');throw Error('儲存失敗，尚未更新本機資料。');}}
 return <Context.Provider value={{state,ready,error,save}}>{children}</Context.Provider>;
}
export function useWorkspace(){const value=useContext(Context);if(!value)throw Error('Workspace provider missing');return value;}
