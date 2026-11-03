/* 淘金篩選「K棒」條件：滑鼠移到選項上顯示對應的 K 棒型態示意卡（紅漲黑跌）。純顯示，不影響篩選。 */
(() => {
'use strict';
const P = {
  doji: { name: '十字線', tag: ['neu', '多空拉鋸'], ctx: [[50,54,49,53],[53,57,52,56],[56,60,55,59]], sig: [[59,62.5,55.5,59.05]],
    desc: '開盤價≈收盤價，上下影線明顯。代表<em>多空力道暫時平衡</em>，出現在連續上漲或下跌後，常是趨勢轉折的前兆。' },
  hanging_man: { name: '吊人線', tag: ['bear', '高檔警訊'], ctx: [[48,52,47,51],[51,55,50,54.5],[54.5,58.5,54,58]], sig: [[59.6,59.6,53,59.6]],
    desc: '出現在<em>上漲高檔</em>，開盤＝最高＝收盤，只留一根長下影線（T 字線）。代表盤中曾遭重挫、買方無力再創高，須留意轉弱。' },
  engulf_bull: { name: '陽吞噬', tag: ['bull', '底部翻多'], ctx: [[60,61,56,57],[57,58,53,54],[54,55,51,52]], sig: [[52.8,53.2,50.9,51.2],[49.6,54.8,49.2,54.4]],
    desc: '下跌趨勢中，<em>紅K 實體完全包覆前一根黑K</em>。買盤一口氣收復跌幅，是常見的底部反轉訊號。' },
  engulf_bear: { name: '陰吞噬', tag: ['bear', '頭部翻空'], ctx: [[48,51,47,50.5],[50.5,54,50,53.5],[53.5,57,53,56.5]], sig: [[56.6,58.3,56.2,58],[59.6,59.9,54.6,55]],
    desc: '上漲趨勢中，<em>黑K 實體完全包覆前一根紅K</em>。賣壓吃掉前一日漲幅，是常見的頭部反轉訊號。' },
  harami_bull: { name: '多頭母子孕育線', tag: ['bull', '跌勢趨緩'], ctx: [[61,62,58,59],[59,60,56.5,57]], sig: [[57,57.5,50.5,51],[53.2,55.3,52.9,54.8]],
    desc: '長黑K（母）之後出現<em>實體被包在其中的小紅K（子）</em>。代表賣壓減弱，待下一根確認轉強。' },
  harami_bear: { name: '空頭母子孕育線', tag: ['bear', '漲勢趨緩'], ctx: [[48,51,47,50],[50,53.5,49.5,52.8]], sig: [[53,59.5,52.5,59],[56.8,57.1,54.9,55.2]],
    desc: '長紅K（母）之後出現<em>實體被包在其中的小黑K（子）</em>。代表買盤追價力道轉弱，待下一根確認轉弱。' },
};
function chart(k) {
  const all = [...k.ctx, ...k.sig], lo = Math.min(...all.map(c => c[2])) - 1, hi = Math.max(...all.map(c => c[1])) + 1;
  const W = 220, H = 88, bw = 15, step = 22, s0 = k.ctx.length, n = all.length;
  const y = v => 7 + (hi - v) / (hi - lo) * (H - 14), mid = (s0 + n - 1) / 2, cx = i => W / 2 + (i - mid) * step;
  let g = '';
  for (let i = 1; i < 4; i++) g += `<line x1="0" x2="${W}" y1="${i * H / 4}" y2="${i * H / 4}" class="kh-grid"/>`;
  const bx0 = cx(s0) - bw / 2 - 6, bx1 = cx(n - 1) + bw / 2 + 6;
  g += `<rect x="${bx0}" y="3" width="${bx1 - bx0}" height="${H - 6}" rx="7" class="kh-focus"/>`;
  all.forEach((c, i) => {
    const [o, h, l, cl] = c, x = cx(i), flat = Math.abs(cl - o) < .25, up = cl > o && !flat;
    const cls = flat ? 'kh-flat' : up ? 'kh-up' : 'kh-dn', top = y(Math.max(o, cl)), bh = Math.max(2, Math.abs(y(o) - y(cl)));
    g += `<g class="${cls}${i < s0 ? ' kh-ctx' : ''}"><line x1="${x}" x2="${x}" y1="${y(h)}" y2="${y(l)}" class="kh-wick"/>` +
      `<rect x="${x - bw / 2}" y="${flat ? y(o) - 1.1 : top}" width="${bw}" height="${flat ? 2.2 : bh}" rx="1.2" class="kh-body"/></g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
}
let tip = null, cur = null, showT = 0, hideT = 0;
function ensure() {
  if (tip) return tip;
  tip = document.createElement('div'); tip.className = 'kh-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'kbarHintTip'; tip.hidden = true;
  document.body.append(tip); return tip;
}
function place(anchor) {
  const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let top = r.bottom + 10, side = 'bottom';
  if (top + h > innerHeight - 8 && r.top - h - 10 > 8) { top = r.top - h - 10; side = 'top'; }
  let left = Math.max(8, Math.min(r.left - 6, innerWidth - w - 8));
  tip.dataset.side = side; tip.style.left = left + 'px'; tip.style.top = top + 'px';
  tip.style.setProperty('--kh-arrow', Math.max(16, Math.min(w - 16, r.left + 18 - left)) + 'px');
}
function show(key, anchor) {
  clearTimeout(hideT); clearTimeout(showT);
  showT = setTimeout(() => {
    const k = P[key]; if (!k) return; ensure();
    if (cur !== key) {
      tip.innerHTML = `<div class="kh-top"><b>${k.name}</b><span class="kh-tag kh-${k.tag[0]}">${k.tag[1]}</span></div><div class="kh-chart">${chart(k)}</div><p>${k.desc}</p><div class="kh-legend"><span class="kh-lu">紅K 上漲</span><span class="kh-ld">黑K 下跌</span><span class="kh-lf">虛線框＝訊號K</span></div>`;
      cur = key;
    }
    tip.hidden = false; tip.classList.remove('is-in'); place(anchor);
    requestAnimationFrame(() => tip.classList.add('is-in'));
    anchor.querySelector('input')?.setAttribute('aria-describedby', 'kbarHintTip');
  }, 90);
}
function hide() { clearTimeout(showT); hideT = setTimeout(() => { if (tip) { tip.classList.remove('is-in'); tip.hidden = true; } }, 60); }
function mount() {
  Object.keys(P).forEach(key => {
    const input = document.getElementById(key), row = input?.closest('.checkbox-row');
    if (!row || row.dataset.khBound) return; row.dataset.khBound = '1'; row.classList.add('kh-row');
    row.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') show(key, row); });
    row.addEventListener('pointerleave', hide);
    input.addEventListener('focus', () => { if (input.matches(':focus-visible')) show(key, row); });
    input.addEventListener('blur', hide);
  });
  addEventListener('scroll', hide, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();
