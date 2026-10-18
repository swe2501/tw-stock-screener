"""Isolated connectivity bootstrap: allowlisted staging project, no writes."""
import json
import os
import math
import time
import threading
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

STAGING_ORIGIN = 'https://ebwtkcsmpvgyjvosbofx.supabase.co'
MARKET_SOURCE = 'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK'
_market_lock = threading.Lock()
_market_cache = None


def market_rows(data, today=None):
    """Normalize official daily values. Never infer intraday or missing values."""
    today = today or datetime.now(timezone(timedelta(hours=8))).date()
    if not isinstance(data, list) or not data or len(data) > 1000:
        raise ValueError('invalid daily series')
    rows = {}
    def number(value, positive=False):
        value = float(str(value).replace(',', ''))
        if not math.isfinite(value) or (positive and value <= 0):
            raise ValueError('invalid number')
        return value
    for raw in data:
        stamp = str(raw['Date'])
        if len(stamp) != 7 or not stamp.isdecimal():
            raise ValueError('invalid ROC date')
        day = date(int(stamp[:3]) + 1911, int(stamp[3:5]), int(stamp[5:]))
        if day > today:
            raise ValueError('future data')
        close, change = number(raw['TAIEX'], True), number(raw['Change'])
        previous = close - change
        if previous <= 0:
            raise ValueError('invalid previous close')
        amount, volume = number(raw['TradeValue']), number(raw['TradeVolume'])
        if amount < 0 or volume < 0:
            raise ValueError('negative activity')
        row = {'date': day.isoformat(), 'close': close, 'change': change,
               'change_percent': round(change / previous * 100, 4),
               'trade_value_twd': amount, 'trade_volume_shares': volume}
        if row['date'] in rows and rows[row['date']] != row:
            raise ValueError('conflicting duplicate date')
        rows[row['date']] = row
    return sorted(rows.values(), key=lambda row: row['date'])


def market_summary():
    global _market_cache
    with _market_lock:
        now = time.monotonic()
        if _market_cache and now - _market_cache[0] < 300:
            return 200, {**_market_cache[1], 'cached': True}
        try:
            request = Request(MARKET_SOURCE, headers={'Accept': 'application/json', 'User-Agent': 'MarketAcademy-Mobile/0.1'})
            with build_opener(NoRedirect()).open(request, timeout=10) as response:
                if response.status != 200 or 'json' not in response.headers.get('Content-Type', ''):
                    raise ValueError('invalid response')
                body = response.read(1048577)
                if len(body) > 1048576:
                    raise ValueError('oversized response')
            rows = market_rows(json.loads(body))
            now_date = datetime.now(timezone(timedelta(hours=8))).date()
            payload = {'schema_version': 1, 'available': True, 'symbol': 'TAIEX',
                       'name': '臺灣加權指數', 'frequency': 'daily', 'session': 'day',
                       'as_of': rows[-1]['date'], 'latest': rows[-1], 'history': rows,
                       'retrieved_at': datetime.now(timezone.utc).isoformat(),
                       'source': {'name': '臺灣證券交易所 FMTQIK', 'url': MARKET_SOURCE},
                       'stale': (now_date - date.fromisoformat(rows[-1]['date'])).days > 7,
                       'cached': False, 'notice': '官方盤後日資料，非即時報價；成交金額為上市市場整體成交金額。'}
            _market_cache = (time.monotonic(), payload)
            return 200, payload
        except Exception:
            if _market_cache and now - _market_cache[0] < 86400:
                return 200, {**_market_cache[1], 'cached': True, 'stale': True,
                             'notice': '來源暫時無法更新，顯示先前取得的資料；請留意資料日與取得時間。'}
            return 503, {'schema_version': 1, 'available': False, 'error': '官方大盤資料暫時無法取得，請稍後再試。',
                         'source': {'name': '臺灣證券交易所 FMTQIK', 'url': MARKET_SOURCE}}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def connectivity():
    """Probe public Auth settings only. Never send credentials elsewhere."""
    base = os.environ.get('STAGING_SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('STAGING_SUPABASE_PUBLISHABLE_KEY', '')
    result = {'database_connected': False, 'supabase_connected': False, 'connection_state': 'not_configured'}
    if not base and not key:
        return result
    if base != STAGING_ORIGIN or not key.startswith('sb_publishable_'):
        return {**result, 'connection_state': 'configuration_rejected'}
    try:
        req = Request(base + '/auth/v1/settings', headers={'apikey': key, 'Accept': 'application/json'})
        with build_opener(NoRedirect()).open(req, timeout=5) as response:
            if response.status != 200 or 'json' not in response.headers.get('Content-Type', ''):
                raise ValueError('invalid response')
            data = json.loads(response.read(65536))
            if not isinstance(data, dict) or not isinstance(data.get('external'), dict):
                raise ValueError('invalid settings')
        # Auth reachability alone does not verify a research schema/database query.
        return {**result, 'supabase_connected': True, 'connection_state': 'ready'}
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
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['market_summary']:
            status, payload = market_summary()
            return self.reply(status, payload)
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['site_search']:
            return self.reply(503, {'items': [], 'available': False, 'partial': False,
                                    'error': 'App 測試資料來源尚未設定', 'scope': 'saved_public_news'})
        return self.reply(404, {'error': 'not_found'})

    def do_POST(self):
        self.reply(405, {'error': 'read_only_preview'})

    do_PUT = do_PATCH = do_DELETE = do_POST
