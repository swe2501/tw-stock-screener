from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.parse, re
from datetime import datetime, timezone, timedelta, date
from concurrent.futures import ThreadPoolExecutor, as_completed

TW_TZ = timezone(timedelta(hours=8))
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":    "https://www.twse.com.tw/zh/trading/historical/brokerlimited.html",
    "Accept":     "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "zh-TW,zh;q=0.9",
}
OTC_HEADERS = {**TWSE_HEADERS, "Referer": "https://www.tpex.org.tw/"}


# ── TWSE HTML parser ──────────────────────────────────────────────────────────
def _parse_broker_table(html):
    """Extract broker rows from TWSE/OTC HTML. Returns list of (name, buy, sell)."""
    rows = []
    # TWSE table rows: <td>broker_code</td><td>name</td><td>buy</td><td>sell</td><td>diff</td>
    pattern = re.compile(
        r'<tr[^>]*>(?:\s*<td[^>]*>([^<]*)</td>){5}',
        re.IGNORECASE | re.DOTALL
    )
    cell_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.IGNORECASE | re.DOTALL)
    tr_pattern   = re.compile(r'<tr[^>]*>(.*?)</tr>', re.IGNORECASE | re.DOTALL)

    for m in tr_pattern.finditer(html):
        cells = cell_pattern.findall(m.group(1))
        if len(cells) < 4:
            continue
        # strip tags / whitespace from each cell
        clean = [re.sub(r'<[^>]+>', '', c).replace(',', '').strip() for c in cells]
        if not clean[0]:  # skip header rows
            continue
        # Expect: [broker_code, broker_name, buy, sell, diff] or [broker_name, buy, sell, diff]
        if len(clean) >= 5:
            name, buy_str, sell_str = clean[1], clean[2], clean[3]
        elif len(clean) == 4:
            name, buy_str, sell_str = clean[0], clean[1], clean[2]
        else:
            continue
        try:
            buy  = int(buy_str)  if buy_str.lstrip('-').isdigit()  else 0
            sell = int(sell_str) if sell_str.lstrip('-').isdigit() else 0
        except ValueError:
            continue
        if buy == 0 and sell == 0:
            continue
        if not name or len(name) > 30:
            continue
        rows.append((name, buy, sell))
    return rows


# ── TWSE fetch (上市) ─────────────────────────────────────────────────────────
def _fetch_tse(code, date_str):
    """date_str: YYYYMMDD"""
    url = (f"https://www.twse.com.tw/exchangeReport/BROKERLIMITED"
           f"?response=html&date={date_str}&stockNo={code}")
    try:
        req = urllib.request.Request(url, headers=TWSE_HEADERS)
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode("utf-8", errors="replace")
        rows = _parse_broker_table(html)
        return rows if rows else None
    except Exception:
        return None


# ── OTC fetch (上櫃) ──────────────────────────────────────────────────────────
def _fetch_otc(code, date_str):
    """date_str: YYYYMMDD"""
    d = datetime.strptime(date_str, "%Y%m%d")
    tw_year = d.year - 1911
    d_slash = f"{tw_year}/{d.month:02d}/{d.day:02d}"
    url = (f"https://www.tpex.org.tw/web/stock/aftertrading/broker_trading/"
           f"brokerBS_result.php?l=zh-tw&d={d_slash}&stkno={code}&s=0,asc")
    try:
        req = urllib.request.Request(url, headers=OTC_HEADERS)
        with urllib.request.urlopen(req, timeout=12) as r:
            raw = r.read()
        # OTC returns JSON
        data = json.loads(raw)
        aaData = data.get("aaData") or []
        rows = []
        for row in aaData:
            if len(row) < 4:
                continue
            name     = re.sub(r'<[^>]+>', '', str(row[1])).strip()
            buy_str  = re.sub(r'[,<>]', '', str(row[2])).strip()
            sell_str = re.sub(r'[,<>]', '', str(row[3])).strip()
            try:
                buy  = int(buy_str)  if buy_str.lstrip('-').isdigit()  else 0
                sell = int(sell_str) if sell_str.lstrip('-').isdigit() else 0
            except ValueError:
                continue
            if buy or sell:
                rows.append((name, buy, sell))
        return rows if rows else None
    except Exception:
        return None


