import datetime
import json
import os
import re
import unittest
from unittest import mock
from urllib.parse import unquote

os.environ.setdefault('FORUM_CODE_SECRET', 'test-secret')
from lib import forum_ads as F  # noqa: E402


class FakeRest:
    """極簡 PostgREST：admin_settings（key 唯一）與 member_point_ledger（source_event_key 唯一）。"""

    def __init__(self):
        self.settings = {}
        self.ledger = {}
        self.vouchers = {}
        self.awards = {}
        self.tasks = {'name-v1': {'id': 'name-v1', 'title': '設定研究暱稱', 'points': 20, 'period': 'once', 'verifier': 'profile_name', 'active': True, 'sort': 11}}
        self.products = {'vip-7d-v1': {'id': 'vip-7d-v1', 'title': '全方位研究 7 天', 'points': 2500, 'duration_days': 7, 'active': True}}

    def __call__(self, path, method='GET', body=None, prefer=None):
        path = unquote(path)
        if path.startswith('/admin_settings'):
            if method == 'GET':
                m = re.search(r'key=eq\.([^&]+)', path)
                if m:
                    k = m.group(1)
                    return 200, ([{'key': k, 'value': self.settings[k]}] if k in self.settings else [])
                m = re.search(r'key=like\.([^&]+)\*', path)
                rows = [{'key': k, 'value': v} for k, v in sorted(self.settings.items()) if k.startswith(m.group(1))]
                offset = int(re.search(r'offset=(\d+)', path).group(1)) if 'offset=' in path else 0
                return 200, rows[offset:offset + 1000]
            if method == 'POST':
                if 'on_conflict' in path:
                    self.settings[body['key']] = body['value']
                    return 201, {}
                if body['key'] in self.settings:
                    return 409, {}
                self.settings[body['key']] = body['value']
                return 201, {}
            if method == 'DELETE':
                k = re.search(r'key=eq\.([^&]+)', path).group(1)
                self.settings.pop(k, None)
                return 204, {}
        if path.startswith('/rpc/_member_issue_voucher'):
            self.vouchers[body['p_event']] = body
            return 200, 'v-id'
        if path.startswith('/rpc/admin_award_member_task'):
            key = (body['p_user'], body['p_task_id'], body['p_reference'])
            if key in self.awards:
                return 200, {'duplicate': True}
            self.awards[key] = body
            self.ledger['task:%s:%s:%s' % key] = {'user_id': body['p_user'], 'points': body['p_points']}
            return 200, {'duplicate': False}
        if path.startswith('/member_task_claims'):
            return 200, []
        if path.startswith('/member_task_definitions'):
            if method == 'GET':
                return 200, list(self.tasks.values())
            if method == 'POST':
                self.tasks[body['id']] = dict(body)
                return 201, [self.tasks[body['id']]]
            tid = re.search(r'id=eq\.([^&]+)', path).group(1)
            if method == 'DELETE':
                self.tasks.pop(tid)
                return 204, {}
            self.tasks[tid].update(body)
            return 200, [self.tasks[tid]]
        if path.startswith('/member_exchange_definitions'):
            if method == 'GET':
                m = re.search(r'id=eq\.([^&]+)', path)
                return 200, ([self.products[m.group(1)]] if m and m.group(1) in self.products else [] if m else list(self.products.values()))
            if method == 'POST':
                if body['id'] in self.products:
                    return 409, {}
                self.products[body['id']] = dict(body)
                return 201, [self.products[body['id']]]
            pid = re.search(r'id=eq\.([^&]+)', path).group(1)
            self.products[pid].update(body)
            return 200, [self.products[pid]]
        if path.startswith('/member_point_ledger'):
            if method == 'GET' and 'user_id=eq.' in path:
                uid = re.search(r'user_id=eq\.([^&]+)', path).group(1)
                return 200, [{'points': v['points']} for v in self.ledger.values() if v.get('user_id') == uid]
            if method == 'GET' and 'like.admin-adjust' in path:
                return 200, [dict(v, created_at='2026-11-08T00:00:00Z') for k, v in self.ledger.items() if k.startswith('admin-adjust:')]
            if method == 'GET':
                k = re.search(r'source_event_key=eq\.([^&]+)', path).group(1)
                return 200, ([{'id': 1}] if k in self.ledger else [])
            if body['source_event_key'] in self.ledger:
                return 409, {}
            self.ledger[body['source_event_key']] = body
            return 201, {}
        raise AssertionError(path)


