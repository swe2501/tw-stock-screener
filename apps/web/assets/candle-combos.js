/* K棒組合 16 類（2026-11-04）：規則說明、選股勾選框、選股結果標籤、K 線圖黃框。
   判斷在本機 scripts/candle_combos.py（每晚盤後算全市場 → Supabase candle_combo_hits），這裡只讀結果、不重算。
   規則來源：《K棒組合.md》16 類原文；用戶補充：長紅/長黑一律實體 3%、內困三日與紅黑三兵的定義（見 COMMON 與各類 rule）。 */
(() => {
  'use strict';
  const SB = 'https://bruqrbvbjxntgoljxsne.supabase.co', AK = 'sb_publishable_KgYlaR-mqtx4uVre6kPD2A_qO6tdT1y';
  const STORE = 'kv_show_combo';
  const COMBOS = [
    { id: 'reversal-doji', name: '反轉十字線', bars: '單棒', wave: '上漲或下跌任一',
      rule: '開盤＝收盤，且同時有上影線（最高＞開盤）與下影線（最低＜開盤）；影線不限長度。波段上漲或波段下跌任一成立即可（以當日最高／最低判斷），同棒雙方向只列一次。完全不看成交量，也不套最低量。' },
    { id: 'bullish-engulfing', name: '陽吞噬', bars: '雙棒', wave: '波段下跌',
      rule: '前黑 → 後紅；後紅K實體包住前黑K整根（含影線）：後開盤 ≤ 前最低、後收盤 ≥ 前最高。' },
    { id: 'bearish-engulfing', name: '陰吞噬', bars: '雙棒', wave: '波段上漲',
      rule: '前紅 → 後黑；後黑K實體包住前紅K整根（含影線）：後開盤 ≥ 前最高、後收盤 ≤ 前最低。' },
    { id: 'piercing', name: '貫穿線', bars: '雙棒', wave: '波段下跌',
      rule: '前黑 → 後紅；後紅實體低點（開盤）嚴格低於前黑實體低點（收盤）；兩實體交集 ≥ 前黑實體 60%；後紅收盤（不含上影線）≤ 前黑最高價（含影線）；後一日成交量 ＞ 前一日。' },
    { id: 'dark-cloud', name: '烏雲罩頂', bars: '雙棒', wave: '波段上漲',
      rule: '前紅 → 後黑；後黑實體高點（開盤）嚴格高於前紅實體高點（收盤）；兩實體交集 ≥ 前紅實體 60%；後黑收盤（不含下影線）≥ 前紅開盤。' },
    { id: 'bullish-harami', name: '多頭母子', bars: '雙棒', wave: '波段下跌',
      rule: '長黑 → 紅；母棒為長黑（實體 ≥ 3%），母棒實體較大且完整包住子棒實體（邊界同價可），不看子棒影線。' },
    { id: 'bearish-harami', name: '空頭母子', bars: '雙棒', wave: '波段上漲',
      rule: '長紅 → 黑；母棒為長紅（實體 ≥ 3%），母棒實體較大且完整包住子棒實體（邊界同價可），不看子棒影線。' },
    { id: 'three-inside-up', name: '內困三日翻紅', bars: '三棒', wave: '波段下跌（沿用多頭母子）',
      rule: '第 1、2 根為多頭母子（含其波段條件），第 3 根紅K且收盤 ＞ 第 1 根開盤。' },
    { id: 'three-inside-down', name: '內困三日翻黑', bars: '三棒', wave: '波段上漲（沿用空頭母子）',
      rule: '第 1、2 根為空頭母子（含其波段條件），第 3 根黑K且收盤 ＜ 第 1 根開盤。' },
    { id: 'two-gap-crows', name: '雙鴉躍空', bars: '三棒', wave: '第 1 根紅K須先通過波段上漲（只用第 1 根最高價）',
      rule: '紅 → 黑 → 黑；第 2、3 根的開盤與收盤都嚴格高於第 1 根收盤（黑K下影線不看）。' },
    { id: 'three-white-soldiers', name: '紅三兵', bars: '三棒', wave: '不加波段',
      rule: '連續 3 個交易日長紅（實體 ≥ 3%），收盤逐日墊高；不設量比。' },
    { id: 'three-black-crows', name: '黑三兵', bars: '三棒', wave: '不加波段',
      rule: '連續 3 個交易日長黑（實體 ≥ 3%），收盤逐日走低；不設量比。' },
    { id: 'bullish-tank', name: '多頭戰車', bars: '三棒', wave: '不加波段',
      rule: '紅 → 黑 → 紅；第 1 根收盤 ＞ 本站保存的形成前全部日K最高價（創紀錄）；第 3 根收盤 ＞ 第 2 根最高價 × 1.03（恰好 3% 不算）；第 3 根量 ≥ 第 2 根量 × 1.5；相鄰兩根實體相交或碰到（影線碰到不算）。' },
    { id: 'bearish-tank', name: '空頭戰車', bars: '三棒', wave: '不加波段',
      rule: '黑 → 紅 → 黑；第 1 根收盤 ＜ 本站保存的形成前全部日K最低價（創紀錄）；第 3 根收盤 ＜ 第 2 根最低價 × 0.97；第 3 根量 ＜ 第 2 根量；相鄰兩根實體相交或碰到。' },
    { id: 'rising-three', name: '上升三法', bars: '多棒（至少 5 根）', wave: '不加波段',
      rule: '首末皆紅K；中間至少 3 根（不限顏色、無上限），每根中間實體（開、收）都在首棒實體 [開1, 收1] 內，影線可超出；末棒開盤在首棒實體內、收盤 ＞ 首棒最高價、量 ≥ 前一日 × 1.5。完成後從下一交易日重找首棒；多個起點同時成立取最早。' },
    { id: 'falling-three', name: '下降三法', bars: '多棒（至少 5 根）', wave: '不加波段',
      rule: '首末皆黑K；中間至少 3 根，每根中間實體都在首棒實體 [收1, 開1] 內，影線可超出；末棒開盤在首棒實體內、收盤 ＜ 首棒最低價、量 ＜ 前一日。完成後從下一交易日重找首棒。' },
  ];
  const COMMON = [
    '紅K＝收盤＞開盤、黑K＝收盤＜開盤，開盤＝收盤不算紅黑。實體＝開盤到收盤，不含影線。',
    '長紅／長黑：實體 ≥ 3%（紅：收盤 ≥ 開盤 × 1.03；黑：收盤 ≤ 開盤 × 0.97）。',
    '波段上漲：組合之前有低點 ≤ 組合最高價 ÷ 1.3；波段下跌：組合之前有高點 ≥ 組合最低價 ÷ 0.7（含等號、含影線）。',
    '反向回撤 10%：往前找波段時，遇到較早高點到其後低點回落超過 10%（上漲波段），或較早低點到其後高點反彈超過 10%（下跌波段），就停止往前找；恰好 10% 仍可跨越。先找到波段目標就成立。',
    '組合必須是連續交易日；遇停牌缺日、無效價或除權息日會切段，組合與往前找的波段都不跨段（戰車的創紀錄比較例外，比對全部保存資料）。',
    '選股只列最近 3 個交易日（含篩選日）完成的組合，並套最低量：收盤 ≥ 100 元需 ≥ 10 萬股，＜ 100 元需 ≥ 50 萬股；十字線免量。K 線圖黃框不套最低量。',
    '資料範圍：本站保存的日K（2024-07 起），不下載補值，不代表每檔都有完整十年。價格比較一律精確比較、不先四捨五入。',
    '組合僅供參考，不構成買賣建議。',
  ];
  const byId = new Map(COMBOS.map(c => [c.id, c]));
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nameOf = id => (byId.get(id) || {}).name || id;

  // ── 規則說明 ──
  function rulesHtml(focus) {
    return '<ul class="cc-common">' + COMMON.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      + '<table class="cc-rules"><thead><tr><th>組合</th><th>棒數</th><th>波段</th><th>條件</th></tr></thead><tbody>'
      + COMBOS.map(c => '<tr id="cc-rule-' + c.id + '"' + (c.id === focus ? ' class="is-focus"' : '') + '><th scope="row">' + esc(c.name) + '</th><td>' + esc(c.bars) + '</td><td>' + esc(c.wave) + '</td><td>' + esc(c.rule) + '</td></tr>').join('')
      + '</tbody></table>';
  }
  function openRules(focus) {
    let d = document.getElementById('ccRulesDialog');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'ccRulesDialog'; d.className = 'cc-dialog';
      d.setAttribute('aria-labelledby', 'ccRulesTitle');
      document.body.append(d);
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
    }
    d.innerHTML = '<div class="cc-dialog-hd"><h3 id="ccRulesTitle">K棒組合 16 類規則</h3><button type="button" class="cc-dialog-x" aria-label="關閉規則說明">✕</button></div><div class="cc-dialog-body">' + rulesHtml(focus) + '</div>';
    d.querySelector('.cc-dialog-x').onclick = () => d.close();
    if (!d.open) d.showModal();
    const row = focus && d.querySelector('#cc-rule-' + focus);
    if (row) row.scrollIntoView({ block: 'center' });
  }

  // ── 選股：勾選框與結果標籤 ──
  function mountGrid() {
    const grid = document.getElementById('ccComboGrid');
    if (!grid || grid.childElementCount) return;
    grid.innerHTML = COMBOS.map(c => '<label class="checkbox-row"><input type="checkbox" class="cc-cb" data-combo="' + c.id + '" /><div><div class="cb-label">' + esc(c.name) + '</div><div class="cb-hint">' + esc(c.bars) + '・' + esc(c.wave) + '</div></div></label>').join('');
  }
  function resultTag(list) {
    return '<div class="zm3-info cc-result">' + list.map(h => '<a href="javascript:void(0)" data-cc-rule="' + esc(h.combo) + '" title="' + esc(nameOf(h.combo)) + '（' + esc(h.date) + ' 完成，僅供參考）；點看規則">' + esc(nameOf(h.combo)) + ' ' + esc(String(h.date).slice(5).replace('-', '/')) + '</a>').join('・') + '</div>';
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-cc-rule]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation(); openRules(a.dataset.ccRule);
  }, true);

  // ── K 線圖黃框 ──
  let visible = true; try { visible = localStorage.getItem(STORE) !== '0'; } catch (_) {}
  let ctx = null, layer = null, groups = [], frame = 0, ro = null, unsub = null, ticket = 0;
  const cache = new Map();

  function mountToggle() {
    if (document.getElementById('chartComboToggle')) return true;
    const info = document.getElementById('chartInfoToggle');
    if (!info) return false;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'chartComboToggle'; b.setAttribute('role', 'switch');
    b.title = 'K棒組合：在日K圖上用黃框標出 16 類 K 棒組合（僅供參考）';
    b.setAttribute('aria-label', 'K棒組合：在日K圖上用黃框標出 K 棒組合');
    b.innerHTML = 'K棒組合<span class="kinfo-sw" aria-hidden="true"></span>';
    info.after(b);
    b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      visible = !visible; try { localStorage.setItem(STORE, visible ? '1' : '0'); } catch (_) {}
      renderToggle(); schedule();
    });
    renderToggle();
    return true;
  }
  function renderToggle() {
    const b = document.getElementById('chartComboToggle'); if (!b) return;
    b.setAttribute('aria-pressed', String(visible)); b.setAttribute('aria-checked', String(visible));
  }

  function detach() {
    ticket++;
    if (unsub) { try { unsub(); } catch (_) {} unsub = null; }
    if (ro) { ro.disconnect(); ro = null; }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (layer) layer.remove();
    layer = null; groups = []; ctx = null;
  }

  async function load(code) {
    if (cache.has(code)) return cache.get(code);
    const p = fetch(SB + '/rest/v1/candle_combo_hits?select=combo,start_date,end_date&code=eq.' + encodeURIComponent(code) + '&order=end_date&limit=2000',
      { headers: { apikey: AK, Authorization: 'Bearer ' + AK } }).then(r => r.ok ? r.json() : []).catch(() => []);
    cache.set(code, p);
    const rows = await p;
    if (!Array.isArray(rows) || !rows.length) cache.delete(code);   // 失敗或無資料不長期快取
    return rows;
  }

  function attach(c) {
    detach();
    mountToggle();
    if (!c || !c.chart || !c.series || !c.host || c.period !== 'day' || !/^\d{4,6}[A-Z]?$/.test(String(c.code || ''))) return;
    if (!c.candles || !c.candles.length || typeof c.candles[0].time !== 'string') return;
    ctx = c;
    const my = ++ticket;
    const idx = new Map(c.candles.map((k, i) => [k.time, i]));
    load(c.code).then(rows => {
      if (my !== ticket || !Array.isArray(rows)) return;
      const merged = new Map();     // 同一起訖合成一框，名稱並列
      for (const r of rows) {
        const i0 = idx.get(r.start_date), i1 = idx.get(r.end_date);
        if (i0 == null || i1 == null || i1 < i0) continue;
        const key = r.start_date + '|' + r.end_date;
        if (!merged.has(key)) {
          let hi = -Infinity, lo = Infinity;
          for (let i = i0; i <= i1; i++) { hi = Math.max(hi, c.candles[i].high); lo = Math.min(lo, c.candles[i].low); }
          merged.set(key, { from: r.start_date, to: r.end_date, hi, lo, ids: [] });
        }
        merged.get(key).ids.push(r.combo);
      }
      groups = [...merged.values()];
      if (getComputedStyle(c.host).position === 'static') c.host.style.position = 'relative';
      layer = document.createElement('div'); layer.className = 'cc-layer'; layer.setAttribute('aria-hidden', 'false');
      c.host.append(layer);
      const ts = c.chart.timeScale();
      ts.subscribeVisibleLogicalRangeChange(schedule);
      const pm = () => schedule();
      c.host.addEventListener('pointermove', pm, { passive: true });
      c.host.addEventListener('wheel', pm, { passive: true });
      unsub = () => { try { ts.unsubscribeVisibleLogicalRangeChange(schedule); } catch (_) {} c.host.removeEventListener('pointermove', pm); c.host.removeEventListener('wheel', pm); };
      ro = new ResizeObserver(schedule); ro.observe(c.host);
      schedule();
    });
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }

  function paint() {
    frame = 0;
    if (!ctx || !layer || !layer.isConnected) return;
    layer.replaceChildren();
    if (!visible || !groups.length) return;
    const ts = ctx.chart.timeScale(), s = ctx.series;
    let psw = 0, tsh = 0;
    try { psw = ctx.chart.priceScale('right').width() || 0; } catch (_) {}
    try { tsh = ts.height() || 0; } catch (_) {}
    const W = ctx.host.clientWidth - psw, H = ctx.host.clientHeight - tsh;
    layer.style.width = W + 'px'; layer.style.height = H + 'px';
    const spacing = (ts.options().barSpacing || 6);
    const half = Math.max(2, spacing / 2);
    const placed = [];
    for (const g of groups) {
      const x0 = ts.timeToCoordinate(g.from), x1 = ts.timeToCoordinate(g.to);
      const yt = s.priceToCoordinate(g.hi), yb = s.priceToCoordinate(g.lo);
      if (x0 == null || x1 == null || yt == null || yb == null) continue;
      const left = x0 - half - 2, right = x1 + half + 2;
      if (right < 0 || left > W) continue;
      const box = document.createElement('div'); box.className = 'cc-box';
      box.style.left = left + 'px'; box.style.top = (yt - 4) + 'px';
      box.style.width = Math.max(6, right - left) + 'px'; box.style.height = Math.max(6, yb - yt + 8) + 'px';
      layer.append(box);
      // 名稱放框上方，太靠上就放框下方；與已放的名稱重疊就再往外推
      const lab = document.createElement('div'); lab.className = 'cc-label';
      g.ids.forEach((id, k) => {
        if (k) lab.append('、');
        const a = document.createElement('a'); a.href = 'javascript:void(0)'; a.textContent = nameOf(id);
        a.dataset.ccRule = id; a.title = nameOf(id) + '（' + g.from + (g.from === g.to ? '' : '～' + g.to) + '，僅供參考）；點看規則';
        lab.append(a);
      });
      lab.append(Object.assign(document.createElement('small'), { textContent: '（僅供參考）' }));
      layer.append(lab);
      const lw = lab.offsetWidth, lh = lab.offsetHeight;
      let lx = Math.min(Math.max(2, left), Math.max(2, W - lw - 2));
      let ly = yt - 4 - lh - 3;
      if (ly < 2) ly = yt - 4 + Math.max(6, yb - yt + 8) + 3;
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find(p => lx < p.x + p.w && lx + lw > p.x && ly < p.y + p.h && ly + lh > p.y);
        if (!hit) break;
        ly = ly < yt ? hit.y - lh - 2 : hit.y + hit.h + 2;
      }
      if (ly < 0 || ly + lh > H) { lab.remove(); continue; }
      lab.style.left = lx + 'px'; lab.style.top = ly + 'px';
      placed.push({ x: lx, y: ly, w: lw, h: lh });
    }
  }

  function boot() { mountGrid(); mountToggle(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.AcademyCandleCombos = { COMBOS, COMMON, nameOf, rulesHtml, openRules, resultTag, attach, detach, refresh: schedule, isVisible: () => visible };
})();
