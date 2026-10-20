/* 掏金篩選器「每日選股紀錄」：把當次篩選結果（日期、策略名稱、條件、個股與當時收盤）存進會員本人的研究資料，
 * 之後可依日期／策略回看，並以最新收盤計算至今漲跌。
 * 保存位置：academy.research.v1.<uid> 的 screen_logs（沿用既有研究資料同步，不新增資料表）。
 * 這是會員個人研究紀錄，不作為發點或權益依據。 */
(() => {
  'use strict';
  const MAX_LOGS = 400, MAX_CODES = 300, PRESETS = ['真名一式', '真名二式', '真名三式', 'Golden Cross式'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const pct = v => num(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—';
  const tone = v => num(v) ? (v > 0 ? 'sl-up' : v < 0 ? 'sl-down' : '') : '';
  // crypto.randomUUID 只在 https／localhost 可用，其他情況退回隨機字串
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'sl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

  // ── 會員與保存 ─────────────────────────────────────────────
  function user() { try { const u = JSON.parse(localStorage.getItem('sb_user') || '{}'); return localStorage.getItem('sb_token') && u.id ? u : null; } catch { return null; } }
  const key = id => 'academy.research.v1.' + id;
  function readResearch(id) {
    try {
      const d = JSON.parse(localStorage.getItem(key(id)) || 'null');
      if (d && Array.isArray(d.groups) && Array.isArray(d.observations) && Array.isArray(d.runs)) return d;
    } catch {}
    // 與 member-research.js 相同的預設結構，避免覆蓋成研究工具讀不懂的格式
    return {groups: ['長期關注', '等待機會', 'ETF'].map(name => ({id: uuid(), name})), labels: {}, observations: [], runs: []};
  }
  function logs(id) { const l = readResearch(id).screen_logs; return Array.isArray(l) ? l.filter(x => x && x.id && x.date && Array.isArray(x.stocks)) : []; }
  function saveLogs(id, list) {
    const data = readResearch(id); data.screen_logs = list.slice(0, MAX_LOGS);
    const value = JSON.stringify(data);
    if (window.AcademyCloud?.setItem) window.AcademyCloud.setItem(key(id), value); else localStorage.setItem(key(id), value);
  }

  // ── 讀取目前篩選畫面 ───────────────────────────────────────
  function screenDate() {
    try { if (typeof _lastScreenDate !== 'undefined' && _lastScreenDate) return String(_lastScreenDate); } catch {}
    const t = document.querySelector('#statusArea .results-title')?.textContent || '';
    const m = t.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : null;
  }
  function currentStocks() {
    let all = [];
    try { if (typeof lastResults !== 'undefined' && Array.isArray(lastResults)) all = lastResults; } catch {}
    const byCode = new Map(all.map(r => [String(r.code), r]));
    // 依畫面目前顯示（含產業／箱型過濾與排序）的順序
    const seen = new Set(), out = [];
    document.querySelectorAll('#resultsArea td[data-viewed-code]').forEach(td => {
      const code = td.dataset.viewedCode; if (!code || seen.has(code)) return; seen.add(code);
      const r = byCode.get(code) || {};
      out.push({code, name: r.name || (window._names && window._names[code]) || '', close: num(+r.close) ? +r.close : null, chg: num(+r.change_pct) ? +r.change_pct : null});
    });
    return out;
  }
  function conditions() { return [...document.querySelectorAll('#scCombo .sc-chip')].map(c => c.textContent.trim()).filter(Boolean); }

  // ── 對話框 ───────────────────────────────────────────────
  const dialog = el('dialog', 'sl-dialog'); dialog.setAttribute('aria-labelledby', 'sl-title');
  document.body.append(dialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  function shell(title, body) {
    dialog.innerHTML = '<header class="sl-head"><h2 id="sl-title">' + esc(title) + '</h2><button type="button" class="sl-close" aria-label="關閉">×</button></header><div class="sl-body"></div>';
    dialog.querySelector('.sl-close').onclick = () => dialog.close();
    const b = dialog.querySelector('.sl-body'); if (typeof body === 'string') b.innerHTML = body; else b.append(body);
    if (!dialog.open) dialog.showModal();
    return b;
  }
  function needLogin() {
    const b = shell('每日選股紀錄', '<p class="sl-copy">登入會員後即可記錄每天的選股結果，紀錄會跟著你的帳號同步到其他裝置。</p><div class="sl-actions"><button type="button" class="sl-primary" data-login>登入會員</button></div>');
    b.querySelector('[data-login]').onclick = () => { dialog.close(); window.openMemberCenter?.(); };
  }

  function openRecord() {
    const u = user(); if (!u) return needLogin();
    const date = screenDate(), stocks = currentStocks().slice(0, MAX_CODES), cond = conditions();
    if (!date || !stocks.length) { shell('記錄今日選股', '<p class="sl-copy">請先按「開始篩選」，有篩選結果後再記錄。</p>'); return; }
    const used = [...new Set(logs(u.id).map(l => l.strategy).filter(Boolean))];
    const names = [...new Set(PRESETS.concat(used))];
    const b = shell('記錄今日選股',
      '<form class="sl-form">' +
      '<div class="sl-meta"><span>篩選日期 <b>' + esc(date) + '</b></span><span>共 <b>' + stocks.length + '</b> 檔</span></div>' +
      '<label class="sl-field"><span>招式／策略名稱</span><input name="strategy" list="sl-strategies" maxlength="40" required placeholder="例如：真名一式"><datalist id="sl-strategies">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></label>' +
      '<div class="sl-presets">' + names.slice(0, 8).map(n => '<button type="button" data-preset="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' +
      '<div class="sl-field"><span>本次條件</span><div class="sl-chips">' + (cond.length ? cond.map(c => '<span class="sl-chip">' + esc(c) + '</span>').join('') : '<span class="sl-muted">未設定條件</span>') + '</div></div>' +
      '<label class="sl-field"><span>備註（選填）</span><textarea name="note" rows="2" maxlength="300" placeholder="例如：大盤偏多，挑量能放大的"></textarea></label>' +
      '<div class="sl-field"><span>個股</span><div class="sl-codes">' + stocks.map(s => '<span>' + esc(s.code) + ' ' + esc(s.name) + '</span>').join('') + '</div></div>' +
      '<p class="sl-status" role="status" aria-live="polite"></p>' +
      '<div class="sl-actions"><button type="button" data-view>查看我的紀錄</button><button type="submit" class="sl-primary">儲存紀錄</button></div>' +
      '</form>');
    const form = b.querySelector('form'), input = form.strategy, status = b.querySelector('.sl-status');
    const last = used[0]; if (last) input.value = last;
    b.querySelectorAll('[data-preset]').forEach(x => x.onclick = () => { input.value = x.dataset.preset; input.focus(); });
    b.querySelector('[data-view]').onclick = () => openLogs();
    form.onsubmit = e => {
      e.preventDefault();
      const strategy = input.value.trim(); if (!strategy) { input.focus(); return; }
      const list = logs(u.id), dup = list.findIndex(l => l.date === date && l.strategy === strategy);
      if (dup >= 0 && !confirmReplace(status, form)) return;
      const entry = {id: dup >= 0 ? list[dup].id : uuid(), date, strategy, conditions: cond, note: form.note.value.trim().slice(0, 300), stocks, saved_at: new Date().toISOString()};
      if (dup >= 0) list.splice(dup, 1);
      list.unshift(entry); list.sort((a, b) => b.date.localeCompare(a.date) || String(b.saved_at).localeCompare(String(a.saved_at)));
      try { saveLogs(u.id, list); } catch { status.textContent = '儲存失敗，請稍後再試。'; return; }
      window.dispatchEvent(new CustomEvent('academy-screen-log-saved', {detail: {date, strategy, count: stocks.length}}));
      status.innerHTML = '已記錄 <b>' + esc(date) + ' · ' + esc(strategy) + '</b>（' + stocks.length + ' 檔）。';
      form.querySelector('[type=submit]').disabled = true;
    };
  }
  // 同日同招式已存在：第一次按下先提示，再按一次才覆蓋
  function confirmReplace(status, form) {
    if (form.dataset.replace === '1') return true;
    form.dataset.replace = '1';
    status.textContent = '這一天已經有同名招式的紀錄，再按一次「儲存紀錄」會用這次結果取代。';
    return false;
  }

  // ── 最新收盤（price_window，公開讀取） ──────────────────────
  const quoteCache = new Map();
  async function latestCloses(codes) {
    const need = codes.filter(c => !quoteCache.has(c));
    const SB = (typeof SIG_SB_URL !== 'undefined' && SIG_SB_URL) || 'https://bruqrbvbjxntgoljxsne.supabase.co';
    const AK = (typeof SIG_SB_ANON !== 'undefined' && SIG_SB_ANON) || '';
    if (need.length && AK) {
      for (let i = 0; i < need.length; i += 60) {
        const part = need.slice(i, i + 60);
        try {
          const q = '/rest/v1/price_window?select=code,trade_date,close&code=in.(' + part.join(',') + ')&order=trade_date.desc&limit=' + part.length * 3;
          const rows = await fetch(SB + q, {headers: {apikey: AK, Authorization: 'Bearer ' + AK}}).then(r => r.ok ? r.json() : []);
          part.forEach(c => { const r = (rows || []).find(x => String(x.code) === c && num(+x.close)); quoteCache.set(c, r ? {close: +r.close, date: r.trade_date} : null); });
        } catch { part.forEach(c => quoteCache.set(c, null)); }
      }
    }
    return new Map(codes.map(c => [c, quoteCache.get(c) || null]));
  }

  // ── 紀錄列表 ───────────────────────────────────────────────
  let filter = '';
  function openLogs() {
    const u = user(); if (!u) return needLogin();
    const list = logs(u.id);
    const names = [...new Set(list.map(l => l.strategy))];
    if (filter && !names.includes(filter)) filter = '';
    const shown = filter ? list.filter(l => l.strategy === filter) : list;
    const b = shell('我的選股紀錄',
      '<div class="sl-toolbar"><label><span>招式</span><select data-filter><option value="">全部招式（' + list.length + '）</option>' + names.map(n => '<option value="' + esc(n) + '"' + (n === filter ? ' selected' : '') + '>' + esc(n) + '（' + list.filter(l => l.strategy === n).length + '）</option>').join('') + '</select></label>' +
      (list.length ? '<button type="button" data-export>匯出 CSV</button>' : '') + '</div>' +
      (shown.length ? '<div class="sl-list">' + shown.map(card).join('') + '</div>' : '<div class="sl-empty"><p>還沒有選股紀錄。</p><p class="sl-muted">在掏金篩選器篩出結果後，按「記錄今日選股」就會出現在這裡。</p></div>'));
    b.querySelector('[data-filter]').onchange = e => { filter = e.target.value; openLogs(); };
    b.querySelector('[data-export]')?.addEventListener('click', () => exportCsv(shown));
    b.querySelectorAll('[data-delete]').forEach(x => x.onclick = () => {
      if (x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = '再按一次刪除'; return; }
      saveLogs(u.id, logs(u.id).filter(l => l.id !== x.dataset.delete)); openLogs();
    });
    b.querySelectorAll('[data-stock]').forEach(x => x.onclick = () => { const [code, name] = x.dataset.stock.split('|'); dialog.close(); window._openStock?.(code, name); });
    b.querySelectorAll('details.sl-log').forEach(d => d.addEventListener('toggle', () => { if (d.open) fillPerformance(d, list.find(l => l.id === d.dataset.id)); }, {once: true}));
  }
  function card(l) {
    return '<details class="sl-log" data-id="' + esc(l.id) + '"><summary>' +
      '<span class="sl-date">' + esc(l.date) + '</span><span class="sl-strategy">' + esc(l.strategy) + '</span>' +
      '<span class="sl-count">' + l.stocks.length + ' 檔</span><span class="sl-avg" data-avg>展開看至今表現</span></summary>' +
      '<div class="sl-log-body">' +
      (l.conditions?.length ? '<div class="sl-chips">' + l.conditions.map(c => '<span class="sl-chip">' + esc(c) + '</span>').join('') + '</div>' : '') +
      (l.note ? '<p class="sl-note">' + esc(l.note) + '</p>' : '') +
      '<div class="sl-table-wrap"><table class="sl-table"><thead><tr><th>股票</th><th>紀錄價</th><th>最新價</th><th>至今漲跌</th></tr></thead><tbody>' +
      l.stocks.map(s => '<tr data-code="' + esc(s.code) + '"><td><button type="button" class="sl-stock" data-stock="' + esc(s.code + '|' + (s.name || '')) + '"><b>' + esc(s.code) + '</b> ' + esc(s.name || '') + '</button></td><td>' + (num(s.close) ? s.close.toLocaleString('zh-TW', {maximumFractionDigits: 2}) : '—') + '</td><td data-latest>…</td><td data-ret>…</td></tr>').join('') +
      '</tbody></table></div><div class="sl-log-foot"><small class="sl-muted" data-asof></small><button type="button" class="sl-delete" data-delete="' + esc(l.id) + '">刪除這筆</button></div></div></details>';
  }
  async function fillPerformance(d, l) {
    if (!l) return;
    const q = await latestCloses(l.stocks.map(s => s.code));
    const rets = []; let asof = '';
    l.stocks.forEach(s => {
      const tr = d.querySelector('tr[data-code="' + CSS.escape(s.code) + '"]'), cur = q.get(s.code); if (!tr) return;
      const r = cur && num(s.close) && s.close > 0 ? (cur.close / s.close - 1) * 100 : null;
      if (num(r)) rets.push(r); if (cur?.date && cur.date > asof) asof = cur.date;
      tr.querySelector('[data-latest]').textContent = cur ? cur.close.toLocaleString('zh-TW', {maximumFractionDigits: 2}) : '—';
      const rc = tr.querySelector('[data-ret]'); rc.textContent = pct(r); rc.className = tone(r);
    });
    const avg = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null, win = rets.filter(r => r > 0).length;
    const s = d.querySelector('[data-avg]');
    s.innerHTML = rets.length ? '平均 <b class="' + tone(avg) + '">' + pct(avg) + '</b> · 上漲 ' + win + '/' + rets.length : '暫無最新報價';
    d.querySelector('[data-asof]').textContent = asof ? '最新收盤日 ' + asof + '；至今漲跌＝最新收盤 ÷ 紀錄日收盤 − 1，未含除權息與交易成本。' : '';
  }
  function exportCsv(list) {
    const rows = [['日期', '招式', '代號', '名稱', '紀錄日收盤', '當日漲跌%', '條件', '備註']];
    list.forEach(l => l.stocks.forEach(s => rows.push([l.date, l.strategy, s.code, s.name || '', num(s.close) ? s.close : '', num(s.chg) ? s.chg : '', (l.conditions || []).join('；'), l.note || ''])));
    const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    a.download = '選股紀錄_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── 按鈕：結果標題列＋條件列 ────────────────────────────────
  function addButtons() {
    const head = document.querySelector('#statusArea .results-header');
    if (head && !head.querySelector('.sl-bar')) {
      const bar = el('div', 'sl-bar');
      bar.innerHTML = '<button type="button" class="sl-record">記錄今日選股</button><button type="button" class="sl-open">我的紀錄</button>';
      bar.querySelector('.sl-record').onclick = openRecord; bar.querySelector('.sl-open').onclick = openLogs;
      head.append(bar);
    }
    const combo = document.getElementById('scCombo')?.parentElement;
    if (combo && !combo.querySelector('.sl-combo-open')) {
      const b = el('button', 'sl-combo-open', '我的選股紀錄'); b.type = 'button'; b.onclick = openLogs; combo.append(b);
    }
  }
  function boot() {
    addButtons();
    const s = document.getElementById('statusArea'); if (s) new MutationObserver(addButtons).observe(s, {childList: true, subtree: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.AcademyScreenLog = {openRecord, openLogs, logs: () => { const u = user(); return u ? logs(u.id) : []; }};
})();
