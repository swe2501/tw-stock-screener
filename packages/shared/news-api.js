'use strict';
// Public read-only contract. Never attach a member token to news requests.
function apiBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('API 網址必須是 HTTPS 網站根網址');
  return url.origin;
}
function articleUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
async function searchNews(base, query, options = {}) {
  const q = String(query).trim();
  if (q.length < 2 || q.length > 80) throw Error('請輸入 2～80 個字');
  const response = await (options.fetcher || fetch)(apiBase(base) + '/api/prices?action=site_search&q=' + encodeURIComponent(q), {signal: options.signal});
  if (!response.ok) throw Error('研究資料暫時無法取得，請稍後重試');
  if(response.headers?.get?.('content-type')?.includes('text/html')) throw Error('研究服務尚未開放此裝置存取，請聯絡管理員確認測試環境');
  const data = await response.json();
  if (!data || !Array.isArray(data.items)) throw Error('研究服務回應格式異常');
  if(data.available===false) throw Error('研究來源暫時無法取得，請稍後重試');
  return {items:data.items.filter(x=>x && typeof x.title==='string').map(x=>({title:x.title,source:String(x.source||''),date:String(x.date||''),snippet:String(x.snippet||''),url:articleUrl(x.url)})),partial:!!data.partial};
}
module.exports={apiBase,articleUrl,searchNews};
