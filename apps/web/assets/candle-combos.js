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
      rule: '首末皆紅K；中間至少 3 根（不限顏色、無上限），每根中間實體（開、收）都在首棒實體 [開1, 收1] 內，影線可超出；末棒開盤在首棒實體內、且黏著倒數第 2 根（開盤 ≤ 前一根實體上緣，不能有缺口）、收盤 ＞ 首棒最高價、量 ≥ 前一日 × 1.5。完成後從下一交易日重找首棒；多個起點同時成立取最早。' },
    { id: 'falling-three', name: '下降三法', bars: '多棒（至少 5 根）', wave: '不加波段',
      rule: '首末皆黑K；中間至少 3 根，每根中間實體都在首棒實體 [收1, 開1] 內，影線可超出；末棒開盤在首棒實體內、且黏著倒數第 2 根（開盤 ≥ 前一根實體下緣，不能有缺口）、收盤 ＜ 首棒最低價、量 ＜ 前一日。完成後從下一交易日重找首棒。' },
  ];
  // 「反轉十字線」與上方單一 K 棒的「十字線」使用同一套定義；
  // 保留資料映射與圖表辨識，但不在 K 棒組合區重複提供選項。
  const COMBO_OPTIONS = COMBOS.filter(c => c.id !== 'reversal-doji');
  const COMMON = [
    '紅K＝收盤＞開盤、黑K＝收盤＜開盤，開盤＝收盤不算紅黑。實體＝開盤到收盤，不含影線。',
    '長紅／長黑：實體 ≥ 3%（紅：收盤 ≥ 開盤 × 1.03；黑：收盤 ≤ 開盤 × 0.97）。',
    '波段上漲：組合之前有低點 ≤ 組合最高價 ÷ 1.3；波段下跌：組合之前有高點 ≥ 組合最低價 ÷ 0.7（含等號、含影線）。',
    '反向回撤 10%：往前找波段時，遇到較早高點到其後低點回落超過 10%（上漲波段），或較早低點到其後高點反彈超過 10%（下跌波段），就停止往前找；恰好 10% 仍可跨越。先找到波段目標就成立。',
    '組合必須是連續交易日；遇停牌缺日、無效價或除權息日會切段，組合與往前找的波段都不跨段（戰車的創紀錄比較例外，比對全部保存資料）。',
    '選股以篩選器的「日期」為準（不填＝最新交易日）：預設列出該日往前 3 個交易日（含該日）完成的組合，也可選「只看指定日期當天」；並套最低量：收盤 ≥ 100 元需 ≥ 10 萬股，＜ 100 元需 ≥ 50 萬股；十字線免量。K 線圖黃框不套最低量。',
    '資料範圍：本站保存的日K（2024-07 起），不下載補值，不代表每檔都有完整十年。價格比較一律精確比較、不先四捨五入。',
    '組合僅供參考，不構成買賣建議。',
  ];
  // 滑鼠移到篩選器勾選框時的示意卡（沿用合夥人 kbar-hint.js 的卡片；K 棒格式 [開, 高, 低, 收]，ctx＝前面走勢、sig＝組合本身）
  const HINTS = {
    'reversal-doji': { tag: ['neu', '轉折觀察'], ctx: [[60,61,56,57],[57,58,53,54],[54,55,51,52]], sig: [[51,53.5,48.5,51]],
      desc: '出現<em>開盤＝收盤、上下都有影線</em>的十字線，多空暫時拉平，留意是否反轉。不看成交量。' },
    'bullish-engulfing': { tag: ['bull', '底部翻多'], ctx: [[60,61,56,57],[57,58,53,54],[54,55,51,52]], sig: [[52.8,53.2,50.9,51.2],[49.6,54.8,49.2,54.4]],
      desc: '<em>紅K 實體把前一根黑K 整根（含影線）吃掉</em>，買盤一口氣收復跌幅。' },
    'bearish-engulfing': { tag: ['bear', '頭部翻空'], ctx: [[48,51,47,50.5],[50.5,54,50,53.5],[53.5,57,53,56.5]], sig: [[56.6,58.3,56.2,58],[59.6,59.9,54.6,55]],
      desc: '<em>黑K 實體把前一根紅K 整根（含影線）吃掉</em>，賣壓吃掉前一日漲幅。' },
    'piercing': { tag: ['bull', '跌深反攻'], ctx: [[60,61,56,57],[57,58,53.5,54]], sig: [[54,54.5,50.5,51],[50,54.2,49.5,53.5]],
      desc: '黑K 之後<em>開更低的紅K，收盤拉回到黑K 實體六成以上</em>（不超過黑K 最高價），且量比前一天大。' },
    'dark-cloud': { tag: ['bear', '高檔遇壓'], ctx: [[48,51,47,50.5],[50.5,54,50,53.5]], sig: [[53.5,57.5,53,57],[58,58.5,54.5,54.8]],
      desc: '紅K 之後<em>開更高的黑K，收盤壓回紅K 實體六成以上</em>，但沒跌破紅K 開盤。' },
    'bullish-harami': { tag: ['bull', '跌勢趨緩'], ctx: [[61,62,58,59],[59,60,56.5,57]], sig: [[57,57.5,50.5,51],[53.2,55.3,52.9,54.8]],
      desc: '<em>長黑K 之後出現被包在實體內的小紅K</em>，賣壓減弱，待下一根確認。' },
    'bearish-harami': { tag: ['bear', '漲勢趨緩'], ctx: [[48,51,47,50],[50,53.5,49.5,52.8]], sig: [[53,59.5,52.5,59],[56.8,57.1,54.9,55.2]],
      desc: '<em>長紅K 之後出現被包在實體內的小黑K</em>，追價力道轉弱，待下一根確認。' },
    'three-inside-up': { tag: ['bull', '母子確認翻紅'], ctx: [[61,62,58,59],[59,60,56.5,57]], sig: [[57,57.5,50.5,51],[52.5,54.8,52,54.2],[54.5,59.5,54,59]],
      desc: '出現多頭母子後，<em>第 3 根紅K 收盤站上母棒（長黑）開盤</em>，確認轉強。' },
    'three-inside-down': { tag: ['bear', '母子確認翻黑'], ctx: [[48,51,47,50],[50,53.5,49.5,52.8]], sig: [[53,59.5,52.5,59],[57.8,58.2,55.5,56.2],[56,56.5,51.5,52]],
      desc: '出現空頭母子後，<em>第 3 根黑K 收盤跌破母棒（長紅）開盤</em>，確認轉弱。' },
    'two-gap-crows': { tag: ['bear', '漲勢結束'], ctx: [[48,51,47,50.5],[50.5,54,50,53.5]], sig: [[53.5,57.5,53,57],[59,60,57.8,58.2],[59.5,60,57.5,57.8]],
      desc: '紅K 之後<em>連兩根跳空的黑K</em>，開盤、收盤都還在紅K 收盤之上，追價力道轉弱。' },
    'three-white-soldiers': { tag: ['bull', '連續走強'], ctx: [[50,51,49,50.2],[50.2,51,49.5,50]], sig: [[50,52.2,49.8,52],[52.1,54.3,51.9,54],[54,56.6,53.8,56.4]],
      desc: '<em>連續 3 天長紅K，收盤一天比一天高</em>。不看成交量、不要求前面先跌。' },
    'three-black-crows': { tag: ['bear', '連續走弱'], ctx: [[57,58,56,57.2],[57.2,58,56.5,57]], sig: [[57,57.2,54.8,55],[54.9,55.1,52.8,53],[53,53.2,50.6,50.8]],
      desc: '<em>連續 3 天長黑K，收盤一天比一天低</em>。不看成交量、不要求前面先漲。' },
    'bullish-tank': { tag: ['bull', '創高續攻'], ctx: [[48,50,47.5,49.5],[49.5,51,49,50.5]], sig: [[50.5,53.5,50.2,53.2],[53,53.8,51.8,52.2],[52.5,56.5,52.3,56]],
      desc: '紅K <em>收盤創本站資料新高</em>，隔天小黑休息，第 3 根紅K 延續攻勢。' },
    'bearish-tank': { tag: ['bear', '創低續跌'], ctx: [[56,56.5,54,54.5],[54.5,55,53,53.5]], sig: [[53.5,53.8,50.5,50.8],[50.8,52.2,50.5,51.6],[51.5,51.8,47.8,48.2]],
      desc: '黑K <em>收盤創本站資料新低</em>，隔天小紅反彈，第 3 根黑K 延續跌勢。' },
    'rising-three': { tag: ['bull', '整理後續漲'], ctx: [[48,49,47.5,48.5]], sig: [[48.5,53.2,48.2,53],[52.8,53.4,51.6,51.9],[51.9,52.3,50.6,51],[51,51.8,50.2,51.5],[51.5,55,51.4,54.8]],
      desc: '長紅之後<em>至少 3 根小K 都待在第一根紅K 實體內</em>，收盤突破第一根最高價。' },
    'falling-three': { tag: ['bear', '反彈後續跌'], ctx: [[57,57.5,56,56.5]], sig: [[56.5,56.8,51.6,52],[52.3,53.6,52,53.2],[53.2,54.2,52.8,54],[53.9,54.5,53,53.4],[53.4,53.5,49.6,49.8]],
      desc: '長黑之後<em>至少 3 根小K 都待在第一根黑K 實體內</em>，收盤跌破第一根最低價。' },
  };
  window.AcademyKbarHintExtra = Object.fromEntries(COMBOS.map(c => ['cc_' + c.id, Object.assign({ name: c.name }, HINTS[c.id])]));

  // ── 單根 K 棒訊號（2026-11-05 用戶定義；scripts/candle_combos.py SIGNALS）──
  // 不在圖面自動畫圈；僅在 K 棒資訊列與篩選結果呈現型態名稱。
  const SIG = {
    'long-lower-3': '長下影線 ≥3%', 'long-lower-5': '長下影線 ≥5%',
    'long-upper-3': '長上影線 ≥3%', 'long-upper-5': '長上影線 ≥5%',
    'one-line': '一字線', 'spinning-top': '紡錘線',
    'candle-sell': '蠟燭線', 'gravestone': '墓碑線',
    'hanging-man': '吊人線', 'hanging-man-main': '吊人線→主力確認', 'hanging-man-retail': '吊人線→散戶確認',
  };
  const SIG_SHORT = { 'reversal-doji': '十字線' };
  // 篩選器「K棒」分類勾選框的滑鼠示意卡（key＝勾選框 id；十字線沿用反轉十字線的卡片）
  const SIG_HINTS = {
    red_candle_pct: { name: '長紅棒', tag: ['bull', '紅K 長實體'], ctx: [[49,50,48.5,49.4],[49.4,50.2,49,49.8]], sig: [[50,55.2,49.8,55]],
      desc: '<em>收盤高於開盤，且紅K實體達到設定幅度</em>。輸入數字可調整篩選門檻。' },
    black_candle_pct: { name: '長黑棒', tag: ['bear', '黑K 長實體'], ctx: [[56,56.5,55,55.8],[55.8,56,55.1,55.4]], sig: [[55,55.2,49.8,50]],
      desc: '<em>收盤低於開盤，且黑K實體達到設定幅度</em>。輸入數字可調整篩選門檻。' },
    doji: Object.assign({ name: '十字線' }, HINTS['reversal-doji'], {
      desc: '出現<em>開盤＝收盤、上下都有影線</em>的十字線，代表多空暫時拉平，可搭配前後 K 棒觀察型態變化。' }),
    long_lower: { name: '長下影線', tag: ['bull', '低檔承接'], ctx: [[56,57,54,54.5],[54.5,55,52,52.5]], sig: [[52,53,48,52.8]],
      desc: '下影線＝<em>紅K (開盤−最低)÷收盤、黑K (收盤−最低)÷收盤</em>，≥ 所選 3% 或 5%。盤中殺低後有買盤承接。' },
    long_upper: { name: '長上影線', tag: ['bear', '上檔賣壓'], ctx: [[48,50,47.5,49.5],[49.5,52,49,51.8]], sig: [[52,57,51.8,52.6]],
      desc: '上影線＝<em>紅K (最高−收盤)÷收盤、黑K (最高−開盤)÷收盤</em>，≥ 所選 3% 或 5%。盤中衝高後被賣壓壓回。' },
    one_line: { name: '一字線', tag: ['neu', '強勢或弱勢'], ctx: [[50,52,49.5,51.5],[51.5,55,51.4,54.8]], sig: [[60.3,60.3,60.3,60.3],[48.8,48.8,48.8,48.8]],
      desc: '<em>開盤＝最高＝最低＝收盤</em>。高於前一日為強勢一字漲停；低於前一日為弱勢一字跌停。' },
    one_line_strong: { name: '一字線・強勢', tag: ['bull', '向上鎖定'], ctx: [[50,52,49.5,51.5],[51.5,55,51.4,54.8]], sig: [[60.3,60.3,60.3,60.3]],
      desc: '<em>開盤＝最高＝最低＝收盤</em>，且價格高於前一交易日，呈現強勢一字線。' },
    one_line_weak: { name: '一字線・弱勢', tag: ['bear', '向下鎖定'], ctx: [[55,55.5,53,53.4],[53.4,54,51,51.3]], sig: [[46.2,46.2,46.2,46.2]],
      desc: '<em>開盤＝最高＝最低＝收盤</em>，且價格低於前一交易日，呈現弱勢一字線。' },
    spinning_top: { name: '紡錘線', tag: ['bear', '弱勢拉鋸'], ctx: [[50,52,49.6,51.6],[51.6,53,51.2,52.2]], sig: [[52.8,56,51.6,52]],
      desc: '<em>黑K有實體，且上下影線明顯</em>，反映盤中拉鋸後收低。' },
    candle_line: { name: '蠟燭線', tag: ['neu', '高檔拉鋸'], ctx: [[40,44,39.5,43.5],[43.5,48,43,47.5],[47.5,52,47,51.5]], sig: [[51.8,54.5,50.6,53.4]],
      desc: '<em>紅K有實體、上下都有影線</em>，並出現在一段波段上漲之後，反映盤中多空拉鋸加劇。' },
    gravestone: { name: '墓碑線', tag: ['bear', '上檔壓力'], ctx: [[46,48.5,45.8,48.2],[48.2,50.3,48,50]], sig: [[50,54.5,50,50]],
      desc: '<em>開盤＝收盤＝最低價</em>，只留下較長上影線。' },
    hanging_man: { name: '吊人線', tag: ['neu', '主力或散戶'], ctx: [[45,49.5,45,49.5],[49.5,54.4,49.5,54.4]], sig: [[59.8,59.8,55,59.8]],
      desc: '前面連續出現漲停後，形成<em>開盤＝收盤＝最高價、只留下影線</em>的 T 字。' },
    hanging_main: { name: '吊人線→主力確認', tag: ['bull', '主力吊在那'], ctx: [[49.5,54.4,49.5,54.4],[59.8,59.8,55,59.8],[59,60,57,58],[58,59,56.5,57.5]], sig: [[58,63.5,57.8,63]],
      desc: '吊人線後出現<em>帶量紅K，且收盤超過吊人線</em>，列為主力確認。' },
    hanging_retail: { name: '吊人線→散戶確認', tag: ['bear', '散戶吊在那'], ctx: [[59.8,59.8,55,59.8],[59,60,57,58],[58,58.5,56,56.5]], sig: [[56,56.2,53,53.5]],
      desc: '吊人線後未出現主力確認，之後<em>收盤跌破吊人線最低價</em>，列為散戶確認。' },
  };
  Object.assign(window.AcademyKbarHintExtra, SIG_HINTS);
  const byId = new Map(COMBOS.map(c => [c.id, c]));
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nameOf = id => (byId.get(id) || {}).name || id;

  // ── 規則說明 ──
  function rulesHtml(focus) {
    return '<ul class="cc-common">' + COMMON.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      + '<table class="cc-rules"><thead><tr><th>組合</th><th>棒數</th><th>波段</th><th>條件</th></tr></thead><tbody>'
      + COMBO_OPTIONS.map(c => '<tr id="cc-rule-' + c.id + '"' + (c.id === focus ? ' class="is-focus"' : '') + '><th scope="row">' + esc(c.name) + '</th><td>' + esc(c.bars) + '</td><td>' + esc(c.wave) + '</td><td>' + esc(c.rule) + '</td></tr>').join('')
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
    d.innerHTML = '<div class="cc-dialog-hd"><h3 id="ccRulesTitle">K棒組合 15 類規則</h3><button type="button" class="cc-dialog-x" aria-label="關閉規則說明">✕</button></div><div class="cc-dialog-body">' + rulesHtml(focus) + '</div>';
    d.querySelector('.cc-dialog-x').onclick = () => d.close();
    if (!d.open) d.showModal();
    const row = focus && d.querySelector('#cc-rule-' + focus);
    if (row) row.scrollIntoView({ block: 'center' });
  }

  // ── 選股：勾選框與結果標籤 ──
  function mountGrid() {
    const grid = document.getElementById('ccComboGrid');
    if (!grid || grid.childElementCount) return;
    grid.innerHTML = COMBO_OPTIONS.map(c => '<label class="checkbox-row" title="' + esc(c.name) + '：點擊名稱可於規則說明查看完整條件"><input type="checkbox" class="cc-cb" id="cc_' + c.id + '" data-combo="' + c.id + '" /><span class="cb-label">' + esc(c.name) + '</span></label>').join('');
  }
  function resultTag(list) {
    return '<div class="zm3-info cc-result">' + list.map(h => '<span class="cc-result-item"><a href="javascript:void(0)" data-cc-rule="' + esc(h.combo) + '" title="' + esc(nameOf(h.combo)) + '（' + esc(h.date) + ' 完成）；點看規則">' + esc(nameOf(h.combo)) + ' ' + esc(String(h.date).slice(5).replace('-', '/')) + '</a><button type="button" class="cc-help" data-kh-key="cc_' + esc(h.combo) + '" aria-label="查看' + esc(nameOf(h.combo)) + '示意圖">?</button></span>').join('<span class="cc-result-sep">・</span>') + '</div>';
  }
  function sigName(id) { return SIG[id] || SIG_SHORT[id] || nameOf(id); }
  function sigHintKey(id) {
    if (id === 'reversal-doji') return 'doji';
    if (id.startsWith('long-lower-')) return 'long_lower';
    if (id.startsWith('long-upper-')) return 'long_upper';
    return ({ 'one-line': 'one_line', 'spinning-top': 'spinning_top', 'candle-sell': 'candle_line', 'gravestone': 'gravestone', 'hanging-man': 'hanging_man', 'hanging-man-main': 'hanging_main', 'hanging-man-retail': 'hanging_retail' })[id] || '';
  }
  function signalTag(list) {
    const ids = list.map(h => h.signal);
    const shown = ids.filter(id => !(id.endsWith('-3') && ids.includes(id.slice(0, -2) + '-5')));   // 有 5% 就不重複列 3%
    return '<div class="zm3-info cc-result cc-signal-tag">' + shown.map(id => '<span class="cc-result-item"><span>' + esc(sigName(id)) + '</span><button type="button" class="cc-help" data-kh-key="' + esc(sigHintKey(id)) + '" aria-label="查看' + esc(sigName(id)) + '示意圖">?</button></span>').join('<span class="cc-result-sep">・</span>') + '</div>';
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-cc-rule]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation(); openRules(a.dataset.ccRule);
  }, true);
  document.addEventListener('pointerover', e => {
    const help = e.target.closest && e.target.closest('.cc-help[data-kh-key]');
    if (help) window.AcademyKbarHint?.show(help.dataset.khKey, help);
  }, true);
  document.addEventListener('pointerout', e => {
    const help = e.target.closest && e.target.closest('.cc-help[data-kh-key]');
    if (help && !help.contains(e.relatedTarget)) window.AcademyKbarHint?.hide();
  }, true);
  document.addEventListener('focusin', e => {
    const help = e.target.closest && e.target.closest('.cc-help[data-kh-key]');
    if (help) window.AcademyKbarHint?.show(help.dataset.khKey, help);
  }, true);
  document.addEventListener('focusout', e => {
    if (e.target.closest && e.target.closest('.cc-help[data-kh-key]')) window.AcademyKbarHint?.hide();
  }, true);
  document.addEventListener('click', e => {
    const help = e.target.closest && e.target.closest('.cc-help[data-kh-key]');
    if (!help) return;
    e.preventDefault(); e.stopPropagation();
    window.AcademyKbarHint?.show(help.dataset.khKey, help);
  }, true);

  // ── K 線圖黃框 ──
  let visible = true; try { visible = localStorage.getItem(STORE) !== '0'; } catch (_) {}
  let ctx = null, layer = null, groups = [], sigByDate = new Map(), frame = 0, ro = null, unsub = null, ticket = 0;
  const infoOn = () => window.AcademyChartViewport?.isInfoVisible?.() !== false;   // 單根訊號圈圈跟「K棒訊息」開關連動
  const cache = new Map();

  function mountToggle() {
    if (document.getElementById('chartComboToggle')) return true;
    const info = document.getElementById('chartInfoToggle');
    if (!info) return false;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'chartComboToggle'; b.setAttribute('role', 'switch');
    b.title = 'K棒組合：在日K圖上標示 K 棒組合（僅供參考）';
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
    layer = null; groups = []; sigByDate = new Map(); ctx = null;
  }

  async function fetchTable(table, col, code) {
    // PostgREST 一次最多 1000 筆 → 分頁讀；回傳統一成 {combo, start_date, end_date}
    let all = [];
    for (let off = 0; off < 10000; off += 1000) {
      const r = await fetch(SB + '/rest/v1/' + table + '?select=' + col + ',start_date,end_date&code=eq.' + encodeURIComponent(code) + '&order=end_date,' + col + '&offset=' + off + '&limit=1000',
        { headers: { apikey: AK, Authorization: 'Bearer ' + AK } });
      if (!r.ok) break;
      const page = await r.json();
      all = all.concat(page.map(x => ({ combo: x[col], start_date: x.start_date, end_date: x.end_date })));
      if (page.length < 1000) break;
    }
    return all;
  }
  async function fetchAll(code) {
    // K棒組合 candle_combo_hits ＋ 單根訊號 candle_signal_hits（2026-11-05 分表）
    const [a, b] = await Promise.all([fetchTable('candle_combo_hits', 'combo', code), fetchTable('candle_signal_hits', 'signal', code).catch(() => [])]);
    return a.concat(b);
  }

  async function load(code) {
    if (cache.has(code)) return cache.get(code);
    const p = fetchAll(code).catch(() => []);
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
        if (SIG[r.combo] || r.combo === 'reversal-doji') {          // 單根訊號（十字線兩邊都算）：依「標示日」收集
          if (idx.has(r.end_date)) {
            if (!sigByDate.has(r.end_date)) sigByDate.set(r.end_date, []);
            sigByDate.get(r.end_date).push(r.combo);
          }
          if (!byId.has(r.combo)) continue;
        }
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
    if (!(visible && groups.length)) return;
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
      layer.append(lab);
      const lw = lab.offsetWidth, lh = lab.offsetHeight;
      const center = (left + right) / 2;
      let lx = Math.min(Math.max(2, center - lw / 2), Math.max(2, W - lw - 2));
      let ly = yt - 4 - lh - 3;
      if (ly < 2) ly = yt - 4 + Math.max(6, yb - yt + 8) + 3;
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find(p => lx < p.x + p.w && lx + lw > p.x && ly < p.y + p.h && ly + lh > p.y);
        if (!hit) break;
        ly = ly < yt ? hit.y - lh - 2 : hit.y + hit.h + 2;
      }
      if (ly < 0 || ly + lh > H) { lab.remove(); continue; }
      lab.dataset.placement = ly < yt ? 'above' : 'below';
      lab.style.left = lx + 'px'; lab.style.top = ly + 'px';
      placed.push({ x: lx, y: ly, w: lw, h: lh });
    }
  }

  // 提示框（「K棒訊息」）多一行：這根 K 棒的單根訊號；不加入操作建議。
  function signalTipHtml(time, k) {
    if (!ctx || !infoOn()) return '';
    const ids = (sigByDate.get(time) || []).slice();
    const names = ids.filter(id => !(id.endsWith('-3') && ids.includes(id.slice(0, -2) + '-5'))).map(sigName);
    if (!names.length) return '';
    return '<div class="ohlc-signal"><span>K棒訊號</span>' + names.map(n => '<b>' + esc(n) + '</b>').join('') + '</div>';
  }

  function boot() { mountGrid(); mountToggle(); window.AcademyKbarHint?.register(window.AcademyKbarHintExtra); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.AcademyCandleCombos = { COMBOS, COMMON, SIG, nameOf, rulesHtml, openRules, resultTag, signalTag, signalTipHtml, attach, detach, refresh: schedule, isVisible: () => visible };
})();
