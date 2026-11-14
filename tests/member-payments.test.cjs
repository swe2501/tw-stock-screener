const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const js = read('apps/web/assets/member-payments.js');
const css = read('apps/web/assets/member-payments.css');
const member = read('apps/web/assets/member-center.js');
const html = read('apps/web/index.html');

test('member center exposes a dedicated billing route', () => {
  assert.match(member, /\['billing','方案與帳務'\]/);
  assert.match(member, /AcademyPayments\?\.render/);
});

test('payment center offers the three requested Taiwan payment methods', () => {
  for (const label of ['信用卡／簽帳金融卡', 'LINE Pay', '超商代碼']) assert.match(js, new RegExp(label));
});

test('payment UI never asks the site to retain raw card details', () => {
  assert.doesNotMatch(js, /name=["'](?:card_number|cvv|cvc)/i);
  assert.match(js, /不在本站保存完整卡號/);
  assert.match(js, /金流尚未接通|安全連線尚未啟用/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^)]*(?:card|cvc|expiry)/i);
});

test('card entry has animated preview, validation, flip, and a non-charging completion state', () => {
  for (const attr of ['data-card-number', 'data-card-expiry-input', 'data-card-cvc-input', 'data-card-holder-input']) {
    assert.match(js, new RegExp(attr));
  }
  assert.match(js, /is-flipped/);
  assert.match(js, /validateCard/);
  assert.match(js, /showCardSuccess/);
  assert.match(css, /mp-digit-pop/);
  assert.match(css, /mp-success-mark/);
  assert.match(js, /目前沒有送出卡號，也不會產生扣款/);
  assert.match(js, /detectCardNetwork/);
  assert.match(js, /cardNetworkMark/);
  for (const network of ['VISA', 'MASTERCARD', 'AMERICAN EXPRESS', 'JCB', 'UNIONPAY']) assert.match(js, new RegExp(network));
  for (const mark of ['is-visa', 'is-mastercard', 'is-amex', 'is-jcb', 'is-unionpay']) assert.match(js, new RegExp(mark));
  assert.match(js, /data-payment-processing/);
  assert.match(css, /mp-secure-scan/);
  assert.match(js, /mp-processing-card-orbit/);
  assert.match(css, /mp-card-orbit/);
});

test('wallet and convenience-store modes provide purpose-built animated artifacts', () => {
  assert.match(js, /mp-qr-svg/);
  assert.match(css, /mp-qr-scan/);
  assert.match(js, /mp-ticket/);
  assert.match(css, /mp-ticket-print/);
  assert.match(js, /auth-brands\/line\.png/);
  for (const store of ['7-ELEVEN', 'FamilyMart', 'Hi-Life', 'OK mart']) assert.match(js, new RegExp(store));
});

test('card security guidance stays below the CVC field and payment actions use glass pills', () => {
  assert.match(js, /mp-field-help/);
  assert.doesNotMatch(js, /mp-card-back[\s\S]{0,360}<p>安全碼/);
  assert.match(css, /\.mp-action\{[^}]*border-radius:999px/);
  assert.match(css, /transition:transform 1\.08s/);
  assert.match(css, /mp-card-signature/);
  assert.match(css, /mp-chip::before/);
  assert.match(css, /mp-button-light-orbit/);
  assert.match(css, /data-theme=light\] \.mp-page \.mp-action/);
  assert.match(css, /:root:not\(\[data-theme=light\]\) \.mp-page \.mp-action/);
  assert.match(css, /#ffbd24/);
  assert.match(css, /border-width:1px/);
  assert.match(css, /\.mp-action::before\{display:none!important\}/);
  assert.match(css, /width:min\(100%,320px\)/);
  assert.match(css, /min-height:58px/);
  assert.match(js, /mp-action-lock/);
});

test('all four theme combinations are explicitly styled', () => {
  assert.match(css, /data-theme=light/);
  assert.match(css, /:root:not\(\[data-theme=light\]\)/);
  assert.match(css, /data-ui-skin=glass/);
});

test('payment assets load before the member center controller', () => {
  const paymentCss = html.indexOf('member-payments.css');
  const paymentJs = html.indexOf('member-payments.js');
  const memberJs = html.indexOf('member-center.js');
  assert.ok(paymentCss > -1 && paymentJs > -1 && paymentJs < memberJs);
});
