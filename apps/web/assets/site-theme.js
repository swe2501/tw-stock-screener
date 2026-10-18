/* Theme existing chart canvases in place; keep data, zoom and current selection. */
(() => {
  'use strict';
  const charts=new Map();
  let scheduled=0,lastTheme;
  function palette(){
    const css=getComputedStyle(document.documentElement),light=document.documentElement.dataset.theme==='light';
    return {background:css.getPropertyValue('--chart-bg').trim()||(light?'#ffffff':'#101820'),
      text:css.getPropertyValue('--text-muted').trim()||(light?'#5b6b82':'#b8c4d1'),
      border:css.getPropertyValue('--border').trim()||(light?'#d8e1ea':'#26313d')};
  }
  function paint(chart,entry,colors){
    chart.applyOptions({layout:{background:{color:entry.transparent?'transparent':colors.background},textColor:colors.text},
      grid:{vertLines:{color:colors.border},horzLines:{color:colors.border}},
      rightPriceScale:{borderColor:colors.border},leftPriceScale:{borderColor:colors.border},timeScale:{borderColor:colors.border}});
    entry.series.forEach((options,series)=>series.applyOptions(document.documentElement.dataset.theme==='light'?options.light:options.dark));
  }
  function sync(){
    scheduled=0;
    const colors=palette();
    charts.forEach((entry,chart)=>{
      if(!entry.host.isConnected){charts.delete(chart);return;}
      try{paint(chart,entry,colors);}catch(_){charts.delete(chart);}
    });
    document.dispatchEvent(new CustomEvent('academy-theme-changed',{detail:{theme:document.documentElement.dataset.theme==='light'?'light':'dark'}}));
  }
  function schedule(){
    const theme=document.documentElement.dataset.theme==='light'?'light':'dark';
    if(theme===lastTheme)return;
    lastTheme=theme;if(scheduled)cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(sync);
  }
  window._createThemedChart=function(host,options){
    const chart=LightweightCharts.createChart(host,options),element=typeof host==='string'?document.getElementById(host):host;
    const entry={host:element,transparent:options?.layout?.background?.color==='transparent',series:new Map()};
    charts.set(chart,entry);
    paint(chart,entry,palette());
    const remove=chart.remove.bind(chart);chart.remove=function(){charts.delete(chart);return remove();};
    const removeSeries=chart.removeSeries.bind(chart);chart.removeSeries=function(series){entry.series.delete(series);return removeSeries(series);};
    return chart;
  };
  window._bindThemedSeries=function(chart,series,light,dark){
    const entry=charts.get(chart);if(!entry)return;
    entry.series.set(series,{light,dark});series.applyOptions(document.documentElement.dataset.theme==='light'?light:dark);
  };
  new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
})();
