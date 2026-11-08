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
    if (payState.token === token) return payState;
    payState.token = token; payState.plans = []; payState.env = '';
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
        <div>${icons.check}<span><b>支援月繳與年繳</b><small>每次扣款前仍可在帳務摘要查看方案與下次扣款日。</small></span></div>
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
    host.querySelector('.mp-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    page?.classList.add('is-payment-success');
    success?.setAttribute('aria-hidden', 'false');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 2));
    window.setTimeout(() => success?.querySelector('button')?.focus({ preventScroll: true }), 760);
  }

  function showCardProcessing(host) {
    const page = host.querySelector('.mp-page');
    page?.classList.remove('is-payment-success');
    page?.classList.add('is-payment-processing');
    host.querySelector('[data-payment-processing]')?.setAttribute('aria-hidden', 'false');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 1));
  }

  function hideCardSuccess(host) {
    host.querySelector('.mp-page')?.classList.remove('is-payment-success', 'is-payment-processing');
    host.querySelector('[data-payment-processing]')?.setAttribute('aria-hidden', 'true');
    host.querySelector('[data-payment-success]')?.setAttribute('aria-hidden', 'true');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 0));
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

  function renderPanel(host, profile, method) {
    const data = methods[method];
    const plan = profile?.membership?.plan && profile.membership.plan !== 'general'
      ? (window.AcademyResearchTitle?.() || '已授權方案') : '尚未選擇付費方案';
    host.innerHTML = `
      <section class="mp-page" data-payment-method="${method}">
        <header class="mp-heading">
          <div><span class="mc-kicker">FORESIGHT QUANT · BILLING</span><h2>方案與帳務</h2><p>管理付款方式與方案繳費。所有扣款都會在最後一步再次確認。</p></div>
          <span class="mp-security">${icons.shield}<span><b>安全支付</b><small>不在本站保存完整卡號</small></span></span>
        </header>
        <div class="mp-progress" aria-label="付款流程"><span class="is-current"><b>1</b>選擇方式</span><i></i><span><b>2</b>安全驗證</span><i></i><span><b>3</b>完成</span></div>
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
            <button type="button" class="mp-action" data-payment-action><i class="mp-action-lock" aria-hidden="true">${icons.shield}</i><span>${data.action}</span>${icons.arrow}</button>
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
              <div class="mp-flow-card mp-flow-card-success"><span class="mp-flow-chip"></span><b><span>FORESIGHT</span><em data-flow-network>${cardNetworkMark('PAYMENT CARD')}</em></b><strong>•••• &nbsp;•••• &nbsp;•••• &nbsp;••••</strong><small>CARD VERIFIED</small></div>
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
            <button type="button" class="mp-history" disabled>付款紀錄<span>尚無紀錄</span></button>
          </aside>
        </div>
      </section>`;

    wireCardInputs(host);
    wireStoreInputs(host);
    wireActionLight(host);

    host.querySelectorAll('[data-method]').forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.method;
      if (next === method) return;
      try { sessionStorage.setItem('foresight.payment.method', next); } catch (_) {}
      renderPanel(host, profile, next);
    }));

    host.querySelector('[data-success-back]')?.addEventListener('click', () => hideCardSuccess(host));

    if (method === 'line') mountLinePay(host);
    host.querySelector('.mp-history')?.addEventListener('click', () => showHistory(host));
    if (payToken()) loadPlans().then(state => {
      const history = host.querySelector('.mp-history');
      if (history && state.plans.length) { history.disabled = false; history.querySelector('span').textContent = '查看'; }
    });

    host.querySelector('[data-payment-action]').addEventListener('click', event => {
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
  }

  const TIER_NAMES = { observation: '市場觀察員', research: '研究員', advanced: '進階', vip: 'VIP' };
  const ORDER_STATUS = { pending: '待付款', paid: '已付款', failed: '未完成', refunded: '已退款' };

  async function mountLinePay(host) {
    const state = await loadPlans();
    const page = host.querySelector('[data-payment-method="line"]');
    if (!page || !page.isConnected || !state.plans.length) return;      // 後端未開放 → 保留原本預覽
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
      const data = await payCall('pay_linepay_request', { plan_code: plan.plan_code, return_origin: location.origin });
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
    host.querySelector('.mp-history')?.after(box);
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
