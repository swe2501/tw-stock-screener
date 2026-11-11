const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync('apps/web/assets/member-research.js', 'utf8');
const watchSource = source.slice(source.indexOf('  function uid()'), source.indexOf('  const star='));

function setup({ switchAccount = false } = {}) {
  const session = { sb_token: 'expired', sb_user: JSON.stringify({ id: 'alice' }) };
  const rows = [];
  const calls = [];
  let refreshes = 0;
  const context = vm.createContext({
    API: '/api',
    localStorage: { getItem: key => session[key] },
    async _tryRefreshToken() {
      refreshes++;
      session.sb_token = 'fresh';
      if (switchAccount) session.sb_user = JSON.stringify({ id: 'bob' });
      return true;
    },
    fetch: async (url, request) => {
      calls.push(request);
      if (request.headers.Authorization === 'Bearer expired') return { status: 401 };
      if (request.method === 'POST') rows.push(JSON.parse(request.body));
      if (request.method === 'DELETE') rows.splice(0, rows.length);
      return { ok: true, json: async () => rows.slice() };
    },
    CustomEvent: class {},
    dispatchEvent() {}
  });
  vm.runInContext(watchSource, context);
  return { watch: context.watch, calls, refreshes: () => refreshes };
}

test('adding, reopening and deleting a favorite works after the session renews', async () => {
  const fixture = setup();
  await fixture.watch('POST', { code: '2330' });
  assert.equal(fixture.refreshes(), 1);
  assert.equal(fixture.calls[1].headers.Authorization, 'Bearer fresh');
  assert.deepEqual(await fixture.watch(), [{ code: '2330' }]);
  await fixture.watch('DELETE', null, '2330');
  assert.deepEqual(await fixture.watch(), []);
});

test('a pending favorite write is not retried under another account', async () => {
  const fixture = setup({ switchAccount: true });
  await assert.rejects(fixture.watch('POST', { code: '2330' }), /帳號已切換/);
  assert.equal(fixture.calls.length, 1);
});
