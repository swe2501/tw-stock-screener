from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta


YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


def fetch_chart(code, range_str="3mo"):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW"
           f"?interval=1d&range={range_str}")
    req = urllib.request.Request(url, headers=YF_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())

    result = d.get("chart", {}).get("result") or []
    if not result:
        return None

    r0 = result[0]
    meta = r0.get("meta", {})
    timestamps = r0.get("timestamp") or []
    q = (r0.get("indicators", {}).get("quote") or [{}])[0]
    opens   = q.get("open")   or []
    highs   = q.get("high")   or []
    lows    = q.get("low")    or []
    closes  = q.get("close")  or []
    volumes = q.get("volume") or []

    candles = []
    for i, ts in enumerate(timestamps):
        dt = datetime.fromtimestamp(ts, tz=timezone(timedelta(hours=8)))
        o = opens[i]  if i < len(opens)   else None
        h = highs[i]  if i < len(highs)   else None
        l = lows[i]   if i < len(lows)    else None
        c = closes[i] if i < len(closes)  else None
        v = volumes[i] if i < len(volumes) else None
        if None in (o, h, l, c):
            continue
        candles.append({
            "time":   dt.strftime("%Y-%m-%d"),
            "open":   round(float(o), 2),
            "high":   round(float(h), 2),
            "low":    round(float(l), 2),
            "close":  round(float(c), 2),
            "volume": int(v) if v else 0,
        })

    return {
        "code": code,
        "name": meta.get("longName") or meta.get("shortName") or code,
        "currency": meta.get("currency", "TWD"),
        "data": candles,
    }


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        code = (params.get("code") or [""])[0].strip()
        range_str = (params.get("range") or ["3mo"])[0].strip()

        if not code:
            self._json(400, {"error": "missing code parameter"})
            return

        try:
            result = fetch_chart(code, range_str)
            if not result:
                self._json(404, {"error": f"no data for {code}"})
                return
            self._json(200, result)
        except Exception as e:
            self._json(500, {"error": str(e)})
