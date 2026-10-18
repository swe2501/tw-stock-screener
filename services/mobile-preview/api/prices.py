"""Isolated connectivity bootstrap: allowlisted staging project, no writes."""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

STAGING_ORIGIN = 'https://ebwtkcsmpvgyjvosbofx.supabase.co'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def connectivity():
    """Probe public Data API metadata only. Never send credentials elsewhere."""
    base = os.environ.get('STAGING_SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('STAGING_SUPABASE_PUBLISHABLE_KEY', '')
    result = {'database_connected': False, 'connection_state': 'not_configured'}
    if not base and not key:
        return result
    if base != STAGING_ORIGIN or not key.startswith('sb_publishable_'):
        return {**result, 'connection_state': 'configuration_rejected'}
    try:
        req = Request(base + '/rest/v1/', headers={'apikey': key, 'Accept': 'application/openapi+json'})
        with build_opener(NoRedirect()).open(req, timeout=5) as response:
            if response.status != 200 or 'json' not in response.headers.get('Content-Type', ''):
                raise ValueError('invalid response')
            # Inspect no table contents; connectivity does not imply schema readiness.
            response.read(1)
        return {'database_connected': True, 'connection_state': 'ready'}
    except Exception:
        return {**result, 'connection_state': 'unavailable'}


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
            state = connectivity()
            return self.reply(200, {'service': 'mobile-preview', 'status': 'ok',
                                    **state, 'member_login_enabled': False, 'research_ready': False})
        params = parse_qs(parsed.query)
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['site_search']:
            return self.reply(503, {'items': [], 'available': False, 'partial': False,
                                    'error': 'App 測試資料來源尚未設定', 'scope': 'saved_public_news'})
        return self.reply(404, {'error': 'not_found'})

    def do_POST(self):
        self.reply(405, {'error': 'read_only_preview'})

    do_PUT = do_PATCH = do_DELETE = do_POST
