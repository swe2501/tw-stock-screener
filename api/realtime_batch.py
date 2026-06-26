from http.server import BaseHTTPRequestHandler
import json, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

TW_TZ = timezone(timedelta(hours=8))
YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}
_yf_hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
_host_idx = 0


def _fetch_one(code):
    global _host_idx
    host = _yf_hosts[_host_idx % 2]
    _host_idx += 1
    for suffix in (".TW", ".TWO"):
        url = (f"https://{host}/v8/finance/chart/"
               f"{urllib.parse.quote(code + suffix)}?interval=1d&range=1d&includePrePost=false")
        try:
            req = urllib.request.Request(url, headers=YF_HEADERS)
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
            r0   = (data.get("chart", {}).get("result") or [None])[0]
            if not r0:
                continue
            meta = r0.get("meta", {})
            close = float(meta.get("regularMarketPrice") or 0)
            if close <= 0:
                continue
            prev  = float(meta.get("chartPreviousClose") or meta.get("previousClose") or 0)
            q     = (r0.get("indicators", {}).get("quote") or [{}])[0]

            def _last(lst):
                for v in reversed(lst or []):
                    if v is not None and float(v) > 0:
                        return float(v)
                return None

            now_tw = datetime.now(TW_TZ)
            return code, {
                "close":      close,
                "open":       _last(q.get("open")),
                "high":       _last(q.get("high")),
                "low":        _last(q.get("low")),
                "volume":     round(int(_last(q.get("volume")) or 0) / 1000),
                "prev_close": prev,
                "change_pct": round((close - prev) / prev * 100, 2) if prev > 0 else 0,
                "time":       now_tw.strftime("%Y-%m-%d"),
                "hms":        now_tw.strftime("%H:%M:%S"),
                "is_trading": meta.get("marketState", "") in ("REGULAR", "PRE", "POST"),
                "source":     "yahoo",
            }
        except Exception:
            continue
    return code, None


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
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
        qs    = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        codes_str = (qs.get("codes") or [""])[0].strip()
        if not codes_str:
            return self._json(400, {"error": "codes required"})
        codes = [c.strip() for c in codes_str.split(",") if c.strip()]
        if not codes:
            return self._json(400, {"error": "codes required"})
        codes = codes[:50]  # 安全上限

        results = {}
        workers = min(len(codes), 20)
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(_fetch_one, c): c for c in codes}
            for f in as_completed(futs):
                code, data = f.result()
                if data:
                    results[code] = data

        self._json(200, {"results": results})