EV_DAY = datetime.datetime(2026, 11, 22, 14, 0, tzinfo=F.TW)
USER = {'id': 'u1', 'email': 'a@b.c', 'email_confirmed_at': 'x'}
USER2 = {'id': 'u2', 'email': 'd@b.c', 'email_confirmed_at': 'x'}


def at(t):
    return mock.patch.object(F, 'now', return_value=t)


class ForumTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeRest()
        with at(EV_DAY):
            st, out = F.handle_admin('admin_forum_save', {'event': {'city': 'TPE', 'date': '2026-11-22', 'venue': '台北會場', 'status': 'published'}}, 'admin', self.r)
        self.assertEqual(st, 200)
        self.eid = out['event']['id']

    def test_code_batches_survive_and_revoke_preserves_redemptions(self):
        st, batch = F.handle_admin('admin_forum_codes', {'id': self.eid, 'count': 3}, 'admin', self.r)
        with at(EV_DAY):
            F.handle_public('forum_redeem', {'code': batch['codes'][0]}, USER, self.r)
            st, result = F.handle_admin('admin_forum_code_revoke', {'id': self.eid, 'codes': batch['codes']}, 'admin', self.r)
            self.assertEqual(result['revoked'], 2)
            self.assertEqual(result['rows'][0]['status'], 'used')
            st, result = F.handle_public('forum_redeem', {'code': batch['codes'][1]}, USER2, self.r)
            self.assertEqual(result['code'], 'FORUM_CODE_REVOKED')
        st, saved = F.handle_admin('admin_forum_codes_list', {'id': self.eid}, 'admin', self.r)
        self.assertEqual(saved['batches'][0]['id'], batch['batch_id'])
        self.assertEqual([r['status'] for r in saved['batches'][0]['rows']], ['used', 'revoked', 'revoked'])
        self.assertEqual(len(self.r.ledger), 1)

    def test_event_notes_private_and_preserved_on_legacy_update(self):
        ev = F._find_event(self.r, self.eid)
        ev['notes'] = '內部報到安排'
        F.handle_admin('admin_forum_save', {'event': ev}, 'admin', self.r)
        del ev['notes']
        F.handle_admin('admin_forum_save', {'event': ev}, 'admin', self.r)
        self.assertEqual(F._find_event(self.r, self.eid)['notes'], '內部報到安排')
        with at(EV_DAY):
            st, data = F.handle_public('forum_events', {}, None, self.r)
        self.assertNotIn('notes', data['events'][0])

    def test_custom_product_creation_is_inactive_and_not_overwritten(self):
        body = {'definition': 'research-v1', 'days': 12, 'points': 5000}
        st, data = F.handle_admin('admin_products_create', body, 'admin', self.r)
        self.assertEqual(st, 200)
        self.assertEqual(data['product']['title'], '趨勢研究員 · 12 天')
        self.assertFalse(data['product']['active'])
        self.assertEqual(F.handle_admin('admin_products_create', body, 'admin', self.r)[0], 409)
        self.assertEqual(F.handle_admin('admin_products_create', dict(body, days=0), 'admin', self.r)[0], 400)

    def test_media_validation_and_public_projection(self):
        raw = {'slot': 'home_card', 'title': '研究分享會', 'media_type': 'image',
               'media_url': 'https://example.com/banner.webp', 'media_x': 85, 'enabled': True}
        ad = F.clean_ad(raw)
        public = F.ads_for([ad], {'guest': True})[0]
        self.assertEqual(public['media_url'], raw['media_url'])
        self.assertEqual(public['media_x'], 85)
        self.assertNotIn('name', public)
        for url in ['javascript:alert(1)', 'data:image/svg+xml,test', 'https://user:pw@example.com/x']:
            with self.assertRaises(ValueError):
                F.clean_ad(dict(raw, media_url=url))
        with self.assertRaises(ValueError):
            F.clean_ad(dict(raw, slot='top_bar'))

    def test_registration_requires_verified_user_and_fails_closed(self):
        self.assertEqual(F.handle_public('forum_register', {'id': self.eid}, None, self.r)[0], 403)
        def unavailable(*args):
            return 404, {'message': 'function not found'}
        st, data = F.handle_public('forum_register', {'id': self.eid}, USER, unavailable)
        self.assertEqual(st, 503)
        self.assertEqual(data['code'], 'FORUM_REGISTRATION_UNAVAILABLE')

    def test_lifetime_attendance_shared_across_events_and_codes(self):
        with at(EV_DAY):
            token = F.make_pass(self.eid)
            self.assertEqual(F.handle_public('forum_checkin', {'pass': token}, USER, self.r)[0], 200)
            status, event = F.handle_admin('admin_forum_save', {'event': {'city': 'TXG', 'date': '2026-11-22', 'status': 'published'}}, 'admin', self.r)
            second = event['event']['id']
            status, out = F.handle_public('forum_checkin', {'pass': F.make_pass(second)}, USER, self.r)
            self.assertEqual((status, out['code']), (409, 'FORUM_ALREADY'))
            status, out = F.handle_public('forum_redeem', {'code': F.make_code(second)}, USER, self.r)
            self.assertEqual((status, out['code']), (409, 'FORUM_ALREADY'))
            self.assertEqual(len(self.r.ledger), 1)

    def test_read_failure_does_not_pretend_member_is_eligible(self):
        def unavailable(*args): return 503, {}
        with self.assertRaises(RuntimeError): F.has_attended(unavailable, USER['id'])

    def test_code_history_pagination_keeps_all_rows(self):
        for i in range(2001): self.r.settings['forumcodes:test:%04d' % i] = '{}'
        self.assertEqual(len(F._list_prefix(self.r, 'forumcodes:test:')), 2001)

    def test_event_id_and_duplicate_day(self):
        self.assertEqual(self.eid, 'TPE1122')
        st, out = F.handle_admin('admin_forum_save', {'event': {'city': 'TPE', 'date': '2026-11-22'}}, 'admin', self.r)
        self.assertEqual(out['event']['id'], 'TPE1122A')

    def test_qr_checkin_once_per_member(self):
        with at(EV_DAY):
            tok = F.qr_token(self.eid)
            st, p = F.handle_public('forum_pass', {'e': self.eid, 't': tok}, None, self.r)
            self.assertEqual(st, 200)
            st, out = F.handle_public('forum_checkin', {'pass': p['pass']}, USER, self.r)
            self.assertEqual((st, out['points']), (200, 1000))
            st, out = F.handle_public('forum_checkin', {'pass': p['pass']}, USER, self.r)
            self.assertEqual(out['code'], 'FORUM_ALREADY')
        self.assertEqual(len(self.r.ledger), 1)

    def test_old_qr_rejected(self):
        with at(EV_DAY - datetime.timedelta(minutes=5)):
            tok = F.qr_token(self.eid)
        with at(EV_DAY):
            st, out = F.handle_public('forum_pass', {'e': self.eid, 't': tok}, None, self.r)
        self.assertEqual(out['code'], 'FORUM_QR_EXPIRED')

    def test_qr_outside_hours(self):
        t = datetime.datetime(2026, 11, 22, 19, 0, tzinfo=F.TW)
        with at(t):
            st, out = F.handle_public('forum_pass', {'e': self.eid, 't': F.qr_token(self.eid)}, None, self.r)
        self.assertEqual(out['code'], 'FORUM_CLOSED')

    def test_pass_survives_registration_time(self):
        with at(EV_DAY):
            p = F.make_pass(self.eid)
        with at(EV_DAY + datetime.timedelta(minutes=20)):
            st, out = F.handle_public('forum_checkin', {'pass': p}, USER, self.r)
        self.assertEqual(st, 200)

    def test_unverified_or_guest(self):
        with at(EV_DAY):
            p = F.make_pass(self.eid)
            self.assertEqual(F.handle_public('forum_checkin', {'pass': p}, None, self.r)[1]['code'], 'LOGIN_REQUIRED')
            self.assertEqual(F.handle_public('forum_checkin', {'pass': p}, {'id': 'u9'}, self.r)[1]['code'], 'MEMBER_VERIFY_REQUIRED')

    def test_backup_codes(self):
        with at(EV_DAY):
            st, out = F.handle_admin('admin_forum_codes', {'id': self.eid, 'count': 50}, 'admin', self.r)
        codes = out['codes']
        self.assertEqual(len(set(codes)), 50)
        self.assertTrue(all(re.match(r'^[A-Z0-9-]{4,32}$', c) for c in codes))
        later = EV_DAY + datetime.timedelta(days=3)
        with at(later):
            st, res = F.handle_public('forum_redeem', {'code': codes[0].lower()}, USER, self.r)
            self.assertEqual((st, res['points']), (200, 1000))
            # 同一碼他人不能再用
            self.assertEqual(F.handle_public('forum_redeem', {'code': codes[0]}, USER2, self.r)[1]['code'], 'FORUM_CODE_USED')
            # 同一人換別的碼也不能再領
            self.assertEqual(F.handle_public('forum_redeem', {'code': codes[1]}, USER, self.r)[1]['code'], 'FORUM_ALREADY')
            # 偽造碼
            fake = codes[2][:-1] + ('A' if codes[2][-1] != 'A' else 'B')
            self.assertEqual(F.handle_public('forum_redeem', {'code': fake}, USER2, self.r)[1]['code'], 'FORUM_CODE_INVALID')
            st, res = F.handle_public('forum_redeem', {'code': codes[2]}, USER2, self.r)
            self.assertEqual(st, 200)
        with at(EV_DAY + datetime.timedelta(days=20)):
            self.assertEqual(F.handle_public('forum_redeem', {'code': codes[3]}, {'id': 'u3', 'email_confirmed_at': 1}, self.r)[1]['code'], 'FORUM_CODE_EXPIRED')

    def test_code_after_qr_checkin_blocked_and_code_kept(self):
        with at(EV_DAY):
            F.handle_public('forum_checkin', {'pass': F.make_pass(self.eid)}, USER, self.r)
            code = F.handle_admin('admin_forum_codes', {'id': self.eid, 'count': 1}, 'admin', self.r)[1]['codes'][0]
            self.assertEqual(F.handle_public('forum_redeem', {'code': code}, USER, self.r)[1]['code'], 'FORUM_ALREADY')
            self.assertEqual(F.handle_public('forum_redeem', {'code': code}, USER2, self.r)[0], 200)

    def test_test_event_gives_no_points(self):
        with at(EV_DAY):
            st, out = F.handle_admin('admin_forum_save', {'event': {'city': 'KHH', 'date': '2026-11-22', 'test': True}}, 'admin', self.r)
            st, res = F.handle_public('forum_checkin', {'pass': F.make_pass(out['event']['id'])}, USER, self.r)
        self.assertTrue(res['test'])
        self.assertEqual(self.r.ledger, {})

    def test_attendee_list_and_counts(self):
        with at(EV_DAY):
            F.handle_public('forum_checkin', {'pass': F.make_pass(self.eid)}, USER, self.r)
            evs = F.handle_admin('admin_forum_list', {}, 'admin', self.r)[1]['events']
            ppl = F.handle_admin('admin_forum_attendees', {'id': self.eid}, 'admin', self.r)[1]['attendees']
            self.assertEqual(F.handle_admin('admin_forum_delete', {'id': self.eid}, 'admin', self.r)[0], 409)
        self.assertEqual(evs[0]['checked_in'], 1)
        self.assertEqual(ppl[0]['email'], 'a@b.c')


