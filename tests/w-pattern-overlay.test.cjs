const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const messages={},context={window:{},URL,document:{getElementById(id){return messages[id]??=(id==='wPatternClearBtn'?{hidden:true}:{textContent:''});}}};
 vm.runInNewContext(fs.readFileSync('apps/web/assets/w-pattern-overlay.js','utf8'),context);
 const values=[[15,16,14,15],[12,13,10,11],[13,14,12,13],[11,12,9,10],[12,13,11,12],[14,16,13,15]];
 const bars=values.map(([open,high,low,close],i)=>({bar_index:i,date:'2026-10-0'+(i+1),open,high,low,close}));
 const points=Object.fromEntries(['lead_in','first_low','neckline_peak','second_low','breakout'].map((k,i)=>{const b=bars[[0,1,2,3,5][i]];return[k,{bar_index:b.bar_index,date:b.date,price:b[k.includes('low')?'low':k==='breakout'?'close':'high']}];}));
 const packet={overlay_version:'0.1.0',review_required:true,code:'2330',source_chart_url:'/api/chart?interval=1d&raw=1',source_bars:bars,patterns:[{pattern_id:'W1',type:'w_bottom',status:'confirmed',keypoints:points}]};
 const chartContext={code:'2330',chart_snapshot:{url:packet.source_chart_url}},live=bars.map(b=>({...b,time:b.date}));
 const added=[],removed=[],chart={addLineSeries(){const s={setData(d){this.data=d;},setMarkers(){}};added.push(s);return s;},removeSeries(s){removed.push(s);}};
 return {api:context.window.WPatternOverlay,packet,live,chartContext,chart,series:{data:()=>live},added,removed,messages};
}
test('candidate lines use dates/prices and clear removes both series',()=>{const s=setup();assert.equal(s.api.apply(s.packet,{chart:s.chart,series:s.series,context:s.chartContext}),1);assert.equal(s.added.length,2);assert.equal(s.added[0].data[1].value,10);assert.equal(s.added[1].data[1].value,14);s.api.clear();assert.equal(s.removed.length,2);});
test('rejects different stock, adjusted mode and changed OHLC',()=>{for(const mutate of [s=>s.chartContext.code='2454',s=>s.chartContext.chart_snapshot.url+='&adj=1',s=>s.live[0].close=14]){const s=setup();mutate(s);assert.throws(()=>s.api.verify(s.packet,s.live,s.chartContext));assert.equal(s.added.length,0);}});
test('rejects false breakthrough instead of drawing model claim',()=>{const s=setup();s.packet.patterns[0].keypoints.breakout={bar_index:4,date:s.packet.source_bars[4].date,price:12};assert.throws(()=>s.api.verify(s.packet,s.live,s.chartContext),/突破/);});
test('nested candidates remain separate',()=>{const s=setup();s.packet.patterns.push({...s.packet.patterns[0],pattern_id:'W2',parent_pattern_id:'W1'});assert.equal(s.api.apply(s.packet,{chart:s.chart,series:s.series,context:s.chartContext}),2);assert.equal(s.added.length,4);});
