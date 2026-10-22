/* 學習中心畫面（2026-10-22 第三版）：左側目錄（手機改成底部滑出）、搜尋、未讀／收藏篩選、
   每週學習挑戰（倒數、週測驗、徽章）、學習路線、每篇的圖解、實際算一次、常犯的錯、動手做、小測驗、小算盤。
   已讀紀錄：member_learning；挑戰紀錄：member_learning_challenges；收藏：AcademyResearch saved_lessons。 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = { view: 'academy.learning.track', open: 'academy.learning.open', filter: 'academy.learning.filter' };
  const sget = k => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
  const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
  const svg = (p, w = 15) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const icon = {
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14), clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 13),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 14), bookmark: svg('<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>', 14),
    calc: svg('<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h1M12 12h0M15.5 12h0M8.5 16h1M12 16h0M15.5 16h0"/>'),
    warn: svg('<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.2M12 17h0"/>'), hand: svg('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10V4.5a1.5 1.5 0 0 1 3 0V11M15 10.5V6a1.5 1.5 0 0 1 3 0v7.5a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.8-2.4L4.4 14.2a1.6 1.6 0 0 1 2.4-2.1L9 14"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'), list: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0"/>', 16),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 16), flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'), home: svg('<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>', 14)
  };
  const medal = (label, on = true) => `<svg class="lc-medal${on ? '' : ' is-off'}" viewBox="0 0 48 56" aria-hidden="true"><path class="lc-medal-rib" d="M14 2h8l4 14h-8zM34 2h-8l-4 14h8z"/><circle class="lc-medal-disc" cx="24" cy="34" r="18"/><circle class="lc-medal-ring" cx="24" cy="34" r="13.5"/><path class="lc-medal-star" d="m24 26 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg><span class="sr-only">${esc(label)}</span>`;
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const fee = (amt, disc, min = 20) => amt > 0 ? Math.max(min, Math.floor(amt * 0.001425 * disc)) : 0;

  // ── 小算盤 ──
  const CALC = {
    'buy-cost': { title: '小算盤：買一張要準備多少錢', fields: [['price', '股價（元）', 80], ['lots', '張數', 1], ['disc', '手續費折數（1＝不打折，0.6＝六折）', 1]],
      run: v => { const amt = v.price * 1000 * v.lots, f = fee(amt, v.disc); return [['股票金額', fmt(amt) + ' 元'], ['手續費', fmt(f) + ' 元（最低 20 元）'], ['T+2 要準備', fmt(amt + f) + ' 元', true]]; } },
    'odd-lot': { title: '小算盤：買零股的手續費', fields: [['price', '股價（元）', 600], ['shares', '股數', 10], ['min', '券商最低手續費（元）', 1], ['disc', '手續費折數', 1]],
      run: v => { const amt = v.price * v.shares, f = fee(amt, v.disc, v.min); return [['股票金額', fmt(amt) + ' 元'], ['手續費', fmt(f) + ' 元'], ['手續費占比', fmt(amt ? f / amt * 100 : NaN, 2) + '%', true]]; } },
    'round-trip': { title: '小算盤：一買一賣的成本', fields: [['buy', '買進價（元）', 100], ['sell', '賣出價（元）', 100], ['lots', '張數', 1], ['disc', '手續費折數', 1], ['tax', '證交稅率 %（股票 0.3、ETF 0.1、當沖 0.15）', 0.3]],
      run: v => { const b = v.buy * 1000 * v.lots, s = v.sell * 1000 * v.lots, fb = fee(b, v.disc), fs = fee(s, v.disc), tx = Math.floor(s * v.tax / 100), cost = fb + fs + tx, net = s - b - cost; return [['買進手續費', fmt(fb) + ' 元'], ['賣出手續費', fmt(fs) + ' 元'], ['證交稅', fmt(tx) + ' 元'], ['總成本', fmt(cost) + ' 元（' + fmt(b ? cost / b * 100 : NaN, 2) + '%）'], ['扣完成本損益', (net >= 0 ? '+' : '') + fmt(net) + ' 元', true]]; } },
    recovery: { title: '小算盤：虧損後要漲多少才回本', fields: [['loss', '虧損幅度 %', 30]],
      run: v => { const l = Math.min(99, Math.max(0, v.loss)); return [['剩下的本金', fmt(100 - l, 1) + '%'], ['要漲多少才回本', fmt(l / (100 - l) * 100, 1) + '%', true]]; } },
    position: { title: '小算盤：這筆最多買多少', fields: [['cap', '總資金（元）', 1000000], ['risk', '單筆最多虧總資金 %', 1], ['stop', '停損幅度 %', 5], ['price', '股價（元，選填）', 50]],
      run: v => { const lossMax = v.cap * v.risk / 100, pos = v.stop > 0 ? lossMax / (v.stop / 100) : NaN, lots = v.price > 0 ? Math.floor(pos / (v.price * 1000)) : NaN; return [['這筆最多虧', fmt(lossMax) + ' 元'], ['最多投入', fmt(pos) + ' 元', true], ['約可買', Number.isFinite(lots) ? fmt(lots) + ' 張' + (lots < 1 ? '（不到一張，可考慮零股）' : '') : '—']]; } },
    'ex-div': { title: '小算盤：除權息參考價', fields: [['close', '除權息前一天收盤（元）', 100], ['cash', '現金股利（元）', 4], ['stock', '股票股利（元，面額 10 元）', 0]],
      run: v => { const ref = (v.close - v.cash) / (1 + v.stock / 10); return [['配股率', fmt(v.stock / 10 * 100, 1) + '%'], ['參考價', fmt(ref, 2) + ' 元', true], ['漲回多少算填權息', fmt(v.close, 2) + ' 元']]; } },
    'div-tax': { title: '小算盤：二代健保補充保費', fields: [['amt', '單筆股利金額（元）', 30000]],
      run: v => { const base = Math.min(v.amt, 10000000), p = v.amt >= 20000 ? Math.round(base * 0.0211) : 0; return [['要不要扣', v.amt >= 20000 ? '要（單筆 ≥ 2 萬元）' : '不用（未達 2 萬元）'], ['補充保費（2.11%）', fmt(p) + ' 元'], ['實際入帳', fmt(v.amt - p) + ' 元', true]]; } },
    fib: { title: '小算盤：斐波那契回檔位置', fields: [['low', '起漲低點（元）', 40], ['high', '最高點（元）', 60]],
      run: v => { const r = v.high - v.low; return [['38.2%', fmt(v.high - r * .382, 2) + ' 元'], ['50%', fmt(v.high - r * .5, 2) + ' 元', true], ['61.8%', fmt(v.high - r * .618, 2) + ' 元']]; } },
    bias: { title: '小算盤：乖離率', fields: [['close', '收盤價（元）', 66], ['ma', '均線（元）', 60]],
      run: v => { const b = v.ma ? (v.close - v.ma) / v.ma * 100 : NaN; return [['乖離率', (b >= 0 ? '+' : '') + fmt(b, 2) + '%', true], ['方向', b >= 0 ? '在均線之上（正乖離）' : '在均線之下（負乖離）']]; } },
    margin: { title: '小算盤：融資維持率', fields: [['buy', '買進價（元）', 100], ['now', '現價（元）', 85], ['ratio', '融資成數（上市 0.6）', 0.6]],
      run: v => { const loan = v.buy * v.ratio, m = loan ? v.now / loan * 100 : NaN; return [['目前維持率', fmt(m, 1) + '%', true], ['碰到 130% 追繳的價格', fmt(loan * 1.3, 2) + ' 元'], ['狀態', m < 130 ? '已低於 130%，會被追繳' : m < 140 ? '接近追繳線' : '正常']]; } }
  };
  const calcHTML = id => { const c = CALC[id]; if (!c) return ''; return `<section class="lc-calc" data-calc="${id}"><h4>${icon.calc}${esc(c.title)}</h4><div class="lc-calc-grid">${c.fields.map(([k, l, d]) => `<label><span>${esc(l)}</span><input type="number" inputmode="decimal" step="any" data-k="${k}" value="${d}"></label>`).join('')}</div><dl class="lc-calc-out"></dl></section>`; };
  const runCalc = box => { const c = CALC[box.dataset.calc]; if (!c) return; const v = {}; box.querySelectorAll('input[data-k]').forEach(i => { v[i.dataset.k] = parseFloat(i.value) || 0; }); box.querySelector('.lc-calc-out').innerHTML = c.run(v).map(([a, b, hl]) => `<div${hl ? ' class="is-key"' : ''}><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join(''); };
  const left = ms => { if (ms <= 0) return '已截止'; const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return d ? `剩 ${d} 天 ${h} 小時` : h ? `剩 ${h} 小時 ${m} 分` : `剩 ${m} 分鐘`; };
  let timer = null;

  /** opts: {completed, saved, challenges, toggleRead(id), toggleSave(id), saveChallenge(rec), go(route), feedback} */
  function render(main, opts) {
    const A = window.AcademyLearning, { tracks, lessons } = A, plan = A.plan || [], done = new Set(opts.completed || []), saved = new Set(opts.saved || []);
    const C = window.AcademyLearningChallenge, profile = { member_learning_challenges: opts.challenges || {} };
    const byId = id => lessons.find(l => l.id === id), trackOf = id => tracks.find(t => t.id === id);
    let view = sget(K.view); if (!['saved', 'search'].includes(view) && !tracks.some(t => t.id === view)) view = '';
    let filter = sget(K.filter) || 'all'; const query = main._lcQuery || '';
    const count = list => list.filter(l => done.has(l.id)).length;
    const pass = l => filter === 'unread' ? !done.has(l.id) : filter === 'saved' ? saved.has(l.id) : true;
    const stageIdx = Math.max(0, plan.findIndex(w => w.ids.some(id => !done.has(id))));
    const stage = plan[stageIdx];
    const next = (stage && stage.ids.map(byId).find(l => l && !done.has(l.id))) || lessons.find(l => !done.has(l.id));
    const ch = C ? C.current() : null, rec = ch ? (C.records(profile)[ch.key] || null) : null, chRead = ch ? ch.ids.filter(id => done.has(id)).length : 0;
    const fig = id => { const s = window.AcademyLearningFigures?.render(id); return s ? `<figure class="lc-fig">${s}</figure>` : ''; };
    const quizHTML = l => (l.quiz || []).map((q, qi) => `<fieldset class="lc-quiz" data-quiz="${esc(l.id)}:${qi}"><legend>小測驗 ${qi + 1}／${l.quiz.length}</legend><p>${esc(q.q)}</p><div class="lc-options">${q.options.map((o, i) => `<label><input type="radio" name="q-${esc(l.id)}-${qi}" value="${i}"><span>${esc(o)}</span></label>`).join('')}</div><button type="button" class="lc-btn" data-check="${esc(l.id)}:${qi}">檢查答案</button><p class="lc-result" role="status"></p></fieldset>`).join('');
    const lessonHTML = (l, n, showTrack) => {
      const isDone = done.has(l.id), t = trackOf(l.track);
      return `<details class="lc-lesson${isDone ? ' is-done' : ''}" data-lesson-id="${esc(l.id)}">
        <summary><span class="lc-mark" aria-hidden="true">${isDone ? icon.check : n}</span><span class="lc-sum"><span class="lc-meta"><span class="lc-level lc-level-${l.level === '入門' ? 'a' : l.level === '基礎' ? 'b' : 'c'}">${esc(l.level)}</span><span>${icon.clock}${l.minutes} 分鐘</span>${showTrack ? `<span class="lc-track-name">${esc(t?.name || '')}</span>` : ''}${saved.has(l.id) ? `<span class="lc-saved-dot">${icon.bookmark}已收藏</span>` : ''}</span><b>${esc(l.title)}</b><small>${esc(l.summary)}</small></span><span class="lc-state">${isDone ? '已讀' : '閱讀'}</span></summary>
        <div class="lc-body">
          ${fig(l.fig)}
          ${l.sections.map(([h, p]) => `<section><h4>${esc(h)}</h4><p>${esc(p)}</p></section>`).join('')}
          ${l.ex ? `<section class="lc-ex"><h4>${icon.calc}實際算一次：${esc(l.ex.title)}</h4><ol>${l.ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="lc-ex-result">${esc(l.ex.result)}</p></section>` : ''}
          ${l.trap ? `<aside class="lc-trap"><h4>${icon.warn}新手最常犯的錯</h4><p>${esc(l.trap)}</p></aside>` : ''}
          <aside class="lc-points"><b>重點整理</b><ul>${l.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></aside>
          ${l.drill?.length ? `<section class="lc-drill"><h4>${icon.hand}動手做</h4><ol>${l.drill.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>` : ''}
          ${l.calc ? calcHTML(l.calc) : ''}
          ${quizHTML(l)}
          <div class="lc-actions">
            <button type="button" class="lc-btn${isDone ? '' : ' lc-primary'}" data-read="${esc(l.id)}">${isDone ? '標為未讀' : icon.check + ' 讀完了'}</button>
            <button type="button" class="lc-btn" data-save="${esc(l.id)}" aria-pressed="${saved.has(l.id)}">${icon.bookmark} ${saved.has(l.id) ? '已收藏' : '收藏'}</button>
            ${l.try ? `<button type="button" class="lc-btn lc-try" data-try="${esc(l.id)}">${esc(l.try.label)} ${icon.arrow}</button>` : ''}
          </div>
        </div></details>`;
    };

    // ── 目錄 ──
    const tocHTML = () => `<div class="lc-toc-inner">
        <label class="lc-search">${icon.search}<input type="search" placeholder="搜尋文章，例如：零股、KD、停損" value="${esc(query)}" data-search aria-label="搜尋學習內容"></label>
        <div class="lc-seg" role="radiogroup" aria-label="篩選">${[['all', '全部'], ['unread', '未讀'], ['saved', '收藏']].map(([k, n]) => `<button type="button" role="radio" aria-checked="${filter === k}" data-filter="${k}">${n}</button>`).join('')}</div>
        <button type="button" class="lc-toc-home${view === '' ? ' is-active' : ''}" data-view="">${icon.home}學習首頁</button>
        <nav class="lc-toc" aria-label="學習主題">${tracks.map(t => { const list = lessons.filter(l => l.track === t.id), shown = list.filter(pass), openT = view === t.id || (!!query && shown.length); return `<details class="lc-toc-group${view === t.id ? ' is-active' : ''}"${openT || view === t.id ? ' open' : ''}><summary><span>${esc(t.name)}</span><small>${count(list)}/${list.length}</small></summary><ol>${shown.map(l => `<li><button type="button" data-open="${esc(l.id)}" class="${done.has(l.id) ? 'is-done' : ''}${sget(K.open) === l.id ? ' is-current' : ''}"><i aria-hidden="true">${done.has(l.id) ? icon.check : ''}</i><span>${esc(l.title.replace(/[：:].*$/, ''))}</span></button></li>`).join('') || '<li class="lc-toc-empty">沒有符合的文章</li>'}</ol></details>`; }).join('')}</nav>
      </div>`;

    // ── 每週挑戰 ──
    const challengeHTML = () => {
      if (!ch) return '';
      const passed = !!(rec && rec.passed), ready = chRead === ch.ids.length;
      return `<section class="mc-card lc-challenge${passed ? ' is-passed' : ''}" aria-labelledby="lcChTitle">
        <div class="lc-ch-head"><div><span class="lc-ch-kicker">${icon.flag}本週學習挑戰 · ${esc(ch.key.replace('-W', ' 第 ') + ' 週')}</span><h3 id="lcChTitle">${esc(ch.name)}</h3><p>讀完 4 篇、通過 ${ch.quiz.length} 題週測驗（答對 ${ch.pass} 題以上），拿「${esc(ch.badge)}」徽章，並可到任務領 50 點。</p></div>
          <div class="lc-ch-time"><b data-countdown="${ch.end}">${left(ch.end - Date.now())}</b><small>週日 23:59 截止</small></div></div>
        <ol class="lc-ch-steps">${ch.lessons.map((l, i) => `<li class="${done.has(l.id) ? 'is-done' : ''}"><button type="button" data-open="${esc(l.id)}"><i>${done.has(l.id) ? icon.check : i + 1}</i><span>${esc(l.title.replace(/[：:].*$/, ''))}</span></button></li>`).join('')}</ol>
        <div class="lc-ch-foot">${passed ? `<div class="lc-ch-done">${medal(ch.badge)}<div><b>挑戰完成：${esc(ch.badge)}</b><small>答對 ${rec.score}／${rec.total} 題。記得到「任務與點數」領本週學習挑戰的點數。</small></div><button type="button" class="lc-btn" data-go="tasks">去領點數 ${icon.arrow}</button></div>`
          : `<div class="lc-ch-progress"><span>已讀 ${chRead}／${ch.ids.length} 篇${rec ? ` · 上次答對 ${rec.score}／${rec.total}` : ''}</span><div class="lc-bar lc-bar-sm"><i style="width:${chRead / ch.ids.length * 100}%"></i></div></div><button type="button" class="lc-btn lc-primary" data-ch-start${ready ? '' : ' disabled'}>${ready ? '開始週測驗' : '讀完 4 篇後開始週測驗'}</button>`}</div>
        <div class="lc-ch-quiz" hidden></div>
      </section>`;
    };
    const badgesHTML = () => { const b = C ? C.badges(profile) : []; if (!b.length) return ''; return `<section class="mc-card lc-badges"><h3>我的徽章 <small>${b.length} 枚</small></h3><ul>${b.slice(0, 12).map(x => `<li title="${esc(x.week)}">${medal(x.badge || '')}<b>${esc(x.badge || '徽章')}</b><small>${esc(String(x.week).replace('-W', ' 第 ') + ' 週')}</small></li>`).join('')}</ul></section>`; };
    const routeHTML = () => plan.length ? `<section class="mc-card lc-plan" aria-labelledby="lcPlanTitle">
        <header class="lc-plan-head"><h3 id="lcPlanTitle">學習路線</h3><p>八個階段，照順序讀最容易吸收。不用趕，每天一兩篇就好。</p></header>
        <ol class="lc-weeks">${plan.map((w, i) => { const ls = w.ids.map(byId).filter(Boolean), c = count(ls), all = c === ls.length, cur = i === stageIdx && !all; return `<li class="lc-week${all ? ' is-done' : ''}${cur ? ' is-current' : ''}"><div class="lc-week-top"><span class="lc-week-no">階段 ${w.week}</span>${all ? `<span class="lc-week-badge">${icon.check}完成</span>` : cur ? '<span class="lc-week-badge is-now">進行中</span>' : ''}</div><b>${esc(w.name)}</b><div class="lc-week-goal">${esc(w.goal)}</div><div class="lc-bar lc-bar-sm"><i style="width:${Math.round(c / ls.length * 100)}%"></i></div><small>${c} / ${ls.length} 篇</small></li>`; }).join('')}</ol>
        ${stage && count(stage.ids.map(byId).filter(Boolean)) < stage.ids.length ? (() => { const todo = stage.ids.map(byId).filter(l => l && !done.has(l.id)); return `<div class="lc-week-todo"><span>階段 ${stage.week} 還沒讀</span><div>${todo.slice(0, 4).map(l => `<button type="button" class="lc-chip" data-open="${esc(l.id)}">${esc(l.title.replace(/[：:].*$/, ''))}</button>`).join('')}${todo.length > 4 ? `<span class="lc-more">還有 ${todo.length - 4} 篇，左側目錄可以看全部</span>` : ''}</div></div>`; })() : ''}
      </section>` : '';
    const topicsHTML = () => `<section class="lc-topics" aria-label="學習主題">${tracks.map(t => { const list = lessons.filter(l => l.track === t.id), c = count(list); return `<button type="button" class="lc-topic" data-view="${t.id}"><span class="lc-topic-name">${esc(t.name)}</span><span class="lc-topic-desc">${esc(t.desc)}</span><span class="lc-topic-foot"><span class="lc-bar lc-bar-sm"><i style="width:${Math.round(c / list.length * 100)}%"></i></span><small>${c} / ${list.length} 篇</small></span></button>`; }).join('')}</section>`;

    let content;
    if (query) {
      const q = query.toLowerCase(), hits = lessons.filter(l => pass(l) && [l.title, l.summary, ...l.points, ...l.sections.map(s => s[0] + s[1])].join(' ').toLowerCase().includes(q));
      content = `<section class="mc-card lc-list"><header class="lc-list-head"><h3>「${esc(query)}」的搜尋結果</h3><p>找到 ${hits.length} 篇。</p></header>${hits.map((l, i) => lessonHTML(l, i + 1, true)).join('') || '<p class="mc-muted">沒有找到，換個關鍵字試試，例如「停損」「ETF」「融資」。</p>'}</section>`;
    } else if (view) {
      const t = trackOf(view), list = lessons.filter(l => l.track === view), shown = list.filter(pass);
      content = `<section class="mc-card lc-list"><header class="lc-list-head"><div><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></div><span class="lc-list-count">已讀 ${count(list)} / ${list.length} 篇</span></header>${shown.map(l => lessonHTML(l, list.indexOf(l) + 1, false)).join('') || `<p class="mc-muted">${filter === 'unread' ? '這個主題都讀完了。' : '這個主題還沒有收藏的文章。'}</p>`}</section>`;
    } else {
      content = `<section class="mc-card lc-hero">
          <div class="lc-hero-text"><span class="mc-kicker">LEARNING CENTER</span><h2>學習中心</h2><p class="mc-muted">${lessons.length} 篇文章，從看懂 K 線、會用網站，到做出自己的策略。每篇都有圖解、實際算一次、常犯的錯和小測驗。</p></div>
          <div class="lc-progress"><div class="lc-progress-head"><span>已讀</span><b>${count(lessons)} <small>/ ${lessons.length} 篇</small></b></div><div class="lc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${lessons.length}" aria-valuenow="${count(lessons)}" aria-label="已讀文章"><i style="width:${Math.round(count(lessons) / lessons.length * 100)}%"></i></div>${next ? `<button type="button" class="lc-btn lc-primary lc-next" data-open="${esc(next.id)}"><span>下一篇：${esc(next.title.replace(/[：:].*$/, ''))}</span>${icon.arrow}</button>` : '<p class="lc-all-done">全部讀完了，記得定期回來複習。</p>'}</div>
        </section>
        ${challengeHTML()}${badgesHTML()}${routeHTML()}${topicsHTML()}
        <section class="mc-card lc-practice"><h3>讀完去做一次</h3><p class="mc-muted">讀完再實際操作，最容易記住。回測使用歷史資料，和實際投資分開看。</p><div class="lc-practice-actions"><button type="button" class="lc-btn" data-go="favorites">建立第一筆自選與觀察</button><button type="button" class="lc-btn" data-go="strategy">在策略工作台做一個策略</button><button type="button" class="lc-btn" data-go="screen-calendar">記錄並回顧選股</button><button type="button" class="lc-btn" data-go="workspace">寫下研究筆記</button></div></section>`;
    }
    main.innerHTML = `<div class="lc-layout"><div class="lc-grid">
        <aside class="lc-side" aria-label="學習目錄">${tocHTML()}</aside>
        <div class="lc-content">
          <div class="lc-mbar"><button type="button" class="lc-btn" data-sheet>${icon.list}目錄</button><span>${esc(query ? '搜尋：' + query : view ? (trackOf(view)?.name || '') : '學習首頁')}</span>${view || query ? `<button type="button" class="lc-btn lc-mbar-home" data-view="">${icon.home}</button>` : ''}</div>
          ${content}
          <p class="lc-disclaimer">${esc(A.disclaimer)}</p>${opts.feedback || ''}
        </div>
      </div></div>
      <div class="lc-sheet" hidden><div class="lc-sheet-back" data-sheet-close></div><div class="lc-sheet-panel" role="dialog" aria-modal="true" aria-label="學習目錄"><div class="lc-sheet-head"><b>學習目錄</b><button type="button" class="lc-icon-btn" data-sheet-close aria-label="關閉">${icon.close}</button></div>${tocHTML()}</div></div>`;
    main.querySelectorAll('.lc-calc').forEach(runCalc);
    const open = sget(K.open);
    if (open) { const d = main.querySelector(`.lc-content [data-lesson-id="${CSS.escape(open)}"]`); if (d) d.open = true; }
    clearInterval(timer); timer = setInterval(() => { const b = main.querySelector('[data-countdown]'); if (!b || !main.isConnected) { clearInterval(timer); return; } b.textContent = left(+b.dataset.countdown - Date.now()); }, 30000);
    const sheet = main.querySelector('.lc-sheet'), closeSheet = () => { if (sheet) sheet.hidden = true; document.documentElement.classList.remove('lc-sheet-open'); };

    if (!main.dataset.lcBound) {
      main.dataset.lcBound = '1';
      main.addEventListener('toggle', e => { const d = e.target.closest?.('.lc-lesson'); if (d && d.open) { sset(K.open, d.dataset.lessonId); main.querySelectorAll('.lc-content .lc-lesson[open]').forEach(x => { if (x !== d) x.open = false; }); main.querySelectorAll('.lc-toc button[data-open]').forEach(b => b.classList.toggle('is-current', b.dataset.open === d.dataset.lessonId)); } }, true);
      main.addEventListener('input', e => {
        const box = e.target.closest?.('.lc-calc'); if (box) { runCalc(box); return; }
        if (e.target.matches?.('[data-search]')) { clearTimeout(main._lcT); const v = e.target.value.trim(), inSheet = !!e.target.closest('.lc-sheet'); main._lcT = setTimeout(() => { main._lcQuery = v; render(main, opts); const inp = main.querySelector(inSheet ? '.lc-sheet [data-search]' : '.lc-side [data-search]'); if (inSheet) { main.querySelector('.lc-sheet').hidden = false; document.documentElement.classList.add('lc-sheet-open'); } if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }, 250); }
      });
      main.addEventListener('keydown', e => { if (e.key === 'Escape') { const s = main.querySelector('.lc-sheet'); if (s && !s.hidden) { s.hidden = true; document.documentElement.classList.remove('lc-sheet-open'); main.querySelector('[data-sheet]')?.focus(); } } });
    }
    main.onclick = e => {
      const b = e.target.closest('button, [data-sheet-close]'); if (!b) return;
      if (b.hasAttribute('data-sheet')) { sheet.hidden = false; document.documentElement.classList.add('lc-sheet-open'); sheet.querySelector('[data-search]')?.focus({ preventScroll: true }); return; }
      if (b.hasAttribute('data-sheet-close')) { closeSheet(); return; }
      if (b.dataset.filter) { sset(K.filter, b.dataset.filter); const inSheet = !!b.closest('.lc-sheet'); render(main, opts); if (inSheet) { main.querySelector('.lc-sheet').hidden = false; document.documentElement.classList.add('lc-sheet-open'); } return; }
      if (b.dataset.view !== undefined) { closeSheet(); main._lcQuery = ''; sset(K.view, b.dataset.view); render(main, opts); main.querySelector('.lc-content')?.scrollIntoView({ block: 'start', behavior: 'instant' }); return; }
      if (b.dataset.open) { const l = byId(b.dataset.open); if (!l) return; closeSheet(); main._lcQuery = ''; sset(K.view, l.track); sset(K.open, l.id); if (filter !== 'all' && !(filter === 'saved' ? saved.has(l.id) : !done.has(l.id))) sset(K.filter, 'all'); render(main, opts); const d = main.querySelector(`.lc-content [data-lesson-id="${CSS.escape(l.id)}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); } return; }
      if (b.dataset.check) {
        const [id, qi] = b.dataset.check.split(':'), l = byId(id), q = l.quiz[+qi || 0], box = b.closest('.lc-quiz'), pick = box.querySelector('input:checked'), out = box.querySelector('.lc-result');
        if (!pick) { out.textContent = '先選一個答案。'; out.className = 'lc-result'; return; }
        const ok = +pick.value === q.answer; out.textContent = (ok ? '答對了！' : '再想想。') + q.explain; out.className = 'lc-result ' + (ok ? 'is-ok' : 'is-no');
        box.querySelectorAll('label').forEach((x, i) => { x.classList.toggle('is-answer', ok && i === q.answer); x.classList.toggle('is-wrong', !ok && +pick.value === i); });
        return;
      }
      if (b.hasAttribute('data-ch-start')) {
        const box = main.querySelector('.lc-ch-quiz'); box.hidden = false;
        box.innerHTML = `<form class="lc-ch-form">${ch.quiz.map((q, qi) => `<fieldset class="lc-quiz"><legend>第 ${qi + 1} 題</legend><p>${esc(q.q)}</p><div class="lc-options">${q.options.map((o, i) => `<label><input type="radio" name="ch-${qi}" value="${i}" required><span>${esc(o)}</span></label>`).join('')}</div><p class="lc-result"></p></fieldset>`).join('')}<div class="lc-actions"><button type="submit" class="lc-btn lc-primary">交卷</button><span class="lc-ch-msg" role="status"></span></div></form>`;
        b.disabled = true; box.querySelector('fieldset')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        box.querySelector('form').onsubmit = async ev => {
          ev.preventDefault(); const f = ev.currentTarget; let score = 0;
          ch.quiz.forEach((q, qi) => { const pick = f.querySelector(`input[name="ch-${qi}"]:checked`), fs = f.querySelectorAll('fieldset')[qi], ok = pick && +pick.value === q.answer; if (ok) score++; fs.querySelectorAll('label').forEach((x, i) => { x.classList.toggle('is-answer', i === q.answer); x.classList.toggle('is-wrong', !!pick && +pick.value === i && !ok); }); const out = fs.querySelector('.lc-result'); out.textContent = (ok ? '答對了！' : '答錯了。') + q.explain; out.className = 'lc-result ' + (ok ? 'is-ok' : 'is-no'); });
          const passed = score >= ch.pass, msg = f.querySelector('.lc-ch-msg'), btn = f.querySelector('[type=submit]');
          msg.textContent = passed ? `答對 ${score}／${ch.quiz.length} 題，通過！正在儲存…` : `答對 ${score}／${ch.quiz.length} 題，還差 ${ch.pass - score} 題。看完解析可以再挑戰一次。`;
          if (!passed) { btn.textContent = '再挑戰一次'; btn.type = 'button'; btn.onclick = () => { f.reset(); f.querySelectorAll('.lc-result').forEach(r => { r.textContent = ''; }); f.querySelectorAll('label').forEach(x => x.classList.remove('is-answer', 'is-wrong')); btn.type = 'submit'; btn.textContent = '交卷'; btn.onclick = null; msg.textContent = ''; }; return; }
          btn.disabled = true;
          const prev = (opts.challenges || {})[ch.key]; const record = { id: ch.id, score: Math.max(score, prev?.score || 0), total: ch.quiz.length, passed: true, at: new Date().toISOString() };
          const ok = await opts.saveChallenge?.(ch.key, record); if (!ok) { msg.textContent = '答對 ' + score + ' 題，通過了，但紀錄沒有存成功，請稍後再交一次。'; btn.disabled = false; }
        };
        return;
      }
      if (b.dataset.read) { b.disabled = true; sset(K.open, b.dataset.read); opts.toggleRead(b.dataset.read); return; }
      if (b.dataset.save) { opts.toggleSave(b.dataset.save); return; }
      if (b.dataset.try) { const t = byId(b.dataset.try).try; if (t.member) opts.go(t.member); else if (t.site) { document.querySelector('[data-back]')?.click(); setTimeout(() => window._showView?.(t.site), 150); } return; }
      if (b.dataset.go) opts.go(b.dataset.go);
    };
  }
  window.AcademyLearningCenter = { render };
})();
