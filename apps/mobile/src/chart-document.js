const vendor=require('./vendor/lightweight-charts-source');
const {movingAverage}=require('./chart-model');
function chartDocument(bars,dark,periods){
 const colors={bg:dark?'#162331':'#ffffff',text:dark?'#adbdce':'#60748b',grid:dark?'#273747':'#edf1f6',border:dark?'#344759':'#dce5ef'};
 const payload=JSON.stringify({bars,colors,averages:periods.map((p,i)=>({period:p,color:['#c09b3c','#4f9df1','#bd7cba','#e08b51'][[5,10,20,60].indexOf(p)]||'#4f9df1',data:movingAverage(bars,p)}))}).replace(/</g,'\\u003c');
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';img-src data:;connect-src 'none'"><style>html,body,#chart{margin:0;width:100%;height:100%;overflow:hidden;background:${colors.bg}}*{box-sizing:border-box}</style></head><body><div id="chart"></div><script>${vendor}</script><script>
 try{
 const p=${payload},host=document.getElementById('chart');
 const chart=LightweightCharts.createChart(host,{autoSize:true,layout:{background:{color:p.colors.bg},textColor:p.colors.text,fontSize:11},grid:{vertLines:{color:p.colors.grid},horzLines:{color:p.colors.grid}},rightPriceScale:{borderColor:p.colors.border},timeScale:{borderColor:p.colors.border,rightOffset:3,timeVisible:false},localization:{locale:'zh-TW'},crosshair:{mode:0},handleScroll:{vertTouchDrag:false,horzTouchDrag:true},handleScale:{pinch:true,axisPressedMouseMove:true}});
 const series=chart.addCandlestickSeries({upColor:'#d86b60',downColor:'#429e76',wickUpColor:'#d86b60',wickDownColor:'#429e76',borderVisible:false,priceLineVisible:true});
 series.setData(p.bars.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close})));
 p.averages.forEach(a=>{const s=chart.addLineSeries({color:a.color,lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});s.setData(a.data);});
 chart.timeScale().fitContent();
 chart.subscribeCrosshairMove(param=>{const b=param.seriesData.get(series);if(b&&param.time){const row=p.bars.find(x=>x.time===param.time);window.ReactNativeWebView?.postMessage(JSON.stringify({type:'bar',...row}));}});
 window.ReactNativeWebView?.postMessage(JSON.stringify({type:'ready'}));
 }catch(e){window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error'}));}
 </script></body></html>`;
}
module.exports={chartDocument};
