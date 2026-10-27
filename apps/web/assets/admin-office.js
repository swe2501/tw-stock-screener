/* AI 研究室（後台管理分頁，僅管理者）— 2026-10-27
   7 個 AI 角色＝既有排程分組；狀態來自本機排程打卡（scripts/office_step.py → admin_settings office:<角色>），
   經 /api/auth action=admin_office 取得。像素風辦公室：狀態燈、對話泡泡（真實產出摘要）、交棒動畫、閒置時去倒咖啡。
   window.AdminOffice.show(容器, post 函式) / hide() */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ORDER = ['chip', 'tech', 'macro', 'risk', 'etf', 'data'];          // 夜間排程交棒順序
  var SEATS = {
    news: { cx: 120, y: 190 }, chip: { cx: 330, y: 190 }, tech: { cx: 540, y: 190 }, macro: { cx: 750, y: 190 },
    risk: { cx: 225, y: 360 }, etf: { cx: 435, y: 360 }, data: { cx: 645, y: 360 }
  };
  var LOOK = {
    news: { n: '新聞研究員', shirt: '#4a90e2', hair: '#2d2016' }, chip: { n: '籌碼分析師', shirt: '#8e6bbf', hair: '#5a3a1c' },
    tech: { n: '技術分析師', shirt: '#e08a3c', hair: '#1f1f1f' }, macro: { n: '總經研究員', shirt: '#3c9a8f', hair: '#7a4a24' },
    risk: { n: '風控', shirt: '#c0567a', hair: '#2d2016' }, etf: { n: 'ETF 研究員', shirt: '#5c8a3a', hair: '#3a2a1a' },
    data: { n: '資料管理員', shirt: '#6b7a8f', hair: '#3a2a1a' }
  };
  var LIMIT_MIN = { news: 90, chip: 150, tech: 60, macro: 60, risk: 60, etf: 90, data: 120 };
  var ST_COLOR = { done: '#5aa469', work: '#4a90e2', stuck: '#d9534f', idle: '#9aa5b1' };
  var ST_TEXT = { done: '完成', work: '工作中', stuck: '卡住', idle: '待命' };
  var AISLE = 272, COFFEE = { x: 846, y: 140 };

  var box, post, data = {}, svg, sprites = {}, walker, wTag, timers = [], selected = null, tick = 0, blink = 0;

  function R(p, x, y, w, h, f) { var r = document.createElementNS(NS, 'rect'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('fill', f); p.appendChild(r); return r; }
  function T(p, x, y, s, c, anchor) { var t = document.createElementNS(NS, 'text'); t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('font-size', '12'); t.setAttribute('fill', c); if (anchor) t.setAttribute('text-anchor', anchor); t.textContent = s; p.appendChild(t); return t; }
  function G(p) { var g = document.createElementNS(NS, 'g'); p.appendChild(g); return g; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mins(iso) { var t = Date.parse(iso || ''); return isFinite(t) ? (Date.now() - t) / 60000 : Infinity; }
  function hm(iso) { var m = /T(\d\d:\d\d)/.exec(iso || ''); return m ? m[1] : '—'; }
  function today() { var d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); }

  function person(p, shirt, hair) {
    R(p, 2, 0, 12, 4, hair); R(p, 2, 4, 12, 8, '#f2c9a0'); R(p, 4, 7, 2, 2, '#2b2b2b'); R(p, 10, 7, 2, 2, '#2b2b2b');
    R(p, 0, 12, 16, 12, shirt); R(p, -3, 13, 3, 8, shirt); R(p, 16, 13, 3, 8, shirt);
    var l1 = R(p, 3, 24, 4, 4, '#3d4f63'), l2 = R(p, 9, 24, 4, 4, '#3d4f63');
    return [l1, l2];
  }

  // 依打卡資料判定目前狀態（工作太久、背景心跳中斷都算卡住）
  function status(a) {
    var s = data[a];
    if (!s || !s.status) return { k: 'idle' };
    var k = s.status;
    if (k === 'work') {
      var limit = LIMIT_MIN[a];
      if (a === 'tech' && s.current === 'intraday_push') limit = 420;
      var over = mins(s.since);
      if (s.heartbeat && mins(s.heartbeat) > 25) return { k: 'stuck', why: '超過 ' + Math.round(mins(s.heartbeat)) + ' 分鐘沒有回報' };
      if (over > limit) return { k: 'stuck', why: '已工作 ' + Math.round(over) + ' 分鐘（上限 ' + limit + '）' };
      if (s.date && s.date !== today() && !s.heartbeat) return { k: 'stuck', why: '狀態停在 ' + s.date };
    }
    if (k === 'done' && s.date !== today()) return { k: 'idle' };
    return { k: k };
  }

  function build() {
    box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
      + '<div style="font-size:13px;color:var(--text-muted)">每個角色＝一組既有排程；泡泡是它最新的真實產出。點角色看今日工作紀錄。</div>'
      + '<div style="display:flex;align-items:center;gap:10px"><span id="aoUpd" style="font-size:12px;color:var(--text-muted)"></span>'
      + '<button type="button" id="aoRefresh" style="padding:4px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);cursor:pointer;font-size:12px">重新整理</button></div></div>'
      + '<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden"><svg id="aoSvg" viewBox="0 0 900 470" width="100%" shape-rendering="crispEdges" style="display:block;background:#e8dcc6" role="img" aria-label="AI 研究室像素辦公室"></svg></div>'
      + '<div id="aoDetail" style="margin-top:12px"></div>';
    svg = box.querySelector('#aoSvg');
    box.querySelector('#aoRefresh').onclick = load;
    var tl = G(svg);
    for (var y = 70; y < 470; y += 20) for (var x = 0; x < 900; x += 20) if (((x + y) / 20) % 2 === 0) R(tl, x, y, 20, 20, '#e0d2b8');
    R(svg, 0, 0, 900, 64, '#7d93ab'); R(svg, 0, 64, 900, 6, '#5c6f86');
    R(svg, 30, 12, 96, 40, '#cfe9fb'); var wf = R(svg, 30, 12, 96, 40, 'none'); wf.setAttribute('stroke', '#3d4f63'); wf.setAttribute('stroke-width', '3'); R(svg, 77, 12, 3, 40, '#3d4f63');
    R(svg, 160, 12, 220, 42, '#f7f7f2'); var bf = R(svg, 160, 12, 220, 42, 'none'); bf.setAttribute('stroke', '#3d4f63'); bf.setAttribute('stroke-width', '3');
    T(svg, 172, 30, '今日盤後任務', '#2b3a4a');
    svg._bar = G(svg); svg._barTxt = T(svg, 368, 30, '', '#2b3a4a', 'end');
    R(svg, 410, 16, 290, 34, '#2b3442');
    [['done', 420], ['work', 480], ['stuck', 552], ['idle', 612]].forEach(function (p) { R(svg, p[1], 29, 8, 8, ST_COLOR[p[0]]); T(svg, p[1] + 12, 37, ST_TEXT[p[0]], '#ffffff'); });
    svg._clock = T(svg, 860, 40, '', '#ffffff', 'end');
    R(svg, COFFEE.x - 10, 96, 34, 40, '#5b4636'); R(svg, COFFEE.x - 6, 100, 26, 14, '#2b3442'); R(svg, COFFEE.x + 2, 116, 10, 8, '#ffffff'); T(svg, COFFEE.x + 7, 152, '咖啡', '#5b4636', 'middle');
    R(svg, 868, 384, 20, 26, '#8b5e3c'); R(svg, 862, 366, 32, 20, '#4f9a5c'); R(svg, 868, 358, 20, 10, '#5fb06c');
    Object.keys(SEATS).forEach(function (a) {
      var s = SEATS[a], cx = s.cx, y = s.y, g = G(svg); g.style.cursor = 'pointer';
      g.addEventListener('click', function () { selected = a; detail(); });
      var bub = G(g); R(bub, cx - 80, y - 74, 160, 40, '#ffffff'); var bo = R(bub, cx - 80, y - 74, 160, 40, 'none'); bo.setAttribute('stroke', '#2b3442'); bo.setAttribute('stroke-width', '2');
      R(bub, cx - 6, y - 34, 8, 6, '#ffffff'); R(bub, cx - 6, y - 34, 2, 6, '#2b3442'); R(bub, cx + 2, y - 34, 2, 6, '#2b3442');
      var b1 = T(bub, cx - 72, y - 57, '', '#1f2933'), b2 = T(bub, cx - 72, y - 41, '', '#52606d');
      var dot = R(g, cx - 19, y - 36, 6, 6, ST_COLOR.idle);
      R(g, cx - 60, y - 2, 120, 8, '#a87449'); R(g, cx - 60, y + 6, 120, 22, '#8b5e3c'); R(g, cx - 56, y + 28, 6, 8, '#6b4529'); R(g, cx + 50, y + 28, 6, 8, '#6b4529');
      R(g, cx + 8, y - 24, 30, 22, '#2b3442'); var sc = R(g, cx + 11, y - 21, 24, 15, '#7fd0ff'); R(g, cx + 20, y - 2, 8, 2, '#2b3442');
      var warn = G(g); R(warn, cx + 21, y - 19, 4, 7, '#ffffff'); R(warn, cx + 21, y - 10, 4, 3, '#ffffff');
      R(g, cx - 30, y + 2, 22, 3, '#f7f7f2');
      R(g, cx - 56, y + 40, 112, 18, '#2b3442'); T(g, cx, y + 53, LOOK[a].n, '#ffffff', 'middle');
      var pg = G(svg); pg.style.pointerEvents = 'none'; var legs = person(pg, LOOK[a].shirt, LOOK[a].hair);
      var home = { x: cx - 24, y: y - 26 };
      sprites[a] = { g: g, pg: pg, legs: legs, dot: dot, sc: sc, warn: warn, b1: b1, b2: b2, home: home, x: home.x, y: home.y, path: null, wait: 0 };
      place(sprites[a]);
    });
    var wg = G(svg); wg.style.pointerEvents = 'none'; var wl = person(wg, '#8e6bbf', '#5a3a1c'); R(wg, 17, 10, 10, 12, '#f7f7f2'); R(wg, 19, 13, 6, 1, '#9aa5b1'); R(wg, 19, 16, 6, 1, '#9aa5b1');
    walker = { g: wg, legs: wl, x: 0, y: 0, path: null, active: false };
    wTag = G(svg); R(wTag, 0, 0, 132, 18, '#fff3c4'); var tb = R(wTag, 0, 0, 132, 18, 'none'); tb.setAttribute('stroke', '#b8860b'); wTag._t = T(wTag, 66, 13, '', '#6b4e00', 'middle');
    wg.style.display = 'none'; wTag.style.display = 'none';
  }

  // 泡泡寬 160，文字超過可用寬度（144）才截斷加「…」（依實際量到的字寬，不用固定字數）
  function fit(t, s) {
    s = String(s || ''); t.textContent = s;
    try {
      if (t.getComputedTextLength() <= 144) return;
      while (s.length > 1) { s = s.slice(0, -1); t.textContent = s + '…'; if (t.getComputedTextLength() <= 144) return; }
    } catch (_) { t.textContent = s.slice(0, 13); }
  }

  function place(sp) { sp.pg.setAttribute('transform', 'translate(' + sp.x + ',' + sp.y + ')'); }

  function paint() {
    var done = 0, total = ORDER.length + 1;
    Object.keys(SEATS).forEach(function (a) {
      var sp = sprites[a], st = status(a), s = data[a] || {}, b = s.bubble || [];
      sp.state = st.k;
      sp.dot.setAttribute('fill', ST_COLOR[st.k]);
      sp.sc.setAttribute('fill', st.k === 'stuck' ? '#d9534f' : st.k === 'work' ? '#7fd0ff' : '#9fb6c8');
      sp.warn.style.display = st.k === 'stuck' ? '' : 'none';
      fit(sp.b1, b[0] || (st.k === 'idle' ? '待命中' : '—'));
      fit(sp.b2, st.k === 'stuck' && st.why ? st.why : (b[1] || ''));
      sp.b2.setAttribute('fill', st.k === 'stuck' ? '#c0392b' : '#52606d');
      if (st.k === 'done') done++;
    });
    while (svg._bar.firstChild) svg._bar.removeChild(svg._bar.firstChild);
    R(svg._bar, 172, 38, 150, 6, '#d5d5cf');
    Object.keys(SEATS).forEach(function (a, i) { var k = sprites[a].state; R(svg._bar, 172 + i * 21.4, 38, 20, 6, ST_COLOR[k]); });
    svg._barTxt.textContent = done + '/' + total + ' 完成';
    var t = new Date(); svg._clock.textContent = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
    var u = box.querySelector('#aoUpd'); if (u) u.textContent = '更新 ' + svg._clock.textContent;
    planHandoff();
    if (selected) detail();
  }

  // 交棒：上一個角色剛做完（15 分鐘內）、下一個正在工作 → 拿文件走過去
  function planHandoff() {
    var pair = null;
    for (var i = 1; i < ORDER.length; i++) {
      var A = ORDER[i - 1], B = ORDER[i], sa = data[A] || {}, sb = data[B] || {};
      if (status(B).k !== 'work') continue;
      var ends = (sa.steps || []).map(function (x) { return x.end; }).filter(Boolean).sort();
      var lastEnd = ends[ends.length - 1];
      if (lastEnd && mins(lastEnd) < 15) pair = [A, B];
    }
    if (!pair) { walker.active = false; walker.g.style.display = 'none'; wTag.style.display = 'none'; return; }
    if (walker.active && walker.pair && walker.pair.join() === pair.join()) return;
    walker.pair = pair; walker.active = true;
    var a = sprites[pair[0]].home, b = sprites[pair[1]].home;
    walker.from = { x: a.x + 30, y: a.y }; walker.to = { x: b.x - 30, y: b.y };
    walker.x = walker.from.x; walker.y = walker.from.y; walker.dir = 1;
    wTag._t.textContent = '交棒：' + LOOK[pair[0]].n + '→' + LOOK[pair[1]].n;
    walker.g.style.display = ''; wTag.style.display = '';
  }

  function routeTo(sp, tx, ty) {
    var pts = [{ x: sp.x, y: AISLE }, { x: tx, y: AISLE }, { x: tx, y: ty }];
    if (Math.abs(sp.y - ty) < 4) pts = [{ x: tx, y: ty }];
    return pts;
  }

  function step() {
    tick++;
    Object.keys(sprites).forEach(function (a) {
      var sp = sprites[a];
      if (!sp.path && sp.state !== 'work' && sp.state !== 'stuck' && Math.random() < 0.0025) {
        sp.path = routeTo(sp, COFFEE.x - 30, COFFEE.y - 10).concat([{ wait: 45 }], [{ x: COFFEE.x - 30, y: AISLE }, { x: sp.home.x, y: AISLE }, { x: sp.home.x, y: sp.home.y }]);
      }
      if (sp.path && (sp.state === 'work' || sp.state === 'stuck')) sp.path = [{ x: sp.x, y: AISLE }, { x: sp.home.x, y: AISLE }, { x: sp.home.x, y: sp.home.y }];
      if (!sp.path) return;
      var p = sp.path[0];
      if (p.wait != null) { p.wait--; if (p.wait <= 0) sp.path.shift(); return; }
      var dx = p.x - sp.x, dy = p.y - sp.y, d = Math.hypot(dx, dy);
      if (d < 3) { sp.x = p.x; sp.y = p.y; sp.path.shift(); if (!sp.path.length) sp.path = null; }
      else { sp.x += dx / d * 3; sp.y += dy / d * 3; }
      var phase = tick % 8 < 4; sp.legs[0].setAttribute('height', phase ? 4 : 2); sp.legs[1].setAttribute('height', phase ? 2 : 4);
      place(sp);
    });
    if (walker.active) {
      var tx = walker.dir > 0 ? walker.to : walker.from, dx = tx.x - walker.x, dy = (tx.y - walker.y), d = Math.hypot(dx, dy);
      if (d < 3) walker.dir = -walker.dir; else { walker.x += dx / d * 2.4; walker.y += dy / d * 2.4; }
      var bob = tick % 8 < 4 ? 0 : 1;
      walker.g.setAttribute('transform', 'translate(' + walker.x + ',' + (walker.y + 34 + bob) + ')');
      walker.legs[0].setAttribute('height', bob ? 2 : 4); walker.legs[1].setAttribute('height', bob ? 4 : 2);
      wTag.setAttribute('transform', 'translate(' + (walker.x - 58) + ',' + (walker.y + 8) + ')');
    }
    if (tick % 15 === 0) {
      blink ^= 1;
      Object.keys(sprites).forEach(function (a) { var sp = sprites[a]; if (sp.state === 'work' || sp.state === 'stuck') sp.dot.setAttribute('opacity', blink ? 0.35 : 1); else sp.dot.setAttribute('opacity', 1); if (sp.state === 'work') sp.sc.setAttribute('fill', blink ? '#b7e6ff' : '#7fd0ff'); });
    }
  }

  function detail() {
    var el = box && box.querySelector('#aoDetail'); if (!el || !selected) return;
    var s = data[selected] || {}, st = status(selected), steps = (s.steps || []).slice().reverse().slice(0, 30);
    el.innerHTML = '<div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--surface)">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-size:14px">' + esc(LOOK[selected].n) + '</b>'
      + '<span style="font-size:12px;padding:2px 10px;border-radius:999px;color:#fff;background:' + ST_COLOR[st.k] + '">' + ST_TEXT[st.k] + (s.current ? '・' + esc(s.current) : '') + '</span></div>'
      + '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">' + esc((s.bubble || []).join('｜')) + (st.why ? '｜' + esc(st.why) : '') + '</div>'
      + (steps.length ? '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px"><thead><tr style="color:var(--text-muted);text-align:left"><th style="padding:4px 6px">開始</th><th style="padding:4px 6px">結束</th><th style="padding:4px 6px">步驟</th><th style="padding:4px 6px;text-align:right">耗時</th><th style="padding:4px 6px">結果</th></tr></thead><tbody>'
        + steps.map(function (x) { var r = x.end ? (x.ok ? '<span style="color:#3c8f4f">成功</span>' : '<span style="color:#c0392b">失敗' + (x.detail ? '（' + esc(x.detail) + '）' : '') + '</span>') : '<span style="color:#2f6fb3">執行中</span>'; return '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 6px">' + hm(x.start) + '</td><td style="padding:4px 6px">' + hm(x.end) + '</td><td style="padding:4px 6px">' + esc(x.step) + '</td><td style="padding:4px 6px;text-align:right">' + (x.secs != null ? x.secs + ' 秒' : '—') + '</td><td style="padding:4px 6px">' + r + '</td></tr>'; }).join('')
        + '</tbody></table>' : '<div style="font-size:12px;color:var(--text-muted);margin-top:8px">今天還沒有工作紀錄。</div>')
      + '</div>';
  }

  function load() {
    return post('admin_office').then(function (j) { if (j && j.agents) { data = j.agents; if (svg) paint(); } })
      .catch(function () { var u = box && box.querySelector('#aoUpd'); if (u) u.textContent = '讀取失敗，稍後重試'; });
  }

  window.AdminOffice = {
    show: function (container, postFn) {
      this.hide(); box = container; post = postFn; sprites = {}; selected = null;
      build(); if (Object.keys(data).length) paint();
      load();
      timers.push(setInterval(load, 60000));
      timers.push(setInterval(step, 50));
    },
    hide: function () { timers.forEach(clearInterval); timers = []; }
  };
})();
