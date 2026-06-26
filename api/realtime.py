from http.server import BaseHTTPRequestHandler
import json, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

TW_TZ = timezone(timedelta(hours=8))

MIS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://mis.twse.com.tw/stock/index.jsp",
    "Accept": "application/json, text/plain, */*",
}
YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


def _http_json(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        return json.loads(raw) if raw and raw.strip() else None
    except Exception as e:
        return None


def _parse_num(item, key):
    v = str(item.get(key, "-")).strip()
    if v in ("-", "", "0"):
        return None
    try:
        f = float(v)
        return f if f > 0 else None
    except (ValueError, TypeError):
        return None


# ── TWSE MIS ───────────────────────────────────────────────────
def _fetch_mis(code):
    ts  = int(datetime.now(TW_TZ).timestamp() * 1000)
    url = (
        "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
        f"?ex_ch=tse_{code}.tw%7Cotc_{code}.tw&_={ts}"
    )
    data = _http_json(url, headers=MIS_HEADERS, timeout=8)
    if not data or "msgArray" not in data:
        return None

    for item in data["msgArray"]:
        z_str = str(item.get("z", "-")).strip()
        if z_str in ("-", "", "0"):
            continue
        try:
            close = float(z_str)
            if close <= 0:
                continue
            prev = _parse_num(item, "y") or 0.0
            v_str = str(item.get("v", "0")).strip()
            try:
                volume = int(float(v_str)) if v_str not in ("-", "") else 0  # v 已是千股＝張，不需×1000
            except (ValueError, TypeError):
                volume = 0
            now_tw = datetime.now(TW_TZ)
            return {
                "code":       str(item.get("c", code)).strip(),
                "name":       str(item.get("n", "")).strip(),
                "close":      close,
                "open":       _parse_num(item, "o"),
                "high":       _parse_num(item, "h"),
                "low":        _parse_num(item, "l"),
                "volume":     volume,
                "prev_close": prev,
                "change_pct": round((close - prev) / prev * 100, 2) if prev > 0 else 0,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": True,
                "source":     "twse_mis",
            }
        except (ValueError, ZeroDivisionError):
            continue
    return None


# ── Yahoo Finance fallback ──────────────────────────────────────
def _fetch_yf(code):
    for suffix in (".TW", ".TWO"):
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/"
            f"{urllib.parse.quote(code + suffix)}?interval=1d&range=1d&includePrePost=false"
        )
        data = _http_json(url, headers=YF_HEADERS, timeout=10)
        if not data:
            continue
        try:
            result = data["chart"]["result"][0]
            meta   = result["meta"]
            quote  = result["indicators"]["quote"][0]

            def _last(lst):
                for v in reversed(lst or []):
                    if v is not None and v > 0:
                        return float(v)
                return None

            close = float(meta.get("regularMarketPrice") or 0)
            if close <= 0:
                continue
            prev  = float(meta.get("chartPreviousClose") or meta.get("previousClose") or 0)
            now_tw = datetime.now(TW_TZ)
            return {
                "code":       code,
                "name":       meta.get("shortName", ""),
                "close":      close,
                "open":       _last(quote.get("open")),
                "high":       _last(quote.get("high")),
                "low":        _last(quote.get("low")),
                "volume":     round(int(_last(quote.get("volume")) or 0) / 1000),  # YF 是股，÷1000 轉張
                "prev_close": prev,
                "change_pct": round((close - prev) / prev * 100, 2) if prev > 0 else 0,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": meta.get("marketState", "") in ("REGULAR", "PRE", "POST"),
                "source":     "yahoo",
            }
        except (KeyError, IndexError, TypeError, ValueError):
            continue
    return None


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        qs   = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = (qs.get("code") or [None])[0]
        if not code:
            return self._json(400, {"error": "code required"})
        code = code.strip()

        # 主：TWSE MIS（即時成交，每筆成交更新）
        result = _fetch_mis(code)

        # fallback：TWSE MIS 無資料（非交易時段或 z='-'）才用 Yahoo Finance
        if not result:
            result = _fetch_yf(code)

        if not result:
            return self._json(200, {"error": "no_data", "is_trading": False})

        self._json(200, result)
