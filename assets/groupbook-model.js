/* Keep the research catalog independent of price-data coverage. */
(function(root){
  'use strict';
  var metrics=['score','absWinRate','excessWinRate','doubleWinRate','medianReturn','medianExcess','breadth','maxDrawdown'];
  // Presentation only: retain original catalog and historical evidence for audits.
  function publicText(value){return String(value==null?'':value)
    .replace(/玩股網集團股分類收錄，旗下共 (\d+) 檔掛牌標的；作帳連動以母公司與同集團小型股為觀察重點。/g,'本研究名錄收錄 $1 檔掛牌標的；可搭配公司營運揭露與歷史價格，觀察成員間的連動情形。')
    .replace(/已揭露營運不等於Word描述的季底資金行為成立；仍須獨立核對持股、資金與價格資料/g,'營運揭露本身不足以確認季底資金動向，仍須搭配持股、資金與價格資料判讀')
    .replace(/Word原列核心觀察標的；本季是否仍值得追蹤，需以下列公司營運與事件證據重新檢驗，不能沿用文件結論。/g,'核心觀察標的；本季追蹤重點以下列公司營運與公告事件為依據。')
    .replace(/Word收錄為集團成員，但未明列於核心挑選理由；本季不因同屬集團就自動升為核心標的。/g,'集團關聯觀察標的；是否列為本季核心追蹤，仍須依個股營運與公告事件評估。')
    .replace(/Word未提供這檔的獨立核心挑選理由；以下先檢驗個股營運與事件，不把集團的一般描述當成已證實的個股受惠。/g,'本季先觀察個股營運與公告事件；集團整體發展不代表每家公司均已受惠。')
    .replace(/（Word 記載）/g,'（關係待核實）')
    .replace(/[^。\n]*與\s*Word\s*(?:檔|文件)?不符[^。\n]*[。]?/gi,'相關關係與營運影響仍待進一步確認。')
    .replace(/Word挑選假說/g,'核心觀察依據').replace(/Word 關係補充/g,'其他關聯說明')
    .replace(/Word/gi,'研究名錄').replace(/玩股網/g,'參考名錄')
    .replace(/文件分類/g,'研究分類').replace(/文件名錄關係/g,'研究分類關係').replace(/完整文件理由/g,'完整研究理由');}
  function sourceUrl(value,record){
    if(typeof value!=='string'||!/^https?:\/\//i.test(value))return '';
    var url;try{url=new URL(value)}catch(_){return ''}
    if(url.username||url.password)return '';
    var api=/\/openapi\/|\/v\d+\/opendata\/|\.json(?:$|\/)/i.test(url.pathname)||/^openapi\./i.test(url.hostname);
    if(!api)return url.href;
    if(!/(^|\.)(twse\.com\.tw|tpex\.org\.tw)$/.test(url.hostname))return '';
    var r=record||{},financial=r.kind==='financial'||/t187ap06/.test(url.pathname);
    var target=new URL('https://mopsov.twse.com.tw/mops/web/'+(financial?'t164sb04':'t05st10_ifrs'));
    if(/^\d{4,6}$/.test(String(r.code||'')))target.searchParams.set('co_id',r.code);
    var month=/^(\d{4})-(\d{2})$/.exec(r.revenue_month||'');
    var year=month?Number(month[1]):Number(r.year);
    if(year>=2000&&year<=2100)target.searchParams.set('year',String(year-1911));
    if(month)target.searchParams.set('month',month[2]);
    if(financial&&[1,2,3,4].includes(Number(r.season)))target.searchParams.set('season',String(r.season).padStart(2,'0'));
    return target.href;
  }
  function emptyMember(m){return Object.assign({},m,{winRate:null,medianReturn:null,samples:0});}
  function create(g){return Object.assign({},g,{members:g.members.map(emptyMember),samples:0,confidence:0,events:[],coveredMembers:0},Object.fromEntries(metrics.map(function(k){return[k,null]})));}
  function merge(base,stats){
    var by=new Map((stats.members||[]).map(function(m){return[String(m.code),m]}));
    var result=Object.assign({},base);
    // Catalog identity, text, relationships and order remain authoritative.
    ['samples','confidence','events'].concat(metrics).forEach(function(k){if(Object.hasOwn(stats,k))result[k]=stats[k]});
    result.members=base.members.map(function(m){var s=by.get(String(m.code));return Object.assign(emptyMember(m),s?{winRate:s.samples>0?s.winRate:null,medianReturn:s.samples>0?s.medianReturn:null,samples:s.samples||0}:{});});
    result.coveredMembers=result.members.filter(function(m){return m.samples>0}).length;
    if(!(result.samples>0)||!result.coveredMembers){metrics.forEach(function(k){result[k]=null});result.confidence=0;result.events=[];}
    return result;
  }
  function quarterKey(value){return String(value||'').replace(/\s/g,'');}
  function reasons(g,quarter){var q=(g.quarterlyReasons||{})[quarterKey(quarter)]||{};return g.members.map(function(m){var r=q[m.code];return {code:m.code,name:m.name,text:r&&r.text||'',publishedOn:r&&r.published_on||'',reviewedOn:r&&r.reviewed_on||'',factPeriod:r&&r.fact_period||'',reviewType:r&&r.review_type||'',isBackground:!!(r&&r.is_background),eventTitle:r&&r.event_title||'',status:r&&r.status||'',availableAsOf:r&&r.available_as_of||'',selectionReview:r&&r.selection_review||null,groupContext:r&&r.group_selection_context||null,sourceUrls:r&&Array.isArray(r.source_urls)?r.source_urls:[]};});}
  function sampleLabel(rate,samples){return samples>0&&rate!=null?Math.round(rate*samples/100)+'／'+samples+' 季':'無有效季度';}
  function periodLabel(events){var quarters=(events||[]).map(function(e){return e.quarter}).sort();return quarters.length?quarters[0]+'～'+quarters[quarters.length-1]:'尚無有效季度';}
  root.GroupBookModel={create:create,merge:merge,reasons:reasons,sampleLabel:sampleLabel,periodLabel:periodLabel,publicText:publicText,sourceUrl:sourceUrl};
})(typeof window!=='undefined'?window:globalThis);
