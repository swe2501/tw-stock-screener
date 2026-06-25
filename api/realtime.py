from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timezone, timedelta

TW_TZ = timezone(timedelta(hours=8))

MIS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://mis.twse.com.tw/stock/index.jsp",
    "Accept": "application/json, text/plain, */*",
}


def _http_json(url, headers=None, timeout=12):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        return json.loads(raw) if raw and raw.strip() else None
    except Exception:
        return None


def _parse_num(item, key):
    """Parse a MIS field: return float if > 0, else None."""
    v = str(item.get(key, "-")).strip()
    if v in ("-", "", "0"):
        return None
    try:
        f = float(v)
        return f if f > 0 else None
    except (ValueError, TypeError):
        return None


def _fetch_mis(code):
    ts  = int(datetime.now(TW_TZ).timestamp() * 1000)
    # 同時查上市(tse)和上櫃(otc)，TWSE MIS 兩個都支援
    url = (
        "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
        f"?ex_ch=tse_{code}.tw%7Cotc_{code}.tw&_={ts}"
    )
    data = _http_json(url, headers=MIS_HEADERS)
    if not data or "msgArray" not in data:
        return None, "mis_no_data"

    for item in data["msgArray"]:
        z_str = str(item.get("z", "-")).strip()
        if z_str in ("-", "", "0"):
            continue
        try:
            close = float(z_str)
            if close <= 0:
                continue

            open_  = _parse_num(item, "o")   # 開盤價（可能 None）
            high   = _parse_num(item, "h")   # 今日最高（可能 None）
            low    = _parse_num(item, "l")   # 今日最低（可能 None）
            prev   = _parse_num(item, "y") or 0.0

            v_str  = str(item.get("v", "0")).strip()
            try:
                volume = int(float(v_str) * 1000) if v_str not in ("-", "") else 0
            except (ValueError, TypeError):
                volume = 0

            chg_pct = round((close - prev) / prev * 100, 2) if prev > 0 else 0
            now_tw  = datetime.now(TW_TZ)

            return {
                "code":       str(item.get("c", code)).strip(),
                "name":       str(item.get("n", "")).strip(),
                "close":      close,
                "open":       open_,    # None 表示 MIS 沒給，前端自補
                "high":       high,     # None 表示 MIS 沒給，前端自補
                "low":        low,      # None 表示 MIS 沒給，前端自補
                "volume":     volume,
                "prev_close": prev,
                "change_pct": chg_pct,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": True,
                "source":     "twse_mis",
            }, None
        except (ValueError, ZeroDivisionError):
            continue

    return None, "mis_no_price"


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
        data, err = _fetch_mis(code.strip())
        if data:
            self._json(200, data)
        else:
            self._json(200, {"error": err, "is_trading": False})
