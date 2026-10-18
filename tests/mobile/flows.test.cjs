// Exercises real TSX components/state with native host adapters, not a device layout test.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../apps/mobile'),React=require(path.join(root,'node_modules/react')),Renderer=require(path.join(root,'node_modules/react-test-renderer')),ts=require(path.join(root,'node_modules/typescript'));
global.IS_REACT_ACT_ENVIRONMENT=true;
function setup({width=390,fontScale=1}={}){
 const values=new Map(),alerts=[],requests=[],cache=new Map();
 const host=name=>React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollTo(){},scrollToEnd(){},reload(){},injectJavaScript(){}}));return React.createElement(name,props,props.children);});
 const primitive=Object.fromEntries(['View','Text','Pressable','TextInput','Image','ActivityIndicator','RefreshControl'].map(n=>[n,host(n)]));
 const ScrollView=host('ScrollView'),Modal=({visible,children})=>visible?React.createElement('Modal',{},children):null;
 const RN={...primitive,ScrollView,Modal,FlatList:p=>React.createElement('FlatList',p,[React.createElement(React.Fragment,{key:'header'},p.ListHeaderComponent),...p.data.map((item,index)=>React.createElement(React.Fragment,{key:p.keyExtractor(item)},p.renderItem({item,index}))),React.createElement(React.Fragment,{key:'footer'},p.data.length?p.ListFooterComponent:p.ListEmptyComponent)]),StyleSheet:{create:x=>x},Platform:{OS:'ios'},useColorScheme:()=> 'light',useWindowDimensions:()=>({width,height:844,fontScale}),Alert:{alert:(...args)=>alerts.push(args)},Linking:{openURL:async()=>{}},Share:{share:async()=>{}},BackHandler:{addEventListener:()=>({remove(){}})},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},Animated:{View:host('AnimatedView'),Value:class{constructor(v){this.value=v;}setValue(v){this.value=v;}},spring:()=>({start(){}}),timing:()=>({start(){}}),sequence:()=>({}),loop:()=>({start(){},stop(){}})}};
 const latest={date:'2026-10-16',close:101,change:1,change_percent:1,trade_value_twd:1000,trade_volume_shares:100};
 const market={schema_version:1,available:true,symbol:'TAIEX',frequency:'daily',session:'day',as_of:latest.date,latest,history:[latest],stale:false,cached:false,source:{name:'TWSE',url:'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK'},retrieved_at:'2026-10-18T00:00:00Z',notice:'daily'};
 const stock={...latest,code:'2330',name:'台積電',kind:'stock',market:'TWSE'};
 const context={available:true,schema_version:1,market:'TWSE',frequency:'daily',as_of:'2026-10-16',stale:false,parts:Object.fromEntries([['institutions','https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=20261016&type=day'],['margin','https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=20261016&selectType=MS&response=json'],['breadth','https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL']].map(([key,url])=>[key,{available:false,data:null,date:'2026-10-16',source_url:url}]))};
 const candles={available:true,schema_version:1,symbol:'TAIEX',frequency:'daily',as_of:'2026-10-16',partial:false,stale:false,notice:'render fixture',source:{urls:['https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=20261001&response=json']},candles:['2026-10-13','2026-10-14','2026-10-15','2026-10-16'].map(date=>({date,open:100,high:103,low:99,close:101}))};
 const fetcher=async url=>{requests.push(url);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>url.includes('market_context')?context:url.includes('market_candles')?candles:url.includes('stock_candles')?{...candles,symbol:'2330',name:'台積電',kind:'stock',source:{urls:['https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261001&stockNo=2330&response=json']},candles:candles.candles.map(b=>({...b,volume:1000}))}:url.includes('stock_catalog')?{...market,market:'TWSE',items:[stock],source:{name:'TWSE',url:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'}}:market};};
 const mocks={'react':React,'react/jsx-runtime':require(path.join(root,'node_modules/react/jsx-runtime')),'react-native':RN,'react-native-safe-area-context':{SafeAreaView:host('SafeAreaView')},'react-native-webview':{WebView:host('WebView')},'react-native-svg':{__esModule:true,default:host('Svg'),Circle:host('Circle'),Path:host('Path')},'expo-status-bar':{StatusBar:host('StatusBar')},'@react-native-async-storage/async-storage':{getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{values.set(k,v);}},'./auth':{configured:false,restore:async()=>null}};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const source=fs.readFileSync(file,'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function req(name){if(name in mocks)return mocks[name];if(name.endsWith('.png'))return 'brand-asset';if(name.startsWith('.')){const base=path.resolve(path.dirname(file),name),target=['', '.tsx','.ts','.js'].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());return load(target);}return require(name);}
  vm.runInNewContext('(function(require,module,exports){'+compiled+'\n})',{console,process:{env:{EXPO_PUBLIC_EXPO_GO_PREVIEW:'1'}},__DEV__:true,fetch:fetcher,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Intl,Error})(req,module,module.exports);return module.exports;
 }
 const Provider=load(path.join(root,'src/Workspace.tsx')).WorkspaceProvider,Shell=load(path.join(root,'src/AppShell.tsx')).default;
 return {element:React.createElement(Provider,null,React.createElement(Shell)),values,alerts,requests};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function text(node){return node.findAll(n=>n.type==='Text').flatMap(n=>n.children.filter(v=>typeof v==='string'||typeof v==='number')).join('');}
async function press(renderer,label){const matches=renderer.root.findAll(n=>n.type==='Pressable'&&(n.props.accessibilityLabel===label||text(n)===label));assert.ok(matches.length,'button '+label);const node=matches[0];assert.ok(!node.props.disabled,'enabled '+label);await Renderer.act(async()=>{node.props.onPress();await settle();});}
test('real App flow: explore → save watch → edit note → save strategy → reopen local data',async()=>{
 const context=setup();let app;
 await Renderer.act(async()=>{app=Renderer.create(context.element);await settle();});
 await press(app,'探索');
 await press(app,'2330 台積電，查看盤後資料');
 await press(app,'加入本機自選 ＋');
 await press(app,'關閉股票詳情');
 await press(app,'自選');
 await press(app,'研究筆記');
 await Renderer.act(async()=>{app.root.findByProps({accessibilityLabel:'研究筆記'}).props.onChangeText('下次核對月營收與資料日期');});
 await press(app,'儲存研究筆記');
 let saved=JSON.parse(context.values.get('academy.mobile.local-workspace.v1'));assert.equal(saved.watch[0].code,'2330');assert.equal(saved.watch[0].note,'下次核對月營收與資料日期');
 await press(app,'策略');
 await press(app,'儲存本機策略');
 saved=JSON.parse(context.values.get('academy.mobile.local-workspace.v1'));assert.equal(saved.drafts.length,1);assert.equal(saved.drafts[0].entry,'param period = 20\nclose > SMA(close, period)');
 await press(app,'開啟聊聊策略本機引導');
 assert.ok(app.root.findAll(n=>n.type==='Text'&&text(n).includes('本機規則引導')).length);
 assert.ok(context.requests.every(url=>url.includes('/api/prices?action=market_summary')||url.includes('/api/prices?action=stock_catalog')||url.includes('/api/prices?action=market_context')));
 await Renderer.act(async()=>app.unmount());
});

test('tablet exploration keeps list and selected detail together without a modal',async()=>{
 const context=setup({width:1024});let app;await Renderer.act(async()=>{app=Renderer.create(context.element);await settle();});await press(app,'探索');await press(app,'2330 台積電，查看盤後資料');assert.equal(app.root.findAll(n=>n.type==='Modal').length,0);assert.ok(app.root.findAll(n=>n.type==='Pressable'&&text(n)==='加入本機自選 ＋').length);await Renderer.act(async()=>app.unmount());
});

test('index K chart is opened only from its card and returns to the same overview',async()=>{
 const context=setup();let app;await Renderer.act(async()=>{app=Renderer.create(context.element);await settle();});assert.equal(app.root.findAll(n=>n.type==='WebView').length,0);await press(app,'開啟加權指數 K 圖');assert.equal(app.root.findAll(n=>n.type==='WebView').length,1);assert.ok(context.requests.some(url=>url.includes('market_candles')));await press(app,'返回大盤摘要');assert.equal(app.root.findAll(n=>n.type==='WebView').length,0);assert.ok(app.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='開啟加權指數 K 圖').length);await Renderer.act(async()=>app.unmount());
});

test('stock K opens above its detail and back returns to the selected stock',async()=>{
 const context=setup();let app;await Renderer.act(async()=>{app=Renderer.create(context.element);await settle();});await press(app,'探索');await press(app,'2330 台積電，查看盤後資料');await press(app,'查看個股 K 圖 →');assert.ok(context.requests.some(url=>url.includes('stock_candles&code=2330')));assert.equal(app.root.findAll(n=>n.type==='WebView').length,1);await press(app,'返回個股詳情');assert.equal(app.root.findAll(n=>n.type==='WebView').length,0);assert.ok(app.root.findAll(n=>n.type==='Pressable'&&text(n)==='加入本機自選 ＋').length);await Renderer.act(async()=>app.unmount());
});
test('strategy performance flow requires explicit cost and exports actual simulated trades',async()=>{
 const context=setup();let app;await Renderer.act(async()=>{app=Renderer.create(context.element);await settle();});await press(app,'策略');await Renderer.act(async()=>{app.root.findByProps({accessibilityLabel:'進場公式'}).props.onChangeText('close > 0');app.root.findByProps({accessibilityLabel:'出場公式'}).props.onChangeText('');});await press(app,'設定個股績效回測');await press(app,'載入個股回測行情');await Renderer.act(async()=>{app.root.findByProps({accessibilityLabel:'開始日期 YYYY-MM-DD'}).props.onChangeText('2026-10-14');app.root.findByProps({accessibilityLabel:'結束日期 YYYY-MM-DD'}).props.onChangeText('2026-10-16');});await press(app,'執行個股績效回測');assert.ok(app.root.findAll(n=>n.type==='Text'&&text(n).includes('請先確認未還原價格')).length);await Renderer.act(async()=>{app.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityRole==='checkbox').at(-1).props.onPress();});await press(app,'執行個股績效回測');assert.ok(app.root.findAll(n=>n.type==='Text'&&text(n).includes('手續費 %請填數字')).length);await Renderer.act(async()=>{for(const label of ['單邊手續費 %','賣出稅率 %','單邊滑價 %'])app.root.findByProps({accessibilityLabel:label}).props.onChangeText('0');});await press(app,'執行個股績效回測');await press(app,'查看交易明細（1 筆）');assert.ok(app.root.findAll(n=>n.type==='Text'&&text(n).includes('前日買進訊號')).length);await press(app,'匯出本次回測與驗算資料');await press(app,'返回策略編輯');await Renderer.act(async()=>app.unmount());
});
