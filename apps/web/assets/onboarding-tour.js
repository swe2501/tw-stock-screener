/* 新手導覽（貓頭鷹帶路）2026-10-25
   首次登入(跨裝置，寫 user_metadata)自動跑；偏好選單決定路線；
   依會員等級/權限調整：主力訊號只給先見領航員(VIP)；其他鎖住功能「介紹＋標示會員功能」不強制點進。 */
(function () {
  'use strict';
  var SB = 'https://bruqrbvbjxntgoljxsne.supabase.co', AK = 'sb_publishable_KgYlaR-mqtx4uVre6kPD2A_qO6tdT1y';
  var FLAG = 'onboarded_tour_v1';            // 寫在 user_metadata 的旗標
  var LS = 'fqi_onboarded_v1';               // 本機快取（避免每次打 API）

  /* ── 貓頭鷹小精靈（照 logo 風格：深藍線條、琥珀眼、耳羽、翅膀；CSS 做揮翅/轉頭/眨眼） ── */
  var OWL =
    '<svg class="ob-owl" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g class="ob-wing-l" fill="var(--ob-owl-ink)"><path d="M44 56 C24 50 11 61 9 78 C24 71 34 73 45 84 Z"/></g>' +
    '<g class="ob-wing-r" fill="var(--ob-owl-ink)"><path d="M76 56 C96 50 109 61 111 78 C96 71 86 73 75 84 Z"/></g>' +
    '<ellipse cx="60" cy="76" rx="25" ry="29" fill="var(--ob-owl-ink)"/>' +
    '<path d="M48 93 q12 9 24 0" fill="none" stroke="var(--ob-owl-amber)" stroke-width="2.2" stroke-linecap="round" opacity=".65"/>' +
    '<circle class="ob-node" cx="60" cy="82" r="3" fill="var(--ob-owl-amber)"/>' +
    '<g class="ob-head">' +
      '<path d="M41 41 L49 22 L55 41 Z" fill="var(--ob-owl-ink)"/>' +
      '<path d="M79 41 L71 22 L65 41 Z" fill="var(--ob-owl-ink)"/>' +
      '<circle cx="60" cy="48" r="26" fill="var(--ob-owl-ink)"/>' +
      '<circle cx="50" cy="47" r="9.5" fill="#fdf4dd"/>' +
      '<circle cx="70" cy="47" r="9.5" fill="#fdf4dd"/>' +
      '<circle cx="50" cy="47" r="5.6" fill="var(--ob-owl-amber)"/>' +
      '<circle cx="70" cy="47" r="5.6" fill="var(--ob-owl-amber)"/>' +
      '<g class="ob-pupil"><circle cx="50" cy="47" r="2.5" fill="#20303f"/><circle cx="70" cy="47" r="2.5" fill="#20303f"/></g>' +
      '<rect class="ob-lid" x="40.5" y="37.5" width="19" height="9.5" rx="4" fill="var(--ob-owl-ink)"/>' +
      '<rect class="ob-lid" x="60.5" y="37.5" width="19" height="9.5" rx="4" fill="var(--ob-owl-ink)"/>' +
      '<path d="M60 53 L55.5 59 L60 62 L64.5 59 Z" fill="var(--ob-owl-amber2)"/>' +
    '</g></svg>';

  /* ── 權限 helpers ── */
  function owner() { return !!window._isOwner; }
  function canBroker() { return !!window._canBroker; }       // owner 或 VIP(先見領航員)
  function loggedIn() { return !!window._loggedIn; }
  function hasAccess(f) { try { return owner() || !!(window.AcademyShareUnlock && window.AcademyShareUnlock.hasAccess && window.AcademyShareUnlock.hasAccess(f)); } catch (_) { return owner(); } }
  function nav() { return document.getElementById('mainNav'); }
  function navItem(txt) {   // 依文字找導覽列項目（含下拉子項）
    var n = nav(); if (!n) return null;
    var els = [].slice.call(n.querySelectorAll('a, .mn-item'));
    for (var i = 0; i < els.length; i++) { if (els[i].textContent.replace(/\s+/g, '').indexOf(txt) >= 0) return els[i]; }
    return null;
  }
  function byId(id) { return document.getElementById(id); }
  function go(view) { try { if (window._showView) window._showView(view); } catch (_) {} }

  /* ── 偏好 ── */
  var PREFS = [
    { id: 'event', ic: '🎯', t: '事件交易派', d: '題材、展覽、法說、話題焦點' },
    { id: 'tech', ic: '📈', t: '技術型態派', d: '掏金篩選器、型態、K 線工具' },
    { id: 'chip', ic: '🧩', t: '籌碼主力派', d: '主力訊號、三大法人', vip: true },
    { id: 'value', ic: '💰', t: '存股/價值派', d: '企業價值357、配息、ETF' },
    { id: 'macro', ic: '🌏', t: '大盤總經派', d: '多空廣度、美債對標、國際指標' }
  ];

  /* ── 步驟定義（data-driven）── */
  // 每步：{title, body, badge?, vip?(需canBroker否則整步跳過), feature?(鎖住則標會員功能且不導航), auth?(需登入否則跳過),
  //        before?(導航動作，鎖住時不執行), locate(回傳要聚光的元素或 null→置中)}
  function commonSteps() {
    return [
      { title: '今日大盤一眼看', body: '首頁上排是<b>加權、櫃買、台指期、台指VIX、台幣匯率</b>五張卡，一眼掌握市場溫度與情緒。', before: function () { go('home'); }, locate: function () { return byId('cbPulse'); } },
      { title: '國際與海外盤', body: '<b>富台指</b>（SGX，海外對台股的領先參考）與<b>台積電權值影響</b>都在這；首頁也有美元指數等國際指標。', before: function () { go('home'); }, locate: function () { return byId('cbOverview') || byId('cbPulse'); } },
      { title: '大盤多空廣度', body: '上市櫃<b>上漲/下跌家數結構</b>，看盤面是真強還是被權值撐住。', feature: 'breadth', locate: function () { return navItem('大盤多空廣度'); } },
      { title: '美債對標', body: '把台股殖利率和<b>美國公債</b>比較，評估相對價值、資金去留。', locate: function () { return navItem('美債對標'); } },
      { title: '今日焦點', body: '<b>今日排行、題材焦點、型態觀察、貪婪恐懼、產業類股、漲跌分布</b>一次看完當日盤面。', locate: function () { return navItem('今日焦點'); } }
    ];
  }
  function prefSteps(prefs) {
    var s = [];
    if (prefs.event) s.push(
      { title: '話題族群・事件交易', body: '事件派看這裡：<b>未來行事曆</b>可看「即將展覽」的相關個股；<b>話題熱度</b>看哪些族群正在發酵。', feature: 'hottopics', before: function () { go('hottopics'); }, locate: function () { return navItem('話題'); } }
    );
    if (prefs.tech) s.push(
      { title: '掏金篩選器・技術型態', body: '勾選<b>型態／K棒／缺口／漲停跌停／指標</b>等條件篩出個股；點結果開 K 圖，還能用左右箭頭切換上一檔/下一檔。', before: function () { go('screen'); }, locate: function () { return byId('proScreenLayout') || document.querySelector('.sc-panel'); } },
      { title: 'K 圖畫線工具', body: '開任一檔 K 圖，右側研究工具可畫<b>直線（按住拖曳）</b>、水平/垂直線、通道、黃金分割等，輔助判斷。', locate: function () { return navItem('掏金篩選器'); } }
    );
    if (prefs.chip) s.push(   // vip:true → 非 VIP 會在 build 階段整步濾掉
      { title: '主力訊號・不籌吃穿', body: '<b>勝率前 20 名分點</b>的大單進場訊號，與 K 圖紫色箭頭同源可對照。', vip: true, locate: function () { return navItem('不籌吃穿') || navItem('主力'); } },
      { title: '三大法人買賣超', body: '外資、投信、自營<b>個股買賣超</b>，追籌碼動向。', vip: true, locate: function () { return navItem('三大法人'); } }
    );
    if (prefs.value) s.push(
      { title: '企業價值 357・存股', body: '掏金篩選器裡的<b>企業價值357</b>用現金殖利率把個股分「便宜／合理／昂貴」，適合存股/價值派。', before: function () { go('screen'); }, locate: function () { return byId('proScreenLayout') || document.querySelector('.sc-panel'); } },
      { title: 'ETF 探索・配息', body: '不想選個股就看 <b>ETF 探索</b>：規模排行、成分股、配息行事曆、折溢價、資金流。', before: function () { go('etfx'); }, locate: function () { return navItem('ETF'); } }
    );
    if (prefs.macro) s.push(
      { title: '三大法人動向', body: '總經派再補一塊：<b>三大法人個股買賣超</b>看外資投信主力的錢往哪流。', locate: function () { return navItem('三大法人'); } }
    );
    return s;
  }
  function memberSteps() {
    return [
      { title: '觀察清單', body: '把看好的股票<b>加入觀察</b>，設定到價/到量通知，不用每天盯盤。', auth: true, locate: function () { return navItem('觀察清單') || byId('watchlistBtn'); } },
      { title: '回測勝率', body: '模擬<b>進出場點位</b>，看這套做法的歷史勝率，先驗證再下手。', auth: true, locate: function () { return navItem('回測') || byId('backtestBtn'); } },
      { title: '我的警示', body: '設定<b>價格/到量提醒</b>，條件到了系統通知你。', auth: true, locate: function () { return navItem('我的警示') || byId('alertMgrBtn'); } }
    ];
  }

  function buildSteps(prefs) {
    var raw = commonSteps().concat(prefSteps(prefs)).concat(memberSteps());
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var st = raw[i];
      if (st.vip && !canBroker()) continue;         // 主力訊號類：非 VIP 完全跳過
      if (st.auth && !loggedIn()) continue;         // 會員功能：未登入跳過
      if (st.feature && !hasAccess(st.feature)) { st = Object.assign({}, st); st.locked = true; st.before = null; }  // 鎖住：介紹＋標示，不導航
      out.push(st);
    }
    return out;
  }

  /* ── 導覽引擎 ── */
  var root, steps = [], idx = 0;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function ensureRoot() {
    if (root) return root;
    root = el('div'); root.id = 'obRoot'; root.hidden = true;
    root.innerHTML =
      '<div class="ob-mask" data-m="t"></div><div class="ob-mask" data-m="b"></div>' +
      '<div class="ob-mask" data-m="l"></div><div class="ob-mask" data-m="r"></div>' +
      '<div class="ob-ring"></div>';
    document.body.appendChild(root);
    return root;
  }
  function clearMasks() { ['t', 'b', 'l', 'r'].forEach(function (m) { var e = root.querySelector('.ob-mask[data-m="' + m + '"]'); e.style.cssText = 'position:fixed;'; }); root.querySelector('.ob-ring').style.opacity = '0'; }
  function spotlight(rect) {
    var W = innerWidth, H = innerHeight, pad = 8;
    var t = root.querySelector('.ob-mask[data-m="t"]'), b = root.querySelector('.ob-mask[data-m="b"]'),
        l = root.querySelector('.ob-mask[data-m="l"]'), r = root.querySelector('.ob-mask[data-m="r"]'),
        ring = root.querySelector('.ob-ring');
    if (!rect) { // 無目標 → 整頁反灰、不挖孔
      t.style.cssText = 'position:fixed;inset:0;'; b.style.cssText = l.style.cssText = r.style.cssText = 'position:fixed;';
      ring.style.opacity = '0'; return;
    }
    var x = Math.max(0, rect.left - pad), y = Math.max(0, rect.top - pad),
        w = Math.min(W, rect.right + pad) - x, h = Math.min(H, rect.bottom + pad) - y;
    t.style.cssText = 'position:fixed;left:0;top:0;right:0;height:' + y + 'px;';
    b.style.cssText = 'position:fixed;left:0;top:' + (y + h) + 'px;right:0;bottom:0;';
    l.style.cssText = 'position:fixed;left:0;top:' + y + 'px;width:' + x + 'px;height:' + h + 'px;';
    r.style.cssText = 'position:fixed;left:' + (x + w) + 'px;top:' + y + 'px;right:0;height:' + h + 'px;';
    ring.style.cssText += '';
    ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.style.width = w + 'px'; ring.style.height = h + 'px'; ring.style.opacity = '1';
  }
  function placePop(pop, rect) {
    var W = innerWidth, H = innerHeight, m = 12;
    pop.style.visibility = 'hidden'; pop.style.left = '0px'; pop.style.top = '0px';
    var pw = pop.offsetWidth, ph = pop.offsetHeight, x, y;
    if (!rect) { x = (W - pw) / 2; y = (H - ph) / 2; }
    else {
      var below = rect.bottom + m + ph < H, above = rect.top - m - ph > 0;
      y = below ? rect.bottom + m : (above ? rect.top - m - ph : Math.max(m, (H - ph) / 2));
      x = Math.min(W - pw - m, Math.max(m, rect.left + rect.width / 2 - pw / 2));
    }
    pop.style.left = Math.round(x) + 'px'; pop.style.top = Math.round(y) + 'px'; pop.style.visibility = '';
  }
  function render() {
    var st = steps[idx]; if (!st) return finish(true);
    if (st.before) { try { st.before(); } catch (_) {} }
    setTimeout(function () {
      var target = null; try { target = st.locate ? st.locate() : null; } catch (_) {}
      var rect = null;
      if (target && target.getBoundingClientRect) {
        try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
        var r = target.getBoundingClientRect();
        if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight) rect = r;
      }
      spotlight(rect);
      var old = root.querySelector('.ob-pop, .ob-center'); if (old) old.remove();
      var pop = el('div', 'ob-pop ob-pop-in');
      var dots = steps.map(function (_, i) { return '<i class="' + (i === idx ? 'on' : '') + '"></i>'; }).join('');
      pop.innerHTML =
        '<button class="ob-skip" type="button">略過導覽</button>' +
        '<div style="display:flex;gap:10px;align-items:flex-start">' + OWL +
        '<div style="flex:1;min-width:0"><div class="ob-step">第 ' + (idx + 1) + ' / ' + steps.length + ' 步</div>' +
        '<div class="ob-title">' + st.title + (st.locked ? ' <span class="ob-badge">會員功能</span>' : '') + '</div>' +
        '<div class="ob-body">' + st.body + (st.locked ? '<br><span style="color:var(--ob-owl-amber2)">（此為會員功能，升級/開通後即可使用）</span>' : '') + '</div></div></div>' +
        '<div class="ob-foot"><div class="ob-dots">' + dots + '</div><div class="ob-btns">' +
        (idx > 0 ? '<button class="ob-btn" data-a="prev" type="button">上一步</button>' : '') +
        '<button class="ob-btn pri" data-a="next" type="button">' + (idx === steps.length - 1 ? '完成' : '下一步') + '</button>' +
        '</div></div>';
      root.appendChild(pop);
      placePop(pop, rect);
      pop.querySelector('.ob-skip').onclick = function () { finish(false); };
      pop.querySelector('[data-a="next"]').onclick = function () { idx++; render(); };
      var pv = pop.querySelector('[data-a="prev"]'); if (pv) pv.onclick = function () { idx = Math.max(0, idx - 1); render(); };
    }, st.before ? 420 : 60);
  }
  function startTour(prefs) {
    ensureRoot(); steps = buildSteps(prefs || {}); idx = 0;
    if (!steps.length) return;
    root.hidden = false; document.body.style.overflow = 'hidden';
    clearMasks(); render();
    window.addEventListener('resize', onResize); window.addEventListener('keydown', onKey);
  }
  function onResize() { if (!root || root.hidden) return; var st = steps[idx]; if (!st) return; var t = null; try { t = st.locate && st.locate(); } catch (_) {} var rect = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null; if (rect && (rect.width < 2)) rect = null; spotlight(rect); var pop = root.querySelector('.ob-pop'); if (pop) placePop(pop, rect); }
  function onKey(e) { if (e.key === 'Escape') finish(false); else if (e.key === 'ArrowRight') { idx = Math.min(steps.length - 1, idx + 1); render(); } else if (e.key === 'ArrowLeft') { idx = Math.max(0, idx - 1); render(); } }
  function finish(completed) {
    if (root) { root.hidden = true; }
    document.body.style.overflow = '';
    window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey);
    try { localStorage.setItem(LS, '1'); } catch (_) {}
    markOnboarded();                       // 不論完成或略過，都記「看過了」
    showReplay();
  }

  /* ── 歡迎 / 偏好選單 ── */
  function showMenu() {
    ensureRoot(); root.hidden = false; document.body.style.overflow = 'hidden'; clearMasks();
    var old = root.querySelector('.ob-pop, .ob-center'); if (old) old.remove();
    var wrap = el('div', 'ob-center'); var card = el('div', 'ob-card ob-pop-in');
    var prefHtml = PREFS.map(function (p) {
      var locked = p.vip && !canBroker();
      return '<div class="ob-pref' + (locked ? ' locked' : '') + '" data-p="' + p.id + '"' + (locked ? ' aria-disabled="true"' : '') + '>' +
        '<span class="ob-ic">' + p.ic + '</span><div><div class="ob-pt">' + p.t + '</div><div class="ob-pd">' + p.d + '</div></div>' +
        (locked ? '<span class="ob-lock">先見領航員</span>' : '<span class="ob-check">✓</span>') + '</div>';
    }).join('');
    card.innerHTML =
      '<div style="--ob-owl-size:84px;display:flex;justify-content:center">' + OWL + '</div>' +
      '<h2>歡迎來到先見 FORESIGHT 🦉</h2>' +
      '<div class="ob-sub">我是帶路的貓頭鷹。先告訴我你是哪一種投資人（可複選），我帶你看最適合你的功能；不管怎麼選，共同的大盤觀察我都會介紹。</div>' +
      '<div class="ob-prefs">' + prefHtml + '</div>' +
      '<div class="ob-go"><button class="ob-btn" data-a="skipall" type="button">先略過</button><button class="ob-btn pri" data-a="start" type="button">開始導覽</button></div>';
    wrap.appendChild(card); root.appendChild(wrap);
    var chosen = {};
    card.querySelectorAll('.ob-pref:not(.locked)').forEach(function (d) {
      d.onclick = function () { var id = d.getAttribute('data-p'); chosen[id] = !chosen[id]; d.classList.toggle('on', chosen[id]); };
    });
    card.querySelector('[data-a="skipall"]').onclick = function () { finish(false); };
    card.querySelector('[data-a="start"]').onclick = function () {
      // 一個都沒選＝只跑共同＋會員；有選就加偏好
      wrap.remove(); startTour(chosen);
    };
  }

  /* ── 重跑按鈕 ── */
  function showReplay() {
    var b = byId('obReplayBtn');
    if (!b) { b = el('button', null, OWL + '<span>新手導覽</span>'); b.id = 'obReplayBtn'; b.type = 'button'; b.title = '重看新手導覽'; b.onclick = function () { showMenu(); }; document.body.appendChild(b); }
    b.style.display = 'flex';
  }

  /* ── 首次登入偵測：寫在帳號 user_metadata（跨裝置）；本機 LS 快取避免每次打 API ── */
  function authHeaders() { var tk = (window._authToken) || (function () { try { return localStorage.getItem('sb_token'); } catch (_) { return null; } })(); return tk ? { apikey: AK, Authorization: 'Bearer ' + tk } : null; }
  function markOnboarded() {
    try { localStorage.setItem(LS, '1'); } catch (_) {}
    var h = authHeaders(); if (!h) return;
    // 先讀現有 metadata 合併，再 PUT（使用者可改自己的 user_metadata）
    fetch(SB + '/auth/v1/user', { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
      var data = (u && u.user_metadata) || {}; if (data[FLAG]) return;
      data[FLAG] = new Date().toISOString();
      fetch(SB + '/auth/v1/user', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ data: data }) }).catch(function () {});
    }).catch(function () {});
  }
  var autoChecked = false;
  function maybeAutoStart() {
    if (autoChecked) return; autoChecked = true;
    showReplay();                                   // 登入後常駐重跑按鈕
    try { if (localStorage.getItem(LS) === '1') return; } catch (_) {}
    var h = authHeaders(); if (!h) return;
    fetch(SB + '/auth/v1/user', { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
      var md = (u && u.user_metadata) || {};
      if (md[FLAG]) { try { localStorage.setItem(LS, '1'); } catch (_) {} return; }  // 這帳號已看過
      setTimeout(showMenu, 900);                     // 真首次 → 跑導覽
    }).catch(function () {});
  }

  /* ── 對外 API ── */
  window.FqiTour = {
    open: showMenu,                 // 手動開（重跑按鈕/選單）
    maybeAutoStart: maybeAutoStart  // 登入後由 _applyAuthState 呼叫
  };
  // 保險：若登入狀態已就緒，延遲自動檢查一次
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (window._loggedIn) maybeAutoStart(); }, 1500); });
})();
