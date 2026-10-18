import importlib.util
import json
from http.server import HTTPServer
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mobile_preview', ROOT / 'services/mobile-preview/api/prices.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewTests(unittest.TestCase):
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