class AdTests(unittest.TestCase):
    def test_audience_and_priority(self):
        r = FakeRest()
        mk = lambda **k: F.handle_admin('admin_ads_save', {'ad': dict(slot='top_bar', title='t', enabled=True, **k)}, 'admin', r)
        mk(id='aaa1', audience='not_attended', priority=80, url='?forum=1')
        mk(id='aaa2', audience='all', priority=10)
        mk(id='aaa3', audience='all', priority=99, enabled=False) if False else None
        F.handle_admin('admin_ads_save', {'ad': dict(id='aaa3', slot='top_bar', title='off', enabled=False, priority=99)}, 'admin', r)
        F.handle_admin('admin_ads_save', {'ad': dict(id='aaa4', slot='corner', title='old', enabled=True, ends='2020-01-01')}, 'admin', r)
        g = F.handle_public('site_ads', {}, None, r)[1]['ads']
        self.assertEqual([a['id'] for a in g], ['aaa2'])
        m = F.handle_public('site_ads', {}, USER, r)[1]['ads']
        self.assertEqual([a['id'] for a in m], ['aaa1'])
        r.ledger['forum-attend:u1'] = {}
        m = F.handle_public('site_ads', {}, USER, r)[1]['ads']
        self.assertEqual([a['id'] for a in m], ['aaa2'])

    def test_bad_url_rejected_and_clicks(self):
        r = FakeRest()
        st, out = F.handle_admin('admin_ads_save', {'ad': dict(slot='corner', title='x', url='javascript:alert(1)')}, 'admin', r)
        self.assertEqual(st, 400)
        F.handle_admin('admin_ads_save', {'ad': dict(id='bbb1', slot='corner', title='x', enabled=True)}, 'admin', r)
        F.handle_public('ad_click', {'id': 'bbb1'}, None, r)
        F.handle_public('ad_click', {'id': 'bbb1'}, None, r)
        ads = F.handle_admin('admin_ads_list', {}, 'admin', r)[1]['ads']
        self.assertEqual(ads[0]['clicks'], 2)
        self.assertNotIn('clicks', json.loads(r.settings['site_ads'])[0])


