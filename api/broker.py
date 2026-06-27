from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.parse, re, time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

TW_TZ = timezone(timedelta(hours=8))
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

HISTOCK_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8",
    "Referer": "https://histock.tw/",
}


# ── HiStock fetch ─────────────────────────────────────────────────────────────
def _fetch_histock(code, date_str):
    """
    Fetch broker buy/sell data from HiStock for a single trading day.
    date_str: YYYYMMDD
    Returns list of {"broker_name": str, "buy_vol": int, "sell_vol": int}
    or None if no data (non-trading day or rate-limited).
    """
    url = (f"https://histock.tw/stock/branch.aspx"
           f"?no={code}&from={date_str}&to={date_str}")
    try:
        req = urllib.request.Request(url, headers=HISTOCK_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    # 頁面約 96KB；若 < 80KB 代表被 rate-limited（回傳非資料頁）
    if len(html) < 80000:
        return None

    # 提取嵌入式 JSON：eval({ "Buy": [...], "Sell": [...] })
    m = re.search(r'eval\((\{[\s\S]*?\})\)\s*;', html, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except (ValueError, KeyError):
        return None

    buy_list  = data.get("Buy")  or []
    sell_list = data.get("Sell") or []
    if not buy_list and not sell_list:
        return None

    # 合併 Buy 和 Sell 清單，以 broker_name 為鍵彙整
    merged = {}
    for row in buy_list:
        name = str(row.get("Name", "")).strip()
        if not name:
            continue
        buy  = int(str(row.get("BuySum",  "0")).replace(",", "") or 0)
        sell = int(str(row.get("SellSum", "0")).replace(",", "") or 0)
        merged[name] = {"broker_name": name, "buy_vol": buy, "sell_vol": sell}

    for row in sell_list:
        name = str(row.get("Name", "")).strip()
        if not name:
            continue
        buy  = int(str(row.get("BuySum",  "0")).replace(",", "") or 0)
        sell = int(str(row.get("SellSum", "0")).replace(",", "") or 0)
        if name in merged:
            merged[name]["buy_vol"]  = max(merged[name]["buy_vol"],  buy)
            merged[name]["sell_vol"] = max(merged[name]["sell_vol"], sell)
        else:
            merged[name] = {"broker_name": name, "buy_vol": buy, "sell_vol": sell}

    result = [v for v in merged.values() if v["buy_vol"] or v["sell_vol"]]
    return result if result else None


# ── Supabase helpers ──────────────────────────────────────────────────────────
def _sb(path, method="GET", body=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        pairs = list(params.items()) if isinstance(params, dict) else params
        url += "?" + urllib.parse.urlencode(pairs)
    data = json.dumps(body).encode() if body else None
    prefer = "return=minimal,resolution=merge-duplicates" if method == "POST" else "return=minimal"
    headers = {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer":        prefer,
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
    """Return set of YYYYMMDD strings already in Supabase."""
    status, rows = _sb("/broker_daily", params=[
        ("select",     "trade_date"),
        ("code",       f"eq.{code}"),
        ("trade_date", f"gte.{date_from}"),
        ("trade_date", f"lte.{date_to}"),
    ])
    if status != 200 or not isinstance(rows, list):
        return set()
    return {r["trade_date"].replace("-", "") for r in rows}


def _save_rows(code, date_str, rows):
    if not rows:
        return
    records = [
        {
            "code":        code,
            "trade_date":  f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}",
            "broker_name": r["broker_name"],
            "buy_vol":     r["buy_vol"],
            "sell_vol":    r["sell_vol"],
        }
        for r in rows
    ]
    _sb("/broker_daily", method="POST", body=records,
        params=[("on_conflict", "code,trade_date,broker_name")])


# ── Trading weekday generator ─────────────────────────────────────────────────
def _weekdays(date_from_str, date_to_str):
    d   = datetime.strptime(date_from_str, "%Y-%m-%d").date()
    end = datetime.strptime(date_to_str,   "%Y-%m-%d").date()
    while d <= end:
        if d.weekday() < 5:
            yield d.strftime("%Y%m%d")
        d += timedelta(days=1)


# ── Main handler ──────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type",  "application/json; charset=utf-8")
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

        if not (code and date_from and date_to):
            return self._json(400, {"error": "code, date_from, date_to required"})

        try:
            df = datetime.strptime(date_from, "%Y-%m-%d").date()
            dt = datetime.strptime(date_to,   "%Y-%m-%d").date()
        except ValueError:
            return self._json(400, {"error": "date format must be YYYY-MM-DD"})
        if (dt - df).days > 32:
            return self._json(400, {"error": "chunk_too_large", "hint": "split into ≤30-day chunks"})

        # 1. 算出平日清單
        all_days = list(_weekdays(date_from, date_to))

        # 2. 已快取的日期
        cached = _cached_dates(code, date_from, date_to)

        # 3. 逐日抓缺少的，加入 1.5 秒間隔避免 rate limit
        missing = [d for d in all_days if d not in cached]
        fetched_count = 0
        for day_str in missing:
            rows = _fetch_histock(code, day_str)
            if rows:
                _save_rows(code, day_str, rows)
                fetched_count += 1
            # 控速：每筆請求後等 1.5 秒
            if missing.index(day_str) < len(missing) - 1:
                time.sleep(1.5)

        # 4. 從 Supabase 拉彙整結果
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
            "code":          code,
            "date_from":     date_from,
            "date_to":       date_to,
            "days_checked":  len(all_days),
            "days_fetched":  fetched_count,
            "brokers":       result,
        })
