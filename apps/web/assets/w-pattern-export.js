/* Standalone helper; no network, storage mutation or website source edits.
 * Integration: await WPatternExport.capture({chart, series, candles, context}).
 * In a page where chartInstance is visible: await WPatternExport.captureCurrent().
 */
(() => {
  'use strict';
  function capture({chart, series, candles, context = {}}) {
    if (!chart?.takeScreenshot || !chart?.timeScale || !series?.priceToCoordinate || !Array.isArray(candles))
      throw Error('需要圖表實例、K棒series與當前K棒陣列；請使用capture明確傳入。');
    const ts=chart.timeScale(), width=ts.width();
    if (!Number.isFinite(width) || width<=0) throw Error('圖表尚未顯示。');
    const range=ts.getVisibleLogicalRange();
    if (!range) throw Error('可見時間範圍尚未建立。');
    // v0.1 deliberately limits export to daily bars; no guessing hourly timezone.
    const raw=candles.map(c=>({...c}));
    if (raw.some(c=>typeof c.time!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.time)))
      throw Error('此版只支援日／週／月K日期字串；請先切回日K測試。');
    const visible=[];
    raw.forEach((c,sourceIndex)=>{
      const x=ts.timeToCoordinate(c.time);
      if (x===null || !Number.isFinite(x) || x<0 || x>=width) return;
      const prices=['open','high','low','close'].map(k=>c[k]);
      if (prices.some(v=>!Number.isFinite(v)) || c.low>Math.min(c.open,c.close) || c.high<Math.max(c.open,c.close))
        throw Error('K棒價格無效，停止匯出。');
      const y={}; for (const k of ['open','high','low','close']) {
        y[k]=series.priceToCoordinate(c[k]);
        if (!Number.isFinite(y[k])) throw Error('價格座標未就緒。');
      }
      visible.push({bar_index:visible.length,source_index:sourceIndex,date:c.time,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume??null,x_px:x,y_px:y});
    });
    if (visible.length<5) throw Error('可見K棒不足5根。');
    for(let i=1;i<visible.length;i++) if(visible[i].date<=visible[i-1].date || visible[i].x_px<=visible[i-1].x_px) throw Error('日期或座標順序錯誤。');
    // Capture within the same synchronous task as coordinate/data collection.
    const image=chart.takeScreenshot();
    const size=chart.options();
    const cssWidth=size.width,cssHeight=size.height;
    if (!(cssWidth>0 && cssHeight>0 && image.width>0 && image.height>0)) throw Error('截圖尺寸無效。');
    const bars=visible.map(b=>({...b,x:b.x_px/cssWidth,y:Object.fromEntries(Object.entries(b.y_px).map(([k,v])=>[k,v/cssHeight]))}));
    const packet={export_version:'0.1.0',captured_at:new Date().toISOString(),context,
      chart:{bar_x_coordinate_system:'normalized_full_target_image',price_y_coordinate_system:'normalized_full_target_image',price_scale_mode:size.rightPriceScale?.mode??null,visible_logical_range:range,css_width:cssWidth,css_height:cssHeight,width:image.width,height:image.height,plot_width_css:width,capture_scope:'main_price_chart_only',note:'VOL and separate DOM drawing overlays excluded; screenshot is the exact image paired with these coordinates.'},bars,image_data_url:image.toDataURL('image/png')};
    const blob=new Blob([JSON.stringify(packet)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url; a.download='w-chart-'+Date.now()+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
    return {bars:bars.length,first:bars[0].date,last:bars.at(-1).date,width:image.width,height:image.height};
  }
  function captureCurrent(){
    const chart=typeof chartInstance!=='undefined'?chartInstance:null;
    const series=window._mainCandleSeries;
    return capture({chart,series,candles:window._vpCandles,context:window.AcademyResearchChartContext?.()??{}});
  }
  window.WPatternExport={capture,captureCurrent};
})();
