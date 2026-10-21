/* 學習中心畫面：學程分頁、課程內容、小測驗、去試試看。已讀紀錄沿用會員資料 member_learning。 */
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
    bookmark: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 4h11v16l-5.5-4-5.5 4z"/></svg>'
  };
  /** opts: {completed:string[], saved:string[], toggleRead(id), toggleSave(id), go(route), feedback:string} */
  function render(main, opts) {
    const A = window.AcademyLearning, { tracks, lessons } = A, done = new Set(opts.completed || []), saved = new Set(opts.saved || []);
    let track = sget(TRACK_KEY); if (track !== 'saved' && !tracks.some(t => t.id === track)) track = '';
    const count = list => list.filter(l => done.has(l.id)).length;
    const next = lessons.find(l => !done.has(l.id));
    const tabs = [{ id: '', name: '全部課程', list: lessons }, ...tracks.map(t => ({ id: t.id, name: t.name, list: lessons.filter(l => l.track === t.id) }))];
    if (saved.size) tabs.push({ id: 'saved', name: '我的收藏', list: lessons.filter(l => saved.has(l.id)) });
    const current = tabs.find(t => t.id === track) || tabs[0];
    const lessonHTML = (l, n) => {
      const isDone = done.has(l.id), t = tracks.find(t => t.id === l.track);
      return `<details class="lc-lesson${isDone ? ' is-done' : ''}" data-lesson-id="${esc(l.id)}">
        <summary><span class="lc-mark" aria-hidden="true">${isDone ? icon.check : n}</span><span class="lc-sum"><span class="lc-meta"><span class="lc-level lc-level-${l.level === '入門' ? 'a' : l.level === '基礎' ? 'b' : 'c'}">${esc(l.level)}</span><span>${icon.clock}${l.minutes} 分鐘</span>${track ? '' : `<span class="lc-track-name">${esc(t?.name || '')}</span>`}</span><b>${esc(l.title)}</b><small>${esc(l.summary)}</small></span><span class="lc-state">${isDone ? '已完成' : '開始'}</span></summary>
        <div class="lc-body">
          ${l.sections.map(([h, p]) => `<section><h4>${esc(h)}</h4><p>${esc(p)}</p></section>`).join('')}
          <aside class="lc-points"><b>重點整理</b><ul>${l.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></aside>
          ${l.quiz ? `<fieldset class="lc-quiz" data-quiz="${esc(l.id)}"><legend>小測驗</legend><p>${esc(l.quiz.q)}</p><div class="lc-options">${l.quiz.options.map((o, i) => `<label><input type="radio" name="q-${esc(l.id)}" value="${i}"><span>${esc(o)}</span></label>`).join('')}</div><button type="button" class="lc-btn" data-check="${esc(l.id)}">檢查答案</button><p class="lc-result" role="status"></p></fieldset>` : ''}
          <div class="lc-actions">
            <button type="button" class="lc-btn${isDone ? '' : ' lc-primary'}" data-read="${esc(l.id)}">${isDone ? '標為未完成' : icon.check + ' 完成這一課'}</button>
            <button type="button" class="lc-btn" data-save="${esc(l.id)}" aria-pressed="${saved.has(l.id)}">${icon.bookmark} ${saved.has(l.id) ? '已收藏' : '收藏'}</button>
            ${l.try ? `<button type="button" class="lc-btn lc-try" data-try="${esc(l.id)}">${esc(l.try.label)} ${icon.arrow}</button>` : ''}
          </div>
        </div></details>`;
    };
    main.innerHTML = `<section class="mc-card lc-hero">
        <div class="lc-hero-text"><span class="mc-kicker">LEARNING CENTER</span><h2>學習中心</h2><p class="mc-muted">從看懂 K 線到做出自己的策略。依學程循序漸進，每課 3～7 分鐘，讀完可以直接到網站上試一次。</p></div>
        <div class="lc-progress"><div class="lc-progress-head"><span>整體進度</span><b>${count(lessons)} <small>/ ${lessons.length} 課</small></b></div><div class="lc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${lessons.length}" aria-valuenow="${count(lessons)}" aria-label="已完成課程"><i style="width:${Math.round(count(lessons) / lessons.length * 100)}%"></i></div>${next ? `<button type="button" class="lc-btn lc-primary lc-next" data-open="${esc(next.id)}">下一課：${esc(next.title)} ${icon.arrow}</button>` : '<p class="lc-all-done">全部課程都完成了，記得定期回來複習。</p>'}</div>
      </section>
      <div class="lc-tabs" role="tablist" aria-label="學程">${tabs.map(t => `<button type="button" role="tab" data-track="${t.id}" aria-selected="${t.id === current.id}"><span>${esc(t.name)}</span><small>${count(t.list)}/${t.list.length}</small></button>`).join('')}</div>
      <section class="mc-card lc-list">
        ${current.id && current.id !== 'saved' ? `<header class="lc-list-head"><h3>${esc(current.name)}</h3><p>${esc(tracks.find(t => t.id === current.id).desc)}</p></header>` : current.id === 'saved' ? '<header class="lc-list-head"><h3>我的收藏</h3><p>收藏的課程放在這裡，方便複習。</p></header>' : ''}
        ${current.list.length ? current.list.map((l, i) => lessonHTML(l, i + 1)).join('') : '<p class="mc-muted">這裡還沒有課程。</p>'}
      </section>
      <section class="mc-card lc-practice"><h3>跟著做一次</h3><p class="mc-muted">讀完再實際操作，最容易記住。回測使用歷史資料，與實際投資分開看。</p><div class="lc-practice-actions"><button type="button" class="lc-btn" data-go="favorites">建立第一筆自選與觀察</button><button type="button" class="lc-btn" data-go="strategy">在策略工作台做一個策略</button><button type="button" class="lc-btn" data-go="screen-calendar">記錄並回顧選股</button><button type="button" class="lc-btn" data-go="workspace">寫下研究結論</button></div></section>
      <p class="lc-disclaimer">${esc(A.disclaimer)}</p>${opts.feedback || ''}`;
    const open = sget(OPEN_KEY);
    if (open) { const d = main.querySelector(`[data-lesson-id="${CSS.escape(open)}"]`); if (d) d.open = true; }
    if (!main.dataset.lcToggle) main.dataset.lcToggle = '1', main.addEventListener('toggle', e => { const d = e.target.closest?.('.lc-lesson'); if (d && d.open) { sset(OPEN_KEY, d.dataset.lessonId); main.querySelectorAll('.lc-lesson[open]').forEach(x => { if (x !== d) x.open = false; }); } }, true);
    main.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.track !== undefined) { sset(TRACK_KEY, b.dataset.track); render(main, opts); return; }
      if (b.dataset.open) { const l = lessons.find(x => x.id === b.dataset.open); sset(TRACK_KEY, ''); sset(OPEN_KEY, l.id); render(main, opts); main.querySelector(`[data-lesson-id="${CSS.escape(l.id)}"]`)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); return; }
      if (b.dataset.check) { const l = lessons.find(x => x.id === b.dataset.check), box = b.closest('.lc-quiz'), pick = box.querySelector('input:checked'), out = box.querySelector('.lc-result'); if (!pick) { out.textContent = '先選一個答案。'; out.className = 'lc-result'; return; } const ok = +pick.value === l.quiz.answer; out.textContent = (ok ? '答對了！' : '再想想。') + l.quiz.explain; out.className = 'lc-result ' + (ok ? 'is-ok' : 'is-no'); box.querySelectorAll('label').forEach((x, i) => { x.classList.toggle('is-answer', ok && i === l.quiz.answer); x.classList.toggle('is-wrong', !ok && +pick.value === i); }); return; }
      if (b.dataset.read) { b.disabled = true; sset(OPEN_KEY, b.dataset.read); opts.toggleRead(b.dataset.read); return; }
      if (b.dataset.save) { opts.toggleSave(b.dataset.save); return; }
      if (b.dataset.try) { const t = lessons.find(x => x.id === b.dataset.try).try; if (t.member) opts.go(t.member); else if (t.site) { document.querySelector('[data-back]')?.click(); setTimeout(() => window._showView?.(t.site), 150); } return; }
      if (b.dataset.go) opts.go(b.dataset.go);
    };
  }
  window.AcademyLearningCenter = { render };
})();
