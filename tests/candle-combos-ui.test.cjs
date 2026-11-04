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
