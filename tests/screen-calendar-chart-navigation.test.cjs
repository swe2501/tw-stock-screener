const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');

const source=fs.readFileSync('apps/web/assets/screen-log.js','utf8');
const css=fs.readFileSync('apps/web/assets/screen-log.css','utf8');

test('calendar chart registers the stocks in the opened record before opening the chart',()=>{
  const start=source.indexOf('function openCalendarChart(button)');
  const end=source.indexOf('\n host.onclick=',start);
  assert.ok(start>=0&&end>start,'openCalendarChart should exist');
  const body=source.slice(start,end);
  assert.match(body,/closest\('details\[data-record\]'\)/);
  assert.match(body,/AcademyChartListNav\?\.setSource\(chartRows\)/);
  assert.ok(body.indexOf('setSource(chartRows)')<body.indexOf('window.openChart('),'navigation source must be registered before opening the chart');
});

test('glass mode keeps saved calendar records on their original readable surface',()=>{
  assert.match(css,/:root\[data-ui-skin="glass"\] \.scal-day\{/);
  assert.match(css,/\.scal-page \.sl-stock-list>button\{/);
  assert.match(css,/:root\[data-ui-skin="glass"\] \.scal-day\{[\s\S]*?background:var\(--surface\)!important/);
  assert.match(css,/:root\[data-ui-skin="glass"\] \.scal-day :is\([^}]+\.sl-ret-date\)\{color:color-mix\(in srgb,var\(--text\) 74%,transparent\)!important;opacity:1!important\}/);
});

test('long calendar stock lists use a translucent draggable scrollbar',()=>{
  assert.match(css,/\.scal-day \.sl-stock-list\{[\s\S]*max-height:[^;]+;overflow-y:auto/);
  assert.match(css,/\.sl-stock-list::\-webkit-scrollbar-thumb/);
  assert.match(css,/scrollbar-color:color-mix\(in srgb,var\(--accent\) 34%,transparent\) transparent/);
});

test('calendar return values stay readable and neutral returns have an explicit style',()=>{
  assert.match(source,/ret>0\?'sl-up':ret<0\?'sl-down':'sl-flat'/);
  assert.match(css,/\.sl-ret \.sl-flat\{color:var\(--text\)!important;font-weight:650;opacity:1!important\}/);
  assert.match(css,/:root\[data-ui-skin="glass"\] \.scal-day \.sl-ret,\s*\n:root\[data-ui-skin="glass"\] \.scal-day \.sl-ret>\*\{opacity:1!important\}/);
});

test('narrow calendar stock cards separate identity, record price, and latest quote',()=>{
  assert.match(css,/@container\(max-width:390px\)\{/);
  assert.match(css,/\.scal-day \.sl-record-prices\{display:grid;grid-template-columns:minmax\(78px,\.8fr\) minmax\(126px,1\.2fr\)/);
  assert.match(css,/\.sl-ret \.sl-ret-date,\.sl-ret>span:last-child\{display:block;width:100%;white-space:nowrap;text-align:right/);
});
