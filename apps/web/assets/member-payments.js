(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const icons = {
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6.5 15h4"/></svg>',
    line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 10.4c0-4.2-3.8-7.4-8.5-7.4s-8.5 3.2-8.5 7.4c0 3.8 3.2 6.8 7.3 7.3.5.1.6.3.6.7l-.2 1.8c-.1.5.2.7.7.4 4.6-2.7 8.6-6.1 8.6-10.2Z"/><path d="M7 9v3h1.8M10 9v3M12 12V9l2.1 3V9M17 9h-1.5v3H17"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10c0 1.3 1 2.3 2.3 2.3S7.7 11.3 7.7 10c0 1.3 1 2.3 2.3 2.3s2.3-1 2.3-2.3c0 1.3 1 2.3 2.3 2.3S17 11.3 17 10c0 1.3 1 2.3 2.3 2.3S21 11.3 21 10M9 20v-5h6v5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.6c0 4.8-3.2 8.1-8 9.6-4.8-1.5-8-4.8-8-9.6V6l8-3.2Z"/><path d="m8.7 12 2.1 2.1 4.6-4.7"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5"/></svg>'
  };

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
            <span class="mp-card-brand">FORESIGHT</span>
            <strong class="mp-card-number" aria-label="卡號預覽">${Array.from({ length: 16 }, (_, index) => `<span data-card-digit="${index}">•</span>${index % 4 === 3 && index < 15 ? '<i></i>' : ''}`).join('')}</strong>
            <div class="mp-card-meta"><span><small>CARD HOLDER</small><b data-card-holder>YOUR NAME</b></span><span><small>EXPIRES</small><b data-card-expiry>MM/YY</b></span></div>
          </div>
          <div class="mp-card-face mp-card-back">
            <span class="mp-card-strip" aria-hidden="true"></span><small>SECURITY CODE</small>
            <strong data-card-cvc>•••</strong><p>安全碼只用於本次驗證，不會顯示在付款卡正面。</p>
          </div>
        </div>
      </div>
      <form class="mp-card-form" data-card-form novalidate>
        <label class="mp-field mp-field-wide"><span>卡號</span><input type="text" data-card-number inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="1234 5678 9012 3456" aria-label="信用卡卡號"><small>正式啟用時由金流商安全欄位加密處理</small></label>
        <label class="mp-field"><span>有效期限</span><input type="text" data-card-expiry-input inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="MM/YY" aria-label="信用卡有效期限"></label>
        <label class="mp-field"><span>安全碼</span><input type="password" data-card-cvc-input inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="CVC" aria-label="信用卡安全碼"></label>
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
        <div class="mp-line-copy"><span class="mp-line-mark">LINE</span><small>SCAN TO CONNECT</small><strong>用手機完成安全授權</strong><p>電腦版掃描 QR Code；手機版正式串接後會直接開啟 LINE App。授權與付款確認都在 LINE Pay 安全畫面完成。</p><span class="mp-qr-life"><i></i>QR Code 將於 04:59 後更新</span></div>
        <span class="mp-wallet-orbit" aria-hidden="true"></span>
      </div>
      <ol class="mp-steps" aria-label="LINE Pay 連結流程"><li><b>1</b><span>掃描 QR Code</span></li><li><b>2</b><span>確認會員帳號</span></li><li><b>3</b><span>完成授權</span></li></ol>
      <p class="mp-demo-note">目前為 LINE Pay 介面預覽，尚未串接金流；示意 QR Code 無法付款。</p>`;
    return `
      <fieldset class="mp-store-choices"><legend>選擇繳費通路</legend>
        ${['7-ELEVEN', '全家', '萊爾富', 'OK mart'].map((store, index) => `<label><input type="radio" name="mp-store" value="${esc(store)}" ${index === 0 ? 'checked' : ''}><span>${store}</span></label>`).join('')}
      </fieldset>
      <div class="mp-ticket" data-store-ticket aria-label="超商繳費票券預覽">
        <span class="mp-ticket-edge mp-ticket-edge-top" aria-hidden="true"></span><span class="mp-ticket-edge mp-ticket-edge-bottom" aria-hidden="true"></span>
        <div class="mp-ticket-head"><span><small>FORESIGHT PAYMENT</small><b>會員方案繳費單</b></span><strong data-ticket-store>7-ELEVEN</strong></div>
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
    const digits = [...host.querySelectorAll('[data-card-digit]')];
    const fields = [number, expiry, cvc, holder];
    const bounce = element => {
      element.classList.remove('is-changing');
      void element.offsetWidth;
      element.classList.add('is-changing');
    };
    number.addEventListener('input', () => {
      const raw = number.value.replace(/\D/g, '').slice(0, 16);
      number.value = raw.replace(/(.{4})/g, '$1 ').trim();
      number.setSelectionRange(number.value.length, number.value.length);
      digits.forEach((digit, index) => {
        const next = raw[index] || '•';
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
      const complete = rawNumber.length === 16 && rawExpiry.length === 4 && cvc.value.length >= 3 && holder.value.trim().length >= 2;
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
      ['[data-card-number]', input => input.value.replace(/\D/g, '').length === 16],
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
    host.querySelector('.mp-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    page?.classList.add('is-payment-success');
    success?.setAttribute('aria-hidden', 'false');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 2));
    window.setTimeout(() => success?.querySelector('button')?.focus({ preventScroll: true }), 760);
  }

  function hideCardSuccess(host) {
    host.querySelector('.mp-page')?.classList.remove('is-payment-success');
    host.querySelector('[data-payment-success]')?.setAttribute('aria-hidden', 'true');
    host.querySelectorAll('.mp-progress span').forEach((step, index) => step.classList.toggle('is-current', index === 0));
    host.querySelector('[data-card-number]')?.focus({ preventScroll: true });
  }

  function wireStoreInputs(host) {
    const ticket = host.querySelector('[data-store-ticket]');
    if (!ticket) return;
    host.querySelectorAll('input[name="mp-store"]').forEach(input => input.addEventListener('change', () => {
      host.querySelector('[data-ticket-store]').textContent = input.value;
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
            <button type="button" class="mp-action" data-payment-action><span>${data.action}</span>${icons.arrow}</button>
            <div class="mp-action-status" role="status"></div>
            ${method === 'card' ? `<div class="mp-card-ready" data-card-ready><i>${icons.check}</i><span>卡片欄位已完整，可以進行安全確認</span></div>
            <section class="mp-success-screen" data-payment-success aria-hidden="true" aria-label="卡片資料完成動畫">
              <div class="mp-success-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
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
            <dl><div><dt>付款方式</dt><dd data-summary-method>${data.short}</dd></div><div><dt>本次金額</dt><dd>付款前確認</dd></div><div><dt>扣款狀態</dt><dd>${data.summary}</dd></div></dl>
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

    host.querySelector('[data-payment-action]').addEventListener('click', event => {
      const actionButton = event.currentTarget;
      const status = host.querySelector('.mp-action-status');
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
      window.setTimeout(() => {
        if (!actionButton.isConnected) return;
        actionButton.classList.remove('is-busy');
        label.textContent = originalLabel;
        if (method === 'card') showCardSuccess(host);
      }, 920);
    });
  }

  function render(current, context) {
    if (current !== 'billing') return false;
    let selected = 'card';
    try { selected = methods[sessionStorage.getItem('foresight.payment.method')] ? sessionStorage.getItem('foresight.payment.method') : 'card'; } catch (_) {}
    renderPanel(context.main, context.profile, selected);
    return true;
  }

  window.AcademyPayments = { render };
})();
