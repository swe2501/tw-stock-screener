(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const icons = {
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6.5 15h4"/></svg>',
    line: '<img class="mp-line-logo" src="assets/auth-brands/line.png" alt="" aria-hidden="true">',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10c0 1.3 1 2.3 2.3 2.3S7.7 11.3 7.7 10c0 1.3 1 2.3 2.3 2.3s2.3-1 2.3-2.3c0 1.3 1 2.3 2.3 2.3S17 11.3 17 10c0 1.3 1 2.3 2.3 2.3S21 11.3 21 10M9 20v-5h6v5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.6c0 4.8-3.2 8.1-8 9.6-4.8-1.5-8-4.8-8-9.6V6l8-3.2Z"/><path d="m8.7 12 2.1 2.1 4.6-4.7"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5"/></svg>'
  };

  const storeBrands = {
    '7-ELEVEN': '<span class="mp-store-brand mp-store-brand-seven" aria-label="7-ELEVEN"><svg viewBox="0 0 132 38" role="img"><title>7-ELEVEN</title><path fill="#f58220" d="M8 3h27l-15 31H8l11-22H8z"/><path fill="#ed1c24" d="M27 3h11L23 34H12z"/><rect x="43" y="4" width="84" height="5" rx="2.5" fill="#f58220"/><rect x="43" y="29" width="84" height="5" rx="2.5" fill="#00a651"/><text x="46" y="25" fill="#e31b23" font-family="Arial,sans-serif" font-size="17" font-weight="800">ELEVEN</text></svg></span>',
    '全家': '<span class="mp-store-brand mp-store-brand-family" aria-label="全家 FamilyMart"><svg viewBox="0 0 148 42" role="img"><title>全家 FamilyMart</title><rect x="4" y="5" width="140" height="5" rx="2.5" fill="#00a6c8"/><rect x="4" y="32" width="140" height="5" rx="2.5" fill="#68bd45"/><text x="16" y="29" fill="#009b73" font-family="Arial,sans-serif" font-size="19" font-weight="800">FamilyMart</text></svg></span>',
    '萊爾富': '<span class="mp-store-brand mp-store-brand-hilife" aria-label="萊爾富 Hi-Life"><svg viewBox="0 0 132 38" role="img"><title>萊爾富 Hi-Life</title><rect x="2" y="4" width="128" height="30" rx="7" fill="#fff"/><path fill="#ef3340" d="M11 9h8v20h-8zm12 0h8v20h-8z"/><text x="39" y="25" fill="#183a67" font-family="Arial,sans-serif" font-size="18" font-weight="800">Hi-Life</text><circle cx="114" cy="12" r="4" fill="#ef3340"/></svg></span>',
    'OK mart': '<span class="mp-store-brand mp-store-brand-ok" aria-label="OK mart"><svg viewBox="0 0 132 38" role="img"><title>OK mart</title><rect x="2" y="4" width="128" height="30" rx="7" fill="#fff"/><text x="10" y="27" fill="#0067b1" font-family="Arial,sans-serif" font-size="24" font-weight="900">OK</text><path d="M54 9h5v20h-5z" fill="#ed1c24"/><text x="66" y="25" fill="#253f66" font-family="Arial,sans-serif" font-size="17" font-weight="800">mart</text></svg></span>'
  };
  const storeBrand = store => storeBrands[store] || `<span class="mp-store-brand">${esc(store)}</span>`;

  // ── 2026-11-08 LINE Pay 串接（後端 lib/payments.py）：後端有設 LINE Pay 金鑰才啟用，否則維持原本預覽 ──
  // 金額、方案都由伺服器決定；網頁只送方案代碼。從 LINE Pay 導回後由後端「確認付款」才算付款完成。
  const PAY_API = (window.__API || '') + '/api/auth';
  const payToken = () => { try { return localStorage.getItem('sb_token') || ''; } catch (_) { return ''; } };
  async function payCall(action, extra) {
    const token = payToken();
    const response = await fetch(PAY_API, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(Object.assign({ action }, extra || {}))
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) { const error = Error(data.error || '連線失敗，請稍後再試'); error.status = response.status; error.code = data.code; throw error; }
    return data;
  }
  const payState = { token: null, plans: [], env: '', selected: '' };
  async function loadPlans() {
    const token = payToken();
    if (payState.token === token && Date.now()-(payState.loadedAt||0)<15000) return payState;
    payState.loadedAt=Date.now();payState.token = token; payState.plans = []; payState.env = '';
    if (!token) return payState;
    try {
      const data = await payCall('pay_plans');
      payState.plans = Array.isArray(data.plans) ? data.plans : [];
      payState.env = data.env || '';
      if (!payState.plans.some(plan => plan.plan_code === payState.selected)) payState.selected = payState.plans[0]?.plan_code || '';
    } catch (_) { payState.plans = []; }
    return payState;
  }
  const money = value => 'NT$ ' + Number(value || 0).toLocaleString('zh-TW');
  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  function detectCardNetwork(number) {
    const digits = String(number || '').replace(/\D/g, '');
    if (/^4/.test(digits)) return 'VISA';
    if (/^(5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'MASTERCARD';
    if (/^3[47]/.test(digits)) return 'AMERICAN EXPRESS';
    if (/^35(?:2[89]|[3-8]\d)/.test(digits)) return 'JCB';
    if (/^62/.test(digits)) return 'UNIONPAY';
    return 'PAYMENT CARD';
  }

  function cardNetworkMark(network) {
    if (network === 'VISA') return '<span class="mp-network-logo is-visa"><b>VISA</b></span>';
    if (network === 'MASTERCARD') return '<span class="mp-network-logo is-mastercard"><i></i><i></i><b>mastercard</b></span>';
    if (network === 'AMERICAN EXPRESS') return '<span class="mp-network-logo is-amex"><b>AMERICAN</b><b>EXPRESS</b></span>';
    if (network === 'JCB') return '<span class="mp-network-logo is-jcb"><i>J</i><i>C</i><i>B</i></span>';
    if (network === 'UNIONPAY') return '<span class="mp-network-logo is-unionpay"><i>U</i><i>P</i><b>UnionPay</b></span>';
    return '<span class="mp-network-logo is-generic"><b>PAYMENT</b><b>CARD</b></span>';
  }

  function renderCardNetwork(element, network) {
    if (!element) return;
    element.dataset.network = network.toLowerCase().replace(/\s+/g, '-');
    element.setAttribute('aria-label', network);
    element.innerHTML = cardNetworkMark(network);
  }

  const methods = {
    card: {
      label: '信用卡／簽帳金融卡', short: '信用卡', badge: '適合自動續訂', note: 'Visa・Mastercard・JCB', icon: icons.card,
      heading: '安全綁定付款卡', kicker: 'SECURE CARD', action: '安全新增卡片', summary: '綁定不會立即扣款'
    },
    line: {
      label: 'LINE Pay', short: 'LINE Pay', badge: '快速驗證', note: '使用 LINE App 完成授權', icon: icons.line,
      heading: '連結你的 LINE Pay', kicker: 'MOBILE WALLET', action: '連結 LINE Pay', summary: '連結不會立即扣款'
    },
    store: {
      label: '超商代碼', short: '超商代碼', badge: '單次方案付款', note: '四大超商皆可繳費', icon: icons.store,
      heading: '選擇超商並取得代碼', kicker: 'CONVENIENCE STORE', action: '產生繳費代碼', summary: '完成繳費後才會開通'
    }
  };

  const qrMarkup = `<svg class="mp-qr-svg" viewBox="0 0 21 21" role="img" aria-label="LINE Pay 示意 QR Code">
    <rect width="21" height="21" rx="1" fill="#fff"/><g fill="#102638">
      <path d="M1 1h6v6H1zm2 2v2h2V3zm11-2h6v6h-6zm2 2v2h2V3zM1 14h6v6H1zm2 2v2h2v-2z" fill-rule="evenodd"/>
      <path d="M9 1h2v2H9zm3 1h1v3h-2V4H9V3h3zM8 6h2v2h2v2h-2V9H8zm5 2h2v2h-2zm3 0h4v2h-2v2h-2zm-8 3h2v2H8zm3 0h3v2h2v2h-3v-1h-2zm6 2h3v2h-3zM8 15h2v2h2v3h-2v-2H8zm5 1h2v4h-2zm3 1h4v3h-2v-1h-2z"/>
    </g></svg>`;

  function paymentBody(method) {
    if (method === 'card') return `
      <div class="mp-card-scene" aria-label="付款卡即時預覽">
        <div class="mp-card-visual" data-card-visual>
          <div class="mp-card-face mp-card-front">
            <div class="mp-card-glow"></div><span class="mp-chip" aria-hidden="true"></span>
            <span class="mp-card-issuer">FORESIGHT</span><span class="mp-card-brand" data-card-network>${cardNetworkMark('PAYMENT CARD')}</span>
            <strong class="mp-card-number" aria-label="卡號預覽">${Array.from({ length: 16 }, (_, index) => `<span data-card-digit="${index}">•</span>${index % 4 === 3 && index < 15 ? '<i></i>' : ''}`).join('')}</strong>
            <div class="mp-card-meta"><span><small>CARD HOLDER</small><b data-card-holder>YOUR NAME</b></span><span><small>EXPIRES</small><b data-card-expiry>MM/YY</b></span></div>
          </div>
          <div class="mp-card-face mp-card-back">
            <span class="mp-card-strip" aria-hidden="true"></span>
            <div class="mp-card-signature"><span><small>AUTHORIZED SIGNATURE</small><i></i></span><strong data-card-cvc>•••</strong></div>
            <div class="mp-card-back-foot"><small>SECURE PAYMENT CARD</small><b>FORESIGHT</b></div>
          </div>
        </div>
      </div>
      <form class="mp-card-form" data-card-form novalidate>
        <label class="mp-field mp-field-wide"><span>卡號</span><input type="text" data-card-number inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="1234 5678 9012 3456" aria-label="信用卡卡號"><small>正式啟用時由金流商安全欄位加密處理</small></label>
        <label class="mp-field"><span>有效期限</span><input type="text" data-card-expiry-input inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="MM/YY" aria-label="信用卡有效期限"></label>
        <label class="mp-field"><span>安全碼</span><input type="password" data-card-cvc-input inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="CVC" aria-label="信用卡安全碼"><small class="mp-field-help">僅用於本次安全驗證，不會顯示在卡片上。</small></label>
        <label class="mp-field mp-field-wide"><span>持卡人姓名</span><input type="text" data-card-holder-input autocomplete="cc-name" maxlength="32" placeholder="與卡片上的英文姓名一致" aria-label="持卡人姓名"></label>
      </form>
      <div class="mp-benefit-list">
        <div>${icons.shield}<span><b>卡號不存放在先見</b><small>正式啟用後由合規金流頁面完成驗證與代碼化。</small></span></div>
        <div>${icons.check}<span><b>期間依所選商品為準</b><small>目前不會自動續訂；信用卡綁定功能須另行開通。</small></span></div>
      </div>
      <p class="mp-demo-note">目前為付款介面預覽，尚未串接金流；輸入內容不會送出或儲存。</p>`;
    if (method === 'line') return `
      <div class="mp-line-stage">
        <div class="mp-phone" aria-label="使用手機掃描 LINE Pay QR Code">
          <span class="mp-phone-speaker" aria-hidden="true"></span>
          <div class="mp-phone-screen"><span class="mp-line-mini">LINE Pay</span><div class="mp-qr-wrap">${qrMarkup}<i aria-hidden="true"></i></div><small>使用 LINE 掃描</small></div>
        </div>
        <div class="mp-line-copy"><span class="mp-line-mark">${icons.line}</span><small>SCAN TO CONNECT</small><strong>用手機完成安全授權</strong><p>電腦版掃描 QR Code；手機版正式串接後會直接開啟 LINE App。授權與付款確認都在 LINE Pay 安全畫面完成。</p><span class="mp-qr-life"><i></i>QR Code 將於 04:59 後更新</span></div>
        <span class="mp-wallet-orbit" aria-hidden="true"></span>
      </div>
      <ol class="mp-steps" aria-label="LINE Pay 連結流程"><li><b>1</b><span>掃描 QR Code</span></li><li><b>2</b><span>確認會員帳號</span></li><li><b>3</b><span>完成授權</span></li></ol>
      <p class="mp-demo-note">目前為 LINE Pay 介面預覽，尚未串接金流；示意 QR Code 無法付款。</p>`;
    return `
      <fieldset class="mp-store-choices"><legend>選擇繳費通路</legend>
        ${['7-ELEVEN', '全家', '萊爾富', 'OK mart'].map((store, index) => `<label><input type="radio" name="mp-store" value="${esc(store)}" ${index === 0 ? 'checked' : ''}><span>${storeBrand(store)}</span></label>`).join('')}
      </fieldset>
      <div class="mp-ticket" data-store-ticket aria-label="超商繳費票券預覽">
        <span class="mp-ticket-edge mp-ticket-edge-top" aria-hidden="true"></span><span class="mp-ticket-edge mp-ticket-edge-bottom" aria-hidden="true"></span>
        <div class="mp-ticket-head"><span><small>FORESIGHT PAYMENT</small><b>會員方案繳費單</b></span><strong data-ticket-store>${storeBrand('7-ELEVEN')}</strong></div>
        <div class="mp-ticket-code"><small>PAYMENT CODE</small><strong>•••• •••• ••••</strong><span>產生後顯示</span></div>
        <div class="mp-barcode" aria-hidden="true"></div>
        <div class="mp-ticket-foot"><span>有效期限</span><b>產生後 3 日內</b><i>單次付款</i></div>
      </div>
      <div class="mp-caution"><b>這是單次付款方式</b><span>不支援自動續訂；代碼會有繳費期限，入帳後才開通方案。</span></div>
      <p class="mp-demo-note">目前為超商代碼介面預覽，尚未串接金流；示意票券無法繳費。</p>`;
  }

  function wireCardInputs(host) {
    const form = host.querySelector('[data-card-form]');
    if (!form) return;
    const visual = host.querySelector('[data-card-visual]');
    const number = form.querySelector('[data-card-number]');
    const expiry = form.querySelector('[data-card-expiry-input]');
    const cvc = form.querySelector('[data-card-cvc-input]');
    const holder = form.querySelector('[data-card-holder-input]');
    const network = host.querySelector('[data-card-network]');
    const digits = [...host.querySelectorAll('[data-card-digit]')];
    const fields = [number, expiry, cvc, holder];
    const bounce = element => {
      element.classList.remove('is-changing');
      void element.offsetWidth;
      element.classList.add('is-changing');
    };
    number.addEventListener('input', () => {
      const raw = number.value.replace(/\D/g, '').slice(0, 16);
      const networkName = detectCardNetwork(raw);
      number.value = networkName === 'AMERICAN EXPRESS'
        ? [raw.slice(0, 4), raw.slice(4, 10), raw.slice(10, 15)].filter(Boolean).join(' ')
        : raw.replace(/(.{4})/g, '$1 ').trim();
      renderCardNetwork(network, networkName);
      host.querySelectorAll('[data-flow-network]').forEach(label => renderCardNetwork(label, networkName));
      number.setSelectionRange(number.value.length, number.value.length);
      const previewLength = networkName === 'AMERICAN EXPRESS' ? 15 : 16;
      digits.forEach((digit, index) => {
        const next = raw[index] || (index < previewLength ? '•' : '');
        if (digit.textContent !== next) { digit.textContent = next; bounce(digit); }
      });
    });
    expiry.addEventListener('input', () => {
      const raw = expiry.value.replace(/\D/g, '').slice(0, 4);
      expiry.value = raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
      expiry.setSelectionRange(expiry.value.length, expiry.value.length);
      const preview = host.querySelector('[data-card-expiry]');
      preview.textContent = expiry.value || 'MM/YY';
      bounce(preview);
    });
    holder.addEventListener('input', () => {
      const preview = host.querySelector('[data-card-holder]');
      preview.textContent = holder.value.trim().toUpperCase() || 'YOUR NAME';
      bounce(preview);
    });
    cvc.addEventListener('focus', () => visual.classList.add('is-flipped'));
    cvc.addEventListener('blur', () => visual.classList.remove('is-flipped'));
    cvc.addEventListener('input', () => {
      cvc.value = cvc.value.replace(/\D/g, '').slice(0, 4);
      const preview = host.querySelector('[data-card-cvc]');
      preview.textContent = cvc.value ? '•'.repeat(cvc.value.length) : '•••';
      bounce(preview);
    });
    fields.forEach(input => input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      input.closest('.mp-field')?.classList.remove('is-invalid');
      const rawNumber = number.value.replace(/\D/g, '');
      const rawExpiry = expiry.value.replace(/\D/g, '');
      const expectedLength = detectCardNetwork(rawNumber) === 'AMERICAN EXPRESS' ? 15 : 16;
      const complete = rawNumber.length === expectedLength && rawExpiry.length === 4 && cvc.value.length >= 3 && holder.value.trim().length >= 2;
      form.classList.toggle('is-complete', complete);
      host.querySelector('[data-card-ready]')?.classList.toggle('is-ready', complete);
    }));
    const scene = host.querySelector('.mp-card-scene');
    scene?.addEventListener('pointermove', event => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = scene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      visual.style.setProperty('--mp-tilt-x', `${(-y * 7).toFixed(2)}deg`);
      visual.style.setProperty('--mp-tilt-y', `${(x * 9).toFixed(2)}deg`);
      visual.style.setProperty('--mp-shine-x', `${((x + .5) * 100).toFixed(1)}%`);
      visual.style.setProperty('--mp-shine-y', `${((y + .5) * 100).toFixed(1)}%`);
    });
    scene?.addEventListener('pointerleave', () => {
      visual.style.setProperty('--mp-tilt-x', '0deg');
      visual.style.setProperty('--mp-tilt-y', '0deg');
      visual.style.setProperty('--mp-shine-x', '72%');
      visual.style.setProperty('--mp-shine-y', '18%');
    });
    form.addEventListener('submit', event => event.preventDefault());
  }

  function validateCard(host) {
    const form = host.querySelector('[data-card-form]');
    if (!form) return true;
    const rules = [
      ['[data-card-number]', input => {
        const raw = input.value.replace(/\D/g, '');
        return raw.length === (detectCardNetwork(raw) === 'AMERICAN EXPRESS' ? 15 : 16);
      }],
      ['[data-card-expiry-input]', input => input.value.replace(/\D/g, '').length === 4],
      ['[data-card-cvc-input]', input => input.value.replace(/\D/g, '').length >= 3],
      ['[data-card-holder-input]', input => input.value.trim().length >= 2]
    ];
    let firstInvalid = null;
    rules.forEach(([selector, valid]) => {
      const input = form.querySelector(selector);
      const isValid = valid(input);
      input.setAttribute('aria-invalid', String(!isValid));
      input.closest('.mp-field')?.classList.toggle('is-invalid', !isValid);
      if (!isValid && !firstInvalid) firstInvalid = input;
    });
    firstInvalid?.focus();
    return !firstInvalid;
  }

  function showCardSuccess(host) {
    const page = host.querySelector('.mp-page');
    const success = host.querySelector('[data-payment-success]');
    page?.classList.remove('is-payment-processing');
    host.querySelector('[data-payment-processing]')?.setAttribute('aria-hidden', 'true');

    page?.classList.add('is-payment-success');
    success?.setAttribute('aria-hidden', 'false');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 2));
    window.setTimeout(() => success?.querySelector('button')?.focus({ preventScroll: true }), 760);
  }

  async function showDemoResult(host,result){
    const failure=result==='failure',screen=host.querySelector('[data-payment-success]');if(!screen)return;screen.querySelector(':scope>small').textContent=failure?'PAYMENT DECLINED · DEMO':'PAYMENT CONFIRMED · DEMO';
    screen.classList.toggle('mp-demo-failure',failure);screen.setAttribute('role','status');screen.setAttribute('aria-label',failure?'模擬付款失敗':'模擬付款成功');
    screen.querySelector('h3').textContent=failure?'測試：付款未完成':'測試：付款確認成功';
    screen.querySelector('p').textContent=failure?'這是模擬失敗動畫，沒有送出卡片資料，也沒有扣款。可返回檢查資料，再試一次成功流程。':'這是模擬成功動畫，沒有真正綁卡、扣款或開通會員。正式結果須由金流商確認。';
    screen.querySelector('.mp-success-mark').innerHTML=failure?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>':icons.check;
    screen.querySelector('[data-success-back]').textContent=failure?'返回檢查並重試':'返回繼續測試';
    const card=host.querySelector('.mp-processing-card-orbit .mp-flow-card'),slot=host.querySelector('[data-result-card-slot]');if(!card||!slot)return;
    const run=host._demoRun,from=card.getBoundingClientRect(),reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    slot.style.width=from.width+'px';slot.style.height=from.height+'px';slot.append(card);card.classList.add('mp-shared-result-card');card.style.width='100%';card.style.height='100%';card.dataset.result='pending';
    card.insertAdjacentHTML('beforeend','<svg class="mp-card-edge" viewBox="0 0 270 167" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="mp-card-edge-glow"><stop stop-color="#ffe1a1"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#8edbd8"/></linearGradient></defs><rect x="1.5" y="1.5" width="267" height="164" rx="19" pathLength="1"/></svg>');
    showCardSuccess(host);screen.classList.add('mp-same-card-result');screen.querySelectorAll(':scope>.mp-success-mark,:scope>small,:scope>h3,:scope>p,:scope>[data-success-back]').forEach(e=>{e.style.visibility='hidden';});
    const to=card.getBoundingClientRect();if(!reduced)card.animate([{transform:'translate('+(from.left-to.left)+'px,'+(from.top-to.top)+'px)'},{transform:'none'}],{duration:480,easing:'cubic-bezier(.2,.8,.2,1)'});
    const valid=()=>card.isConnected&&host.contains(card)&&host._demoRun===run&&demoMode;
    try{
      await card.querySelector('rect').animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:reduced?0:900,easing:'linear',fill:'forwards'}).finished;if(!valid())return;
      card.dataset.result=result;
      const tone=failure?'linear-gradient(135deg,#511a24,#a52b37 65%,#cb514a)':'linear-gradient(135deg,#082b26,#0a6849 64%,#28946a)';
      const color=document.createElement('i');color.className='mp-card-color-layer';color.setAttribute('aria-hidden','true');color.style.background=tone;card.prepend(color);await color.animate([{opacity:0},{opacity:1}],{duration:reduced?0:460,easing:'ease-in-out',fill:'forwards'}).finished;if(!valid())return;
      card.querySelector('small').textContent=failure?'PAYMENT DECLINED · DEMO':'PAYMENT CONFIRMED · DEMO';
      screen.querySelectorAll(':scope>.mp-success-mark,:scope>small,:scope>h3,:scope>p,:scope>[data-success-back]').forEach(e=>{e.style.visibility='';});
      screen.dataset.feedback=result;paymentFeedback(result);
      if(failure&&!reduced){host.querySelector('.mp-workspace').animate([{transform:'translateX(0)'},{transform:'translateX(-7px)'},{transform:'translateX(6px)'},{transform:'translateX(-4px)'},{transform:'translateX(2px)'},{transform:'translateX(0)'}],{duration:270,easing:'ease-out'});try{navigator.vibrate?.([70,35,70]);}catch{}}
      host.dispatchEvent(new CustomEvent('academy-payment-demo-feedback',{detail:{result,time:performance.now()}}));
    }catch{}
  }

  function restoreSharedCard(host){
    host._demoRun=(host._demoRun||0)+1;const card=host.querySelector('.mp-shared-result-card');if(card){card.getAnimations().forEach(a=>a.cancel());card.querySelector('.mp-card-edge')?.remove();card.querySelector('.mp-card-color-layer')?.remove();card.classList.remove('mp-shared-result-card');card.removeAttribute('data-result');card.style.width='';card.style.height='';card.querySelector('small').textContent='SECURE PAYMENT';host.querySelector('.mp-processing-card-orbit')?.append(card);}host.querySelector('[data-payment-success]')?.classList.remove('mp-same-card-result');
  }
  let paymentAudio=null,soundEnabled=true;
  function primePaymentAudio(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(soundEnabled&&Audio){paymentAudio??=new Audio();paymentAudio.resume().catch(()=>{});}}catch{}}
  function paymentFeedback(result){if(!soundEnabled||!paymentAudio||paymentAudio.state!=='running')return;const t=paymentAudio.currentTime;const tone=(freq,at,length,type,volume)=>{const o=paymentAudio.createOscillator(),g=paymentAudio.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.008);g.gain.exponentialRampToValueAtTime(.001,at+length);o.connect(g);g.connect(paymentAudio.destination);o.start(at);o.stop(at+length+.02);};if(result==='failure'){tone(170,t,.1,'triangle',.17);tone(115,t+.12,.12,'triangle',.16);}else{tone(1046.5,t,.65,'sine',.14);tone(2093,t+.012,.45,'sine',.045);}}
  async function completeProcessingCycle(host,cardPage,result){const run=host._demoRun,ring=host.querySelector('.mp-card-orbit-ring-outer');try{if(!matchMedia('(prefers-reduced-motion:reduce)').matches){if(ring?.getAnimations().some(a=>a.animationName==='mp-card-orbit'))await new Promise(resolve=>{const end=e=>{if(e.animationName==='mp-card-orbit'){ring.removeEventListener('animationiteration',end);resolve();}};ring.addEventListener('animationiteration',end);});else await cardPage.animate([{opacity:1},{opacity:1}],{duration:300}).finished;}if(cardPage?.isConnected&&demoMode&&host._demoRun===run)showDemoResult(host,result);}catch{}}

  function showCardProcessing(host) {
    restoreSharedCard(host);
    const page = host.querySelector('.mp-page');
    page?.classList.remove('is-payment-success');
    page?.classList.add('is-payment-processing');
    host.querySelector('[data-payment-processing]')?.setAttribute('aria-hidden', 'false');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 1));
  }

  function hideCardSuccess(host) {
    restoreSharedCard(host);
    host.querySelector('.mp-page')?.classList.remove('is-payment-success', 'is-payment-processing');
    host.querySelector('[data-payment-processing]')?.setAttribute('aria-hidden', 'true');
    host.querySelector('[data-payment-success]')?.setAttribute('aria-hidden', 'true');
    host._updateBillingStep?.();
    host.querySelector('[data-card-number]')?.focus({ preventScroll: true });
  }

  function wireStoreInputs(host) {
    const ticket = host.querySelector('[data-store-ticket]');
    if (!ticket) return;
    host.querySelectorAll('input[name="mp-store"]').forEach(input => input.addEventListener('change', () => {
      host.querySelector('[data-ticket-store]').innerHTML = storeBrand(input.value);
      ticket.classList.remove('is-switching');
      void ticket.offsetWidth;
      ticket.classList.add('is-switching');
    }));
  }

  function wireActionLight(host) {
    const button = host.querySelector('[data-payment-action]');
    if (!button) return;
    button.addEventListener('pointermove', event => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--mp-btn-x', `${event.clientX - rect.left}px`);
      button.style.setProperty('--mp-btn-y', `${event.clientY - rect.top}px`);
    });
  }

  let demoMode=location.protocol==='file:',demoResult="success";
  const canDemo=()=>location.protocol==='file:'||['localhost','127.0.0.1'].includes(location.hostname)||window._isOwner||window._isAdmin;
  function renderPanel(host, profile, method, initialStep=1) {
    host._demoRun=(host._demoRun||0)+1;
    host._billingProduct=null;
    const billingOwner=profile?.id||profile?.user?.id||'local-preview';
    if(host._billingOwner!==billingOwner){host._billingOwner=billingOwner;host._billingDemo=null;}
    const data = methods[method];
    const plan = profile?.membership?.plan && profile.membership.plan !== 'general'
      ? (window.AcademyResearchTitle?.() || '已授權方案') : '尚未選擇付費方案';
    host.innerHTML = `
      ${window.AcademyMembershipBenefits?.billingIntro?.() || ""}
      <section class="mp-page" data-payment-method="${method}">
        <header class="mp-heading">
          <div><span class="mc-kicker">FORESIGHT QUANT · BILLING</span><h2>方案與帳務</h2><p>管理付款方式與方案繳費。所有扣款都會在最後一步再次確認。</p></div>
          <span class="mp-security">${icons.shield}<span><b>安全支付</b><small>不在本站保存完整卡號</small></span></span>
        </header>
        <section class="mp-product-section"><h3>選擇會員方案</h3><p>先選想了解的方案，再選付款方式。付款未開放時仍可比較，價格暫不顯示。</p><div data-payment-products role="group" aria-label="會員方案選擇"></div><p data-payment-product-detail aria-live="polite"></p></section>${canDemo()?`<div class="mp-demo-controls"><button type="button" class="mc-secondary-text" data-payment-demo aria-pressed="${demoMode}">${demoMode?'退出測試模式':'測試付款流程（不扣款）'}</button>${demoMode?`<label class="mp-demo-result">測試結果<select data-demo-result aria-label="選擇模擬付款結果"><option value="success" ${demoResult==='success'?'selected':''}>模擬成功</option><option value="failure" ${demoResult==='failure'?'selected':''}>模擬失敗</option></select></label><label class="mp-demo-result"><input type="checkbox" data-demo-sound ${soundEnabled?'checked':''}>音效</label>`:''}<span>${demoMode?'測試中：請使用測試卡號，不會送出、保存或綁定卡片。':'想試填卡片與完成動畫，可開啟測試模式。'}</span></div>`:''}<div class="mp-progress" aria-label="付款流程"><span class="is-current"><b>1</b>選擇方案</span><i></i><span><b>2</b>付款方式</span><i></i><span><b>3</b>確認開通</span></div>
        <div class="mp-checkout">
          <aside class="mp-methods" aria-label="付款方式">
            <div class="mp-column-label"><small>PAYMENT METHODS</small><strong>選擇付款方式</strong></div>
            ${Object.entries(methods).map(([id, item]) => `<button type="button" class="mp-method" data-method="${id}" aria-pressed="${id === method}">
              <span class="mp-method-icon">${item.icon}</span><span><b>${item.label}</b><small>${item.note}</small></span><em>${item.badge}</em>
            </button>`).join('')}
            <div class="mp-trust"><span>${icons.shield}</span><p><b>你的付款資料受到保護</b><small>正式串接時由金流商進行 3D 驗證與交易處理。</small></p></div>
          </aside>
          <section class="mp-workspace" aria-live="polite">
            <div class="mp-workspace-title"><span><small>${data.kicker}</small><h3>${data.heading}</h3></span><span class="mp-method-tag">${data.icon}${data.short}</span></div>
            <div class="mp-method-body">${paymentBody(method)}</div>
            <button type="button" class="mp-action" data-payment-action disabled><i class="mp-action-lock" aria-hidden="true">${icons.shield}</i><span>${data.action}</span>${icons.arrow}</button>
            <div class="mp-action-status" role="status"></div>
            ${method === 'card' ? `<div class="mp-card-ready" data-card-ready><i>${icons.check}</i><span>卡片欄位已完整，可以進行安全確認</span></div>
            <section class="mp-processing-screen" data-payment-processing aria-hidden="true" aria-label="卡片資料安全處理中">
                <div class="mp-processing-card-orbit" aria-hidden="true">
                  <i class="mp-card-orbit-ring mp-card-orbit-ring-outer"></i>
                  <i class="mp-card-orbit-ring mp-card-orbit-ring-inner"></i>
                  <div class="mp-flow-card"><span class="mp-flow-chip"></span><b><span>FORESIGHT</span><em data-flow-network>${cardNetworkMark('PAYMENT CARD')}</em></b><strong>•••• &nbsp;•••• &nbsp;•••• &nbsp;••••</strong><small>SECURE PAYMENT</small></div>
                </div>
              <small>SECURING YOUR CARD</small><h3>正在建立安全驗證</h3><p>準備交由金流商進行加密與 3D 驗證。</p><i class="mp-processing-bar" aria-hidden="true"></i>
            </section>
            <section class="mp-success-screen" data-payment-success aria-hidden="true" aria-label="卡片資料完成動畫">
              <div class="mp-success-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
              <div class="mp-result-card-slot" data-result-card-slot></div>
              <div class="mp-success-mark">${icons.check}</div>
              <small>SECURE CARD · COMPLETE</small>
              <h3>卡片資料已完成</h3>
              <p>格式驗證完成。正式串接後，下一步會由金流商進行 3D 驗證；目前沒有送出卡號，也不會產生扣款。</p>
              <button type="button" data-success-back>返回編輯</button>
            </section>` : ''}
          </section>
          <aside class="mp-summary">
            <div class="mp-column-label"><small>MEMBERSHIP SUMMARY</small><strong>帳務摘要</strong></div>
            <div class="mp-plan-emblem"><span>FQ</span><div><small>目前會員狀態</small><b>${esc(plan)}</b></div></div>
            <dl><div><dt>付款方式</dt><dd data-summary-method>${data.short}</dd></div><div><dt>本次金額</dt><dd data-summary-amount>付款前確認</dd></div><div><dt>扣款狀態</dt><dd data-summary-status>${data.summary}</dd></div></dl>
            <div class="mp-summary-note"><b>清楚確認，再進行付款</b><p>尚未完成金流串接前不會建立訂單，也不會要求你輸入真實卡號。</p></div>
            <button type="button" class="mp-history">付款紀錄<span>查看</span></button>
          </aside>
        </div>
      </section>`;

    host.querySelector('[data-mb-back]')?.addEventListener('click',()=>window.openMemberCenter?.('benefits'));
    host.querySelector('[data-payment-demo]')?.addEventListener('click',()=>{demoMode=!demoMode;renderPanel(host,profile,method);});
    host.querySelector('[data-demo-sound]')?.addEventListener('change',e=>{soundEnabled=e.target.checked;});
    host.querySelector('[data-demo-result]')?.addEventListener('change',e=>{demoResult=e.target.value;});
    if(demoMode){const action=host.querySelector('[data-payment-action]');action.disabled=false;action.querySelector('span').textContent=method==='card'?'測試新增卡片（不綁卡、不扣款）':'測試'+methods[method].short+'流程（不扣款）';host.querySelectorAll('.mp-method-body input').forEach(input=>input.disabled=false);host.querySelector('.mp-action-status').textContent='本機測試模式：不會綁卡、扣款或保存卡號。';}
    installBillingSteps(host, method, initialStep);
    mountBillingOverview(host);
    mountProductChoices(host,method);
    wireCardInputs(host);
    wireStoreInputs(host);
    wireActionLight(host);

    host.querySelectorAll('[data-method]').forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.method;
      if (next === method) return;
      try { sessionStorage.setItem('foresight.payment.method', next); } catch (_) {}
      renderPanel(host, profile, next, 2);
    }));

    host.querySelector('[data-success-back]')?.addEventListener('click', () => hideCardSuccess(host));

    if (method === 'line') mountLinePay(host);
    host.querySelector('.mp-history')?.addEventListener('click', () => showHistory(host));
    if (payToken()) loadPlans().then(state => {
      const history = host.querySelector('.mp-history');
      if (history && state.plans.length) { history.disabled = false; history.querySelector('span').textContent = '查看'; }
    });

    host.querySelector('[data-payment-action]').addEventListener('click', event => {
      if(event.currentTarget.disabled)return;
      if(demoMode){const status=host.querySelector('.mp-action-status');if(method==='card'){if(!validateCard(host)){status.textContent='請填入測試卡號 4111 1111 1111 1111、未來有效期限、任意 3 碼安全碼與測試姓名。';return;}const cardPage=host.querySelector('[data-payment-method=card]'),result=demoResult;primePaymentAudio();showCardProcessing(host);completeProcessingCycle(host,cardPage,result);}else status.textContent=method==='line'?'測試完成：正式流程會前往 LINE Pay；這次沒有建立訂單，也不會開啟付款網站。':'測試完成：正式流程會產生超商繳費代碼；這次沒有訂單或可繳費代碼。';return;}
      const actionButton = event.currentTarget;
      const status = host.querySelector('.mp-action-status');
      if (method === 'line' && host.dataset.lineLive === '1') { startLinePay(host, actionButton, status); return; }
      const label = actionButton.querySelector('span');
      const originalLabel = label.textContent;
      status.classList.remove('is-error');
      if (method === 'card' && !validateCard(host)) {
        status.textContent = '請先完成卡號、期限、安全碼與持卡人姓名。';
        status.classList.add('is-error');
        const form = host.querySelector('[data-card-form]');
        form?.classList.remove('is-invalid-pulse');
        void form?.offsetWidth;
        form?.classList.add('is-invalid-pulse');
        return;
      }
      actionButton.classList.remove('is-busy');
      void actionButton.offsetWidth;
      actionButton.classList.add('is-busy');
      label.textContent = method === 'store' ? '準備安全繳費單…' : '建立安全連線…';
      if (method === 'store') {
        const ticket = host.querySelector('[data-store-ticket]');
        ticket?.classList.remove('is-printing');
        void ticket?.offsetWidth;
        ticket?.classList.add('is-printing');
      }
      status.textContent = method === 'store'
        ? '超商代碼服務尚未接通；正式啟用後會先確認方案與金額，再產生限時繳費代碼。'
        : `${methods[method].short}安全連線尚未啟用；正式串接後會前往金流商完成驗證，不會在先見保存完整付款資料。`;
      if (method === 'card') showCardProcessing(host);
      window.setTimeout(() => {
        if (!actionButton.isConnected) return;
        actionButton.classList.remove('is-busy');
        label.textContent = originalLabel;
        if (method === 'card') showCardSuccess(host);
      }, method === 'card' ? 1900 : 920);
    });
    if(method==='card')host.querySelector('.mp-workspace').classList.add('mp-inline-card');
  }

  async function mountProductChoices(host,method,refreshCatalog=true){
    const box=host.querySelector('[data-payment-products]');if(!box)return;
    const run=host._productLoad=(host._productLoad||0)+1;
    box.textContent='正在載入會員方案…';
    if(refreshCatalog){const refresh=window.AcademyMemberCatalog?.refresh();await Promise.race([Promise.resolve(refresh).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,8000))]);}
    if(!box.isConnected||run!==host._productLoad)return;
    const catalog=window.AcademyMemberCatalog?.get();const products=(catalog?.products||[]).filter(p=>p.active!==false);
    if(!products.length){
      host._billingProduct=null;host._syncProductChoice=null;host.querySelector('[data-payment-action]').disabled=true;
      host._resetBillingStep?.();
      box.innerHTML='<p role="status">'+(catalog?'目前沒有上架中的會員方案。':'會員方案暫時無法載入，請重新載入後再選擇。')+'</p><button type="button" class="mc-secondary-text" data-products-retry>重新載入方案</button>';
      box.querySelector('[data-products-retry]').onclick=()=>mountProductChoices(host,method);
      host.querySelector('[data-payment-product-detail]').textContent='';return;
    }
    if(host._billingProduct&&!products.some(p=>p.id===host._billingProduct.id))host._resetBillingStep?.();
    let preferred='';try{preferred=sessionStorage.getItem('foresight.membership.product')||'';}catch{}
    let interest='';try{interest=sessionStorage.getItem('foresight.membership.interest')||'';}catch{}
    let selected=products.find(p=>p.id===preferred)||products.find(p=>p.tier===interest)||products[0];
    box.innerHTML=products.map(p=>'<article class="mp-product-choice"><label><input type="radio" name="billing-product" value="'+esc(p.id)+'" '+(p.id===selected.id?'checked':'')+'><span class="mp-product-symbol">'+(window.AcademyMemberCatalog?.icon?.(p.icon)||'')+'</span><strong>'+esc(p.name)+'</strong></label><p>'+esc(p.description||'')+'</p><small>'+((p.tier==='free')?'免費基礎身分':p.purchasable?money(p.price_twd)+' ／ 月':'付款尚未開放，暫不顯示價格')+'</small><button type="button" data-product-subscribe="'+esc(p.id)+'">'+(p.tier==='free'?'查看免費權益':'訂閱此方案 →')+'</button>'+(p.tier!=='free'?'<button type="button" class="mp-product-once" data-product-once="'+esc(p.id)+'">單次購買</button>':'')+'</article>').join('');
    const sync=()=>{if(!box.isConnected)return;try{sessionStorage.setItem('foresight.membership.product',selected.id);sessionStorage.setItem('foresight.membership.interest',selected.tier);sessionStorage.setItem('foresight.membership.plan',selected.plan_code||'');}catch{}
      host._billingProduct=selected;
      host.querySelector('[data-payment-product-detail]').textContent=selected.description+' '+(selected.details||'');
      const action=host.querySelector('[data-payment-action]'),status=host.querySelector('.mp-action-status'),real=!demoMode&&method==='line'&&host.dataset.lineLive==='1'&&selected.purchasable;
      action.disabled=!real&&!demoMode;action.querySelector('span').textContent=demoMode?(method==='card'?'測試新增卡片（不綁卡、不扣款）':'測試'+methods[method].short+'流程（不扣款）'):real?'前往 LINE Pay 付款':selected.tier==='free'?'免費身分，無需付款':method==='card'?'信用卡綁定尚未開通':method==='store'?'超商付款尚未開通':'目前尚未開放付款';
      status.textContent=demoMode?'測試模式：請用 4111 1111 1111 1111、未來期限、任意 3 碼安全碼及測試姓名；不會送出或保存資料。':method==='card'?'信用卡介面保留供你了解操作，目前尚未提供真正綁卡或扣款，請勿填寫真實卡號。':method==='store'?'目前不會產生繳費代碼，也不會建立超商訂單。':!real?'你可以先選方案與付款方式；正式開放前不會建立新訂單或扣款。':'請確認所選方案與期間，最後由 LINE Pay 確認付款。';
      host.querySelectorAll('.mp-method-body input').forEach(input=>{if(input.name!=='mp-plan'&&input.type!=='radio')input.disabled=!demoMode;});
      const note=host.querySelector('.mp-summary-note');note.innerHTML='<b>已選方案：'+esc(selected.name)+'</b><p>'+(real?'付款金額與期間請在送出前再次確認。':'目前只選擇方案，不會綁卡或扣款。')+'</p>';
      if(real){payState.selected=selected.plan_code;const input=[...host.querySelectorAll('[name=mp-plan]')].find(x=>x.value===selected.plan_code);if(input){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}
      else host.querySelector('[data-summary-amount]').textContent='尚未開放付款';
    };
    box.onchange=e=>{const p=products.find(p=>p.id===e.target.value);if(p){selected=p;sync();host._updateBillingStep?.();}};
    box.onclick=e=>{const button=e.target.closest('[data-product-subscribe],[data-product-once]');if(!button)return;const p=products.find(p=>p.id===(button.dataset.productSubscribe||button.dataset.productOnce));if(!p)return;selected=p;box.querySelectorAll('[name=billing-product]').forEach(input=>input.checked=input.value===p.id);sync();if(p.tier==='free'){window.openMemberCenter?.('benefits');return;}host._beginBilling?.(host._billingDemo?.mode||(button.hasAttribute('data-product-once')?'one_time':'monthly'));};
    host._syncProductChoice=sync;sync();host._updateBillingStep?.();
    host._labelBillingPlans?.();
  }

  function mountBillingOverview(host){
    const box=document.createElement('section');box.className='mp-billing-overview';
    host.querySelector('.mp-heading').after(box);
    const rank={free:0,observation:1,research:2,advanced:2,vip:3};
    const date=value=>value?new Date(value).toLocaleDateString('zh-TW'):'待確認';
    const paint=()=>{
      const s=demoMode?host._billingDemo:null,real=host._realBilling;
      box.innerHTML='<h3>目前方案</h3>'+(s?'<b>'+esc(s.plan.name||s.plan.id)+' <small>模擬測試</small></b><p>'+(s.mode==='monthly'?'每月訂閱':'單次購買')+' · '+(s.status==='past_due'?'續扣失敗，未取得下期權益':s.status==='expired'?'已到期':s.cancel?'已取消續訂':'本期使用中')+'<br>本期可使用至 '+date(s.end)+(s.pending?'<br>下期將改為 '+esc(s.pending.name||s.pending.id)+'，生效日 '+date(s.end):'')+'</p>':real?'<b>'+esc(real.plan_name||real.source_label)+'</b><p>'+esc(real.source_label)+' · '+esc(real.status)+(real.next_charge_at?'<br>下次扣款日 '+date(real.next_charge_at):real.expires_at?'<br>可使用至 '+date(real.expires_at):'')+'</p>':'<p>'+ (payToken()?'正在載入目前方案…':'登入後可查看正式方案與續訂狀態。')+'</p>')+'<div><button type="button" data-overview-change>更改方案</button>'+(s&&s.status!=='expired'&&s.mode==='monthly'?'<button type="button" data-overview-renew>'+(s.cancel?'恢復自動續訂':'取消自動續訂')+'（測試）</button>':real?.source==='monthly'?'<button type="button" disabled title="訂閱金流尚未串接">'+(real.auto_renew?'取消自動續訂':'恢復自動續訂')+'（服務尚未接通）</button>':'')+(s?.pending?'<button type="button" data-overview-unqueue>取消這次變更（測試）</button>':'')+'</div><p data-overview-status role="status"></p>';
      box.querySelector('[data-overview-change]').onclick=()=>{host._resetBillingStep?.();host.querySelector('.mp-product-section').scrollIntoView({block:'start',behavior:'smooth'});};
      const run=action=>{try{host._billingDemo=window.AcademyBillingModel.event(s,action,{id:crypto.randomUUID()});paint();host._paintBillingDemo?.();}catch(e){box.querySelector('[data-overview-status]').textContent=e.message;}};
      box.querySelector('[data-overview-renew]')?.addEventListener('click',()=>run(s.cancel?'resume':'cancel'));
      box.querySelector('[data-overview-unqueue]')?.addEventListener('click',()=>run('unqueue'));
      host._labelBillingPlans=()=>host.querySelectorAll('[data-product-subscribe]').forEach(button=>{
        const p=window.AcademyMemberCatalog?.get()?.products?.find(p=>p.id===button.dataset.productSubscribe);if(!p||p.tier==='free')return;
        const active=s&&s.status!=='expired'&&Date.parse(s.end)>Date.now();
        button.disabled=!!active&&s.plan.id===p.id;
        button.textContent=!active?'訂閱此方案 →':s.plan.id===p.id?'目前方案':rank[p.tier]>rank[s.plan.tier]?'升級此方案 →':'下期降級 →';
      });host._labelBillingPlans();
    };
    host._paintBillingOverview=paint;paint();
    if(payToken()){const run=host._demoRun;payCall('billing_status',{}).then(r=>{if(run!==host._demoRun||!box.isConnected)return;host._realBilling=r.billing;paint();}).catch(()=>{if(box.isConnected&&!host._billingDemo){host._realBilling={source_label:'待確認',status:'目前方案暫時無法載入，請稍後重新整理。'};paint();}});}
  }

  // The selected plan belongs to this checkout, never to a synthetic paid subscription.
  function installBillingSteps(host, method, initialStep) {
    let step=initialStep, confirmed=false;
    let mode='monthly';try{mode=sessionStorage.getItem('foresight.billing.mode')||mode;}catch{}
    if(!['monthly','one_time'].includes(mode))mode='monthly';
    const section=host.querySelector('.mp-product-section'),checkout=host.querySelector('.mp-checkout');
    section.before(host.querySelector('.mp-progress'));
    const controls=document.createElement('div');controls.className='mp-billing-flow';
    controls.innerHTML='<fieldset><legend>購買方式</legend><label><input type="radio" name="billing-mode" value="monthly">每月訂閱 <small>每月自動續扣，可取消下期續訂</small></label><label><input type="radio" name="billing-mode" value="one_time">單次購買 <small>只支付本次期間，到期不自動續扣</small></label></fieldset><p>升級：付款成功後立即生效，按本期剩餘時間補差額；到期日不變。降級：下期生效，本期權益保留。取消續訂：用到本期結束。超出新方案的筆記與自選資料會保留，新增前需整理至額度內。</p><button type="button" data-billing-next>下一步：選擇付款方式 →</button>';
    section.append(controls);
    const back=document.createElement('button');back.type='button';back.className='mc-secondary-text';back.textContent='← 返回選擇方案';checkout.before(back);
    const review=document.createElement('section');review.className='mp-billing-review';review.hidden=true;checkout.after(review);
    host._billingAbort?.abort();host._billingAbort=new AbortController();
    const rehearsal=document.createElement('details');rehearsal.className='mp-billing-review';review.after(rehearsal);
    const demoPaint=()=>{
      host._paintBillingOverview?.();
      rehearsal.hidden=!demoMode;if(!demoMode)return;
      const s=host._billingDemo;
      rehearsal.innerHTML='<summary>訂閱規則模擬測試</summary><p>僅在這個頁面暫存，不扣款、不建立正式訂閱，也不改變會員權益。離開或重新整理後清除。</p>'+(s?'<p>模擬方案：'+esc(s.plan.name||s.plan.id)+' ／ '+(s.mode==='monthly'?'每月訂閱':'單次購買')+'<br>狀態：'+({active:'本期使用中',past_due:'續扣失敗，尚未取得下期權益',expired:'已到期'}[s.status])+(s.cancel?'，已取消下期續訂':'')+'<br>本期到期：'+esc(new Date(s.end).toLocaleString('zh-TW'))+(s.pending?'<br>下期方案：'+esc(s.pending.name||s.pending.id):'')+'</p><div><button type="button" data-rehearsal="cancel">取消下期續訂</button><button type="button" data-rehearsal="resume">恢復續訂</button><button type="button" data-rehearsal="renew_success">模擬到期續扣成功</button><button type="button" data-rehearsal="renew_failed">模擬到期續扣失敗</button><button type="button" data-rehearsal="expire">模擬到期結束</button><button type="button" data-rehearsal="clear">清除模擬</button></div>':'<p>先選方案並完成一次模擬付款，即可測試續訂與取消。之後返回選擇其他方案，可測試升級或下期降級。</p>')+'<p data-rehearsal-status role="status"></p>';
      rehearsal.querySelectorAll('[data-rehearsal]').forEach(b=>b.onclick=()=>{try{if(b.dataset.rehearsal==='clear')host._billingDemo=null;else host._billingDemo=window.AcademyBillingModel.event(host._billingDemo,b.dataset.rehearsal,{now:['renew_success','renew_failed','expire'].includes(b.dataset.rehearsal)?s.end:new Date().toISOString(),id:crypto.randomUUID()});demoPaint();}catch(e){rehearsal.querySelector('[data-rehearsal-status]').textContent=e.message;}});
    };
    host.addEventListener('academy-payment-demo-feedback',e=>{
      if(e.detail.result!=='success'||!demoMode||!host._billingProduct||!window.AcademyBillingModel)return;
      const p={...host._billingProduct,price_twd:host._billingProduct.price_twd||0};
      try{host._billingDemo=window.AcademyBillingModel.event(host._billingDemo,host._billingDemo&&host._billingDemo.status!=='expired'&&Date.parse(host._billingDemo.end)>Date.now()?'change':'start',{plan:p,mode,id:crypto.randomUUID()});demoPaint();}catch(error){rehearsal.querySelector('[data-rehearsal-status]').textContent=error.message;}
    },{signal:host._billingAbort.signal});
    host._paintBillingDemo=demoPaint;demoPaint();
    const paint=()=>{
      section.hidden=step!==1;checkout.hidden=step!==2;back.hidden=step===1;review.hidden=step!==3;
      host.querySelectorAll('.mp-progress span').forEach((s,i)=>{s.classList.toggle('is-current',i===step-1);if(i===step-1)s.setAttribute('aria-current','step');else s.removeAttribute('aria-current');});
      controls.querySelectorAll('[name=billing-mode]').forEach(r=>r.checked=r.value===mode);
      const product=host._billingProduct;
      controls.querySelector('[data-billing-next]').disabled=!product;
      host.querySelectorAll('[data-method]').forEach(b=>{b.disabled=mode==='monthly'&&b.dataset.method!=='card';b.title=b.disabled?'每月訂閱需要支援定期扣款的信用卡':'';});
      if(step===3){
        review.innerHTML='<span class="mc-kicker">確認方案與付款</span><h3>'+esc(product?.name||'')+'</h3><dl><div><dt>購買方式</dt><dd>'+ (mode==='monthly'?'每月訂閱':'單次購買')+'</dd></div><div><dt>付款方式</dt><dd>'+esc(methods[method].short)+'</dd></div><div><dt>金額</dt><dd>'+ (product?.purchasable?money(product.price_twd):'付款尚未開放，暫不顯示價格')+'</dd></div><div><dt>期間</dt><dd>'+(mode==='monthly'?'每個月續訂；取消後保留至本期結束':esc(product?.days||30)+' 天，到期不續扣')+'</dd></div></dl><p>'+(demoMode?'目前是模擬測試，不會扣款、開通會員或建立正式訂閱。':'正式信用卡訂閱尚未串接，現在不會扣款或開通會員。')+'</p><label><input type="checkbox" data-billing-consent>我已確認方案、期間與'+(mode==='monthly'?'每月續訂及取消規則':'單次付款規則')+'</label><div><button type="button" data-billing-edit>返回付款方式</button><button type="button" data-billing-submit disabled>'+(demoMode?'確認並測試結果':'付款服務尚未開放')+'</button></div>';
        let change=null;
        if(demoMode&&host._billingDemo){try{const s=host._billingDemo;change=window.AcademyBillingModel.quote(s,{...product,price_twd:product.price_twd||0},new Date().toISOString());const message=document.createElement('p');message.textContent=change.operation==='downgrade'?'下期降級：本次不扣款，將於 '+new Date(s.end).toLocaleDateString('zh-TW')+' 生效。本期權益保留，可在目前方案區取消這次變更。':change.operation==='upgrade'?'升級：模擬付款成功後立即生效，到期日維持 '+new Date(s.end).toLocaleDateString('zh-TW')+'。週額度不會因升級重新計算。':'';review.querySelector('dl').after(message);if(product.purchasable)review.querySelectorAll('dd')[2].textContent=money(change.amount)+(change.operation==='upgrade'?'（本期差額）':'');}catch{}}
        review.querySelector('[data-billing-edit]').onclick=()=>{step=2;paint();};
        review.querySelector('[data-billing-consent]').onchange=e=>{review.querySelector('[data-billing-submit]').disabled=!e.target.checked||(!demoMode&&!(mode==='one_time'&&method==='line'&&host.dataset.lineLive==='1'&&product?.purchasable));};
        review.querySelector('[data-billing-submit]').onclick=()=>{if(demoMode&&change?.operation==='downgrade'){host._billingDemo=window.AcademyBillingModel.event(host._billingDemo,'change',{plan:{...product,price_twd:product.price_twd||0},id:crypto.randomUUID()});host._paintBillingDemo?.();step=1;paint();return;}confirmed=true;step=2;paint();host.querySelector('[data-payment-action]').click();confirmed=false;};
      }
    };
    controls.onchange=e=>{if(e.target.name==='billing-mode'){mode=e.target.value;try{sessionStorage.setItem('foresight.billing.mode',mode);}catch{}paint();}};
    controls.querySelector('fieldset').hidden=true;controls.querySelector('[data-billing-next]').hidden=true;
    host._beginBilling=selectedMode=>{mode=selectedMode;try{sessionStorage.setItem('foresight.billing.mode',mode);}catch{}if(demoMode&&host._billingDemo){try{if(window.AcademyBillingModel.quote(host._billingDemo,{...host._billingProduct,price_twd:host._billingProduct.price_twd||0},new Date().toISOString()).operation==='downgrade'){step=3;paint();return;}}catch{}}controls.querySelector('[data-billing-next]').click();};
    controls.querySelector('[data-billing-next]').onclick=()=>{if(!host._billingProduct)return;if(host._billingProduct.tier==='free'){host.querySelector('[data-payment-product-detail]').textContent='免費會員不需要付款，可直接使用免費權益。';return;}if(mode==='monthly'&&method!=='card'){try{sessionStorage.setItem('foresight.payment.method','card');}catch{}host.querySelector('[data-method=card]').click();return;}step=2;paint();};
    back.onclick=()=>{step=1;paint();};
    host.querySelector('[data-payment-action]').addEventListener('click',e=>{
      if(confirmed)return;e.preventDefault();e.stopImmediatePropagation();
      if(!host._billingProduct){host.querySelector('.mp-action-status').textContent='請稍候，正在確認所選方案。';return;}
      if(host._billingDemo&&host._billingDemo.status!=='expired'&&Date.parse(host._billingDemo.end)>Date.now()&&host._billingDemo.mode!==mode){host.querySelector('.mp-action-status').textContent='本期購買方式維持不變；請選回原購買方式測試升降級，或清除模擬後重新開始。';return;}
      if(method==='card'&&demoMode&&!validateCard(host)){host.querySelector('.mp-action-status').textContent='請先填寫完整的測試卡片資料。';return;}
      step=3;paint();
    },true);
    host._resetBillingStep=()=>{step=1;paint();};
    addEventListener('academy-catalog-changed',()=>{if(!host.isConnected){host._billingAbort.abort();return;}mountProductChoices(host,method,false);},{signal:host._billingAbort.signal});
    host._updateBillingStep=paint;paint();
  }

  const TIER_NAMES = { observation: '市場觀察員', research: '趨勢研究員', advanced: '趨勢研究員', vip: '先見領航員' };
  const ORDER_STATUS = { pending: '待付款', paid: '已付款', failed: '未完成', refunded: '已退款' };

  async function mountLinePay(host) {
    const state = await loadPlans();
    const page = host.querySelector('[data-payment-method="line"]');
    if (!page || !page.isConnected || !state.plans.length) return;      // 後端未開放 → 保留原本預覽
    let interest='';try{interest=sessionStorage.getItem('foresight.membership.interest')||'';}catch{}
    let desired='';try{desired=sessionStorage.getItem('foresight.membership.plan')||'';}catch{}const preferred=state.plans.find(p=>p.plan_code===desired)||state.plans.find(p=>p.tier===interest);if(preferred)state.selected=preferred.plan_code;
    host.dataset.lineLive = '1';
    const sandbox = state.env === 'sandbox';
    const body = page.querySelector('.mp-method-body');
    const pick = document.createElement('fieldset');
    pick.className = 'mp-plan-pick';
    pick.innerHTML = `<legend>選擇方案${sandbox ? '<em>測試環境</em>' : ''}</legend>` + state.plans.map(plan => `<label>
        <input type="radio" name="mp-plan" value="${esc(plan.plan_code)}" ${plan.plan_code === state.selected ? 'checked' : ''}>
        <span><b>${esc(plan.label)}</b><small>${esc(TIER_NAMES[plan.tier] || plan.tier)} · ${Number(plan.days)} 天</small></span><strong>${money(plan.price_twd)}</strong>
      </label>`).join('');
    body.prepend(pick);
    const copy = body.querySelector('.mp-line-copy p');
    if (copy) copy.textContent = '電腦會在 LINE Pay 付款頁顯示 QR Code，用手機 LINE 掃描；手機會直接開啟 LINE App。付款確認都在 LINE Pay 安全畫面完成，先見不會取得你的付款資料。';
    body.querySelector('.mp-qr-life')?.remove();
    const steps = body.querySelector('.mp-steps');
    if (steps) steps.innerHTML = '<li><b>1</b><span>選擇方案</span></li><li><b>2</b><span>前往 LINE Pay</span></li><li><b>3</b><span>確認付款後開通</span></li>';
    const note = body.querySelector('.mp-demo-note');
    if (note) note.textContent = sandbox ? '測試環境：使用 LINE Pay 測試帳號付款，不會真的扣款；開通紀錄僅供驗證流程。' : '按下按鈕前往 LINE Pay 付款頁，在 LINE Pay 確認後才會扣款。';
    const label = page.querySelector('[data-payment-action] span');
    if (label) label.textContent = '前往 LINE Pay 付款';
    const sync = () => {
      const plan = state.plans.find(item => item.plan_code === state.selected);
      const amount = host.querySelector('[data-summary-amount]');
      if (amount) amount.textContent = plan ? money(plan.price_twd) : '付款前確認';
      const status = host.querySelector('[data-summary-status]');
      if (status) status.textContent = 'LINE Pay 確認後扣款';
    };
    pick.addEventListener('change', event => { if (event.target.name === 'mp-plan') { state.selected = event.target.value; sync(); } });
    pick.hidden=true;
    sync();
  }

  async function startLinePay(host, button, status) {
    const plan = payState.plans.find(item => item.plan_code === payState.selected);
    status.classList.remove('is-error');
    if (!plan) { status.textContent = '請先選擇方案。'; status.classList.add('is-error'); return; }
    button.disabled = true;
    button.classList.add('is-busy');
    status.textContent = '建立訂單，準備前往 LINE Pay…';
    try {
      const data = await payCall('pay_linepay_request', { plan_code: plan.plan_code, billing_mode:'one_time', return_origin: location.origin });
      try { sessionStorage.setItem('foresight.payment.pending', data.order_key); } catch (_) {}
      status.textContent = '正在前往 LINE Pay（' + money(data.amount) + '）…';
      location.assign(isMobile() && data.app_url ? data.app_url : data.payment_url);
    } catch (error) {
      button.disabled = false;
      button.classList.remove('is-busy');
      status.textContent = error.status === 401 ? '請先登入會員再付款。' : error.message;
      status.classList.add('is-error');
      if (error.status === 401) window.openAuthModal?.('login');
    }
  }

  async function showHistory(host) {
    const status = host.querySelector('.mp-action-status');
    let box = host.querySelector('.mp-history-list');
    if (box) { box.remove(); return; }
    box = document.createElement('div');
    box.className = 'mp-history-list';
    box.textContent = '讀取付款紀錄…';
    (host.querySelector('.mp-history')||host.querySelector('[data-billing-history]'))?.after(box);
    try {
      const data = await payCall('pay_history');
      const periods = (data.periods || []).map(item => `<li><b>${esc(TIER_NAMES[item.tier] || item.tier)}</b><span>${esc(String(item.starts_at).slice(0, 10))} ～ ${esc(String(item.expires_at).slice(0, 10))}</span></li>`).join('');
      const orders = (data.orders || []).map(item => `<li><b>${esc(ORDER_STATUS[item.status] || item.status)}</b><span>${money(item.paid_amount ?? item.expected_amount)} · ${esc(String(item.created_at).slice(0, 16).replace('T', ' '))}${item.provider_env === 'sandbox' ? ' · 測試' : ''}</span></li>`).join('');
      box.innerHTML = `<h4>已付款期間</h4>${periods ? `<ul>${periods}</ul>` : '<p>目前沒有有效的付款期間。</p>'}<h4>訂單</h4>${orders ? `<ul>${orders}</ul>` : '<p>尚無付款紀錄。</p>'}`;
    } catch (error) {
      box.remove();
      if (status) { status.textContent = error.message; status.classList.add('is-error'); }
    }
  }

  // 從 LINE Pay 導回（?lp=confirm|cancel&transactionId=…&orderId=…）：先把網址參數拿掉，再請後端確認付款
  function handleLinePayReturn() {
    const query = new URLSearchParams(location.search);
    const mode = query.get('lp');
    if (mode !== 'confirm' && mode !== 'cancel') return;
    const orderKey = query.get('orderId') || '';
    const transactionId = query.get('transactionId') || '';          // 19 位數，維持字串
    ['lp', 'orderId', 'transactionId'].forEach(key => query.delete(key));
    try { history.replaceState(null, '', location.pathname + (query.toString() ? '?' + query : '') + location.hash); } catch (_) {}
    // 2026-11-09 不用原生 <dialog>：全站 * { margin:0 } 讓它跑到左上角，且 navigation-layers.js 在首次頁面切換時
    // 會關掉所有 dialog[open]（結果視窗一閃就不見）。改用自己的置中遮罩，只有按「確定」才關閉。
    const overlay = document.createElement('div');
    overlay.className = 'mp-return-overlay';
    overlay.innerHTML = '<div class="mp-return-dialog" role="dialog" aria-modal="true" aria-labelledby="mpReturnTitle" aria-describedby="mpReturnText">'
      + '<span class="mc-kicker">FORESIGHT · LINE PAY</span><h3 id="mpReturnTitle">確認付款中…</h3><p id="mpReturnText">請稍候，正在向 LINE Pay 確認這筆交易。</p>'
      + '<button type="button" disabled>請稍候</button></div>';
    const dialog = overlay.firstElementChild;
    const show = (title, text, ok) => {
      dialog.querySelector('h3').textContent = title;
      dialog.querySelector('p').textContent = text;
      dialog.classList.toggle('is-ok', !!ok);
      const button = dialog.querySelector('button');
      button.disabled = false;
      button.textContent = '確定';
      button.onclick = () => { overlay.remove(); window.openMemberCenter?.('billing'); };
      try { button.focus({ preventScroll: true }); } catch (_) {}
    };
    const run = async () => {
      document.body.append(overlay);
      for (let i = 0; i < 30 && !payToken(); i++) await new Promise(resolve => setTimeout(resolve, 500));
      if (!payToken()) { show('請先登入', '請登入原本付款的會員帳號，再到「方案與帳務」查看付款紀錄。', false); return; }
      try {
        if (mode === 'cancel') {
          await payCall('pay_linepay_cancel', { order_key: orderKey });
          show('已取消付款', '這筆訂單沒有扣款，可以重新選擇方案。', false);
        } else {
          const result = await payCall('pay_linepay_confirm', { order_key: orderKey, transaction_id: transactionId });
          show('付款完成', `${result.label}（${money(result.amount)}）已開通 ${result.days} 天${result.env === 'sandbox' ? '。這是測試環境，沒有真的扣款。' : '。'}`, true);
        }
        try { sessionStorage.removeItem('foresight.payment.pending'); } catch (_) {}
      } catch (error) {
        show(mode === 'cancel' ? '取消處理失敗' : '付款尚未完成', error.message, false);
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
  }
  handleLinePayReturn();

  function render(current, context) {
    if (current !== 'billing') return false;
    let selected = 'card';
    try { selected = methods[sessionStorage.getItem('foresight.payment.method')] ? sessionStorage.getItem('foresight.payment.method') : 'card'; } catch (_) {}
    renderPanel(context.main, context.profile, selected);
    return true;
  }

  window.AcademyPayments = { render };
})();
