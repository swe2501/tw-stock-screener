/* 新手導覽（貓頭鷹帶路）2026-10-25
   首次登入(跨裝置，寫 user_metadata)自動跑；偏好選單決定路線；
   依會員等級/權限調整：主力訊號只給先見領航員(VIP)；其他鎖住功能「介紹＋標示會員功能」不強制點進。 */
(function () {
  'use strict';
  var SB = 'https://bruqrbvbjxntgoljxsne.supabase.co', AK = 'sb_publishable_KgYlaR-mqtx4uVre6kPD2A_qO6tdT1y';
  var FLAG = 'onboarded_tour_v1';            // 寫在 user_metadata 的旗標
  var LS = 'fqi_onboarded_v1';               // 本機快取（避免每次打 API）
  // Lucide outline icons (ISC), selected to match each research category.
  // License: onboarding-icons-LICENSE.txt
  var ICONS = {"radar":"<path d=\"M19.07 4.93A10 10 0 0 0 6.99 3.34\"/><path d=\"M4 6h.01\"/><path d=\"M2.29 9.62A10 10 0 1 0 21.31 8.35\"/><path d=\"M16.24 7.76A6 6 0 1 0 8.23 16.67\"/><path d=\"M12 18h.01\"/><path d=\"M17.99 11.66A6 6 0 0 1 15.77 16.67\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"m13.41 10.59 5.66-5.66\"/>","chart-no-axes-combined":"<path d=\"M12 16v5\"/><path d=\"M16 14v7\"/><path d=\"M20 10v11\"/><path d=\"m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15\"/><path d=\"M4 18v3\"/><path d=\"M8 14v7\"/>","network":"<rect x=\"16\" y=\"16\" width=\"6\" height=\"6\" rx=\"1\"/><rect x=\"2\" y=\"16\" width=\"6\" height=\"6\" rx=\"1\"/><rect x=\"9\" y=\"2\" width=\"6\" height=\"6\" rx=\"1\"/><path d=\"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3\"/><path d=\"M12 12V8\"/>","landmark":"<path d=\"M10 18v-7\"/><path d=\"M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z\"/><path d=\"M14 18v-7\"/><path d=\"M18 18v-7\"/><path d=\"M3 22h18\"/><path d=\"M6 18v-7\"/>","layers-2":"<path d=\"M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z\"/><path d=\"m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845\"/>","globe-2":"<path d=\"M21.54 15H17a2 2 0 0 0-2 2v4.54\"/><path d=\"M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17\"/><path d=\"M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05\"/><circle cx=\"12\" cy=\"12\" r=\"10\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","compass":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z\"/>","arrow-up-right":"<path d=\"M7 7h10v10\"/><path d=\"M7 17 17 7\"/>","settings-2":"<path d=\"M14 17H5\"/><path d=\"M19 7h-9\"/><circle cx=\"17\" cy=\"17\" r=\"3\"/><circle cx=\"7\" cy=\"7\" r=\"3\"/>","grip-horizontal":"<circle cx=\"12\" cy=\"9\" r=\"1\"/><circle cx=\"19\" cy=\"9\" r=\"1\"/><circle cx=\"5\" cy=\"9\" r=\"1\"/><circle cx=\"12\" cy=\"15\" r=\"1\"/><circle cx=\"19\" cy=\"15\" r=\"1\"/><circle cx=\"5\" cy=\"15\" r=\"1\"/>","chevron-right":"<path d=\"m9 18 6-6-6-6\"/>"};
  function icon(name) { return '<svg class="ob-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.compass) + '</svg>'; }
  function uiKey() { var id='guest'; try { id=JSON.parse(localStorage.getItem('sb_user')||'null')?.id||id; } catch (_) {} return 'fqi.guide.ui.v1.'+id; }
  function readUI() { try { var s=JSON.parse(localStorage.getItem(uiKey())||'{}');return {enabled:s.enabled!==false,position:Number.isFinite(s.position)?Math.max(0,Math.min(1,s.position)):.66}; } catch (_) { return {enabled:true,position:.66}; } }
  function saveUI(patch) { var state=Object.assign(readUI(),patch);localStorage.setItem(uiKey(),JSON.stringify(state));return state; }

  /* 品牌原圖等比例顯示；翼片排除頭、軀幹與書本，靜止圖層使用互補遮罩。 */
  var owlId=0;
  function owlMarkup(){
    var id='ob-owl-'+(++owlId);
    var left='M390 190 713 285 760 340 820 400 930 490 985 610 820 580 660 575 520 530 420 380Z';
    var right='M1108 513 1180 400 1260 340 1300 270 1540 250 1650 185 1660 440 1510 570 1330 640 1150 610Z';
    function layers(theme){
      var image='assets/brand/foresight-owl-'+theme+'-book-light.png';
      function img(extra){return '<image href="'+image+'" width="1789" height="879" '+extra+'/>';}
      return '<g class="owl-'+theme+'-v2">'+img('mask="url(#'+id+'-body)" class="owl-body"')+
        '<g class="owl-wing owl-wing-left">'+img('clip-path="url(#'+id+'-left)"')+'</g>'+
        '<g class="owl-wing owl-wing-right">'+img('clip-path="url(#'+id+'-right)"')+'</g></g>';
    }
    return '<span class="ob-owl" role="img" aria-label="先見貓頭鷹">'+
      '<svg class="owl-art" viewBox="350 0 1340 850" aria-hidden="true" focusable="false">'+
      '<defs><clipPath id="'+id+'-left"><path d="'+left+'"/></clipPath><clipPath id="'+id+'-right"><path d="'+right+'"/></clipPath>'+
      '<mask id="'+id+'-body" maskUnits="userSpaceOnUse" x="0" y="0" width="1789" height="879"><rect width="1789" height="879" fill="white"/><path d="'+left+'" fill="black"/><path d="'+right+'" fill="black"/></mask></defs>'+
      layers('light')+layers('dark')+'</svg></span>';
  }

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
  function go(view) { try { var cfg=window._VIEWS&&window._VIEWS[view], current=cfg&&byId(cfg.el); if(current&&getComputedStyle(current).display!=='none')return; if (window._showView) window._showView(view); } catch (_) {} }

  /* ── 偏好 ── */
  var PREFS = [
    { id: 'event', ic: 'radar', t: '事件交易派', d: '題材、展覽、法說、話題焦點' },
    { id: 'tech', ic: 'chart-no-axes-combined', t: '技術型態派', d: '篩選器、型態、壓力支撐、K 線' },
    { id: 'chip', ic: 'network', t: '籌碼主力派', d: '主力訊號、三大法人、神燈冥燈', vip: true },
    { id: 'value', ic: 'landmark', t: '存股／價值派', d: '企業價值357、現金殖利率' },
    { id: 'etf', ic: 'layers-2', t: 'ETF 派', d: 'ETF 探索、配息、相似度、折溢價' },
    { id: 'macro', ic: 'globe-2', t: '大盤總經派', d: '貪婪指標、外資空單、多空廣度' }
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
      { title: '話題族群・事件交易', body: '事件派看這裡：<b>未來行事曆</b>可看「即將展覽」的相關個股；<b>話題熱度</b>看哪些族群正在發酵。', feature: 'hottopics', before: function () { go('hottopics'); }, locate: function () { return navItem('話題'); } },
      { title: '題材列表・產業地圖', body: '想從主題找股？<b>題材列表</b>列出每個題材的成分股；<b>產業地圖</b>看資金在各產業間流動。', locate: function () { return navItem('題材列表'); } }
    );
    if (prefs.tech) s.push(
      { title: '掏金篩選器・技術型態', body: '勾選<b>型態／K棒／缺口／漲停跌停／指標</b>等條件篩出個股；點結果開 K 圖，還能用左右箭頭切換上一檔/下一檔。', before: function () { go('screen'); }, locate: function () { var L = byId('proScreenLayout'); return (L && L.querySelector('.form-wrap')) || document.querySelector('.sc-panel'); } },
      { title: 'K 圖畫線工具', body: '開任一檔 K 圖，右側研究工具可畫<b>直線（按住拖曳）</b>、水平/垂直線、通道、黃金分割等，輔助判斷。', locate: function () { return navItem('掏金篩選器'); } },
      { title: '壓力支撐・亮燈區', body: '<b>壓力支撐逼近</b>找接近關鍵價位的股；<b>上漲下跌亮燈區</b>快速掃出今日轉強/轉弱。', locate: function () { return navItem('壓力支撐逼近'); } }
    );
    if (prefs.chip) s.push(   // vip:true → 非 VIP 會在 build 階段整步濾掉
      { title: '主力訊號・不籌吃穿', body: '<b>勝率前 20 名分點</b>的大單進場訊號，與 K 圖紫色箭頭同源可對照。', vip: true, locate: function () { return navItem('不籌吃穿') || navItem('主力'); } },
      { title: '三大法人買賣超', body: '外資、投信、自營<b>個股買賣超</b>，追籌碼動向。', vip: true, locate: function () { return navItem('三大法人'); } },
      { title: '神燈與冥燈', body: '主力<b>連續買超（神燈）／連續賣超（冥燈）</b>的個股清單，一眼看主力在養還是在倒。', feature: 'mingdeng', locate: function () { return navItem('神燈'); } }
    );
    if (prefs.value) s.push(
      { title: '企業價值 357・存股', body: '掏金篩選器裡的<b>企業價值357</b>用現金殖利率把個股分「便宜／合理／昂貴」，適合存股/價值派長期布局。', before: function () { go('screen'); }, locate: function () { var L = byId('proScreenLayout'); return (L && L.querySelector('.form-wrap')) || document.querySelector('.sc-panel'); } }
    );
    if (prefs.etf) s.push(
      { title: 'ETF 探索', body: '不想選個股就看 <b>ETF 探索</b>：規模排行、成分股、相似度、重倉股、折溢價、資金流一次看。', before: function () { go('etfx'); }, locate: function () { return navItem('ETF'); } },
      { title: 'ETF 配息行事曆', body: '<b>配息行事曆</b>看各 ETF 的除息/配息日與金額，方便規劃月月配、季配組合。', locate: function () { return navItem('配息行事曆'); } }
    );
    if (prefs.macro) s.push(
      { title: '貪婪指標', body: '全市場<b>情緒溫度</b>（極度恐懼～極度貪婪），判斷現在是追高還是撿便宜的時機。', locate: function () { return navItem('貪婪指標'); } },
      { title: '外資空單溫度計', body: '<b>外資期貨空單</b>的相對高低溫度，搭配現貨買賣超判斷外資真實方向。', feature: 'fhedge', locate: function () { return navItem('外資空單溫度計'); } }
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
  var root, steps = [], idx = 0, renderTimer = null, renderVersion = 0, previousOverflow='', returnFocus=null;
  function beginOverlay() { ensureRoot();if(root.hidden){previousOverflow=document.body.style.overflow;returnFocus=dock&&dock.contains(document.activeElement)?dock.querySelector('.ob-edge-toggle'):document.activeElement;}root.hidden=false;document.body.style.overflow='hidden';updateDock();window.addEventListener('keydown',onKey); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function ensureRoot() {
    if (root) return root;
    root = el('div'); root.id = 'obRoot'; root.hidden = true;
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','先見新手導覽');
    root.innerHTML =
      '<div class="ob-mask" data-m="t"></div><div class="ob-mask" data-m="b"></div>' +
      '<div class="ob-mask" data-m="l"></div><div class="ob-mask" data-m="r"></div>' +
      '<div class="ob-ring"></div>';
    document.body.appendChild(root);
    return root;
  }
  var _ringShown = false; // 聚光環目前是否顯示中：決定下一次要「瞬間定位」還是「平滑滑動」
  function clearMasks() { ['t', 'b', 'l', 'r'].forEach(function (m) { var e = root.querySelector('.ob-mask[data-m="' + m + '"]'); e.style.cssText = 'position:fixed;'; }); root.querySelector('.ob-ring').style.opacity = '0'; _ringShown = false; }
  function spotlight(rect) {
    var W = innerWidth, H = innerHeight, pad = 8;
    var t = root.querySelector('.ob-mask[data-m="t"]'), b = root.querySelector('.ob-mask[data-m="b"]'),
        l = root.querySelector('.ob-mask[data-m="l"]'), r = root.querySelector('.ob-mask[data-m="r"]'),
        ring = root.querySelector('.ob-ring');
    if (!rect) { // 無目標 → 整頁反灰、不挖孔
      t.style.cssText = 'position:fixed;inset:0;'; b.style.cssText = l.style.cssText = r.style.cssText = 'position:fixed;';
      ring.style.opacity = '0'; _ringShown = false; return null;
    }
    // 不讓聚光孔蓋到固定導覽列；目標過高時只框「上半可視區」，避免環圈住整頁。
    var headEl = document.querySelector('#mainNav, header, .site-nav, nav');
    var headB = headEl ? Math.max(0, Math.min(H - 40, headEl.getBoundingClientRect().bottom)) : 0;
    var x = Math.max(0, rect.left - pad), y = Math.max(headB + 4, rect.top - pad),
        w = Math.min(W, rect.right + pad) - x, h = Math.min(H, rect.bottom + pad) - y;
    var maxH = Math.round((H - headB) * 0.66);
    if (h > maxH) h = maxH;                 // 目標太高 → 只聚光上半部，框住重點而非整頁
    t.style.cssText = 'position:fixed;left:0;top:0;right:0;height:' + y + 'px;';
    b.style.cssText = 'position:fixed;left:0;top:' + (y + h) + 'px;right:0;bottom:0;';
    l.style.cssText = 'position:fixed;left:0;top:' + y + 'px;width:' + x + 'px;height:' + h + 'px;';
    r.style.cssText = 'position:fixed;left:' + (x + w) + 'px;top:' + y + 'px;right:0;height:' + h + 'px;';
    // 首次出現(或剛從無目標步驟回來)：瞬間定位後淡入，避免從左上角滑入；步驟間則維持平滑滑動。
    if (!_ringShown) ring.style.transition = 'none';
    ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.style.width = w + 'px'; ring.style.height = h + 'px';
    if (!_ringShown) { void ring.offsetWidth; ring.style.transition = ''; _ringShown = true; }
    ring.style.opacity = '1';
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }; // 實際高亮範圍，供氣泡定位
  }
  function placePop(pop, rect) {
    var W = innerWidth, H = innerHeight, m = 12;
    // 定位期間關掉過渡：氣泡每步重新建立，若保留 transition 會從預設 (0,0) 滑到定位＝左上角跳動。
    // 先無過渡量測+定位，讓它直接出現在正確位置（進場靠 .ob-pop-in 淡入），下一步再恢復過渡。
    pop.style.transition = 'none';
    pop.style.visibility = 'hidden';
    var pw = pop.offsetWidth, ph = pop.offsetHeight, x, y;
    if (!rect) { x = (W - pw) / 2; y = (H - ph) / 2; }
    else {
      var below = rect.bottom + m + ph <= H, above = rect.top - m - ph >= 0;
      if (below || above) {                 // 上/下方塞得下 → 置於目標上或下，水平對齊中心
        y = below ? rect.bottom + m : rect.top - m - ph;
        x = Math.min(W - pw - m, Math.max(m, rect.left + rect.width / 2 - pw / 2));
      } else {                              // 目標很高(上下都塞不下) → 擺到旁邊空白處，不蓋住重點
        var rightRoom = W - rect.right, leftRoom = rect.left;
        if (rightRoom >= pw + 2 * m) x = rect.right + m;
        else if (leftRoom >= pw + 2 * m) x = rect.left - m - pw;
        else x = Math.min(W - pw - m, Math.max(m, rect.left + rect.width / 2 - pw / 2));
        y = Math.min(H - ph - m, Math.max(m, rect.top));
      }
    }
    x = Math.max(m, Math.min(W - pw - m, x)); y = Math.max(m, Math.min(H - ph - m, y));
    pop.style.left = Math.round(x) + 'px'; pop.style.top = Math.round(y) + 'px'; pop.style.visibility = '';
    void pop.offsetWidth; // 強制 reflow 定位生效後再恢復過渡
    pop.style.transition = '';
  }
  // 導覽目標若在導覽列下拉(.mn-menu)內，暫時強制展開該選單；換步/結束時還原
  var _openedMenu = null;
  function _restoreMenu() { if (_openedMenu) { try { _openedMenu.style.display = ''; } catch (_) {} _openedMenu = null; } }
  function _forceMenuFor(target) {
    _restoreMenu();
    var menu = (target && target.closest) ? target.closest('.mn-menu') : null;
    if (menu) {
      // 手機導覽列橫向捲動：先把這一組(.mn-grp)橫向捲進畫面，下拉(手機為整排全寬)才打得到
      var grp = menu.closest('.mn-grp');
      if (grp) { try { grp.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) {} }
      menu.classList.remove('mn-hide'); menu.style.display = 'block'; _openedMenu = menu;
    }
  }
  function render() {
    var st = steps[idx]; if (!st) return finish(true);
    clearTimeout(renderTimer);
    var version = ++renderVersion;
    var previous = root.querySelector('.ob-guide, .ob-center'); if (previous) previous.remove();
    if (st.before) { try { st.before(); } catch (_) {} }
    renderTimer = setTimeout(function () {
      if (version !== renderVersion || root.hidden) return;
      var target = null; try { target = st.locate ? st.locate() : null; } catch (_) {}
      _forceMenuFor(target);        // 目標在下拉選單裡就先展開(並橫向捲進畫面)，聚光才打得到
      var rect = null;
      if (target && target.getBoundingClientRect) {
        var inMenu = target.closest && target.closest('.mn-menu');
        if (!inMenu) { try { target.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {} }  // 下拉項目已在頂部，不整頁捲動
        var r = target.getBoundingClientRect();
        if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight) rect = r;
      }
      var hole = spotlight(rect);
      var old = root.querySelector('.ob-guide, .ob-center'); if (old) old.remove();
      var guide = el('div', 'ob-guide ob-pop-in');
      var host = el('div', 'ob-guide-host', owlMarkup() + '<span>先見領航員</span>');
      var pop = el('div', 'ob-pop');
      guide.appendChild(host); guide.appendChild(pop);
      var dots = steps.map(function (_, i) { return '<i class="' + (i === idx ? 'on' : '') + '"></i>'; }).join('');
      pop.innerHTML =
        '<button class="ob-skip" type="button">略過導覽</button>' +
        '<div class="ob-copy">' +
        '<div style="flex:1;min-width:0"><div class="ob-step">第 ' + (idx + 1) + ' / ' + steps.length + ' 步</div>' +
        '<div class="ob-title">' + st.title + (st.locked ? ' <span class="ob-badge">會員功能</span>' : '') + '</div>' +
        '<div class="ob-body">' + st.body + (st.locked ? '<br><span style="color:var(--ob-owl-amber2)">（此為會員功能，升級/開通後即可使用）</span>' : '') + '</div></div></div>' +
        '<div class="ob-foot"><div class="ob-dots">' + dots + '</div><div class="ob-btns">' +
        (idx > 0 ? '<button class="ob-btn" data-a="prev" type="button">上一步</button>' : '') +
        '<button class="ob-btn pri" data-a="next" type="button">' + (idx === steps.length - 1 ? '完成' : '下一步') + '</button>' +
        '</div></div>';
      guide.style.setProperty('--ob-progress', ((idx + 1) / steps.length * 100) + '%');
      root.appendChild(guide);
      placePop(guide, hole);
      pop.querySelector('.ob-skip').onclick = function () { finish(false); };
      pop.querySelector('[data-a="next"]').onclick = function () { idx++; render(); };
      var pv = pop.querySelector('[data-a="prev"]'); if (pv) pv.onclick = function () { idx = Math.max(0, idx - 1); render(); };
      pop.querySelector('[data-a="next"]').focus({preventScroll:true});
    }, st.before ? 420 : 60);
  }
  function startTour(prefs) {
    ensureRoot(); steps = buildSteps(prefs || {}); idx = 0;
    if (!steps.length) return;
    beginOverlay();
    clearMasks(); render();
    window.addEventListener('resize', onResize); window.addEventListener('keydown', onKey);
  }
  function onResize() { if (!root || root.hidden) return; var st = steps[idx]; if (!st) return; var t = null; try { t = st.locate && st.locate(); } catch (_) {} var rect = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null; if (rect && (rect.width < 2)) rect = null; var hole = spotlight(rect); var pop = root.querySelector('.ob-guide'); if (pop) placePop(pop, hole); }
  function onKey(e) { if(!root||root.hidden)return;if(e.key==='Tab'){var buttons=[].slice.call(root.querySelectorAll('button:not(:disabled)')).filter(function(b){return !!b.getClientRects().length;});var first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}else if (e.key === 'Escape') {e.preventDefault();finish(false);}else if(root.querySelector('.ob-guide')&&e.key === 'ArrowRight') {e.preventDefault();idx = Math.min(steps.length - 1, idx + 1); render(); } else if(root.querySelector('.ob-guide')&&e.key === 'ArrowLeft') {e.preventDefault();idx = Math.max(0, idx - 1); render(); } }
  function finish(completed) {
    clearTimeout(renderTimer); renderVersion++;
    _restoreMenu();
    if (root) { root.hidden = true; }
    document.body.style.overflow = previousOverflow;
    window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey);
    try { localStorage.setItem(LS, '1'); } catch (_) {}
    markOnboarded();                       // 不論完成或略過，都記「看過了」
    showReplay();
    if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});
  }

  /* ── 歡迎 / 偏好選單 ── */
  function showMenu() {
    beginOverlay(); spotlight(null);
    var old = root.querySelector('.ob-guide, .ob-center'); if (old) old.remove();
    var wrap = el('div', 'ob-center'); var card = el('div', 'ob-card ob-pop-in');
    var prefHtml = PREFS.map(function (p) {
      var locked = p.vip && !canBroker();
      return '<button type="button" class="ob-pref' + (locked ? ' locked' : '') + '" data-p="' + p.id + '" aria-pressed="false"' + (locked ? ' disabled' : '') + '>' +
        '<span class="ob-ic">' + icon(p.ic) + '</span><span><span class="ob-pt">' + p.t + '</span><span class="ob-pd">' + p.d + '</span></span>' +
        (locked ? '<span class="ob-lock">會員功能</span>' : '<span class="ob-check">'+icon('check')+'</span>') + '</button>';
    }).join('');
    card.innerHTML =
      '<div class="ob-welcome-brand">' + owlMarkup() + '<span>FORESIGHT · GUIDE</span></div>' +
      '<h2>歡迎來到先見 FORESIGHT</h2>' +
      '<div class="ob-sub">選擇你的研究方向（可複選），讓先見帶你認識網站功能。<br>大盤觀察會在每一條導覽路線中介紹。</div>' +
      '<div class="ob-prefs">' + prefHtml + '</div>' +
      '<div class="ob-go"><button class="ob-btn" data-a="skipall" type="button">先略過</button><button class="ob-btn pri" data-a="start" type="button">開始導覽</button></div>';
    wrap.appendChild(card); root.appendChild(wrap);
    var chosen = {};
    card.querySelectorAll('.ob-pref:not(.locked)').forEach(function (d) {
      d.onclick = function () { var id = d.getAttribute('data-p'); chosen[id] = !chosen[id]; d.classList.toggle('on', chosen[id]);d.setAttribute('aria-pressed',String(chosen[id])); };
    });
    card.querySelector('[data-a="skipall"]').onclick = function () { finish(false); };
    card.querySelector('[data-a="start"]').onclick = function () {
      // 一個都沒選＝只跑共同＋會員；有選就加偏好
      wrap.remove(); startTour(chosen);
    };
    card.querySelector('[data-a="start"]').focus({preventScroll:true});
  }

  /* ── 重跑按鈕 ── */
  function showReplay() {
    ensureDock();updateDock();
  }

  var dock, dockPosition=.66, suppressClick=false;
  function positionDock() { if(!dock)return;var edge=dock.querySelector('.ob-edge'),height=edge.offsetHeight||124,margin=12,top=Math.round(margin+dockPosition*Math.max(0,innerHeight-height-margin*2));dock.style.top=top+'px';var panel=dock.querySelector('.ob-dock-panel'),ph=panel.offsetHeight;panel.style.top=Math.max(margin-top,Math.min(innerHeight-margin-ph-top,(height-ph)/2))+'px'; }
  function updateDock() { if(!dock)return;var state=readUI();dockPosition=state.position;dock.hidden=!state.enabled||!!(root&&!root.hidden);if(!state.enabled)setExpanded(false);positionDock(); }
  function setExpanded(open) { if(!dock)return;dock.dataset.open=String(open);dock.querySelector('.ob-edge-toggle').setAttribute('aria-expanded',String(open));dock.querySelector('.ob-edge-toggle').setAttribute('aria-label',(open?'收合':'展開')+'新手導覽');dock.querySelector('.ob-dock-panel').inert=!open;positionDock(); }
  function ensureDock() {
    if(dock)return;dock=el('aside','ob-dock');dock.id='obReplayBtn';dock.setAttribute('aria-label','新手導覽入口');dock.dataset.open='false';
    dock.innerHTML='<div class="ob-dock-panel" id="obDockPanel"><div class="ob-dock-heading">'+owlMarkup()+'<div>新手導覽<small>熟悉網站功能</small></div></div><button type="button" class="ob-dock-start">開始探索'+icon('arrow-up-right')+'</button><button type="button" class="ob-dock-settings">'+icon('settings-2')+'導覽設定</button></div><div class="ob-edge"><button type="button" class="ob-drag" aria-label="上下拖曳新手導覽；方向鍵可微調位置">'+icon('grip-horizontal')+'</button><button type="button" class="ob-edge-toggle" aria-expanded="false" aria-controls="obDockPanel" aria-label="展開新手導覽">'+owlMarkup()+'<span>新手導覽</span>'+icon('chevron-right')+'</button></div>';
    document.body.appendChild(dock);setExpanded(false);var edge=dock.querySelector('.ob-edge'),drag=dock.querySelector('.ob-drag'),startY=0,startTop=0,active=null,moved=false;
    edge.addEventListener('pointerdown',function(e){if(e.button!==0)return;active=e.pointerId;startY=e.clientY;startTop=parseFloat(dock.style.top)||0;moved=false;suppressClick=false;(e.target.closest('button')||edge).setPointerCapture(e.pointerId);});
    edge.addEventListener('pointermove',function(e){if(active!==e.pointerId)return;if(Math.abs(e.clientY-startY)>4)moved=true;if(!moved)return;e.preventDefault();var max=Math.max(1,innerHeight-edge.offsetHeight-24),top=Math.max(12,Math.min(innerHeight-edge.offsetHeight-12,startTop+e.clientY-startY));dockPosition=(top-12)/max;positionDock();});
    function endDrag(e){if(active!==e.pointerId)return;active=null;if(moved){suppressClick=true;try{saveUI({position:dockPosition});}catch(_){}setTimeout(function(){suppressClick=false;},0);}}
    edge.addEventListener('pointerup',endDrag);edge.addEventListener('pointercancel',endDrag);
    dock.querySelector('.ob-edge-toggle').addEventListener('click',function(){if(!suppressClick)setExpanded(dock.dataset.open!=='true');});
    drag.addEventListener('keydown',function(e){if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();dockPosition=e.key==='Home'?0:e.key==='End'?1:Math.max(0,Math.min(1,dockPosition+(e.key==='ArrowUp'?-.025:.025)));positionDock();try{saveUI({position:dockPosition});}catch(_){}});
    dock.querySelector('.ob-dock-start').onclick=function(){setExpanded(false);showMenu();};
    dock.querySelector('.ob-dock-settings').onclick=function(){setExpanded(false);window.openMemberCenter?.('settings');};
    document.addEventListener('pointerdown',function(e){if(!dock.contains(e.target))setExpanded(false);},true);
    dock.addEventListener('keydown',function(e){if(e.key==='Escape'){setExpanded(false);dock.querySelector('.ob-edge-toggle').focus();}});
    window.addEventListener('resize',positionDock);
  }
  function setEnabled(enabled) { saveUI({enabled:!!enabled});if(!enabled&&root&&!root.hidden)finish(false);showReplay();window.dispatchEvent(new Event('fqi-tour-preference-changed')); }
  function mountSettings(container) {
    var state=readUI();container.innerHTML='<section class="mc-card ob-settings-card"><div class="ob-settings-heading">'+icon('compass')+'<div><h2>導覽與使用偏好</h2><p>讓先見以你習慣的方式陪伴研究。</p></div></div><label class="ob-setting-row"><span><strong>新手導覽</strong><small>顯示右側標籤與首次導覽提醒</small></span><input class="ob-setting-switch" type="checkbox" role="switch" aria-label="新手導覽" '+(state.enabled?'checked':'')+'></label><p class="ob-setting-note">此設定與標籤位置保存在這個瀏覽器，依登入帳號分開記憶。</p><div class="mc-status" role="status"></div></section>';
    var input=container.querySelector('input'),status=container.querySelector('[role=status]');input.onchange=function(){try{setEnabled(input.checked);status.textContent=input.checked?'已開啟新手導覽':'已關閉新手導覽';}catch(_){input.checked=readUI().enabled;status.textContent='設定尚未儲存，請確認瀏覽器儲存空間後重試。';}};
    window.FqiArrival?.mountSettings(container);
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
  var waitingArrival=false;
  function maybeAutoStart() {
    if(window.FqiArrival?.active()){if(!waitingArrival){waitingArrival=true;window.addEventListener('fqi-arrival-closed',function(){waitingArrival=false;maybeAutoStart();},{once:true});}return;}
    if (autoChecked) return; autoChecked = true;
    showReplay();                                   // 登入後常駐重跑按鈕
    if(!readUI().enabled)return;
    try { if (localStorage.getItem(LS) === '1') return; } catch (_) {}
    var h = authHeaders(); if (!h) return;
    var ownerKey=uiKey();
    fetch(SB + '/auth/v1/user', { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
      if(ownerKey!==uiKey()||!readUI().enabled)return;
      var md = (u && u.user_metadata) || {};
      if (md[FLAG]) { try { localStorage.setItem(LS, '1'); } catch (_) {} return; }  // 這帳號已看過
      setTimeout(function(){if(ownerKey===uiKey()&&readUI().enabled)showMenu();}, 900); // 真首次且仍啟用 → 跑導覽
    }).catch(function () {});
  }

  /* ── 對外 API ── */
  window.FqiTour = {
    open: showMenu,                 // 手動開（重跑按鈕/選單）
    maybeAutoStart: maybeAutoStart, // 登入後由 _applyAuthState 呼叫
    mountSettings: mountSettings,
    enabled: function(){return readUI().enabled;},
    setEnabled: setEnabled
  };
  window.addEventListener('academy-auth-changed',function(){autoChecked=false;if(dock)setExpanded(false);if(window._loggedIn)maybeAutoStart();else updateDock();});
  // 保險：若登入狀態已就緒，延遲自動檢查一次
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (window._loggedIn) maybeAutoStart(); }, 1500); });
})();
