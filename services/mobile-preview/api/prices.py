"""Isolated connectivity bootstrap: allowlisted staging project, no writes."""
import json
import os
import math
import time
import threading
import re
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from concurrent.futures import ThreadPoolExecutor, as_completed

STAGING_ORIGIN = 'https://ebwtkcsmpvgyjvosbofx.supabase.co'
MARKET_SOURCE = 'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK'
_market_lock = threading.Lock()
_market_cache = None
_candle_cache = None
_candle_lock = threading.Lock()
_stock_cache = None
_stock_lock = threading.Lock()
STOCK_SOURCE = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
_context_cache = None
_context_lock = threading.Lock()


def integer(value):
    text = str(value).replace(',', '').strip()
    if not re.fullmatch(r'-?[0-9]+', text):
        raise ValueError('invalid integer')
    return int(text)


def institution_rows(data, day):
    if data.get('stat') != 'OK' or data.get('date') != day.replace('-', ''):
        raise ValueError('institution date mismatch')
    values = {'foreign': None, 'trust': None, 'dealer': 0, 'total': None}
    dealer_rows = 0
    for row in data.get('data', []):
        name, buy, sell, net = str(row[0]), integer(row[1]), integer(row[2]), integer(row[3])
        if buy < 0 or sell < 0 or buy-sell != net:
            raise ValueError('institution values mismatch')
        if '合計' in name:
            values['total'] = net
        elif '外資' in name and '不含' in name:
            values['foreign'] = net
        elif '外資' in name:
            continue  # Foreign dealer already included in official dealer total.
        elif '投信' in name:
            values['trust'] = net
        elif '自營商' in name:
            values['dealer'] += net
            dealer_rows += 1
    if dealer_rows != 2 or any(value is None for value in values.values()) or values['foreign']+values['trust']+values['dealer'] != values['total']:
        raise ValueError('institution categories mismatch')
    return values


def margin_rows(data, day):
    if data.get('stat') != 'OK' or data.get('date') != day.replace('-', ''):
        raise ValueError('margin date mismatch')
    tables = data.get('tables', [])
    rows = next((t.get('data') for t in tables if t.get('data')), [])
    finance = next(r for r in rows if '融資金額' in str(r[0]) and '仟元' in str(r[0]))
    short = next(r for r in rows if '融券' in str(r[0]))
    balance, previous = integer(finance[5])*1000, integer(finance[4])*1000
    shorts, short_previous = integer(short[5]), integer(short[4])
    if min(balance, previous, shorts, short_previous) < 0:
        raise ValueError('negative balance')
    return {'finance_balance_twd': balance, 'finance_change_twd': balance-previous,
            'short_balance_units': shorts, 'short_change_units': shorts-short_previous}


def market_context():
    global _context_cache
    with _context_lock:
        if _context_cache and time.monotonic()-_context_cache[0] < 300:
            return 200, {**_context_cache[1], 'cached': True}
        status, market = market_summary()
        if status != 200:
            return 503, {'available': False, 'error': '大盤資料日期暫時無法核對。'}
        day = market['as_of']
        compact = day.replace('-', '')
        sources = {
            'institutions': 'https://www.twse.com.tw/fund/BFI82U?response=json&dayDate='+compact+'&type=day',
            'margin': 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date='+compact+'&selectType=MS&response=json',
            'breadth': STOCK_SOURCE,
        }
        def read(key):
            if key == 'breadth':
                code, catalog = stock_catalog()
                if code != 200:
                    raise ValueError('no stock sample')
                rows = [r for r in catalog['items'] if r['date'] == day and r['kind'] == 'stock']
                if not rows:
                    raise ValueError('empty aligned sample')
                return {'up': sum(r['change'] > 0 for r in rows), 'down': sum(r['change'] < 0 for r in rows),
                        'flat': sum(r['change'] == 0 for r in rows), 'total': len(rows),
                        'scope': '同資料日上市股票樣本，包含特別股，不含 ETF、上櫃及缺少有效價格的商品。'}
            raw = public_json(sources[key])
            return institution_rows(raw, day) if key == 'institutions' else margin_rows(raw, day)
        parts = {}
        with ThreadPoolExecutor(max_workers=3) as pool:
            jobs = {pool.submit(read, key): key for key in sources}
            for job in as_completed(jobs):
                key = jobs[job]
                try:
                    parts[key] = {'available': True, 'data': job.result(), 'date': day, 'source_url': sources[key]}
                except Exception:
                    parts[key] = {'available': False, 'data': None, 'date': day, 'source_url': sources[key]}
        payload = {'schema_version': 1, 'available': True, 'as_of': day, 'market': 'TWSE', 'frequency': 'daily',
                   'parts': parts, 'partial': any(not p['available'] for p in parts.values()),
                   'cached': False, 'stale': market['stale'], 'retrieved_at': datetime.now(timezone.utc).isoformat(),
                   'notice': '各區均核對同一資料日。法人為上市現貨金額，外資不含已計入自營商的外資自營；融資金額由仟元轉為元。'}
        _context_cache = (time.monotonic(), payload)
        return 200, payload


