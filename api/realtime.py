from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timezone, timedelta

TW_TZ = timezone(timedelta(hours=8))

YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}

MIS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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


def _fetch_yahoo(code):
    """Yahoo Finance: 取今日 OHLCV（上市 .TW / 上櫃 .TWO 都試）"""
    for suffix in (".TW", ".TWO"):
        ticker = code + suffix
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}"
            f"?interval=1d&range=1d&includePrePost=false"
        )
        data = _http_json(url, headers=YF_HEADERS)
        if not data:
            continue
        try:
            result = data["chart"]["result"][0]
            meta   = result["meta"]
            quote  = result["indicators"]["quote"][0]
            # 取最後一個有效值
            o_list = quote.get("open",  [None])
            h_list = quote.get("high",  [None])
            l_list = quote.get("low",   [None])
            c_list = quote.get("close", [None])
            v_list = quote.get("volume",[None])

            def _last(lst):
                for v in reversed(lst):
                    if v is not None:
                        return v
                return None

            o = _last(o_list)
            h = _last(h_list)
            l = _last(l_list)
            c = _last(c_list)
            v = _last(v_list)

            current = meta.get("regularMarketPrice") or c
            prev    = meta.get("chartPreviousClose") or meta.get("previousClose") or 0

            if not current:
                continue

            # 用即時價覆蓋 close（盤中 regularMarketPrice 更即時）
            close = float(current)
            open_ = float(o) if o else close
            high  = max(float(h), close) if h else close
            low   = min(float(l), close) if l else close

            chg_pct = round((close - float(prev)) / float(prev) * 100, 2) if prev else 0
            now_tw  = datetime.now(TW_TZ)

            return {
                "code":       code,
                "name":       meta.get("shortName", meta.get("longName", "")),
                "open":       round(open_, 2),
                "high":       round(high, 2),
                "low":        round(low, 2),
                "close":      round(close, 2),
                "volume":     int(v) if v else 0,
                "change_pct": chg_pct,
                "prev_close": float(prev),
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": meta.get("marketState", "") in ("REGULAR", "PRE", "POST"),
                "source":     "yahoo",
            }, None
        except (KeyError, IndexError, TypeError, ValueError):
            continue
    return None, "yahoo_failed"


def _fetch_mis(code):
    """TWSE MIS 即時行情（fallback）"""
    ts  = int(datetime.now(TW_TZ).timestamp() * 1000)
    url = (
        f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
        f"?ex_ch=tse_{code}.tw%7Cotc_{code}.tw&_={ts}"
    )
    data = _http_json(url, headers=MIS_HEADERS)
    if not data or "msgArray" not in data:
        return None, "mis_no_data"

    for item in data["msgArray"]:
        z = str(item.get("z", "-")).strip()
        if z in ("-", "", "0"):
            continue
        try:
            close = float(z)
            y     = str(item.get("y", "0")).strip()
            prev  = float(y) if y not in ("-", "", "0") else 0
            v     = str(item.get("v", "0")).strip()
            vol   = int(float(v) * 1000) if v not in ("-", "", "0") else 0
            chg_pct = round((close - prev) / prev * 100, 2) if prev > 0 else 0
            now_tw  = datetime.now(TW_TZ)
            return {
                "code":       str(item.get("c", code)).strip(),
                "name":       str(item.get("n", "")).strip(),
                "open":       close,  # MIS 的 o 欄位不可靠，先用 close
                "high":       close,
                "low":        close,
                "close":      close,
                "volume":     vol,
                "change_pct": chg_pct,
                "prev_close": prev,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": True,
                "source":     "mis",
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
        code = code.strip()

        data, err = _fetch_yahoo(code)
        if not data:
            data, err = _fetch_mis(code)
        if data:
            self._json(200, data)
        else:
            self._json(200, {"error": err, "is_trading": False})