def _fetch_one_day(code, date_str):
    """Try TSE first, fall back to OTC. Returns (date_str, rows) or (date_str, None)."""
    rows = _fetch_tse(code, date_str)
    if not rows:
        rows = _fetch_otc(code, date_str)
    return date_str, rows


# ── Supabase helpers ──────────────────────────────────────────────────────────
def _sb(path, method="GET", body=None, params=None):
    """params can be a dict or list of (key, value) tuples (for duplicate keys)."""
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        pairs = list(params.items()) if isinstance(params, dict) else params
        url += "?" + urllib.parse.urlencode(pairs)
    data = json.dumps(body).encode() if body else None
    if method == "POST" and body:
        prefer = "return=minimal,resolution=merge-duplicates"
    else:
        prefer = "return=minimal"
    headers = {
        "Content-Type": "application/json",
        "apikey":       SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer":       prefer,
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else {}


def _cached_dates(code, date_from, date_to):
    """Return set of YYYYMMDD strings already cached in Supabase."""
    # Use list of tuples so we can repeat 'trade_date' key
    status, rows = _sb("/broker_daily", params=[
        ("select",     "trade_date"),
        ("code",       f"eq.{code}"),
        ("trade_date", f"gte.{date_from}"),
        ("trade_date", f"lte.{date_to}"),
    ])
    if status != 200 or not isinstance(rows, list):
        return set()
    # Supabase returns YYYY-MM-DD; convert to YYYYMMDD for comparison
    return {r["trade_date"].replace("-", "") for r in rows}


def _save_rows(code, date_str, rows):
    """Upsert broker rows into Supabase."""
    if not rows:
        return
    records = [
        {"code": code, "trade_date": f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}",
         "broker_name": name, "buy_vol": buy, "sell_vol": sell}
        for name, buy, sell in rows
    ]
    _sb("/broker_daily", method="POST", body=records,
        params=[("on_conflict", "code,trade_date,broker_name")])


# ── Trading day generator ─────────────────────────────────────────────────────
def _weekdays(date_from_str, date_to_str):
    """Yield YYYYMMDD strings for weekdays in [date_from, date_to]."""
    d   = datetime.strptime(date_from_str, "%Y-%m-%d").date()
    end = datetime.strptime(date_to_str,   "%Y-%m-%d").date()
    while d <= end:
        if d.weekday() < 5:   # Mon-Fri
            yield d.strftime("%Y%m%d")
        d += timedelta(days=1)


