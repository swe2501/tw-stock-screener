/* Keep the research catalog independent of price-data coverage. */
(function(root){
  'use strict';
  var metrics=['score','absWinRate','excessWinRate','doubleWinRate','medianReturn','medianExcess','breadth','maxDrawdown'];
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
  function reasons(g,quarter){var q=(g.quarterlyReasons||{})[quarterKey(quarter)]||{};return g.members.map(function(m){var r=q[m.code];return {code:m.code,name:m.name,text:r&&r.text||'',sourceUrls:r&&Array.isArray(r.source_urls)?r.source_urls:[]};});}
  root.GroupBookModel={create:create,merge:merge,reasons:reasons};
})(typeof window!=='undefined'?window:globalThis);
