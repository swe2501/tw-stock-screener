import io
import json
import urllib.error
import unittest
from unittest.mock import patch
from api import auth


class DeviceAuthTests(unittest.TestCase):
    def test_auth_empty_logout_response_is_valid(self):
        response = io.BytesIO(b'')
        response.status = 204
        with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch('urllib.request.urlopen', return_value=response):
            self.assertEqual(auth._sb('/logout?scope=local', {}, 'token'), (204, {}))

    def test_hook_error_becomes_actionable_without_tokens(self):
        error = urllib.error.HTTPError('https://auth.fixture', 403, 'Forbidden', {}, io.BytesIO(json.dumps({'message': 'MEMBER_DEVICE_LIMIT: full'}).encode()))
        with patch.object(auth, 'SUPABASE_URL', 'https://auth.fixture'), patch('urllib.request.urlopen', side_effect=error):
            status, result = auth._sb('/token?grant_type=password', {})
        self.assertEqual(status, 403)
        self.assertEqual(result['code'], 'MEMBER_DEVICE_LIMIT')
        self.assertNotIn('access_token', result)

    def test_logout_failure_does_not_claim_success(self):
        instance = auth.handler.__new__(auth.handler)
        body = b'{"action":"logout"}'
        instance.headers = {'Content-Length': str(len(body)), 'Authorization': 'Bearer current'}
        instance.rfile = io.BytesIO(body)
        result = []
        instance._json = lambda *args: result.append(args)
        with patch.object(auth, '_sb', return_value=(503, {})) as remote:
            instance.do_POST()
        self.assertEqual(result[0][0], 503)
        remote.assert_called_once_with('/logout?scope=local', {}, token='current')