UID = '11111111-2222-3333-4444-555555555555'


class PointsTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeRest()
        self.users = lambda: [{'id': UID, 'email': 'vip@x.com'}]

    def adj(self, pts, rid, reason='論壇補登'):
        return F.handle_admin('admin_points_adjust', {'user_id': UID, 'points': pts, 'reason': reason, 'request_id': rid}, 'admin', self.r, self.users)

    def test_add_deduct_no_negative_idempotent(self):
        self.assertEqual(self.adj(500, 'a' * 32)[1]['balance'], 500)
        self.assertTrue(self.adj(500, 'a' * 32)[1]['duplicate'])
        self.assertEqual(self.adj(-200, 'b' * 32)[1]['balance'], 300)
        st, out = self.adj(-400, 'c' * 32)
        self.assertEqual(st, 400)
        self.assertEqual(self.adj(10, 'd' * 32, reason='')[0], 400)
        found = F.handle_admin('admin_points_find', {'q': 'vip@'}, 'admin', self.r, self.users)[1]['members']
        self.assertEqual(found[0]['balance'], 300)
        recent = F.handle_admin('admin_points_recent', {}, 'admin', self.r, self.users)[1]['rows']
        self.assertEqual(recent[0]['member'], 'vip@x.com')

    def test_products(self):
        st, out = F.handle_admin('admin_products_save', {'id': 'vip-7d-v1', 'title': '全方位研究 7 天', 'points': 2200, 'active': False}, 'admin', self.r)
        self.assertEqual((st, out['product']['points'], out['product']['active']), (200, 2200, False))
        self.assertEqual(F.handle_admin('admin_products_save', {'id': 'vip-7d-v1', 'title': '進出場追蹤', 'points': 1}, 'admin', self.r)[0], 400)


class VoucherAndTaskTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeRest()
        with at(EV_DAY):
            self.eid = F.handle_admin('admin_forum_save', {'event': {'city': 'TXG', 'date': '2026-11-22', 'status': 'published'}}, 'admin', self.r)[1]['event']['id']

    def test_voucher_off_by_default_then_on(self):
        with at(EV_DAY):
            self.assertFalse(F.handle_admin('admin_forum_voucher_get', {}, 'admin', self.r)[1]['voucher']['enabled'])
            F.handle_public('forum_checkin', {'pass': F.make_pass(self.eid)}, USER, self.r)
            self.assertEqual(self.r.vouchers, {})
            F.handle_admin('admin_forum_voucher_save', {'enabled': True, 'definition': 'vip-v1', 'days': 30}, 'admin', self.r)
            st, out = F.handle_public('forum_checkin', {'pass': F.make_pass(self.eid)}, USER2, self.r)
        self.assertEqual(st, 200)
        self.assertIn('全方位研究 30 天', out['voucher'])
        self.assertEqual(self.r.vouchers['forum-voucher:u2']['p_days'], 30)

    def test_custom_task_lifecycle_and_award(self):
        st, out = F.handle_admin('admin_tasks_save', {'title': '直播互動抽獎', 'points': 200, 'period': 'daily', 'active': True}, 'admin', self.r)
        tid = out['task']['id']
        self.assertTrue(tid.startswith('adm-') and out['task']['verifier'] == 'admin_review')
        self.assertEqual(F.handle_admin('admin_tasks_save', {'title': 'x', 'points': 5000}, 'admin', self.r)[0], 400)
        self.assertEqual(F.handle_admin('admin_tasks_save', {'id': 'name-v1', 'title': '設定暱稱', 'points': 30, 'active': False}, 'admin', self.r)[1]['task']['points'], 30)
        self.assertEqual(F.handle_admin('admin_tasks_delete', {'id': 'name-v1'}, 'admin', self.r)[0], 400)
        a = dict(user_id=UID, task_id=tid, points=200, reference='11/10 晚場直播', reason='抽獎中獎')
        st, out = F.handle_admin('admin_tasks_award', a, 'admin', self.r)
        self.assertEqual((st, out['balance']), (200, 200))
        self.assertTrue(F.handle_admin('admin_tasks_award', a, 'admin', self.r)[1]['duplicate'])
        self.assertEqual(F.handle_admin('admin_tasks_delete', {'id': tid}, 'admin', self.r)[0], 200)


if __name__ == '__main__':
    unittest.main()
