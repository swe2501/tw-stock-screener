/* 策略研究面向：策略工作台與私房篩選器共用。ready=false 的面向尚無資料，先不顯示。 */
(() => {
  'use strict';
  const list = [
    { id: 'tech', name: '技術面', ask: '看價格和成交量的變化，找買賣時機。', examples: ['均線', 'KD／RSI', 'MACD', '突破', '量能'], ready: true },
    { id: 'fund', name: '基本面', ask: '看公司賺不賺錢、便不便宜。', examples: ['月營收', 'EPS', '本益比', '殖利率'], ready: false },
    { id: 'chip', name: '籌碼面', ask: '看大戶、法人的錢往哪裡走。', examples: ['三大法人', '融資融券', '集保大戶'], ready: false },
    { id: 'macro', name: '總經面', ask: '政治牽動政策，政策影響總經，再影響大盤。', examples: ['利率', 'PMI', '外資空單', '大盤廣度'], ready: false },
    { id: 'news', name: '消息面', ask: '看題材熱度和事件，誰正被市場討論。', examples: ['題材熱度', '法說會', '重大訊息'], ready: false },
    { id: 'mind', name: '心理面', ask: '看市場情緒是貪婪還是恐懼。', examples: ['貪婪指數', '散戶多空比'], ready: false }
  ];
  const byId = Object.fromEntries(list.map(d => [d.id, d]));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** 策略的面向；舊策略沒有紀錄時視為技術面（目前所有條件都是價量指標）。 */
  function of(strategy) {
    const ids = Array.isArray(strategy?.dimensions) ? [...new Set(strategy.dimensions.filter(id => byId[id]))] : [];
    return ids.length ? ids : ['tech'];
  }
  /** 舊策略沒有上架欄位：沿用原本「儲存即可在私房篩選器使用」的行為，視為已上架。 */
  const isPublished = strategy => strategy?.published !== false;
  const main = strategy => of(strategy)[0];
  function tags(strategy) {
    return of(strategy).map((id, i) => `<span class="ms-dim ms-dim-${id}${i ? '' : ' is-main'}">${esc(byId[id].name)}</span>`).join('');
  }
  window.AcademyStrategyDims = { list, byId, of, main, isPublished, tags, available: () => list.filter(d => d.ready) };
})();
