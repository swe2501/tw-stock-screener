"""Isolated connectivity bootstrap: no database, credentials or writes."""
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/health':
            return self.reply(200, {'service': 'mobile-preview', 'status': 'ok',
                                    'database_connected': False, 'member_login_enabled': False})
        params = parse_qs(parsed.query)
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['site_search']:
            return self.reply(503, {'items': [], 'available': False, 'partial': False,
                                    'error': 'App 測試資料來源尚未設定', 'scope': 'saved_public_news'})
        return self.reply(404, {'error': 'not_found'})

    def do_POST(self):
        self.reply(405, {'error': 'read_only_preview'})

    do_PUT = do_PATCH = do_DELETE = do_POST
