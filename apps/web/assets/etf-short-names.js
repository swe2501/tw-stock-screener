/* ETF 持股名稱一律顯示簡稱（例：台灣積體電路製造 → 台積電）。
 * etf_holdings／active_etf_flow 存的是投信公告的公司全名；讀回來時用全站股名目錄（window._names）依代號換成簡稱。
 * 只改顯示用的 stock_name，代號、權重、張數完全不動；目錄沒有的代號維持原名。 */
(()=>{'use strict';
const RE=/\/rest\/v1\/(etf_holdings|active_etf_flow)\b/;
const nativeFetch=window.fetch.bind(window);
const names=()=>window._loadNames?Promise.race([Promise.resolve(window._loadNames()).catch(()=>null),new Promise(r=>setTimeout(r,2500))]):Promise.resolve();
function shorten(rows){
  const m=window._names;if(!m||!Array.isArray(rows))return rows;
  rows.forEach(r=>{if(r&&typeof r==='object'&&r.stock_code&&typeof r.stock_name==='string'){const s=m[String(r.stock_code).trim()];if(typeof s==='string'&&s&&s.length<r.stock_name.length)r.stock_name=s;}});
  return rows;
}
window.fetch=function(input,init){
  const url=String(input&&input.url||input||'');
  const p=nativeFetch(input,init);
  if(!RE.test(url))return p;
  return p.then(res=>{if(!res.ok)return res;const json=res.json.bind(res);res.json=()=>Promise.all([json(),names()]).then(([d])=>shorten(d));return res;});
};
window.AcademyEtfShortName=shorten;
})();
