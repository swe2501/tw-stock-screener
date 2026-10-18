import importlib.util
import json
from http.server import HTTPServer
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mobile_preview', ROOT / 'services/mobile-preview/api/prices.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewTests(unittest.TestCase):
    def test_rejects_production_and_privileged_keys_without_request(self):
        for base, key in [
            ('https://bruqrbvbjxntgoljxsne.supabase.co', 'sb_publishable_test'),
            (preview.STAGING_ORIGIN, 'sb_secret_test'),
            (preview.STAGING_ORIGIN + '.evil.test', 'sb_publishable_test'),
        ]:
            with patch.dict(preview.os.environ, {'STAGING_SUPABASE_URL': base,
                    'STAGING_SUPABASE_PUBLISHABLE_KEY': key}, clear=True), patch.object(preview, 'build_opener') as opener:
                self.assertEqual(preview.connectivity()['connection_state'], 'configuration_rejected')
                opener.assert_not_called()

    def test_staging_metadata_only_and_failure_does_not_leak(self):
        with patch.dict(preview.os.environ, {'STAGING_SUPABASE_URL': preview.STAGING_ORIGIN,
                'STAGING_SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_test'}, clear=True), patch.object(preview, 'build_opener') as opener:
            response = MagicMock(status=200, headers={'Content-Type': 'application/json'})
            response.read.return_value = b'{"external": {"google": false}}'
            opener.return_value.open.return_value.__enter__.return_value = response
            result = preview.connectivity()
            self.assertTrue(result['supabase_connected'])
            self.assertFalse(result['database_connected'])
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, preview.STAGING_ORIGIN + '/auth/v1/settings')
            self.assertEqual(req.get_method(), 'GET')
            response.read.assert_called_once_with(65536)
            opener.return_value.open.side_effect = RuntimeError('secret details')
            self.assertEqual(preview.connectivity(), {'database_connected': False, 'supabase_connected': False, 'connection_state': 'unavailable'})

    def test_no_database_and_no_writes(self):
        server = HTTPServer(('127.0.0.1', 0), preview.handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        try:
            with urlopen(base + '/health') as response:
                data = json.load(response)
                self.assertFalse(data['database_connected'])
                self.assertFalse(data['member_login_enabled'])
            for path, method, status in [
                ('/api/prices?action=site_search&q=hello', 'GET', 503),
                ('/api/auth', 'GET', 404),
                ('/api/prices?action=other', 'GET', 404),
                ('/api/watchlist', 'DELETE', 405),
                ('/api/auth', 'POST', 405),
            ]:
                with self.assertRaises(HTTPError) as caught:
                    urlopen(Request(base + path, method=method))
                self.assertEqual(caught.exception.code, status)
                payload = json.load(caught.exception)
                if status == 503:
                    self.assertFalse(payload['available'])
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_single_function_and_no_cron(self):
        config = json.loads((ROOT / 'services/mobile-preview/vercel.json').read_text())
        self.assertNotIn('crons', config)
        self.assertEqual(config['builds'], [{'src': 'api/prices.py', 'use': '@vercel/python'}])
