from http.server import BaseHTTPRequestHandler
import json, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

YF_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _fetch_price(code):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW?interval=1d&range=5d"
    try:
        req = urllib.request.Request(url, headers=YF_HEADERS)
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        r0 = (d.get("chart", {}).get("result") or [None])[0]
        if not r0:
            return code, None
        closes = (r0.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
        for v in reversed(closes):
            if v:
                return code, round(float(v), 2)
        return code, None
    except Exception:
        return code, None


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        codes_str = (qs.get("codes") or [""])[0]
        codes = [c.strip() for c in codes_str.split(",") if c.strip()][:50]
        if not codes:
            return self._json(400, {"error": "codes required"})
        result = {}
        with ThreadPoolExecutor(max_workers=min(len(codes), 20)) as ex:
            for code, price in (f.result() for f in as_completed(
                    ex.submit(_fetch_price, c) for c in codes)):
                if price is not None:
                    result[code] = price
        self._json(200, result)