def stock_catalog():
    global _stock_cache
    with _stock_lock:
        now = time.monotonic()
        if _stock_cache and now-_stock_cache[0] < 600:
            return 200, {**_stock_cache[1], 'cached': True}
        try:
            raw = public_json(STOCK_SOURCE)
            if not isinstance(raw, list) or len(raw) > 5000:
                raise ValueError('invalid catalog')
            rows, rejected = [], 0
            for item in raw:
                try:
                    code = str(item['Code'])
                    if not re.fullmatch(r'[0-9]{4,6}[A-Z]?', code) or not (code.startswith('00') or re.fullmatch(r'[1-9][0-9]{3}[A-Z]?', code)):
                        raise ValueError('invalid code')
                    row = market_rows([{'Date': item['Date'], 'TAIEX': item['ClosingPrice'], 'Change': item['Change'],
                                       'TradeValue': item['TradeValue'], 'TradeVolume': item['TradeVolume']}])[0]
                    name = str(item['Name']).strip()
                    if not name or len(name) > 80 or '\ufffd' in name:
                        name = code
                    rows.append({**row, 'code': code, 'name': name, 'market': 'TWSE', 'kind': 'etf' if code.startswith('00') else 'stock'})
                except (ValueError, KeyError, TypeError):
                    rejected += 1
            if not rows:
                raise ValueError('empty catalog')
            rows.sort(key=lambda row: row['code'])
            newest = max(row['date'] for row in rows)
            payload = {'schema_version': 1, 'available': True, 'market': 'TWSE', 'frequency': 'daily',
                       'as_of': newest, 'items': rows, 'partial': bool(rejected), 'excluded_rows': rejected,
                       'cached': False, 'stale': (datetime.now(timezone(timedelta(hours=8))).date()-date.fromisoformat(newest)).days > 7,
                       'retrieved_at': datetime.now(timezone.utc).isoformat(),
                       'source': {'name': '臺灣證券交易所 STOCK_DAY_ALL', 'url': STOCK_SOURCE},
                       'notice': '目前為上市股票及 ETF 盤後資料；未含上櫃、盤中報價或網站私人研究。個別資料日期請逐筆核對。'}
            _stock_cache = (time.monotonic(), payload)
            return 200, payload
        except Exception:
            if _stock_cache and now-_stock_cache[0] < 86400:
                return 200, {**_stock_cache[1], 'stale': True, 'cached': True}
            return 503, {'available': False, 'error': '官方上市股票資料暫時無法取得。'}


