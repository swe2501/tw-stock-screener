/* 學習中心畫面（2026-10-22 改版）：四週學習計畫、學程分頁、圖解、實際算一次、常犯的錯、動手做、多題小測驗、小算盤。
   已讀紀錄沿用會員資料 member_learning；收藏沿用 AcademyResearch saved_lessons。 */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TRACK_KEY = 'academy.learning.track', OPEN_KEY = 'academy.learning.open';
  const sget = k => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
  const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
  const icon = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 4h11v16l-5.5-4-5.5 4z"/></svg>',
    calc: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h1M12 12h0M15.5 12h0M8.5 16h1M12 16h0M15.5 16h0"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.2M12 17h0"/></svg>',
    hand: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10V4.5a1.5 1.5 0 0 1 3 0V11M15 10.5V6a1.5 1.5 0 0 1 3 0v7.5a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.8-2.4L4.4 14.2a1.6 1.6 0 0 1 2.4-2.1L9 14"/></svg>'
  };
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const fee = (amt, disc) => Math.max(20, Math.floor(amt * 0.001425 * disc));

  // ── 小算盤 ──
  const CALC = {
    'buy-cost': {
      title: '小算盤：買一張要準備多少錢',
      fields: [['price', '股價（元）', 80], ['lots', '張數', 1], ['disc', '手續費折數（1＝不打折，0.6＝六折）', 1]],
      run: v => { const amt = v.price * 1000 * v.lots, f = fee(amt, v.disc); return [['股票金額', fmt(amt) + ' 元'], ['手續費', fmt(f) + ' 元（最低 20 元）'], ['T+2 要準備', fmt(amt + f) + ' 元', true]]; }
    },
    'round-trip': {
      title: '小算盤：一買一賣的成本',
      fields: [['buy', '買進價（元）', 100], ['sell', '賣出價（元）', 100], ['lots', '張數', 1], ['disc', '手續費折數', 1], ['tax', '證交稅率 %（股票 0.3、ETF 0.1）', 0.3]],
      run: v => { const b = v.buy * 1000 * v.lots, s = v.sell * 1000 * v.lots, fb = fee(b, v.disc), fs = fee(s, v.disc), tx = Math.floor(s * v.tax / 100), cost = fb + fs + tx, net = s - b - cost; return [['買進手續費', fmt(fb) + ' 元'], ['賣出手續費', fmt(fs) + ' 元'], ['證交稅', fmt(tx) + ' 元'], ['總成本', fmt(cost) + ' 元（' + fmt(cost / b * 100, 2) + '%）'], ['扣完成本損益', (net >= 0 ? '+' : '') + fmt(net) + ' 元', true]]; }
    },
    recovery: {
      title: '小算盤：虧損後要漲多少才回本',
      fields: [['loss', '虧損幅度 %', 30]],
      run: v => { const l = Math.min(99, Math.max(0, v.loss)); return [['剩下的本金', fmt(100 - l, 1) + '%'], ['要漲多少才回本', fmt(l / (100 - l) * 100, 1) + '%', true]]; }
    },
    position: {
      title: '小算盤：這筆最多買多少',
      fields: [['cap', '總資金（元）', 1000000], ['risk', '單筆最多虧總資金 %', 1], ['stop', '停損幅度 %', 5], ['price', '股價（元，選填）', 50]],
      run: v => { const lossMax = v.cap * v.risk / 100, pos = v.stop > 0 ? lossMax / (v.stop / 100) : NaN, lots = v.price > 0 ? Math.floor(pos / (v.price * 1000)) : NaN; return [['這筆最多虧', fmt(lossMax) + ' 元'], ['最多投入', fmt(pos) + ' 元', true], ['約可買', Number.isFinite(lots) ? fmt(lots) + ' 張' + (lots < 1 ? '（不到一張，可考慮零股）' : '') : '—']]; }
    }
  };
  const calcHTML = id => { const c = CALC[id]; if (!c) return ''; return `<section class="lc-calc" data-calc="${id}"><h4>${icon.calc}${esc(c.title)}</h4><div class="lc-calc-grid">${c.fields.map(([k, l, d]) => `<label><span>${esc(l)}</span><input type="number" inputmode="decimal" step="any" data-k="${k}" value="${d}"></label>`).join('')}</div><dl class="lc-calc-out"></dl></section>`; };
  const runCalc = box => { const c = CALC[box.dataset.calc]; if (!c) return; const v = {}; box.querySelectorAll('input[data-k]').forEach(i => { v[i.dataset.k] = parseFloat(i.value) || 0; }); box.querySelector('.lc-calc-out').innerHTML = c.run(v).map(([a, b, hl]) => `<div${hl ? ' class="is-key"' : ''}><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join(''); };

  /** opts: {completed:string[], saved:string[], toggleRead(id), toggleSave(id), go(route), feedback:string} */
  function render(main, opts) {
    const A = window.AcademyLearning, { tracks, lessons } = A, plan = A.plan || [], done = new Set(opts.completed || []), saved = new Set(opts.saved || []);
    const byId = id => lessons.find(l => l.id === id);
    let track = sget(TRACK_KEY); if (track !== 'saved' && !tracks.some(t => t.id === track)) track = '';
    const count = list => list.filter(l => done.has(l.id)).length;
    const weekIdx = Math.max(0, plan.findIndex(w => w.ids.some(id => !done.has(id))));
    const curWeek = plan[weekIdx];
    const next = (curWeek && curWeek.ids.map(byId).find(l => l && !done.has(l.id))) || lessons.find(l => !done.has(l.id));
    const tabs = [{ id: '', name: '全部課程', list: lessons }, ...tracks.map(t => ({ id: t.id, name: t.name, list: lessons.filter(l => l.track === t.id) }))];
    if (saved.size) tabs.push({ id: 'saved', name: '我的收藏', list: lessons.filter(l => saved.has(l.id)) });
    const current = tabs.find(t => t.id === track) || tabs[0];
    const fig = id => { const s = window.AcademyLearningFigures?.render(id); return s ? `<figure class="lc-fig">${s}</figure>` : ''; };
    const quizHTML = l => (l.quiz || []).map((q, qi) => `<fieldset class="lc-quiz" data-quiz="${esc(l.id)}:${qi}"><legend>小測驗 ${qi + 1}／${l.quiz.length}</legend><p>${esc(q.q)}</p><div class="lc-options">${q.options.map((o, i) => `<label><input type="radio" name="q-${esc(l.id)}-${qi}" value="${i}"><span>${esc(o)}</span></label>`).join('')}</div><button type="button" class="lc-btn" data-check="${esc(l.id)}:${qi}">檢查答案</button><p class="lc-result" role="status"></p></fieldset>`).join('');
    const lessonHTML = (l, n) => {
      const isDone = done.has(l.id), t = tracks.find(t => t.id === l.track);
      return `<details class="lc-lesson${isDone ? ' is-done' : ''}" data-lesson-id="${esc(l.id)}">
        <summary><span class="lc-mark" aria-hidden="true">${isDone ? icon.check : n}</span><span class="lc-sum"><span class="lc-meta"><span class="lc-level lc-level-${l.level === '入門' ? 'a' : l.level === '基礎' ? 'b' : 'c'}">${esc(l.level)}</span><span>${icon.clock}${l.minutes} 分鐘</span>${track ? '' : `<span class="lc-track-name">${esc(t?.name || '')}</span>`}</span><b>${esc(l.title)}</b><small>${esc(l.summary)}</small></span><span class="lc-state">${isDone ? '已完成' : '開始'}</span></summary>
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
            <button type="button" class="lc-btn${isDone ? '' : ' lc-primary'}" data-read="${esc(l.id)}">${isDone ? '標為未完成' : icon.check + ' 完成這一課'}</button>
            <button type="button" class="lc-btn" data-save="${esc(l.id)}" aria-pressed="${saved.has(l.id)}">${icon.bookmark} ${saved.has(l.id) ? '已收藏' : '收藏'}</button>
            ${l.try ? `<button type="button" class="lc-btn lc-try" data-try="${esc(l.id)}">${esc(l.try.label)} ${icon.arrow}</button>` : ''}
          </div>
        </div></details>`;
    };
    const planHTML = plan.length ? `<section class="mc-card lc-plan" aria-labelledby="lcPlanTitle">
        <header class="lc-plan-head"><div><h3 id="lcPlanTitle">四週學習計畫</h3><p>每天一課、10 分鐘以內。照順序上，四週後你就能自己做出一個策略、看懂回測。</p></div></header>
        <ol class="lc-weeks">${plan.map((w, i) => { const ls = w.ids.map(byId).filter(Boolean), c = count(ls), all = c === ls.length, cur = i === weekIdx && !all; return `<li class="lc-week${all ? ' is-done' : ''}${cur ? ' is-current' : ''}"><div class="lc-week-top"><span class="lc-week-no">第 ${w.week} 週</span>${all ? `<span class="lc-week-badge">${icon.check}完成</span>` : cur ? '<span class="lc-week-badge is-now">進行中</span>' : ''}</div><b>${esc(w.name)}</b><p>${esc(w.goal)}</p><div class="lc-bar lc-bar-sm"><i style="width:${Math.round(c / ls.length * 100)}%"></i></div><small>${c} / ${ls.length} 課</small></li>`; }).join('')}</ol>
        ${curWeek && count(curWeek.ids.map(byId).filter(Boolean)) < curWeek.ids.length ? `<div class="lc-week-todo"><span>第 ${curWeek.week} 週還沒上的課</span><div>${curWeek.ids.map(byId).filter(l => l && !done.has(l.id)).map(l => `<button type="button" class="lc-chip" data-open="${esc(l.id)}">${esc(l.title)}</button>`).join('')}</div></div>` : ''}
      </section>` : '';
    main.innerHTML = `<section class="mc-card lc-hero">
        <div class="lc-hero-text"><span class="mc-kicker">LEARNING CENTER</span><h2>學習中心</h2><p class="mc-muted">從看懂 K 線、會用網站，到做出自己的策略。每課都有圖解、實際算一次、常犯的錯和小測驗，讀完直接到網站上做一次。</p></div>
        <div class="lc-progress"><div class="lc-progress-head"><span>整體進度</span><b>${count(lessons)} <small>/ ${lessons.length} 課</small></b></div><div class="lc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${lessons.length}" aria-valuenow="${count(lessons)}" aria-label="已完成課程"><i style="width:${Math.round(count(lessons) / lessons.length * 100)}%"></i></div>${next ? `<button type="button" class="lc-btn lc-primary lc-next" data-open="${esc(next.id)}">下一課：${esc(next.title)} ${icon.arrow}</button>` : '<p class="lc-all-done">全部課程都完成了，記得定期回來複習。</p>'}</div>
      </section>
      ${planHTML}
      <div class="lc-tabs" role="tablist" aria-label="學程">${tabs.map(t => `<button type="button" role="tab" data-track="${t.id}" aria-selected="${t.id === current.id}"><span>${esc(t.name)}</span><small>${count(t.list)}/${t.list.length}</small></button>`).join('')}</div>
      <section class="mc-card lc-list">
        ${current.id && current.id !== 'saved' ? `<header class="lc-list-head"><h3>${esc(current.name)}</h3><p>${esc(tracks.find(t => t.id === current.id).desc)}</p></header>` : current.id === 'saved' ? '<header class="lc-list-head"><h3>我的收藏</h3><p>收藏的課程放在這裡，方便複習。</p></header>' : ''}
        ${current.list.length ? current.list.map((l, i) => lessonHTML(l, i + 1)).join('') : '<p class="mc-muted">這裡還沒有課程。</p>'}
      </section>
      <section class="mc-card lc-practice"><h3>跟著做一次</h3><p class="mc-muted">讀完再實際操作，最容易記住。回測使用歷史資料，和實際投資分開看。</p><div class="lc-practice-actions"><button type="button" class="lc-btn" data-go="favorites">建立第一筆自選與觀察</button><button type="button" class="lc-btn" data-go="strategy">在策略工作台做一個策略</button><button type="button" class="lc-btn" data-go="screen-calendar">記錄並回顧選股</button><button type="button" class="lc-btn" data-go="workspace">寫下研究結論</button></div></section>
      <p class="lc-disclaimer">${esc(A.disclaimer)}</p>${opts.feedback || ''}`;
    main.querySelectorAll('.lc-calc').forEach(runCalc);
    const open = sget(OPEN_KEY);
    if (open) { const d = main.querySelector(`[data-lesson-id="${CSS.escape(open)}"]`); if (d) d.open = true; }
    if (!main.dataset.lcToggle) {
      main.dataset.lcToggle = '1';
      main.addEventListener('toggle', e => { const d = e.target.closest?.('.lc-lesson'); if (d && d.open) { sset(OPEN_KEY, d.dataset.lessonId); main.querySelectorAll('.lc-lesson[open]').forEach(x => { if (x !== d) x.open = false; }); } }, true);
      main.addEventListener('input', e => { const box = e.target.closest?.('.lc-calc'); if (box) runCalc(box); });
    }
    main.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.track !== undefined) { sset(TRACK_KEY, b.dataset.track); render(main, opts); return; }
      if (b.dataset.open) { const l = byId(b.dataset.open); if (!l) return; sset(TRACK_KEY, ''); sset(OPEN_KEY, l.id); render(main, opts); main.querySelector(`[data-lesson-id="${CSS.escape(l.id)}"]`)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); return; }
      if (b.dataset.check) {
        const [id, qi] = b.dataset.check.split(':'), l = byId(id), q = l.quiz[+qi || 0], box = b.closest('.lc-quiz'), pick = box.querySelector('input:checked'), out = box.querySelector('.lc-result');
        if (!pick) { out.textContent = '先選一個答案。'; out.className = 'lc-result'; return; }
        const ok = +pick.value === q.answer; out.textContent = (ok ? '答對了！' : '再想想。') + q.explain; out.className = 'lc-result ' + (ok ? 'is-ok' : 'is-no');
        box.querySelectorAll('label').forEach((x, i) => { x.classList.toggle('is-answer', ok && i === q.answer); x.classList.toggle('is-wrong', !ok && +pick.value === i); });
        return;
      }
      if (b.dataset.read) { b.disabled = true; sset(OPEN_KEY, b.dataset.read); opts.toggleRead(b.dataset.read); return; }
      if (b.dataset.save) { opts.toggleSave(b.dataset.save); return; }
      if (b.dataset.try) { const t = byId(b.dataset.try).try; if (t.member) opts.go(t.member); else if (t.site) { document.querySelector('[data-back]')?.click(); setTimeout(() => window._showView?.(t.site), 150); } return; }
      if (b.dataset.go) opts.go(b.dataset.go);
    };
  }
  window.AcademyLearningCenter = { render };
})();
