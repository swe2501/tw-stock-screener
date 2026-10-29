/* Presentation scoped to the market-observation chart-analysis entry. */
(()=>{'use strict';
 window.AcademyChartAnalysis={open(code){
  const previous=window.AcademyChartBridge?.get()?.code;
  code=String(code||previous||'2330');
  window._etxReleaseChart?.();
  // Pass presentation through the existing navigation layer, including back/forward.
  window.openChart(code,window._names?.[code]||(code==='2330'?'台積電':''),'',0,false,null,'',null,'',{analysisOnly:true});
  window.AcademyChartViewport?.refresh();
 }};
})();