# ── Main handler ──────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        qs        = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code      = (qs.get("code")      or [""])[0].strip()
        date_from = (qs.get("date_from") or [""])[0].strip()
        date_to   = (qs.get("date_to")   or [""])[0].strip()
        probe     = (qs.get("probe")     or [""])[0].strip()

        # ── probe mode: 試多個 URL，回傳各自結果 ──
        if probe and code:
            date_str = probe  # 格式 YYYYMMDD
            d = datetime.strptime(date_str, "%Y%m%d")
            tw_year  = d.year - 1911
            d_slash  = f"{tw_year}/{d.month:02d}/{d.day:02d}"
            candidates = [
                # TWSE OpenAPI 官方平台
                ("twse_openapi_BROKERLIMITED", f"https://openapi.twse.com.tw/v1/exchangeReport/BROKERLIMITED?date={date_str}&stockNo={code}", TWSE_HEADERS),
                ("twse_openapi_brokerSearch",  f"https://openapi.twse.com.tw/v1/brokerSearch/brokerSearch?date={date_str}&stockNo={code}", TWSE_HEADERS),
                ("twse_openapi_MI_BROKER",     f"https://openapi.twse.com.tw/v1/exchangeReport/MI_BROKER?date={date_str}&stockNo={code}", TWSE_HEADERS),
                ("twse_openapi_list",          f"https://openapi.twse.com.tw/v1/", TWSE_HEADERS),
                # FinMind 台灣金融開放資料
                ("finmind_broker",  f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockBrokerData&data_id={code}&start_date={d.strftime('%Y-%m-%d')}&end_date={d.strftime('%Y-%m-%d')}", {}),
                ("finmind_holding", f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockHolderThousand&data_id={code}&start_date={d.strftime('%Y-%m-%d')}&end_date={d.strftime('%Y-%m-%d')}", {}),
                # OTC OpenAPI
                ("otc_openapi_v2",  f"https://www.tpex.org.tw/openapi/v2/tpex_aftertrading_daily_brokerbuysell?date={d_slash}&stockNo={code}", OTC_HEADERS),
            ]
            results = {}
            for label, url, hdrs in candidates:
                try:
                    req = urllib.request.Request(url, headers=hdrs)
                    with urllib.request.urlopen(req, timeout=10) as r:
                        status = r.status
                        raw    = r.read()
                    results[label] = {"status": status, "len": len(raw), "preview": raw[:300].decode("utf-8","replace"), "url": url}
                except Exception as e:
                    results[label] = {"error": str(e), "url": url}
            return self._json(200, results)

        if not (code and date_from and date_to):
            return self._json(400, {"error": "code, date_from, date_to required"})

        # 限制查詢區間最多 1 年（約 250 交易日）
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d").date()
            dt = datetime.strptime(date_to,   "%Y-%m-%d").date()
        except ValueError:
            return self._json(400, {"error": "date format must be YYYY-MM-DD"})
        if (dt - df).days > 366:
            return self._json(400, {"error": "date range exceeds 1 year"})

        # 1. 算出日期清單（平日）
        all_days = list(_weekdays(date_from, date_to))

        # 2. 從 Supabase 取已快取的日期
        cached = _cached_dates(code, date_from, date_to)
        cached_day_strs = {d.replace("-", "") for d in cached}

        # 3. 只抓缺少的日期（平行，最多 15 concurrent）
        missing = [d for d in all_days if d not in cached_day_strs]
        if missing:
            workers = min(len(missing), 15)
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futs = {ex.submit(_fetch_one_day, code, d): d for d in missing}
                for f in as_completed(futs):
                    day_str, rows = f.result()
                    if rows:
                        _save_rows(code, day_str, rows)

        # 4. 從 Supabase 拉完整區間並彙整
        status, rows = _sb("/broker_daily", params=[
            ("select",     "trade_date,broker_name,buy_vol,sell_vol"),
            ("code",       f"eq.{code}"),
            ("trade_date", f"gte.{date_from}"),
            ("trade_date", f"lte.{date_to}"),
            ("order",      "trade_date.asc"),
            ("limit",      "50000"),
        ])
        if status != 200:
            return self._json(500, {"error": "db error", "detail": rows})
        rows = rows or []

        # 彙整：以券商名稱加總買賣量
        agg = {}
        for r in rows:
            n = r["broker_name"]
            if n not in agg:
                agg[n] = {"broker_name": n, "buy_vol": 0, "sell_vol": 0}
            agg[n]["buy_vol"]  += r["buy_vol"]
            agg[n]["sell_vol"] += r["sell_vol"]

        result = sorted(agg.values(),
                        key=lambda x: x["buy_vol"] - x["sell_vol"],
                        reverse=True)
        for r in result:
            r["net"] = r["buy_vol"] - r["sell_vol"]

        self._json(200, {
            "code":      code,
            "date_from": date_from,
            "date_to":   date_to,
            "days_fetched": len(all_days),
            "brokers":   result,
        })
