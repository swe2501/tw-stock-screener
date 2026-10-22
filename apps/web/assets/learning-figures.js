/* 學習中心圖解（2026-10-22）：純 SVG 示意圖，顏色走網站變數，深淺色自動切換。數字皆為示意。
   window.AcademyLearningFigures.render(id) → SVG 字串；找不到回傳 ''。 */
(() => {
  'use strict';
  const W = 480;
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (h, label, inner) => `<svg class="lf" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  const t = (x, y, s, cls = 'lf-t', a = 'start') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${a}">${esc(s)}</text>`;
  const ln = (x1, y1, x2, y2, cls = 'lf-grid') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const rect = (x, y, w, h, cls = 'lf-box', r = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}"/>`;
  const num = (x, y, n) => `<g class="lf-num"><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y + 4}" text-anchor="middle">${n}</text></g>`;
  const path = (pts, cls = 'lf-line') => `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')}" class="${cls}"/>`;
  const scale = (min, max, top, bottom) => v => bottom - (v - min) / (max - min) * (bottom - top);
  const candle = (x, o, h, l, c, y, w = 10) => {
    const up = c >= o, cls = up ? 'lf-up' : 'lf-down', yt = y(Math.max(o, c)), yb = y(Math.min(o, c));
    return `<g class="${cls}"><line x1="${x}" y1="${y(h)}" x2="${x}" y2="${y(l)}" class="lf-wick"/><rect x="${x - w / 2}" y="${yt}" width="${w}" height="${Math.max(1.5, yb - yt)}" rx="1.5" class="lf-body"/></g>`;
  };
  const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n);
  const candlesFrom = closes => closes.map((c, i) => { const o = i ? closes[i - 1] : c - .4; const hi = Math.max(o, c) + .6 + (i % 3) * .25, lo = Math.min(o, c) - .6 - (i % 4) * .2; return [o, hi, lo, c]; });
  const kf = (n, keys) => series(n, i => { let a = keys[0], b = keys[keys.length - 1]; for (let k = 1; k < keys.length; k++) if (keys[k][0] >= i) { a = keys[k - 1]; b = keys[k]; break; } return a[1] + (b[1] - a[1]) * ((i - a[0]) / Math.max(1, b[0] - a[0])); });
  const drawCandles = (cs, x0, dx, y, w) => cs.map((k, i) => candle(x0 + i * dx, k[0], k[1], k[2], k[3], y, w)).join('');

  // ── UI 示意圖：簡化的網站畫面＋編號 ──
  const ui = (h, label, parts) => svg(h, label, rect(6, 6, W - 12, h - 12, 'lf-frame', 12) + parts.map(p => {
    const [x, y, w, hh, text, n, cls] = p;
    return rect(x, y, w, hh, cls || 'lf-box', 7) + (text ? t(x + 10, y + Math.min(hh / 2 + 4, 20), text, 'lf-t lf-small') : '') + (n ? num(x + w - 12, y + 12, n) : '');
  }).join(''));

  const F = {
    'tw-market': () => {
      const x = h => 40 + (h - 8) / 7 * 400;
      return svg(170, '台股交易時間與交割時間軸',
        ln(40, 70, 440, 70, 'lf-axis') +
        `<rect x="${x(8.5)}" y="58" width="${x(9) - x(8.5)}" height="24" rx="5" class="lf-soft"/>` +
        `<rect x="${x(9)}" y="58" width="${x(13.5) - x(9)}" height="24" rx="5" class="lf-accent-fill"/>` +
        [8, 9, 10, 11, 12, 13, 14, 15].map(hh => ln(x(hh), 82, x(hh), 88, 'lf-axis') + t(x(hh), 102, hh + ':00', 'lf-t lf-small lf-muted', 'middle')).join('') +
        t(x(8.75), 50, '先掛單', 'lf-t lf-small lf-muted', 'middle') + t(x(11.25), 50, '盤中交易 09:00～13:30', 'lf-t lf-strong', 'middle') + t(x(13.5) + 6, 50, '13:30 收盤價', 'lf-t lf-small lf-up-t') +
        ln(40, 140, 440, 140, 'lf-axis') +
        [['T 日', '成交', 90], ['T+1', '', 240], ['T+2', '早上扣款', 390]].map(([a, b, xx]) => `<circle cx="${xx}" cy="140" r="6" class="${b ? 'lf-dot-accent' : 'lf-dot'}"/>` + t(xx, 128, a, 'lf-t lf-strong', 'middle') + (b ? t(xx, 162, b, 'lf-t lf-small lf-muted', 'middle') : '')).join(''));
    },
    kbar: () => {
      const y = scale(46, 56, 24, 196);
      const lab = (x1, v, s) => ln(x1, y(v), x1 + 34, y(v), 'lf-dash') + t(x1 + 40, y(v) + 4, s, 'lf-t lf-small');
      return svg(220, 'K 棒構造：紅 K 與綠 K 的開高低收',
        candle(120, 49, 55, 47, 54, y, 34) + lab(140, 55, '最高 55') + lab(140, 54, '收盤 54') + lab(140, 49, '開盤 49') + lab(140, 47, '最低 47') +
        t(120, 214, '紅 K：收盤 > 開盤', 'lf-t lf-small lf-up-t', 'middle') +
        candle(340, 54, 55.5, 47.5, 49, y, 34) + lab(360, 55.5, '最高') + lab(360, 54, '開盤') + lab(360, 49, '收盤') + lab(360, 47.5, '最低') +
        t(340, 214, '綠 K：收盤 < 開盤', 'lf-t lf-small lf-down-t', 'middle') +
        t(64, y(51.5) + 4, '實體', 'lf-t lf-small lf-muted', 'end') + ln(70, y(54), 70, y(49), 'lf-bracket') + t(64, y(55) + 2, '影線', 'lf-t lf-small lf-muted', 'end'));
    },
    volume: () => {
      const cl = series(24, i => i < 17 ? 50 + Math.sin(i / 1.4) * 1.1 : 50.6 + (i - 16) * 1.05), cs = candlesFrom(cl), y = scale(47.5, 59.5, 16, 124);
      const vol = series(24, i => i === 17 ? 2.6 : i > 17 ? 1.5 + (i % 2) * .3 : .8 + (i % 3) * .15), vy = v => 200 - v * 24;
      return svg(220, '放量突破：突破當天成交量是平常的兩倍以上',
        ln(20, y(52), 460, y(52), 'lf-dash-accent') + t(24, y(52) - 6, '前高 52', 'lf-t lf-small lf-accent-t') +
        drawCandles(cs, 34, 18, y, 10) +
        vol.map((v, i) => `<rect x="${34 + i * 18 - 5}" y="${vy(v)}" width="10" height="${200 - vy(v)}" rx="1.5" class="${i === 17 ? 'lf-vol-hl' : 'lf-vol'}"/>`).join('') +
        ln(20, vy(1), 460, vy(1), 'lf-dash') + t(24, vy(1) - 5, '20 日均量', 'lf-t lf-small lf-muted') +
        t(34 + 17 * 18, vy(2.6) - 8, '量比 2.6', 'lf-t lf-small lf-strong', 'middle') + ln(20, 200, 460, 200, 'lf-axis'));
    },
    'ma-cross': () => {
      const cl = series(60, i => 50 + Math.sin(i / 7) * 4 + i * .08 + Math.sin(i * 1.7) * .6), m5 = sma(cl, 5), m20 = sma(cl, 20), x = i => 24 + i * 7.3, y = scale(43, 58, 16, 186);
      let gx = null, dx = null; for (let i = 21; i < 60; i++) { if (m5[i - 1] < m20[i - 1] && m5[i] >= m20[i] && gx == null) gx = i; if (m5[i - 1] > m20[i - 1] && m5[i] <= m20[i] && dx == null) dx = i; }
      const pl = a => path(a.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean), '');
      return svg(210, '均線黃金交叉與死亡交叉',
        path(cl.map((v, i) => [x(i), y(v)]), 'lf-price') + pl(m5).replace('class=""', 'class="lf-ma5"') + pl(m20).replace('class=""', 'class="lf-ma20"') +
        (gx != null ? `<circle cx="${x(gx)}" cy="${y(m20[gx])}" r="7" class="lf-ring-up"/>` + t(x(gx), y(m20[gx]) + 24, '黃金交叉', 'lf-t lf-small lf-up-t', 'middle') : '') +
        (dx != null ? `<circle cx="${x(dx)}" cy="${y(m20[dx])}" r="7" class="lf-ring-down"/>` + t(x(dx), y(m20[dx]) - 14, '死亡交叉', 'lf-t lf-small lf-down-t', 'middle') : '') +
        `<g class="lf-legend">${ln(300, 200, 318, 200, 'lf-ma5')}${t(322, 204, 'MA5（快）', 'lf-t lf-small')}${ln(390, 200, 408, 200, 'lf-ma20')}${t(412, 204, 'MA20（慢）', 'lf-t lf-small')}</g>`);
    },
    valuation: () => svg(190, '本益比與殖利率的算法',
      rect(20, 20, 210, 150, 'lf-card') + t(125, 48, '本益比', 'lf-t lf-strong', 'middle') + t(125, 88, '股價 100', 'lf-t lf-big', 'middle') + ln(70, 100, 180, 100, 'lf-axis') + t(125, 124, 'EPS 5', 'lf-t lf-big', 'middle') + t(125, 156, '＝ 20 倍', 'lf-t lf-accent-t lf-strong', 'middle') +
      rect(250, 20, 210, 150, 'lf-card') + t(355, 48, '殖利率', 'lf-t lf-strong', 'middle') + t(355, 88, '現金股利 4', 'lf-t lf-big', 'middle') + ln(300, 100, 410, 100, 'lf-axis') + t(355, 124, '股價 100', 'lf-t lf-big', 'middle') + t(355, 156, '＝ 4%', 'lf-t lf-accent-t lf-strong', 'middle')),
    chips: () => {
      const d = [1.2, .8, 2.1, 1.6, 2.4, 3.1, 2.2, 2.8, 3.5, 4.0], y0 = 150, s = 24, cum = []; d.reduce((a, v, i) => (cum[i] = a + v), 0);
      const cy = scale(0, 26, 24, 150);
      return svg(190, '投信連續買超與累計張數',
        ln(30, y0, 450, y0, 'lf-axis') + d.map((v, i) => `<rect x="${44 + i * 40}" y="${y0 - v * s}" width="22" height="${v * s}" rx="3" class="lf-bar-up"/>`).join('') +
        path(cum.map((v, i) => [55 + i * 40, cy(v)]), 'lf-ma20') + cum.map((v, i) => `<circle cx="${55 + i * 40}" cy="${cy(v)}" r="3" class="lf-dot-accent"/>`).join('') +
        t(30, 176, '每天買超（千張）', 'lf-t lf-small lf-muted') + t(450, 176, '線＝累計買超，越來越陡', 'lf-t lf-small lf-accent-t', 'end'));
    },
    layers: () => {
      const wk = [41, 42.5, 41.8, 44, 46.2, 45.1, 47.5, 49.8, 48.6, 51.2, 53.5, 52.4, 55, 57.6, 56.8, 59.5], wy = scale(38, 62, 44, 180), dy = scale(56.5, 62.5, 44, 170);
      const dc = [61.8, 61, 60.1, 59.2, 58.5, 58.1, 58.6, 59.4];
      return svg(200, '週 K 定方向、日 K 找時機',
        rect(14, 14, 214, 176, 'lf-card') + t(26, 34, '週 K：大方向往上', 'lf-t lf-strong') + drawCandles(candlesFrom(wk).map(k => [k[0], k[1] + .6, k[2] - .6, k[3]]), 36, 12, wy, 8) + path(sma(wk, 4).map((v, i) => v == null ? null : [36 + i * 12, wy(v)]).filter(Boolean), 'lf-ma20') +
        rect(252, 14, 214, 176, 'lf-card') + t(264, 34, '日 K：回檔到月線後止跌', 'lf-t lf-strong') + drawCandles(candlesFrom(dc), 280, 22, dy, 12) + ln(264, dy(57.9), 456, dy(57.9), 'lf-dash-accent') + t(456, dy(57.9) + 16, '月線', 'lf-t lf-small lf-accent-t', 'end') +
        `<path d="M232 102 L246 102 M241 97 L246 102 L241 107" class="lf-arrow"/>`);
    },
    kd: () => {
      const cl = kf(36, [[0, 50], [6, 52], [14, 58], [22, 63], [30, 68], [35, 66]]).map((v, i) => v + Math.sin(i * 1.9) * .9), y = scale(47, 71, 14, 92);
      const k = kf(36, [[0, 35], [6, 72], [9, 86], [16, 83], [22, 90], [28, 84], [31, 76], [35, 58]]).map((v, i) => v + Math.sin(i * 1.3) * 3), ky = scale(0, 100, 122, 200);
      return svg(214, 'KD 高檔鈍化：強勢股 KD 長時間停在 80 以上',
        drawCandles(candlesFrom(cl).map(c => [c[0], c[1] + .4, c[2] - .4, c[3]]), 30, 12, y, 7) + `<rect x="20" y="${ky(100)}" width="440" height="${ky(80) - ky(100)}" class="lf-zone-up"/><rect x="20" y="${ky(20)}" width="440" height="${ky(0) - ky(20)}" class="lf-zone-down"/>` +
        ln(20, ky(80), 460, ky(80), 'lf-dash') + ln(20, ky(20), 460, ky(20), 'lf-dash') + t(462, ky(80) + 4, '80', 'lf-t lf-small lf-muted', 'end') + t(462, ky(20) + 4, '20', 'lf-t lf-small lf-muted', 'end') +
        path(k.map((v, i) => [30 + i * 12, ky(v)]), 'lf-ma20') + t(30 + 18 * 12, 112, '鈍化：KD 一直停在 80 以上，股價還在漲', 'lf-t lf-small lf-strong', 'middle') + t(24, 212, 'KD', 'lf-t lf-small lf-muted'));
    },
    rsi: () => {
      const y = scale(80, 112, 14, 100), ry = scale(40, 90, 120, 196), pts = [[40, 88], [90, 96], [140, 100], [190, 92], [240, 95], [290, 103], [340, 106], [390, 99], [440, 101]], r = [[40, 55], [90, 66], [140, 78], [190, 60], [240, 63], [290, 70], [340, 69], [390, 58], [440, 61]];
      return svg(210, 'RSI 頂背離：價格創新高、RSI 沒有創新高',
        path(pts.map(p => [p[0], y(p[1])]), 'lf-price') + path(r.map(p => [p[0], ry(p[1])]), 'lf-ma20') +
        `<path d="M140 ${y(100)} L340 ${y(106)}" class="lf-dash-up"/><path d="M140 ${ry(78)} L340 ${ry(69)}" class="lf-dash-down"/>` +
        `<circle cx="140" cy="${y(100)}" r="4" class="lf-dot"/><circle cx="340" cy="${y(106)}" r="4" class="lf-dot"/><circle cx="140" cy="${ry(78)}" r="4" class="lf-dot-accent"/><circle cx="340" cy="${ry(69)}" r="4" class="lf-dot-accent"/>` +
        t(350, y(106) - 4, '股價：更高', 'lf-t lf-small lf-up-t') + t(350, ry(69) - 6, 'RSI：更低', 'lf-t lf-small lf-down-t') + t(20, 112, '股價', 'lf-t lf-small lf-muted') + t(20, 206, 'RSI', 'lf-t lf-small lf-muted'));
    },
    macd: () => {
      const h = series(36, i => Math.sin((i - 8) / 5.5) * (i < 20 ? 1 : 1 - (i - 20) / 30)), hy = scale(-1.2, 1.2, 40, 180), z = hy(0);
      const dif = series(36, i => Math.sin((i - 12) / 6) * 1.1), sg = series(36, i => Math.sin((i - 14) / 6) * 1.0);
      const flip = h.findIndex((v, i) => i && h[i - 1] < 0 && v >= 0);
      return svg(210, 'MACD 柱狀體翻正與縮短',
        ln(20, z, 460, z, 'lf-axis') + t(462, z - 4, '0 軸', 'lf-t lf-small lf-muted', 'end') +
        h.map((v, i) => `<rect x="${28 + i * 12}" y="${v >= 0 ? hy(v) : z}" width="8" height="${Math.abs(hy(v) - z)}" rx="1.5" class="${v >= 0 ? 'lf-bar-up' : 'lf-bar-down'}"/>`).join('') +
        path(dif.map((v, i) => [32 + i * 12, hy(v)]), 'lf-ma5') + path(sg.map((v, i) => [32 + i * 12, hy(v)]), 'lf-ma20') +
        (flip > 0 ? t(32 + flip * 12, hy(-1) + 16, '↑ 柱狀體翻正', 'lf-t lf-small lf-up-t', 'middle') : '') + t(32 + 26 * 12, hy(1.15), '紅柱縮短＝加速度變慢', 'lf-t lf-small lf-strong', 'middle') +
        `<g>${ln(30, 200, 48, 200, 'lf-ma5')}${t(52, 204, 'DIF', 'lf-t lf-small')}${ln(100, 200, 118, 200, 'lf-ma20')}${t(122, 204, '訊號線', 'lf-t lf-small')}</g>`);
    },
    breakout: () => {
      const a = [50, 51.2, 49.8, 51.5, 50.3, 51.8, 50.6, 51.4, 53.6, 54.4, 55.1], b = [50.2, 51.5, 50, 51.6, 50.4, 51.7, 50.8, 51.5, 52.6, 51.2, 50.1];
      const y = scale(48, 57, 44, 186);
      return svg(210, '真突破與假突破',
        rect(14, 14, 218, 186, 'lf-card') + t(26, 34, '真突破：收盤站上＋放量', 'lf-t lf-strong lf-up-t') + `<rect x="24" y="${y(52)}" width="128" height="${y(49.4) - y(52)}" class="lf-zone"/>` + ln(24, y(52), 222, y(52), 'lf-dash-accent') + drawCandles(candlesFrom(a), 36, 17, y, 9) + t(36 + 8 * 17, y(55.4), '量比 2', 'lf-t lf-small lf-strong', 'middle') +
        rect(248, 14, 218, 186, 'lf-card') + t(260, 34, '假突破：衝上去又跌回區間', 'lf-t lf-strong lf-down-t') + `<rect x="258" y="${y(52)}" width="128" height="${y(49.4) - y(52)}" class="lf-zone"/>` + ln(258, y(52), 456, y(52), 'lf-dash-accent') + drawCandles(candlesFrom(b).map((k, i) => i === 8 ? [51.5, 54.6, 51.2, 52.6] : k), 270, 17, y, 9) + t(270 + 9 * 17, y(48.6), '跌回 → 出場', 'lf-t lf-small lf-down-t', 'middle'));
    },
    granville: () => {
      const n = 52, x = i => 34 + i * 8.2, y = scale(40, 63, 18, 178);
      const m = kf(n, [[0, 46], [8, 46.2], [20, 50.5], [32, 55.5], [38, 56.4], [44, 55], [51, 52.5]]);
      const p = kf(n, [[0, 44.2], [5, 43.6], [8, 46.8], [12, 50], [15, 49.2], [16, 48.3], [18, 51.2], [23, 55.5], [27, 54], [29, 54.3], [33, 59.4], [36, 58], [40, 50], [43, 44.3], [47, 48.6], [51, 50]]);
      const marks = [[8, '①'], [16, '②'], [29, '③'], [43, '④']];
      return svg(214, '葛蘭碧四個買點的位置',
        path(m.map((v, i) => [x(i), y(v)]), 'lf-ma20') + path(p.map((v, i) => [x(i), y(v)]), 'lf-price') +
        marks.map(([i, s2]) => `<circle cx="${x(i)}" cy="${y(p[i])}" r="5" class="lf-dot-up"/>` + t(x(i), y(p[i]) + 22, s2, 'lf-t lf-strong lf-up-t', 'middle')).join('') +
        ln(334, 16, 352, 16, 'lf-ma20') + t(356, 20, '均線', 'lf-t lf-small') + ln(398, 16, 416, 16, 'lf-price') + t(420, 20, '股價', 'lf-t lf-small') +
        t(34, 208, '① 突破走平均線　② 跌破很快站回　③ 回檔不破　④ 乖離過大反彈', 'lf-t lf-small lf-muted'));
    },
    rule: () => svg(170, '一個條件的三個部分',
      [['比較對象', '收盤價', 20], ['比較方式', '高於', 176], ['數值', '20 日最高價', 332]].map(([a, b, xx], i) => rect(xx, 24, 128, 74, 'lf-card') + t(xx + 64, 50, a, 'lf-t lf-small lf-muted', 'middle') + t(xx + 64, 80, b, 'lf-t lf-big', 'middle') + (i < 2 ? t(xx + 142, 66, '＋', 'lf-t lf-big lf-muted', 'middle') : '')).join('') +
      rect(20, 118, 440, 36, 'lf-accent-soft') + t(240, 141, '＝ 收盤價高於 20 日最高價（每天都能判斷是或不是）', 'lf-t lf-strong', 'middle')),
    drawdown: () => {
      const e = [100, 104, 109, 107, 115, 121, 118, 112, 103, 97, 101, 108, 116, 124, 131, 127, 135], x = i => 30 + i * 26, y = scale(90, 140, 40, 180), pk = 5, tr = 9;
      return svg(200, '資金曲線與最大回撤',
        t(30, 24, '最大回撤 −20%', 'lf-t lf-strong lf-down-t') + t(150, 24, '高點 121 → 之後最低 97', 'lf-t lf-small lf-muted') +
        path(e.map((v, i) => [x(i), y(v)]), 'lf-ma20') + ln(x(pk), y(e[pk]), x(tr), y(e[pk]), 'lf-dash') + `<path d="M${x(tr)} ${y(e[pk]) + 4} L${x(tr)} ${y(e[tr]) - 6}" class="lf-arrow-down"/>` +
        `<circle cx="${x(pk)}" cy="${y(e[pk])}" r="4" class="lf-dot"/><circle cx="${x(tr)}" cy="${y(e[tr])}" r="4" class="lf-dot-down"/>` +
        t(x(pk), y(e[pk]) - 10, '121', 'lf-t lf-small', 'middle') + t(x(tr), y(e[tr]) + 18, '97', 'lf-t lf-small', 'middle') + t(30, 196, '從最高點到之後最低點的跌幅＝最慘時有多痛', 'lf-t lf-small lf-muted'));
    },
    overfit: () => {
      const A = [12, 15, 14, 13, 11], B = [-8, -3, 42, -5, -9], y = scale(-12, 45, 30, 170), z = y(0), lab = ['18', '19', '20', '21', '22'];
      const grp = (arr, x0, name, cls) => t(x0 + 95, 22, name, 'lf-t lf-strong ' + cls, 'middle') + arr.map((v, i) => `<rect x="${x0 + 10 + i * 38}" y="${v >= 0 ? y(v) : z}" width="26" height="${Math.abs(y(v) - z)}" rx="3" class="${v >= 0 ? 'lf-bar-up' : 'lf-bar-down'}"/>` + t(x0 + 23 + i * 38, 190, lab[i] + '日', 'lf-t lf-small lf-muted', 'middle')).join('');
      return svg(200, '參數敏感度：穩定的策略和過度最佳化的策略',
        ln(20, z, 460, z, 'lf-axis') + grp(A, 20, 'A：參數變動結果穩定 ✓', 'lf-up-t') + grp(B, 250, 'B：只有 20 日賺 ✗', 'lf-down-t'));
    },
    payoff: () => {
      const x = v => 40 + (v - 60) / 80 * 400, y = scale(-60, 40, 20, 180);
      return svg(200, '做多與做空的損益：做空虧損沒有上限',
        ln(40, y(0), 440, y(0), 'lf-axis') + ln(x(100), 20, x(100), 180, 'lf-dash') + t(x(100), 196, '進場 100', 'lf-t lf-small lf-muted', 'middle') +
        path([[x(60), y(-40)], [x(140), y(40)]], 'lf-ma5') + path([[x(60), y(40)], [x(140), y(-40)]], 'lf-ma20') +
        t(x(136), y(36) - 6, '做多', 'lf-t lf-small lf-strong', 'end') + t(x(136), y(-36) + 16, '做空：股價越漲賠越多', 'lf-t lf-small lf-down-t', 'end') +
        t(x(62), y(-46), '做多最多賠到 0', 'lf-t lf-small lf-muted') + t(44, 16, '損益', 'lf-t lf-small lf-muted') + t(440, y(0) - 6, '股價 →', 'lf-t lf-small lf-muted', 'end'));
    },
    costs: () => {
      const parts = [['買進手續費', 142, 'lf-seg1'], ['賣出手續費', 142, 'lf-seg2'], ['證交稅', 300, 'lf-seg3']], tot = 584; let acc = 0;
      return svg(150, '一買一賣 10 萬元的交易成本',
        t(20, 30, '一買一賣 100,000 元（無折扣）', 'lf-t lf-strong') +
        parts.map(([n, v, c]) => { const w = v / tot * 440, xx = 20 + acc; acc += w; return `<rect x="${xx}" y="46" width="${w - 2}" height="34" rx="5" class="${c}"/>` + t(xx + w / 2, 68, v + ' 元', 'lf-t lf-small lf-on', 'middle') + t(xx + w / 2, 100, n, 'lf-t lf-small lf-muted', 'middle'); }).join('') +
        t(460, 132, '合計 584 元 ≈ 0.58%', 'lf-t lf-strong lf-accent-t', 'end'));
    },
    recovery: () => {
      const x = v => 40 + v / 60 * 400, y = scale(0, 160, 24, 170), pts = series(31, i => { const l = i * 2; return [x(l), y(l / (100 - l) * 100)]; });
      return svg(200, '虧損幅度與回本需要的漲幅',
        ln(40, 170, 440, 170, 'lf-axis') + ln(40, 24, 40, 170, 'lf-axis') + path(pts, 'lf-ma20') + path([[x(0), y(0)], [x(60), y(60)]], 'lf-dash') +
        `<circle cx="${x(10)}" cy="${y(11.1)}" r="4" class="lf-dot-down"/>` + t(x(10), y(11.1) - 12, '跌 10% → 要漲 11.1%', 'lf-t lf-small lf-strong') +
        `<circle cx="${x(30)}" cy="${y(42.9)}" r="4" class="lf-dot-down"/>` + t(x(30) - 8, y(42.9) - 12, '跌 30% → 要漲 42.9%', 'lf-t lf-small lf-strong', 'end') +
        `<circle cx="${x(50)}" cy="${y(100)}" r="4" class="lf-dot-down"/>` + t(x(50) - 8, y(100) - 4, '跌 50% → 要漲 100%', 'lf-t lf-small lf-strong', 'end') +
        t(x(60), y(60) + 16, '虛線：直覺以為的', 'lf-t lf-small lf-muted', 'end') + t(440, 190, '虧損幅度 →', 'lf-t lf-small lf-muted', 'end') + t(46, 20, '回本需要的漲幅', 'lf-t lf-small lf-muted'));
    },
    position: () => svg(170, '用停損算部位大小',
      rect(20, 28, 112, 80, 'lf-card') + t(76, 56, '總資金', 'lf-t lf-small lf-muted', 'middle') + t(76, 86, '100 萬', 'lf-t lf-big', 'middle') +
      t(164, 72, '× 1%', 'lf-t lf-strong lf-muted', 'middle') +
      rect(196, 28, 112, 80, 'lf-card') + t(252, 56, '這筆最多虧', 'lf-t lf-small lf-muted', 'middle') + t(252, 86, '1 萬', 'lf-t lf-big lf-down-t', 'middle') +
      t(340, 72, '÷ 5%', 'lf-t lf-strong lf-muted', 'middle') +
      rect(372, 28, 88, 80, 'lf-accent-soft') + t(416, 56, '最多買', 'lf-t lf-small lf-muted', 'middle') + t(416, 86, '20 萬', 'lf-t lf-big lf-accent-t', 'middle') +
      t(240, 142, '停損 5% 時，買 20 萬、停損剛好虧 1 萬', 'lf-t lf-small lf-muted', 'middle')),
    journal: () => svg(180, '一則交易筆記的格式',
      rect(60, 14, 360, 152, 'lf-card') + [['日期', '10/15　日 K'], ['看到', '連三天站上月線，量比 1.6'], ['要確認', '明天能不能站穩 52 元'], ['失效條件', '收盤跌破 49 元'], ['回顧（一週後補）', '跌回 50，大盤當週轉弱']].map(([a, b], i) => t(80, 42 + i * 28, a, 'lf-t lf-small lf-muted') + t(200, 42 + i * 28, b, 'lf-t lf-small' + (i === 4 ? ' lf-accent-t' : ''))).join('') + ln(76, 130, 404, 130, 'lf-dash')),
    cycle: () => {
      const c = [[240, 34, '追高買進'], [400, 100, '開始跌，捨不得停損'], [240, 166, '凹成大虧，低點認賠'], [80, 100, '反彈後悔，又想追']];
      return svg(200, '追高、凹單、認賠的常見循環',
        `<ellipse cx="240" cy="100" rx="160" ry="66" class="lf-orbit"/>` + c.map(([x, y, s]) => `<rect x="${x - 70}" y="${y - 16}" width="140" height="32" rx="16" class="lf-pill"/>` + t(x, y + 5, s, 'lf-t lf-small lf-strong', 'middle')).join('') +
        t(240, 104, '用規則打破', 'lf-t lf-small lf-accent-t', 'middle'));
    },
    // ── 網站介面示意 ──
    'ui-dates': () => ui(150, '資料日期的位置', [[20, 20, 440, 40, '盤後研究手札', 0, 'lf-box'], [330, 28, 120, 24, '資料日期 10/21', 1, 'lf-accent-soft'], [20, 72, 210, 60, '選股日曆紀錄：記錄 10/22', 2], [250, 72, 210, 60, '行情日期 10/21（前一日收盤）', 3]]),
    'ui-sitemap': () => ui(150, '網站上方七個選單', [[20, 20, 440, 34, '', 0, 'lf-box'], ...['①首頁', '②焦點', '③選股', '④題材', '⑤市場', '⑥ETF', '⑦新聞'].map((s, i) => [26 + i * 62, 24, 58, 26, s, 0, 'lf-chip']), [20, 70, 300, 62, '點任何股票代號 → 開 K 線圖', 0, 'lf-accent-soft'], [340, 70, 120, 62, '右上頭像＝會員中心', 0]]),
    'ui-focus': () => ui(170, '今日焦點的三個分頁', [[20, 20, 100, 28, '市場總覽', 1, 'lf-chip-on'], [128, 20, 100, 28, '今日排行榜', 2, 'lf-chip'], [236, 20, 100, 28, '題材索引', 3, 'lf-chip'], [20, 60, 210, 90, '強勢／弱勢題材', 0], [250, 60, 100, 90, '漲停最多題材', 0], [360, 60, 100, 90, '爆量榜 量比≥1.3', 0]]),
    'ui-screener': () => ui(190, '掏金篩選器操作順序', [[20, 20, 150, 150, '條件分類', 1], [184, 20, 276, 34, '目前組合：已勾 2 個', 2, 'lf-accent-soft'], [184, 64, 130, 30, '開始篩選', 3, 'lf-btn'], [324, 64, 136, 30, '記錄今日選股', 5, 'lf-chip'], [184, 104, 276, 66, '結果列表：點列開 K 線', 4]]),
    'ui-picks': () => ui(150, '選股選單下的其他工具', [[20, 20, 105, 110, '箱型', 1], [135, 20, 105, 110, '亮燈區', 2], [250, 20, 105, 110, '流動性', 3], [365, 20, 95, 110, '壓力支撐', 4]]),
    'ui-themes': () => ui(170, '題材熱力圖：面積是成交額、顏色是漲跌', [[20, 20, 200, 130, '大族群', 1, 'lf-heat-up'], [228, 20, 120, 70, '', 0, 'lf-heat-up2'], [356, 20, 104, 70, '', 0, 'lf-heat-down'], [228, 98, 80, 52, '', 0, 'lf-heat-down2'], [316, 98, 144, 52, '點方塊看成分股', 2, 'lf-box']]),
    'ui-market': () => ui(170, '市場觀察常用的頁面', [[20, 20, 210, 60, '三大法人買賣超', 1], [250, 20, 210, 60, '貪婪指標 0～100', 2], [20, 92, 210, 60, '大盤多空廣度', 3], [250, 92, 210, 60, '處置股：交易前先查', 4, 'lf-accent-soft']]),
    'ui-etf': () => ui(170, 'ETF 分析常用功能', [[20, 20, 140, 60, '成分股', 1], [170, 20, 140, 60, '股票反查', 2], [320, 20, 140, 60, '配息行事曆', 3], [20, 92, 140, 60, '折溢價', 4, 'lf-accent-soft'], [170, 92, 140, 60, '資金流', 5], [320, 92, 140, 60, '相似度', 6]]),
    'ui-news': () => ui(130, '每日新聞的時段', [[20, 20, 100, 30, '盤前', 1, 'lf-chip'], [130, 20, 100, 30, '盤中', 2, 'lf-chip'], [240, 20, 100, 30, '盤後', 3, 'lf-chip-on'], [350, 20, 110, 30, '晚間總經', 4, 'lf-chip'], [20, 62, 300, 46, '搜尋關鍵字', 0], [330, 62, 130, 46, '產業索引', 0]]),
    'ui-kchart': () => ui(220, 'K 線圖視窗的五個區塊', [[20, 20, 300, 30, '週期：日K 週K 月K', 1, 'lf-chip'], [20, 58, 300, 30, '圖層：大盤K 主力分點 葛蘭碧', 2, 'lf-chip'], [20, 96, 300, 26, '標記工具　橡皮擦', 3, 'lf-chip'], [20, 130, 300, 70, 'MA5 MA20　K 線與副圖', 4], [334, 20, 126, 180, '右側面板', 5]]),
    'ui-favorites': () => ui(150, '自選股的三行觀察', [[20, 20, 160, 110, '分類：等突破', 1, 'lf-chip'], [194, 20, 266, 30, '理由', 2], [194, 58, 266, 30, '要確認的事', 0], [194, 96, 266, 34, '失效條件', 3, 'lf-accent-soft']]),
    'ui-calendar': () => ui(170, '選股日曆：顏色越深紀錄越多', [...Array.from({ length: 14 }, (_, i) => [20 + (i % 7) * 46, 20 + Math.floor(i / 7) * 46, 40, 40, '', 0, ['lf-cal0', 'lf-cal1', 'lf-cal2', 'lf-cal3'][(i * 7) % 4]]), [352, 20, 108, 86, '點日期看明細', 1], [20, 116, 440, 36, '展開紀錄：記錄價 → 最新收盤 → 期間漲跌', 2, 'lf-accent-soft']]),
    'ui-studio': () => ui(170, '策略工作台五個步驟', [...['方向', '進場', '出場風控', '驗證', '上架'].map((s, i) => [20 + i * 90, 20, 82, 36, s, i + 1, i === 2 ? 'lf-accent-soft' : 'lf-chip']), [20, 70, 300, 80, '條件設定區', 0], [334, 70, 126, 80, '聊聊策略', 0, 'lf-box']]),
    'ui-points': () => ui(130, '任務、點數、使用券', [[20, 20, 130, 90, '完成任務', 1], [175, 20, 130, 90, '按領取點數', 2, 'lf-accent-soft'], [330, 20, 130, 90, '換券→開始使用', 3]])
  };
  // ── 2026-10-22 擴充篇目的圖解 ──
  const cards = (h, label, items, y0 = 24, ch = 0) => { const n = items.length, gap = 12, w = (W - 40 - gap * (n - 1)) / n, hh = ch || h - y0 - 20; return svg(h, label, items.map(([a, b, c, cls], i) => { const x = 20 + i * (w + gap); return rect(x, y0, w, hh, cls || 'lf-card') + t(x + w / 2, y0 + 26, a, 'lf-t lf-small lf-muted', 'middle') + t(x + w / 2, y0 + hh / 2 + 10, b, 'lf-t lf-big', 'middle') + (c ? t(x + w / 2, y0 + hh - 14, c, 'lf-t lf-small lf-muted', 'middle') : ''); }).join('')); };
  const timeline = (h, label, x0h, x1h, bands, marks) => { const x = v => 40 + (v - x0h) / (x1h - x0h) * 400; let o = ln(40, 80, 440, 80, 'lf-axis'); for (let v = Math.ceil(x0h); v <= x1h; v++) o += ln(x(v), 80, x(v), 86, 'lf-axis') + t(x(v), 102, v + ':00', 'lf-t lf-small lf-muted', 'middle'); bands.forEach(([a, b, s, cls, y = 58]) => { o += `<rect x="${x(a)}" y="${y}" width="${Math.max(3, x(b) - x(a))}" height="22" rx="5" class="${cls}"/>` + t((x(a) + x(b)) / 2, y - 8, s, 'lf-t lf-small lf-strong', 'middle'); }); (marks || []).forEach(([v, s, a = 'middle', yy = 128]) => { o += `<circle cx="${x(v)}" cy="69" r="5" class="lf-dot-up"/>` + t(x(v), yy, s, 'lf-t lf-small lf-up-t', a); }); return svg(h, label, o); };
  Object.assign(F, {
    'after-hours': () => timeline(160, '盤後定價交易時間', 9, 15, [[9, 13.5, '盤中交易', 'lf-soft'], [14, 14.5, '盤後定價下單', 'lf-accent-fill']], [[13.5, '13:30 收盤價', 'end', 128], [14.5, '14:30 用收盤價撮合', 'end', 146]]),
    'odd-lot': () => timeline(170, '盤中零股與盤後零股交易時間', 9, 15, [[9, 13.5, '盤中零股：每 5 秒撮合', 'lf-accent-fill'], [13 + 40 / 60, 14.5, '盤後零股', 'lf-soft', 58]], [[9 + 10 / 60, '09:10 第一次'], [14.5, '14:30 撮合一次']]),
    'order-types': () => svg(190, 'ROD、IOC、FOK 的差別', [['ROD', '當天有效', '沒成交就一直掛到收盤', [1, 1, .4]], ['IOC', '立刻成交', '能成交多少算多少，其餘取消', [1, .6, 0]], ['FOK', '全部或全不', '不能全部成交就整筆取消', [0, 0, 0]]].map(([a, b, c, f], i) => { const y = 22 + i * 56; return t(20, y + 22, a, 'lf-t lf-big') + t(76, y + 14, b, 'lf-t lf-small lf-strong') + t(76, y + 32, c, 'lf-t lf-small lf-muted') + f.map((v, k) => `<rect x="${300 + k * 52}" y="${y + 6}" width="44" height="26" rx="5" class="${v === 1 ? 'lf-bar-up' : v > 0 ? 'lf-accent-soft' : 'lf-box'}"/>`).join('') + (i === 0 ? t(326, y - 2, '成交', 'lf-t lf-small lf-muted', 'middle') : ''); }).join('')),
    boards: () => svg(180, '上市、上櫃、興櫃的差別', [['上市', '證交所', '漲跌幅 10%', '條件最嚴'], ['上櫃', '櫃買中心', '漲跌幅 10%', '中小型多'], ['興櫃', '櫃買中心', '沒有漲跌幅', '議價、量小']].map(([a, b, c, d], i) => { const x = 20 + i * 150; return rect(x, 20, 138, 140, i === 2 ? 'lf-accent-soft' : 'lf-card') + t(x + 69, 52, a, 'lf-t lf-big', 'middle') + t(x + 69, 80, b, 'lf-t lf-small lf-muted', 'middle') + t(x + 69, 110, c, 'lf-t lf-small lf-strong' + (i === 2 ? ' lf-down-t' : ''), 'middle') + t(x + 69, 136, d, 'lf-t lf-small lf-muted', 'middle'); }).join('')),
    'ex-div': () => { const y = scale(94.5, 102, 34, 170), c = [100.5, 101.2, 100.6, 101, 100, 96.4, 97, 97.8, 98.6, 99.1, 99.9, 100.6]; return svg(200, '除息缺口與填息', ln(20, y(100), 460, y(100), 'lf-dash-accent') + t(24, 22, '虛線：除息前收盤 100 元', 'lf-t lf-small lf-accent-t') + drawCandles(candlesFrom(c).map((k, i) => i === 5 ? [96, 96.9, 95.8, 96.4] : k), 50, 36, y, 16) + `<rect x="${50 + 4 * 36 + 10}" y="${y(100)}" width="${36 - 20}" height="${y(96.9) - y(100)}" class="lf-zone-down"/>` + t(50 + 5 * 36, y(95.2) + 4, '除息日：參考價 96', 'lf-t lf-small lf-strong', 'middle') + t(50 + 11 * 36, y(101.6) - 8, '填息', 'lf-t lf-small lf-up-t', 'middle')); },
    alert: () => svg(160, '注意股、處置股、全額交割股', [['注意股', '提醒', '交易方式不變', 'lf-card'], ['處置股', '分盤撮合', '5 或 20 分鐘一次', 'lf-accent-soft'], ['全額交割', '先付錢', '多半財務有問題', 'lf-zone-up']].map(([a, b, c, cls], i) => { const x = 20 + i * 150; return rect(x, 24, 132, 112, cls) + t(x + 66, 52, a, 'lf-t lf-strong', 'middle') + t(x + 66, 84, b, 'lf-t lf-big', 'middle') + t(x + 66, 116, c, 'lf-t lf-small lf-muted', 'middle') + (i < 2 ? `<path d="M${x + 136} 80 L${x + 146} 80 M${x + 142} 76 L${x + 146} 80 L${x + 142} 84" class="lf-arrow"/>` : ''); }).join('')),
    'day-trade': () => svg(170, '當沖：同一天買賣，只交割差額', rect(20, 24, 200, 120, 'lf-card') + t(120, 52, '09:30 買 50 元', 'lf-t lf-strong lf-up-t', 'middle') + t(120, 84, '13:00 賣 50.5 元', 'lf-t lf-strong lf-down-t', 'middle') + t(120, 120, '沖掉 → 只交割差額', 'lf-t lf-small lf-muted', 'middle') + rect(260, 24, 200, 120, 'lf-zone-up') + t(360, 52, '沒沖掉？', 'lf-t lf-strong', 'middle') + t(360, 84, '要全額交割', 'lf-t lf-big lf-down-t', 'middle') + t(360, 120, '拿不出錢＝違約交割', 'lf-t lf-small lf-muted', 'middle')),
    'etf-types': () => svg(190, 'ETF 的四大類', [['市值型', '跟大盤', 'lf-card'], ['高股息', '配息穩', 'lf-card'], ['債券', '看利率', 'lf-card'], ['槓桿反向', '只適合短線', 'lf-zone-up']].map(([a, b, cls], i) => { const x = 20 + (i % 2) * 226, y = 20 + Math.floor(i / 2) * 82; return rect(x, y, 214, 70, cls) + t(x + 18, y + 30, a, 'lf-t lf-big') + t(x + 18, y + 54, b, 'lf-t lf-small lf-muted'); }).join('')),
    dca: () => { const p = [30, 26, 20, 22, 25, 28], y = scale(0, 160, 30, 160); return svg(200, '定期定額：低價買比較多股', ln(30, 160, 450, 160, 'lf-axis') + p.map((v, i) => { const sh = 3000 / v, x = 50 + i * 70; return `<rect x="${x}" y="${y(sh)}" width="34" height="${160 - y(sh)}" rx="4" class="lf-bar-up"/>` + t(x + 17, y(sh) - 6, Math.round(sh) + ' 股', 'lf-t lf-small', 'middle') + t(x + 17, 180, v + ' 元', 'lf-t lf-small lf-muted', 'middle'); }).join('') + t(30, 18, '每月固定 3,000 元，價格低時買到比較多股', 'lf-t lf-small lf-strong')); },
    'div-tax': () => cards(160, '股利的稅與補充保費', [['合併計稅', '抵減 8.5%', '每戶上限 8 萬'], ['分開計稅', '28%', '股利單獨計算'], ['補充保費', '2.11%', '單筆 ≥ 2 萬才扣', 'lf-accent-soft']]),
    revenue: () => { const cur = [9.8, 10.4, 11, 10.6, 11.8, 12], prev = [9, 9.2, 9.4, 9.6, 10, 10], y = scale(0, 13, 24, 160), lab = ['4月', '5月', '6月', '7月', '8月', '9月']; return svg(200, '營收年增率：和去年同月比', ln(30, 160, 450, 160, 'lf-axis') + cur.map((v, i) => { const x = 50 + i * 68; return `<rect x="${x}" y="${y(prev[i])}" width="20" height="${160 - y(prev[i])}" rx="3" class="lf-vol"/><rect x="${x + 22}" y="${y(v)}" width="20" height="${160 - y(v)}" rx="3" class="lf-bar-up"/>` + t(x + 21, 180, lab[i], 'lf-t lf-small lf-muted', 'middle'); }).join('') + `<rect x="300" y="12" width="12" height="10" rx="2" class="lf-vol"/>` + t(316, 21, '去年同月', 'lf-t lf-small') + `<rect x="380" y="12" width="12" height="10" rx="2" class="lf-bar-up"/>` + t(396, 21, '今年', 'lf-t lf-small')); },
    margins: () => { const parts = [['成本 60', 60, 'lf-vol'], ['費用 15', 15, 'lf-seg2'], ['業外與稅 5', 5, 'lf-seg1'], ['淨利 20', 20, 'lf-seg3']]; let acc = 0; return svg(170, '營收 100 拆成成本、費用和淨利', t(20, 30, '營收 100 億', 'lf-t lf-strong') + parts.map(([n, v, c]) => { const w = v / 100 * 440, x = 20 + acc; acc += w; return `<rect x="${x}" y="44" width="${w - 2}" height="36" rx="5" class="${c}"/>` + t(x + w / 2, v < 10 ? 118 : 100, n, 'lf-t lf-small lf-muted', 'middle'); }).join('') + t(20, 150, '毛利率 40%　營益率 25%　淨利率 20%', 'lf-t lf-strong lf-accent-t')); },
    'pattern-w': () => { const x = i => 30 + i * 13.5, y = scale(37, 54, 20, 180), p = kf(32, [[0, 50], [6, 40.2], [12, 46], [18, 40.5], [24, 47.2], [27, 49], [31, 52.5]]); return svg(200, 'W 底與頸線', path(p.map((v, i) => [x(i), y(v)]), 'lf-ma20') + ln(20, y(46), 460, y(46), 'lf-dash-accent') + t(456, y(46) - 6, '頸線 46', 'lf-t lf-small lf-accent-t', 'end') + `<circle cx="${x(6)}" cy="${y(40.2)}" r="4" class="lf-dot"/><circle cx="${x(18)}" cy="${y(40.5)}" r="4" class="lf-dot"/>` + t(x(6), y(40.2) + 18, '底 1', 'lf-t lf-small', 'middle') + t(x(18), y(40.5) + 18, '底 2', 'lf-t lf-small', 'middle') + `<circle cx="${x(25)}" cy="${y(47.6)}" r="5" class="lf-dot-up"/>` + t(x(25) + 8, y(47.6) + 20, '突破頸線', 'lf-t lf-small lf-up-t') + `<path d="M${x(30)} ${y(46)} L${x(30)} ${y(52)}" class="lf-dash-up"/>` + t(x(30) - 6, y(49), '+6', 'lf-t lf-small lf-up-t', 'end')); },
    triangle: () => { const x = i => 30 + i * 13, y = scale(48, 62, 20, 180), p = kf(32, [[0, 52], [3, 59.5], [7, 51], [11, 58], [15, 52.2], [19, 56.8], [22, 53.4], [25, 56], [27, 57.6], [31, 61]]); return svg(200, '三角收斂後突破', `<path d="M${x(3)} ${y(60)} L${x(27)} ${y(55.6)}" class="lf-dash-accent"/><path d="M${x(7)} ${y(50.8)} L${x(27)} ${y(54)}" class="lf-dash-accent"/>` + path(p.map((v, i) => [x(i), y(v)]), 'lf-price') + `<circle cx="${x(27)}" cy="${y(57.6)}" r="5" class="lf-dot-up"/>` + t(x(27) - 10, y(57.6) - 14, '收盤突破上緣', 'lf-t lf-small lf-up-t', 'end') + series(28, i => `<rect x="${x(i) - 4}" y="${192 - (i === 27 ? 24 : 14 - i * .35)}" width="8" height="${i === 27 ? 24 : 14 - i * .35}" class="${i === 27 ? 'lf-vol-hl' : 'lf-vol'}"/>`).join('')); },
    gaps: () => { const y = scale(46, 58, 24, 176), c = [48, 48.6, 48.2, 49, 52.5, 53.4, 54, 53.2, 52.1, 49.8]; return svg(200, '向上跳空缺口與回補', drawCandles(candlesFrom(c).map((k, i) => i === 4 ? [51.6, 52.9, 51.4, 52.5] : k), 50, 42, y, 18) + `<rect x="20" y="${y(51.4)}" width="440" height="${y(49.6) - y(51.4)}" class="lf-zone-up"/>` + t(24, y(50.5) + 4, '缺口 49.6～51.4', 'lf-t lf-small lf-strong') + t(50 + 9 * 42, y(48.6) + 14, '回補', 'lf-t lf-small lf-down-t', 'middle')); },
    'sr-levels': () => { const x = i => 30 + i * 13.5, y = scale(66, 90, 20, 180), p = kf(32, [[0, 72], [5, 80], [9, 74], [14, 79.6], [18, 75], [21, 83], [24, 80.4], [27, 86], [31, 88]]); return svg(200, '壓力突破後變支撐', `<rect x="20" y="${y(80.6)}" width="440" height="${y(79.4) - y(80.6)}" class="lf-zone"/>` + ln(20, y(80), 460, y(80), 'lf-dash-accent') + path(p.map((v, i) => [x(i), y(v)]), 'lf-ma20') + t(x(7), y(81) - 4, '壓力', 'lf-t lf-small lf-down-t', 'middle') + t(x(14), y(81) - 4, '壓力', 'lf-t lf-small lf-down-t', 'middle') + t(x(24), y(79) + 16, '變支撐', 'lf-t lf-small lf-up-t', 'middle') + t(456, y(80) - 6, '80 元', 'lf-t lf-small lf-accent-t', 'end')); },
    bollinger: () => { const x = i => 26 + i * 7.4, n = 58, p = kf(n, [[0, 50], [10, 52], [20, 51.2], [30, 51.6], [36, 51.8], [42, 55], [50, 59], [57, 61]]).map((v, i) => v + Math.sin(i * 1.3) * .5), m = sma(p, 20), sd = p.map((_, i) => { if (i < 19) return null; const s = p.slice(i - 19, i + 1), mu = m[i]; return Math.sqrt(s.reduce((a, v) => a + (v - mu) ** 2, 0) / 20); }), y = scale(46, 63, 16, 180); const up = [], lo = [], mid = []; p.forEach((_, i) => { if (m[i] == null) return; up.push([x(i), y(m[i] + 2 * sd[i])]); lo.push([x(i), y(m[i] - 2 * sd[i])]); mid.push([x(i), y(m[i])]); }); return svg(200, '布林通道：收窄後擴張', `<path d="M${up.map(q => q.join(' ')).join(' L')} L${lo.reverse().map(q => q.join(' ')).join(' L')} Z" class="lf-zone"/>` + path(up, 'lf-dash-accent') + path(lo.reverse(), 'lf-dash-accent') + path(mid, 'lf-ma5') + path(p.map((v, i) => [x(i), y(v)]), 'lf-price') + t(x(34), y(48), '通道收窄', 'lf-t lf-small lf-strong', 'middle') + t(x(52), y(62), '沿上軌走', 'lf-t lf-small lf-up-t', 'middle')); },
    fib: () => { const y = scale(38, 61, 16, 196), x = i => 30 + i * 12, p = kf(32, [[0, 40], [16, 60], [22, 53.2], [25, 52.4], [31, 57]]); return svg(210, '斐波那契回檔位置', [[60, '0%'], [52.36, '38.2%'], [50, '50%'], [47.64, '61.8%'], [40, '100%']].map(([v, s]) => ln(20, y(v), 460, y(v), v === 60 || v === 40 ? 'lf-dash' : 'lf-dash-accent') + t(458, y(v) - 4, s + '　' + v.toFixed(1), 'lf-t lf-small lf-muted', 'end')).join('') + path(p.map((v, i) => [x(i), y(v)]), 'lf-ma20') + `<circle cx="${x(25)}" cy="${y(52.4)}" r="5" class="lf-dot-up"/>` + t(x(25), y(45), '↑ 回到 38.2% 附近止跌', 'lf-t lf-small lf-up-t', 'middle')); },
    bias: () => { const x = i => 30 + i * 9, n = 46, m = kf(n, [[0, 50], [45, 58]]), p = kf(n, [[0, 50], [12, 53], [22, 63], [27, 60], [33, 56.5], [45, 59]]), y = scale(46, 66, 20, 180); return svg(200, '乖離率：離均線太遠會被拉回', path(m.map((v, i) => [x(i), y(v)]), 'lf-ma20') + path(p.map((v, i) => [x(i), y(v)]), 'lf-price') + `<path d="M${x(22)} ${y(m[22])} L${x(22)} ${y(63)}" class="lf-dash-up"/>` + t(x(22) - 8, y(61), '正乖離 +16%', 'lf-t lf-small lf-up-t', 'end') + t(x(34), y(m[34]) + 22, '拉回均線', 'lf-t lf-small lf-strong', 'middle')); },
    'pv-div': () => { const x = i => 30 + i * 13.5, y = scale(40, 60, 20, 120), p = kf(32, [[0, 42], [8, 50], [12, 47], [20, 55], [24, 52.5], [31, 58]]), v = [[4, 50], [16, 35], [28, 20]]; return svg(210, '價漲量縮的量價背離', path(p.map((q, i) => [x(i), y(q)]), 'lf-ma20') + `<path d="M${x(8)} ${y(50)} L${x(31)} ${y(58)}" class="lf-dash-up"/>` + ln(20, 190, 460, 190, 'lf-axis') + series(32, i => `<rect x="${x(i) - 4}" y="${190 - (52 - i * 1.05)}" width="8" height="${52 - i * 1.05}" class="lf-vol"/>`).join('') + `<path d="M${x(4)} ${190 - 50} L${x(28)} ${190 - 22}" class="lf-dash-down"/>` + t(x(31), y(58) - 8, '價一波比一波高', 'lf-t lf-small lf-up-t', 'end') + t(x(31), 150, '量一波比一波少', 'lf-t lf-small lf-down-t', 'end')); },
    'vol-levels': () => { const y = scale(48, 62, 16, 140), c = [52, 53, 52.6, 54, 55.5, 57.6, 55.4, 54.6, 55.8, 56.2, 55.6, 56.8], vol = [1, 1.1, .9, 1.4, 1.8, 3.4, 1.6, 1.2, 1.1, 1, .9, 1.2]; return svg(210, '大量 K 棒的高、中、低三個價位', drawCandles(candlesFrom(c).map((k, i) => i === 5 ? [52.4, 58, 52, 57.6] : k), 40, 34, y, 14) + [[58, '高 58'], [55, '中 55'], [52, '低 52']].map(([v, s]) => ln(20, y(v), 460, y(v), 'lf-dash-accent') + t(458, y(v) - 4, s, 'lf-t lf-small lf-accent-t', 'end')).join('') + vol.map((v, i) => `<rect x="${40 + i * 34 - 7}" y="${200 - v * 14}" width="14" height="${v * 14}" rx="2" class="${i === 5 ? 'lf-vol-hl' : 'lf-vol'}"/>`).join('') + t(40 + 5 * 34, 200 - 3.4 * 14 - 6, '最大量', 'lf-t lf-small lf-strong', 'middle')); },
    branch: () => { const y = scale(40, 58, 20, 150), c = [44, 44.6, 44.2, 45, 45.4, 46.6, 47.8, 48.4, 50.6, 52, 53.4, 55]; const hits = [1, 2, 4, 5, 7]; return svg(190, '主力分點進場日標記', drawCandles(candlesFrom(c), 40, 36, y, 14) + hits.map(i => `<circle cx="${40 + i * 36}" cy="${y(c[i]) + 26}" r="5" class="${i % 2 ? 'lf-dot-up' : 'lf-dot-accent'}"/>`).join('') + t(40 + 4 * 36, y(c[4]) + 46, '2', 'lf-t lf-small lf-strong', 'middle') + rect(270, 150, 190, 30, 'lf-card') + t(282, 170, '主力進場 ● 京城嘉義 ● 元大三峽', 'lf-t lf-small')); },
    tdcc: () => { const w = ['第 1 週', '第 2 週', '第 3 週', '第 4 週'], big = [62, 63.5, 64.8, 66], ppl = [3.2, 3.0, 2.9, 2.8], y = scale(55, 70, 30, 160), y2 = scale(2.5, 3.4, 30, 160); return svg(200, '大戶持股增加、股東人數減少', ln(30, 160, 450, 160, 'lf-axis') + big.map((v, i) => `<rect x="${60 + i * 100}" y="${y(v)}" width="36" height="${160 - y(v)}" rx="4" class="lf-bar-up"/>` + t(78 + i * 100, y(v) - 6, v + '%', 'lf-t lf-small', 'middle') + t(78 + i * 100, 180, w[i], 'lf-t lf-small lf-muted', 'middle')).join('') + path(ppl.map((v, i) => [78 + i * 100, y2(v)]), 'lf-ma20') + ppl.map((v, i) => `<circle cx="${78 + i * 100}" cy="${y2(v)}" r="3.5" class="lf-dot-accent"/>`).join('') + t(30, 20, '長條＝千張大戶持股比例　線＝股東人數（萬人）', 'lf-t lf-small lf-muted')); },
    sbl: () => svg(170, '借券賣出的流程', [['① 向大股東借股票', 20], ['② 在市場賣出', 170], ['③ 之後買回還券', 320]].map(([s, x], i) => rect(x, 40, 140, 56, i === 1 ? 'lf-accent-soft' : 'lf-card') + t(x + 70, 73, s, 'lf-t lf-small lf-strong', 'middle') + (i < 2 ? `<path d="M${x + 142} 68 L${x + 148} 68" class="lf-arrow"/>` : '')).join('') + t(240, 130, '和融券不同：法人為主、期限較長、沒有一樣的強制回補', 'lf-t lf-small lf-muted', 'middle')),
    margin: () => { const x = v => 40 + (100 - v) / 40 * 400, y = scale(110, 180, 20, 150); return svg(200, '融資維持率與追繳線', ln(40, 150, 440, 150, 'lf-axis') + path([[x(100), y(166.7)], [x(60), y(100)]].map(([a, b]) => [a, Math.min(150, b)]), 'lf-ma20') + ln(40, y(130), 440, y(130), 'lf-dash-up') + t(436, y(130) - 6, '130% 追繳線', 'lf-t lf-small lf-up-t', 'end') + `<circle cx="${x(78)}" cy="${y(130)}" r="5" class="lf-dot-down"/>` + t(x(78), y(130) + 22, '跌到 78 元', 'lf-t lf-small lf-strong', 'middle') + t(x(100), y(166.7) - 8, '買進 100 元：166%', 'lf-t lf-small', 'start') + t(40, 176, '股價 →（往右越低）', 'lf-t lf-small lf-muted')); },
    'futures-oi': () => cards(170, '外資空單的相對規模', [['淨空單', '3 萬口', '名目約 1,380 億'], ['外資持股市值', '約 30 兆', '現貨部位'], ['相對規模', '≈ 0.46%', '再看歷史百分位', 'lf-accent-soft']]),
    dressing: () => svg(160, '季底作帳的時間表', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((m, i) => { const q = (i + 1) % 3 === 0; return rect(20 + i * 37, 40, 32, 60, q ? 'lf-accent-soft' : 'lf-card', 6) + t(36 + i * 37, 76, m + '月', 'lf-t lf-small' + (q ? ' lf-strong lf-accent-t' : ' lf-muted'), 'middle'); }).join('') + t(240, 132, '3、6、9、12 月底前：投信、集團較常拉抬', 'lf-t lf-small lf-strong', 'middle')),
    'bt-period': () => { const x = i => 30 + i * 6, p = kf(70, [[0, 100], [22, 138], [30, 132], [46, 108], [54, 112], [69, 116]]), y = scale(95, 145, 30, 170); return svg(200, '回測要包含多頭、空頭和盤整', `<rect x="${x(0)}" y="22" width="${x(22) - x(0)}" height="156" class="lf-zone-up"/><rect x="${x(22)}" y="22" width="${x(46) - x(22)}" height="156" class="lf-zone-down"/><rect x="${x(46)}" y="22" width="${x(69) - x(46)}" height="156" class="lf-zone"/>` + path(p.map((v, i) => [x(i), y(v)]), 'lf-ma20') + t((x(0) + x(22)) / 2, 192, '多頭 +38%', 'lf-t lf-small lf-up-t', 'middle') + t((x(22) + x(46)) / 2, 192, '空頭 −22%', 'lf-t lf-small lf-down-t', 'middle') + t((x(46) + x(69)) / 2, 192, '盤整 +3%', 'lf-t lf-small lf-muted', 'middle')); },
    survivor: () => svg(180, '存活者偏差：下市的公司不在名單裡', series(40, i => { const out = [3, 8, 14, 21, 27, 33, 37].includes(i); return `<circle cx="${40 + (i % 10) * 44}" cy="${36 + Math.floor(i / 10) * 30}" r="9" class="${out ? 'lf-ring-down' : 'lf-dot-accent'}"/>` + (out ? `<path d="M${34 + (i % 10) * 44} ${30 + Math.floor(i / 10) * 30} l12 12 m0 -12 l-12 12" class="lf-dash-down"/>` : ''); }).join('') + t(240, 172, '實心＝現在還在交易　空心＝已經下市，回測時看不到', 'lf-t lf-small lf-muted', 'middle')),
    'r-multiple': () => { const y = scale(44, 62, 20, 180); return svg(200, '用 R 衡量一筆交易', ln(60, y(50), 420, y(50), 'lf-axis') + t(56, y(50) + 4, '進場 50', 'lf-t lf-small', 'end') + `<rect x="140" y="${y(50)}" width="200" height="${y(47) - y(50)}" class="lf-zone-down"/><rect x="140" y="${y(59)}" width="200" height="${y(50) - y(59)}" class="lf-zone-up"/>` + ln(140, y(47), 340, y(47), 'lf-dash-down') + ln(140, y(59), 340, y(59), 'lf-dash-up') + t(346, y(47) + 4, '停損 47 → −1R', 'lf-t lf-small lf-down-t') + t(346, y(59) + 4, '目標 59 → +3R', 'lf-t lf-small lf-up-t') + [53, 56].map((v, i) => ln(140, y(v), 340, y(v), 'lf-dash') + t(346, y(v) + 4, '+' + (i + 1) + 'R', 'lf-t lf-small lf-muted')).join('')); },
    trailing: () => { const x = i => 30 + i * 13.5, p = kf(32, [[0, 50], [8, 60], [11, 58], [18, 70], [21, 67], [26, 80], [31, 73]]), hi = []; let h = 0; p.forEach((v, i) => { h = Math.max(h, v); hi.push([x(i), h * .92]); }); const y = scale(44, 84, 20, 180); return svg(200, '移動停利：停利點只往上移', path(p.map((v, i) => [x(i), y(v)]), 'lf-price') + path(hi.map(([a, b]) => [a, y(b)]), 'lf-dash-up') + `<circle cx="${x(31)}" cy="${y(73.6)}" r="5" class="lf-dot-down"/>` + t(x(31) - 4, y(73.6) + 22, '73.6 出場', 'lf-t lf-small lf-strong', 'end') + t(x(26), y(80) - 10, '最高 80', 'lf-t lf-small', 'middle') + t(x(14), y(47), '虛線＝停利點（最高點 −8%）', 'lf-t lf-small lf-up-t')); },
    scaling: () => svg(190, '金字塔加碼：越加越少', [[3, '50 元', '試單'], [2, '55 元', '突破加碼'], [1, '60 元', '再創高']].map(([n, p, s], i) => { const w = n * 70, x = 240 - w / 2, yy = 130 - i * 46; return rect(x, yy, w, 38, i === 0 ? 'lf-accent-soft' : 'lf-card', 6) + t(240, yy + 24, `${p}　${n} 張`, 'lf-t lf-small lf-strong', 'middle') + t(x + w + 10, yy + 24, s, 'lf-t lf-small lf-muted'); }).join('') + t(240, 186, '平均成本約 53.3 元', 'lf-t lf-small lf-accent-t', 'middle')),
    combine: () => svg(200, '全部符合與任一符合', `<circle cx="190" cy="92" r="62" class="lf-zone-up"/><circle cx="270" cy="92" r="62" class="lf-zone"/><circle cx="230" cy="140" r="52" class="lf-zone-down"/>` + `<circle cx="190" cy="92" r="62" class="lf-orbit"/><circle cx="270" cy="92" r="62" class="lf-orbit"/><circle cx="230" cy="140" r="52" class="lf-orbit"/>` + t(160, 70, 'A 趨勢', 'lf-t lf-small lf-strong', 'middle') + t(300, 70, 'B 量能', 'lf-t lf-small lf-strong', 'middle') + t(230, 178, 'C 籌碼', 'lf-t lf-small lf-strong', 'middle') + `<circle cx="230" cy="112" r="10" class="lf-dot-accent"/>` + t(330, 140, '中間重疊＝全部符合', 'lf-t lf-small lf-accent-t') + t(330, 160, '任何一圈＝任一符合', 'lf-t lf-small lf-muted')),
    'money-plan': () => { const parts = [['緊急預備金', 35, 'lf-vol'], ['長期投資', 40, 'lf-seg2'], ['短線練習', 10, 'lf-seg3'], ['短期要用', 15, 'lf-seg1']]; let acc = 0; return svg(150, '把錢分成幾個水桶', parts.map(([n, v, c]) => { const w = v / 100 * 440, x = 20 + acc; acc += w; return `<rect x="${x}" y="34" width="${w - 3}" height="44" rx="6" class="${c}"/>` + t(x + w / 2, 100, n, 'lf-t lf-small lf-strong', 'middle') + t(x + w / 2, 120, v + '%', 'lf-t lf-small lf-muted', 'middle'); }).join('') + t(20, 22, '比例只是示意，依自己的狀況決定', 'lf-t lf-small lf-muted')); },
    leverage: () => { const d = [['不用槓桿', 20], ['融資 2.5 倍', 50], ['期貨 10 倍', 100]], y = scale(0, 100, 30, 160); return svg(200, '同樣跌 20%，自有資金虧多少', ln(40, 160, 440, 160, 'lf-axis') + d.map(([n, v], i) => `<rect x="${80 + i * 120}" y="${y(Math.min(v, 100))}" width="60" height="${160 - y(Math.min(v, 100))}" rx="5" class="lf-bar-down"/>` + t(110 + i * 120, y(Math.min(v, 100)) - 8, '−' + v + '%' + (v >= 100 ? '（虧光）' : ''), 'lf-t lf-small lf-strong', 'middle') + t(110 + i * 120, 182, n, 'lf-t lf-small lf-muted', 'middle')).join('')); },
    'gap-risk': () => { const y = scale(78, 104, 20, 180), c = [99, 101.4, 99.6, 101.8, 90, 81]; return svg(200, '跳空跌停：停損價賣不到', drawCandles(candlesFrom(c).map((k, i) => i === 4 ? [90, 90, 90, 90] : i === 5 ? [84, 86, 81, 81] : k), 60, 66, y, 22) + ln(20, y(95), 460, y(95), 'lf-dash-accent') + t(456, y(95) - 6, '設定停損 95', 'lf-t lf-small lf-accent-t', 'end') + `<rect x="${60 + 3 * 66 + 14}" y="${y(99.6)}" width="38" height="${y(90.4) - y(99.6)}" class="lf-zone-down"/>` + t(60 + 4 * 66, y(90) + 22, '跌停 90 賣不掉', 'lf-t lf-small lf-down-t', 'middle') + t(60 + 5 * 66, y(81) + 20, '81 才賣出', 'lf-t lf-small lf-strong', 'middle')); },
    scam: () => svg(200, '投資詐騙的紅旗訊號', ['保證獲利、穩賺不賠', '匯款到個人帳戶', '下載不明投資 App', '出金要先繳稅金、保證金', '名額有限、今天就要決定'].map((s, i) => { const yy = 18 + i * 34; return `<circle cx="36" cy="${yy + 12}" r="10" class="lf-dot-up"/><path d="M31 ${yy + 7} l10 10 m0 -10 l-10 10" stroke="#fff" stroke-width="2"/>` + t(56, yy + 17, s, 'lf-t lf-strong'); }).join('') + rect(330, 60, 130, 70, 'lf-accent-soft') + t(395, 90, '懷疑就打', 'lf-t lf-small lf-muted', 'middle') + t(395, 118, '165', 'lf-t lf-big lf-accent-t', 'middle')),
    'ui-home': () => ui(170, '首頁盤後研究手札', [[20, 20, 440, 36, '今日定調：一句話結論', 1, 'lf-accent-soft'], [20, 66, 210, 80, '今日判讀', 2], [250, 66, 210, 80, '判讀依據（可以自己查）', 3]]),
    'ui-brief': () => ui(190, '每日籌碼簡報', [[20, 20, 82, 44, '加權', 0, 'lf-chip'], [108, 20, 82, 44, '櫃買', 0, 'lf-chip'], [196, 20, 82, 44, '台指期', 0, 'lf-chip'], [284, 20, 82, 44, 'VIX', 1, 'lf-chip'], [372, 20, 88, 44, '匯率', 0, 'lf-chip'], [20, 74, 210, 46, '官股券商 今日／5／20／60 日', 2], [250, 74, 210, 46, '結算日倒數', 0], [20, 130, 440, 40, '三大法人買賣超（上市、上櫃）', 3, 'lf-accent-soft']]),
    greed: () => { const z = [[0, 25, '極度恐懼', '#E24B4A'], [25, 45, '恐懼', '#F0997B'], [45, 55, '中立', '#B4B2A9'], [55, 75, '貪婪', '#5DCAA5'], [75, 100, '極度貪婪', '#1D9E75']]; return svg(160, '貪婪指標的五個區間', z.map(([a, b, s, c]) => { const x = 20 + a / 100 * 440, w = (b - a) / 100 * 440; return `<rect x="${x}" y="40" width="${w - 3}" height="30" rx="5" fill="${c}"/>` + t(x + w / 2, 92, s, 'lf-t lf-small', 'middle') + t(x, 34, a, 'lf-t lf-small lf-muted', 'middle'); }).join('') + t(460, 34, '100', 'lf-t lf-small lf-muted', 'middle') + t(20, 130, '價格位置 30%＋動能 25%＋量能 25%＋籌碼 20%', 'lf-t lf-small lf-strong')); },
    breadth: () => svg(200, '大盤多空廣度的五階週期', [['60 日', '總方向與曝險上限'], ['20 日', '波段防守'], ['10 日或 5 日', '動能延續'], ['今日盤後', '家數結構']].map(([a, b], i) => { const w = 440 - i * 70, x = 20 + i * 35, yy = 18 + i * 42; return rect(x, yy, w, 34, i === 0 ? 'lf-accent-soft' : 'lf-card', 7) + t(x + 14, yy + 22, a, 'lf-t lf-strong') + t(x + w - 14, yy + 22, b, 'lf-t lf-small lf-muted', 'end'); }).join('') + t(240, 194, '上層決定方向，下層不能推翻上層', 'lf-t lf-small lf-accent-t', 'middle'))
  });
  window.AcademyLearningFigures = { render: id => { try { return F[id] ? F[id]() : ''; } catch (e) { return ''; } }, ids: Object.keys(F) };
})();