def candle_rows(data, today=None):
    today = today or datetime.now(timezone(timedelta(hours=8))).date()
    result = {}
    for raw in data:
        if isinstance(raw, list):
            stamp, opening, high, low, close = raw[:5]
        else:
            stamp, opening, high, low, close = (raw[k] for k in ('Date', 'OpeningIndex', 'HighestIndex', 'LowestIndex', 'ClosingIndex'))
        stamp = str(stamp).replace('/', '')
        if len(stamp) != 7 or not stamp.isdecimal():
            raise ValueError('invalid candle date')
        day = date(int(stamp[:3])+1911, int(stamp[3:5]), int(stamp[5:]))
        values = [float(str(v).replace(',', '')) for v in (opening, high, low, close)]
        o, h, l, c = values
        if day > today or not all(math.isfinite(v) and v > 0 for v in values) or not l <= min(o, c) <= max(o, c) <= h:
            raise ValueError('invalid OHLC')
        row = {'date': day.isoformat(), 'open': o, 'high': h, 'low': l, 'close': c}
        if row['date'] in result and result[row['date']] != row:
            raise ValueError('conflicting candle')
        result[row['date']] = row
    return sorted(result.values(), key=lambda r: r['date'])


def public_json(url):
    # Only callers construct fixed official source URLs, never client input.
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 MarketAcademy-Mobile/0.1'})
    with build_opener(NoRedirect()).open(request, timeout=8) as response:
        if response.status != 200 or 'json' not in response.headers.get('Content-Type', ''):
            raise ValueError('invalid official response')
        body = response.read(2097153)
        if len(body) > 2097152:
            raise ValueError('oversized official response')
        return json.loads(body)


def market_candles():
    global _candle_cache
    with _candle_lock:
        now = time.monotonic()
        if _candle_cache and now-_candle_cache[0] < 900:
            return 200, {**_candle_cache[1], 'cached': True}
        today = datetime.now(timezone(timedelta(hours=8))).date()
        first = today.replace(day=1)
        months = []
        for _ in range(6):
            months.append(first.strftime('%Y%m01'))
            first = (first-timedelta(days=1)).replace(day=1)
        def read_month(month):
            url = 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date='+month+'&response=json'
            data = public_json(url)
            if data.get('stat') != 'OK' or not isinstance(data.get('data'), list) or not data['data']:
                raise ValueError('no official month')
            rows = candle_rows(data['data'], today)
            if any(row['date'][:7] != month[:4]+'-'+month[4:6] for row in rows):
                raise ValueError('wrong official month')
            return rows, url
        rows, sources, failed = [], [], 0
        with ThreadPoolExecutor(max_workers=3) as pool:
            jobs = [pool.submit(read_month, m) for m in months]
            for job in as_completed(jobs):
                try:
                    part, url = job.result()
                    rows.extend(part)
                    sources.append(url)
                except Exception:
                    failed += 1
        if not rows:
            if _candle_cache and now-_candle_cache[0] < 86400:
                return 200, {**_candle_cache[1], 'cached': True, 'stale': True, 'partial': True}
            return 503, {'available': False, 'error': '官方 K 線資料暫時無法取得。'}
        unique = {r['date']: r for r in rows}
        rows = sorted(unique.values(), key=lambda r: r['date'])
        payload = {'schema_version': 1, 'available': True, 'symbol': 'TAIEX', 'frequency': 'daily',
                   'as_of': rows[-1]['date'], 'candles': rows, 'partial': bool(failed), 'cached': False,
                   'stale': (today-date.fromisoformat(rows[-1]['date'])).days > 7,
                   'retrieved_at': datetime.now(timezone.utc).isoformat(),
                   'source': {'name': '臺灣證券交易所 MI_5MINS_HIST', 'urls': sorted(sources)},
                   'notice': '官方日 K；週 K、月 K 由已取得的日資料彙整，首尾可能為未完整週／月。不補造缺少的交易日。'}
        _candle_cache = (time.monotonic(), payload)
        return 200, payload


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
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['market_context']:
            status, payload = market_context()
            return self.reply(status, payload)
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['stock_catalog']:
            status, payload = stock_catalog()
            return self.reply(status, payload)
        if parsed.path in ('/api/prices', '/api/prices.py') and params.get('action') == ['market_candles']:
            status, payload = market_candles()
            return self.reply(status, payload)
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
