from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timezone, timedelta

TW_TZ = timezone(timedelta(hours=8))

MIS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://mis.twse.com.tw/stock/index.jsp",
    "Accept": "application/json, text/plain, */*",
}


def _fetch_realtime(code):
    ts = int(datetime.now(TW_TZ).timestamp() * 1000)
    ex_ch = f"tse_{code}.tw|otc_{code}.tw"
    url = f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={urllib.parse.quote(ex_ch)}&_={ts}"
    req = urllib.request.Request(url, headers=MIS_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return None, str(e)

    if not data or "msgArray" not in data:
        return None, "no data"

    for item in data["msgArray"]:
        z = str(item.get("z", "-")).strip()
        if z in ("-", "", "0"):
            continue
        try:
            close  = float(z)
            o_val  = str(item.get("o", "-")).strip()
            h_val  = str(item.get("h", "-")).strip()
            l_val  = str(item.get("l", "-")).strip()
            y_val  = str(item.get("y", "0")).strip()
            v_val  = str(item.get("v", "0")).strip()
            open_  = float(o_val) if o_val not in ("-", "") else close
            high   = float(h_val) if h_val not in ("-", "") else close
            low    = float(l_val) if l_val not in ("-", "") else close
            prev   = float(y_val) if y_val not in ("-", "") else 0
            volume = int(float(v_val) * 1000) if v_val not in ("-", "") else 0
            chg_pct = round((close - prev) / prev * 100, 2) if prev > 0 else 0
            now_tw  = datetime.now(TW_TZ)
            return {
                "code":       str(item.get("c", code)).strip(),
                "name":       str(item.get("n", "")).strip(),
                "open":       open_,
                "high":       high,
                "low":        low,
                "close":      close,
                "volume":     volume,
                "change_pct": chg_pct,
                "prev_close": prev,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": True,
            }, None
        except (ValueError, ZeroDivisionError):
            continue

    # 市場已收盤或未開盤：回傳昨收資料標記 is_trading=False
    for item in data["msgArray"]:
        y_val = str(item.get("y", "-")).strip()
        if y_val in ("-", ""):
            continue
        try:
            prev = float(y_val)
            now_tw = datetime.now(TW_TZ)
            return {
                "code":       str(item.get("c", code)).strip(),
                "name":       str(item.get("n", "")).strip(),
                "close":      prev,
                "change_pct": 0,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": False,
            }, None
        except ValueError:
            continue

    return None, "market closed or no price"


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
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = (qs.get("code") or [None])[0]
        if not code:
            return self._json(400, {"error": "code required"})
        data, err = _fetch_realtime(code.strip())
        if data:
            self._json(200, data)
        else:
            self._json(200, {"error": err, "is_trading": False})
