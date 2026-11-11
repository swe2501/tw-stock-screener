"""Offline real admin handler; mock only upstream Auth and task store dispatch."""
import io
import json
import os
import unittest
import urllib.error
from unittest.mock import patch
from api import auth

SECRET = 'DO_NOT_LEAK_UPSTREAM_BODY_OR_TOKEN'
ADMIN = {'id': 'synthetic-admin-id', 'email': 'Admin@Fixture.Test'}
MEMBER = {'id': 'synthetic-member-id', 'email': 'member@fixture.test'}


def request(action='admin_office_tasks_list', token='synthetic-token'):
    h = object.__new__(auth.handler)
    raw = json.dumps({'action': action}).encode()
    h.headers = {'Content-Length': str(len(raw))}
    if token is not None:
        h.headers['Authorization'] = 'Bearer ' + token
    h.rfile = io.BytesIO(raw)
    h._json = lambda status, data: (status, data)
    return h


def response(data):
    r = io.BytesIO(json.dumps(data).encode())
    r.status = 200
    return r


def http_error(code):
    return urllib.error.HTTPError('https://auth.fixture/auth/v1/user', code, SECRET, {}, io.BytesIO(SECRET.encode()))


class AdminExpired401(unittest.TestCase):
    def invoke(self, *, user=ADMIN, error=None, token='synthetic-token'):
        with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch.object(auth, 'SUPABASE_ANON_KEY', 'synthetic-public'), patch.object(auth, 'ADMIN_IDS', {ADMIN['id']}), patch('urllib.request.urlopen', side_effect=error, return_value=response(user)) as remote, patch('lib.office_tasks.handle', return_value=(200, {'tasks': []})) as store:
            result = request(token=token).do_POST()
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(remote.call_count, 0 if not token else 1, 'no second Auth lookup')
        if result[0] == 200:
            store.assert_called_once()
        else:
            store.assert_not_called()
        if token:
            req = remote.call_args.args[0]
            self.assertEqual(req.full_url, 'https://auth.fixture/auth/v1/user')
            self.assertEqual(req.get_header('Authorization'), 'Bearer ' + token)
        return result

    def test_missing_authorization_is_401_without_auth_call(self):
        self.assertEqual(self.invoke(token=None), (401, {'error': 'unauthorized'}))

    def test_empty_token_is_401_without_auth_call(self):
        self.assertEqual(self.invoke(token=''), (401, {'error': 'unauthorized'}))

    def test_expired_token_upstream_401_is_401(self):
        self.assertEqual(self.invoke(error=http_error(401)), (401, {'error': 'unauthorized'}))

    def test_invalid_token_upstream_403_is_401(self):
        self.assertEqual(self.invoke(error=http_error(403)), (401, {'error': 'unauthorized'}))

    def test_success_without_user_is_401(self):
        for user in [None, {}, [], {'user': None}, {'id': ''}]:
            with self.subTest(user=user):
                self.assertEqual(self.invoke(user=user), (401, {'error': 'unauthorized'}))

    def test_valid_non_admin_retains_forbidden_403(self):
        self.assertEqual(self.invoke(user=MEMBER), (403, {'error': 'forbidden: 僅限管理員'}))

    def test_valid_admin_dispatches_200_with_one_auth_call(self):
        self.assertEqual(self.invoke(), (200, {'tasks': []}))

    def test_allowlisted_id_without_email_does_not_gain_access(self):
        self.assertEqual(self.invoke(user={'id': ADMIN['id']}), (403, {'error': 'forbidden: 僅限管理員'}))

    def test_email_alone_cannot_grant_admin_access(self):
        self.assertEqual(self.invoke(user={**MEMBER, 'email': ADMIN['email']}), (403, {'error': 'forbidden: 僅限管理員'}))

    def test_upstream_5xx_is_generic_503_not_refreshable_401(self):
        for status in [500, 502, 503]:
            with self.subTest(status=status):
                self.assertEqual(self.invoke(error=http_error(status)), (503, {'error': 'authentication unavailable'}))

    def test_upstream_other_http_error_is_generic_503(self):
        self.assertEqual(self.invoke(error=http_error(429)), (503, {'error': 'authentication unavailable'}))

    def test_upstream_network_and_timeout_are_generic_503(self):
        for error in [urllib.error.URLError(SECRET), TimeoutError(SECRET)]:
            with self.subTest(error=type(error).__name__):
                self.assertEqual(self.invoke(error=error), (503, {'error': 'authentication unavailable'}))

    def test_malformed_upstream_json_is_not_misclassified_as_expired(self):
        with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch('urllib.request.urlopen', return_value=io.BytesIO(SECRET.encode())) as remote:
            self.assertEqual(request().do_POST(), (503, {'error': 'authentication unavailable'}))
            self.assertEqual(remote.call_count, 1)

    def test_legacy_helper_contract_remains_email_or_none(self):
        for user, expected in [(ADMIN, 'admin@fixture.test'), (MEMBER, None), ({}, None)]:
            with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch.object(auth, 'ADMIN_IDS', {ADMIN['id']}), patch('urllib.request.urlopen', return_value=response(user)) as remote:
                self.assertEqual(auth._verify_admin('synthetic-token'), expected)
                self.assertEqual(remote.call_count, 1)
        self.assertIsNone(auth._verify_admin(''))

    def test_algo_info_keeps_hidden_200_for_invalid_token(self):
        with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch('urllib.request.urlopen', side_effect=http_error(401)), patch.object(auth, '_rest') as store:
            self.assertEqual(request('algo_info').do_POST(), (200, {'visible': False}))
            store.assert_not_called()

    def test_scope_guard_still_returns_same_403_for_valid_admin(self):
        with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch.object(auth, 'ADMIN_IDS', {ADMIN['id']}), patch('urllib.request.urlopen', return_value=response(ADMIN)) as remote, patch.dict(os.environ, {'VERCEL': '1', 'VERCEL_GIT_COMMIT_REF': 'prod'}), patch.object(auth, '_rest') as store:
            self.assertEqual(request().do_POST(), (403, {'error': '任務中心目前僅在 UAT 啟用'}))
            self.assertEqual(remote.call_count, 1)
            store.assert_not_called()


if __name__ == '__main__':
    unittest.main()
