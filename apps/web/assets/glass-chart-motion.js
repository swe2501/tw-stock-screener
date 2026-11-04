/* ── Lightweight Charts（K 線、量能、指標）：玻璃模式下新資料載入時，
      K 棒由中間往上下彈開（ㄉㄨㄞㄉㄨㄞ）、量能／柱狀從 0 彈起、均線與指標線由左畫到右。
      只在「換股票／換週期」這類整批換資料時播放；即時更新（update）會立刻結束動畫、交回原本資料。 ── */
(function(){
  'use strict';
  var LW=window.LightweightCharts;if(!LW||window.__lwGlassMotion)return;window.__lwGlassMotion=true;
  var root=document.documentElement,TOTAL=1000,EACH=640;
  function on(){return root.getAttribute('data-ui-skin')==='glass'&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function spring(t){if(t<=0)return 0;if(t>=1)return 1;return 1-Math.exp(-6.2*t)*Math.cos(9.4*t);}
  function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  var origCreate=LW.createChart;
  var patched=Object.assign({},LW);
  patched.createChart=function(){
    var chart=origCreate.apply(this,arguments);
    ['addCandlestickSeries','addBarSeries','addHistogramSeries','addLineSeries','addAreaSeries','addBaselineSeries'].forEach(function(m){
      if(typeof chart[m]!=='function')return;var orig=chart[m].bind(chart);
      chart[m]=function(){var s=orig.apply(null,arguments);try{wrap(chart,s,m);}catch(e){}return s;};
    });
    return chart;
  };
  try{window.LightweightCharts=patched;}catch(e){}
  function sig(d){if(!d||!d.length)return '';var a=d[0],z=d[d.length-1];return String(a.time&&a.time.year?JSON.stringify(a.time):a.time)+'|'+String(z.time&&z.time.year?JSON.stringify(z.time):z.time)+'|'+d.length;}
  function wrap(chart,series,kind){
    var setData=series.setData.bind(series),update=series.update.bind(series),anim=null,last='';
    function finish(){if(!anim)return;var a=anim;anim=null;cancelAnimationFrame(a.raf);setData(a.data);if(a.restore)try{series.applyOptions({autoscaleInfoProvider:a.restore});}catch(e){}}
    series.setData=function(data){
      finish();
      var s=sig(data),changed=s!==last&&(!last||last.split('|')[0]!==s.split('|')[0]||Math.abs((+last.split('|')[2])-(+s.split('|')[2]))>3);last=s;
      if(!on()||!changed||!Array.isArray(data)||data.length<3)return setData(data);
      var range=null;try{range=chart.timeScale().getVisibleLogicalRange();}catch(e){}
      var n=data.length,from=range?Math.max(0,Math.floor(range.from)):Math.max(0,n-200),to=range?Math.min(n-1,Math.ceil(range.to)):n-1;
      if(to-from>400)from=to-400;var span=Math.max(1,to-from),stagger=(TOTAL-EACH)/span;
      var isCandle=kind==='addCandlestickSeries'||kind==='addBarSeries',isHist=kind==='addHistogramSeries';
      /* 動畫期間鎖住價格座標，避免軸線跟著縮放跳動 */
      var lo=Infinity,hi=-Infinity;for(var i=from;i<=to;i++){var d=data[i];if(!d)continue;if(isCandle){if(d.low<lo)lo=d.low;if(d.high>hi)hi=d.high;}else if(d.value!=null){if(d.value<lo)lo=d.value;if(d.value>hi)hi=d.value;}}
      if(isHist){lo=Math.min(lo,0);hi=Math.max(hi,0);}
      var restore=null;if(isFinite(lo)&&isFinite(hi)&&hi>lo){try{restore=series.options().autoscaleInfoProvider||function(o){return o();};var pad=(hi-lo)*.04;series.applyOptions({autoscaleInfoProvider:function(){return{priceRange:{minValue:lo-pad,maxValue:hi+pad}};}});}catch(e){restore=null;}}
      var t0=performance.now();anim={data:data,restore:restore,raf:0};
      function frame(now){
        if(!anim)return;var T=now-t0,out=new Array(n);
        for(var i=0;i<n;i++){var d=data[i];
          if(i<from||i>to||d==null||(isCandle&&d.open==null)||(!isCandle&&d.value==null)){out[i]=d;continue;}
          var lt=(T-(i-from)*stagger)/EACH;
          if(isCandle){var k=spring(lt),mid=(d.open+d.close)/2;
            out[i]=Object.assign({},d,{open:mid+(d.open-mid)*k,close:mid+(d.close-mid)*k,high:mid+(d.high-mid)*k,low:mid+(d.low-mid)*k});}
          else if(isHist){out[i]=Object.assign({},d,{value:d.value*spring(lt)});}
          else{/* 線：由左往右畫出，尚未畫到的點以空白點保留時間軸 */
            var reveal=from+easeInOut(Math.min(1,T/TOTAL))*span;out[i]=i<=reveal?d:{time:d.time};}
        }
        setData(out);
        if(T<TOTAL+80)anim.raf=requestAnimationFrame(frame);else finish();
      }
      /* 先放一份「全部收在中間」的資料，讓時間軸與座標先就定位 */
      frame(t0);
      return;
    };
    series.update=function(bar){finish();return update(bar);};
    if(typeof series.data==='function'){var dataFn=series.data.bind(series);series.data=function(){return anim?anim.data:dataFn();};}
  }
})();
