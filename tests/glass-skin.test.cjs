const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/web/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'apps/web/assets/glass-skin.js'),'utf8');
const css=fs.readFileSync(path.join(root,'apps/web/assets/glass-skin.css'),'utf8');
const tour=fs.readFileSync(path.join(root,'apps/web/assets/onboarding-tour.js'),'utf8');

test('glass preference restores before first paint and assets are loaded',()=>{
  assert.match(html,/localStorage\.getItem\('fqi_glass_ui'\)==='1'/);
  assert.match(html,/assets\/glass-skin\.js\?v=4/);
  assert.match(html,/assets\/glass-skin\.css\?v=4/);
});

test('glass controller is valid JavaScript and mounts in member settings',()=>{
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/data-glass-ui-switch/);
  assert.match(js,/root\.setAttribute\('data-ui-skin','glass'\)/);
  assert.match(tour,/FqiGlassUI\?\.mountSettings\(container\)/);
});

test('glass styling stays opt-in and preserves readable content layers',()=>{
  assert.match(css,/:root\[data-ui-skin="glass"\]/);
  assert.match(css,/text-shadow:none!important/);
  assert.doesNotMatch(css,/:is\(button,[^}]+border-radius:999px!important/);
  assert.match(css,/\.ss-panel,[^}]*\.gs-search-drop[^}]*background-color:rgba\(250,252,254,\.975\)!important/);
  assert.match(css,/\.ss-inline,[^}]*\.gs-search[^}]*>input\[type="search"\][^{]*\{[^}]*border-radius:0!important/);
  assert.match(css,/--glass-sheen:/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('glass mode preserves component geometry and keeps auth overlays exclusive',()=>{
  assert.doesNotMatch(css,/:root\[data-ui-skin="glass"\][^{]*:is\(button,[^{]*\)\s*\{[^}]*border-radius/);
  assert.match(css,/#siteGate>\[data-gate-login\]/);
  assert.match(html,/if \(_idleModal\) _idleModal\.style\.display = 'none'/);
  assert.match(html,/window\.SITE_GATE_ON === false \? 'flex' : 'none'/);
});

test('chart polish is scoped to glass mode and keeps data cards untouched',()=>{
  assert.match(css,/:root\[data-ui-skin="glass"\] #chartModal \.chart-fit-tools/);
  assert.match(css,/:root\[data-ui-skin="glass"\] \.drawing-context/);
  assert.match(css,/#chartModal:has\(\.chart-fit-tools:hover\) #chartWrapper/);
  assert.match(css,/#chartModal:has\(\.chart-fit-tools:focus-within\) #chartWrapper/);
  assert.doesNotMatch(css,/:root\[data-ui-skin="glass"\][^{]*:is\(button,[^{]*\)\s*\{[^}]*border-radius/);
});
