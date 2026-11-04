const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const js = read('apps/web/assets/candle-combos.js');
const css = read('apps/web/assets/candle-combos.css');
const hintJs = read('apps/web/assets/kbar-hint.js');
const hintCss = read('apps/web/assets/kbar-hint.css');

test('combo selector keeps only compact names instead of the old rule hint rows', () => {
  const mount = js.slice(js.indexOf('function mountGrid'), js.indexOf('function resultTag'));
  assert.doesNotMatch(mount, /cb-hint/);
  assert.match(mount, /<span class="cb-label">/);
  assert.match(css, /#ccComboGrid\{display:grid/);
  assert.match(css, /#ccComboGrid \.cb-label[^}]*font-size:16px/);
});

test('chart markers use compact theme-aware glass labels without repeated disclaimer text', () => {
  const paint = js.slice(js.indexOf('function paint'), js.indexOf('function boot'));
  assert.doesNotMatch(paint, /textContent: '（僅供參考）'/);
  assert.match(paint, /dataset\.placement/);
  assert.match(css, /data-ui-skin="glass"\] \.cc-label/);
  assert.match(css, /backdrop-filter:blur\(12px\)/);
});

test('green-box strategy details are removed while the remaining hover guidance stays', () => {
  const hints = js.slice(js.indexOf('const HINTS'), js.indexOf('const byId'));
  assert.doesNotMatch(hints, /實體各 ≥3%|實體 ≥3%|量放大 1\.5 倍；三根實體相連沒有缺口|量縮；三根實體相連沒有缺口/);
  // 2026-11-05 Andrew 要求示意卡保留 30% 波段前提（需要波段的 9 類＋雙鴉躍空）
  assert.match(hints, /'bullish-engulfing'[\s\S]*?跌了一大段（約 30%）後/);
  assert.match(hints, /'bearish-harami'[\s\S]*?漲了一大段（約 30%）後/);
  assert.match(hints, /'bullish-engulfing'[\s\S]*?紅K 實體把前一根黑K/);
  assert.match(hints, /'bullish-tank'[\s\S]*?第 3 根紅K 延續攻勢/);
  assert.match(hintJs, /k\.desc \? `<p>\$\{k\.desc\}<\/p>` : ''/);
});

test('the redundant completion-day note and rules link are removed', () => {
  const index = read('apps/web/index.html');
  assert.doesNotMatch(index, /完成日以上方「日期」為準/);
  assert.doesNotMatch(index, />16 類規則說明<\/a>/);
});

test('combo screening uses the single existing screener date instead of adding another date input', () => {
  const index = read('apps/web/index.html');
  assert.equal((index.match(/id="date"/g) || []).length, 1);
  assert.doesNotMatch(index, /id="ccDate"/);
  assert.match(index, /const dateVal = document\.getElementById\('date'\)\.value/);
  assert.match(index, /date: dateVal \? dateVal\.replace\(\/\-\/g, ''\) : ''/);
  assert.match(index, /candle_combos: Array\.from/);
});

test('rising and falling three methods require the last two bodies to touch in rules and illustrations', () => {
  assert.match(js, /rising-three'[\s\S]*?黏著倒數第 2 根（開盤 ≤ 前一根實體上緣，不能有缺口）/);
  assert.match(js, /falling-three'[\s\S]*?黏著倒數第 2 根（開盤 ≥ 前一根實體下緣，不能有缺口）/);
  assert.match(js, /'rising-three'[\s\S]*?\[51,51\.8,50\.2,51\.5\],\[51\.5,55,51\.4,54\.8\]/);
  assert.match(js, /'falling-three'[\s\S]*?\[53\.9,54\.5,53,53\.4\],\[53\.4,53\.5,49\.6,49\.8\]/);
});

test('three-method hover cards omit the private green-box details while keeping concise guidance', () => {
  const hints = js.slice(js.indexOf('const HINTS'), js.indexOf('const byId'));
  assert.doesNotMatch(hints, /影線可超出|最後一根紅K 與倒數第二根實體相連|最後一根黑K 與倒數第二根實體相連|量放大 1\.5 倍|且量縮/);
  assert.match(hints, /至少 3 根小K 都待在第一根紅K 實體內[\s\S]*?收盤突破第一根最高價/);
  assert.match(hints, /至少 3 根小K 都待在第一根黑K 實體內[\s\S]*?收盤跌破第一根最低價/);
});

test('base K-bar labels match combo labels and all shared hint charts are slightly larger', () => {
  assert.match(css, /\.sc-panel\[data-cat="kbar"\] \.checkbox-row \.cb-label\{font-size:16px/);
  assert.match(css, /\.sc-panel\[data-cat="kbar"\] \.checkbox-row input\[type="checkbox"\][^}]*width:17px/);
  assert.match(hintCss, /width:266px/);
  assert.match(hintCss, /\.kh-chart svg\{[^}]*height:100px/);
});

test('single K-bar panel is compact, illustrated, and contains no trading advice copy', () => {
  const index = read('apps/web/index.html');
  const api = read('api/screen.py');
  const panel = index.slice(index.indexOf('<div class="sc-panel" data-cat="kbar">'), index.indexOf('<div class="sc-panel" data-cat="combo">'));
  const hints = js.slice(js.indexOf('const SIG_HINTS'), js.indexOf('Object.assign(window.AcademyKbarHintExtra'));

  assert.match(panel, /ks-threshold-card ks-threshold-red/);
  assert.match(panel, /ks-threshold-card ks-threshold-black/);
  assert.doesNotMatch(panel, /ks-threshold-mark|長紅棒幅度|長黑棒幅度/);
  assert.match(css, /\.ks-threshold-card\{[^}]*display:flex!important;flex-direction:row!important;align-items:center!important/);
  assert.match(panel, /id="one_line_strong"[^>]*data-direction="strong"/);
  assert.match(panel, /id="one_line_weak"[^>]*data-direction="weak"/);
  assert.match(index, /one_line_directions:[\s\S]*?data-signal="one-line"/);
  assert.match(api, /one_line_directions = \{[\s\S]*?"strong", "weak"/);
  assert.match(api, /if "one-line" in candle_signals and len\(one_line_directions\) == 1:/);
  assert.doesNotMatch(panel, /\(收 - 開\)|\(開 - 收\)|續抱|減碼|賣出訊號|漲逾 30%/);
  assert.match(css, /data-cat="kbar"\] \.ks-shape-grid\{grid-template-columns:repeat\(3/);
  assert.match(panel, /ks-group-title">單根形態[\s\S]*?id="long_lower"[\s\S]*?id="long_upper"[\s\S]*?id="spinning_top"[\s\S]*?id="candle_line"/);
  assert.match(panel, /ks-group-title">一字線方向[\s\S]*?id="one_line_strong"[\s\S]*?id="one_line_weak"/);
  assert.match(panel, /ks-group-title">吊人線確認[\s\S]*?id="hanging_main"[\s\S]*?id="hanging_retail"/);
  assert.match(hints, /red_candle_pct:[\s\S]*?黑K 長實體/);
  assert.match(hints, /one_line:[\s\S]*?強勢一字漲停[\s\S]*?弱勢一字跌停/);
  assert.match(hints, /one_line_strong:[\s\S]*?one_line_weak:/);
  assert.doesNotMatch(hints, /一路漲或跌一大段（約 30%）後/);
  assert.match(hints, /spinning_top:[\s\S]*?sig: \[\[52\.8,56,51\.6,52\]\]/);
  assert.match(hints, /candle_line:[\s\S]*?高檔拉鋸/);
  assert.doesNotMatch(hints, /續抱|減碼|賣出/);
  assert.match(hintJs, /closest\('\.checkbox-row, \.ks-threshold-card'\)/);
});

test('screening results expose compact question-mark help for single bars and combos', () => {
  const resultSection = js.slice(js.indexOf('function resultTag'), js.indexOf('// ── K 線圖黃框'));
  assert.match(resultSection, /class="cc-help" data-kh-key="cc_/);
  assert.match(resultSection, /function sigHintKey/);
  assert.match(resultSection, /data-kh-key="' \+ esc\(sigHintKey\(id\)\)/);
  assert.doesNotMatch(resultSection, /十字線（變盤）|吊人線（待確認）/);
  assert.match(hintJs, /show\(key, anchor\)/);
  assert.match(css, /\.cc-help\{position:relative;display:inline-grid[^}]*width:13px[^}]*height:13px/);
});

test('single-bar signals no longer draw noisy colored rings over the chart', () => {
  const paint = js.slice(js.indexOf('function paint'), js.indexOf('function tipExtra'));
  assert.doesNotMatch(paint, /cc-ring|showSig|ring\.style/);
  assert.doesNotMatch(css, /\.cc-ring/);
  assert.match(js, /function signalTipHtml[\s\S]*?sigByDate\.get/);
  assert.doesNotMatch(js, /30% 內・續抱/);
});
