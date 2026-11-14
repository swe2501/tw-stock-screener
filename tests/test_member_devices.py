import os
import io
import json
import unittest
from unittest.mock import patch
from lib import member_devices as D, member_commerce as C


class DeviceTests(unittest.TestCase):
    def test_disabled_does_not_contact_database(self):
        with patch.dict(os.environ, {'MEMBER_DEVICE_POLICY_ENABLED': ''}), patch.object(D, 'rpc') as rpc:
            self.assertIsNone(D.check('token'))
            self.assertFalse(D.manage('token', {})[1]['enabled'])
            rpc.assert_not_called()

    def test_enabled_propagates_denial_and_outage(self):
        with patch.dict(os.environ, {'MEMBER_DEVICE_POLICY_ENABLED': 'true'}):
            for status in (409, 503):
                with patch.object(D, 'rpc', return_value=(status, {'code': 'denied'})):
                    self.assertEqual(D.check('token')[0], status)
            with patch.object(D, 'rpc', return_value=(200, None)):
                self.assertIsNone(D.check('token'))

    def test_shared_db_activation_waits_for_live_site(self):
        with patch.dict(os.environ, {'MEMBER_DEVICE_POLICY_ENABLED': 'true'}):
            for result, expected in [({'device_protocol': 1, 'guard_ready': True}, True),
                                     ({'device_protocol': 1, 'guard_ready': False}, False),
                                     ({'error': 'old API'}, False)]:
                response = io.BytesIO(json.dumps(result).encode())
                with patch('urllib.request.urlopen', return_value=response):
                    self.assertEqual(D.rollout_ready(), expected)
            with patch('urllib.request.urlopen', side_effect=TimeoutError):
                self.assertFalse(D.rollout_ready())

    def test_input_and_catalog(self):
        with patch.dict(os.environ, {'MEMBER_DEVICE_POLICY_ENABLED': 'true'}):
            self.assertEqual(D.manage('token', {'operation': 'revoke', 'target': 'bad'})[0], 400)
            self.assertEqual(D.manage('token', {'operation': 'unsafe'})[0], 400)
        config = C.defaults()
        self.assertEqual([p['device_limit'] for p in config['products']], [1, 1, 2, 3])
        for value in (0, 11, True, '2'):
            config['products'][0]['device_limit'] = value
            with self.assertRaises(C.CatalogError):
                C.validate(config)

    def test_direct_api_cannot_bypass_gate_and_management_stays_available(self):
        from api import auth
        def request(action):
            body = json.dumps({'action': action}).encode()
            instance = auth.handler.__new__(auth.handler)
            instance.headers = {'Content-Length': str(len(body)), 'Authorization': 'Bearer original-jwt'}
            instance.rfile = io.BytesIO(body)
            result = []
            instance._json = lambda *value: result.append(value)
            instance.do_POST()
            return result[0]
        with patch.object(D, 'check', return_value=(409, {'code': 'MEMBER_DEVICE_LIMIT'})), patch.object(auth, '_token_user') as user:
            self.assertEqual(request('membership_access')[0], 409)
            user.assert_not_called()
        with patch.object(D, 'check') as check, patch.object(D, 'manage', return_value=(200, {'allowed': False})) as manage:
            self.assertEqual(request('member_devices')[0], 200)
            check.assert_not_called()
            self.assertEqual(manage.call_args.args[0], 'original-jwt')


if __name__ == '__main__':
    unittest.main()
