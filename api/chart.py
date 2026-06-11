from http.server import BaseHTTPRequestHandler
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta


YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

RANGE_DAYS = {"1mo": 35, "3mo": 95, "6mo": 185, "1y": 370}
YF_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}


def fetch_chart(code, range_str="3mo"):
    days = RANGE_DAYS.get(range_str, 95)
    now = int(time.time())
    period1 = now - days * 86400
    period2 = now + 86400  # tomorrow — ensures today's bar is never cut off

    # Try range= and period1/period2 on both hosts; pick the freshest last candle
    attempts = []
    for host in YF_HOSTS:
        attempts.append(f"https://{host}/v8/finance/chart/{code}.TW?interval=1d&range={range_str}")
        attempts.append(f"https://{host}/v8/finance/chart/{code}.TW?interval=1d&period1={period1}&period2={period2}")

    best_result = None
    best_last_ts = 0
    for url in attempts:
        try:
            req = urllib.request.Request(url, headers=YF_HEADERS)
            with urllib.request.urlopen(req, timeout=10) as r:
                d = json.loads(r.read())
            result = d.get("chart", {}).get("result") or []
            if not result:
                continue
            ts = result[0].get("timestamp") or []
            last_ts = max(ts) if ts else 0
            if last_ts > best_last_ts:
                best_last_ts = last_ts
                best_result = result[0]
            if best_last_ts >= now:  # already at today or later — stop early
                break
        except Exception:
            continue

    if not best_result:
        return None

    meta = best_result.get("meta", {})

    # ── TWSE supplement ────────────────────────────────────────────────────────
    # Yahoo Finance CDN from non-TW servers often lags 1 trading day.
    # Fetch TWSE STOCK_DAY for the current month and append any candles newer
    # than the last Yahoo Finance candle.
    def _twse_recent(code_str):
        now_dt = datetime.now(tz=timezone(timedelta(hours=8)))
        for delta in (0, -1):  # try current month then previous
            m = now_dt.month + delta
            y = now_dt.year
            if m < 1:
                m = 12; y -= 1
            yyyymm01 = f"{y}{m:02d}01"
            url = (f"https://www.twse.com.tw/exchangeReport/STOCK_DAY"
                   f"?response=json&date={yyyymm01}&stockNo={code_str}")
            try:
                req = urllib.request.Request(url, headers=TWSE_HEADERS)
                with urllib.request.urlopen(req, timeout=8) as resp:
                    d = json.loads(resp.read())
                if d.get("stat") != "OK":
                    continue
                rows = d.get("data") or []
                if rows:
                    return rows
            except Exception:
                continue
        return []

    timestamps = best_result.get("timestamp") or []
    q = (best_result.get("indicators", {}).get("quote") or [{}])[0]
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

    # Supplement with TWSE data for any trading days newer than Yahoo Finance
    last_yf = candles[-1]["time"] if candles else "0000-00-00"
    for row in _twse_recent(code):
        try:
            parts = row[0].split("/")  # e.g. "115/06/11"
            twse_date = f"{int(parts[0])+1911}-{parts[1]}-{parts[2]}"
            if twse_date <= last_yf:
                continue
            candles.append({
                "time":   twse_date,
                "open":   round(float(row[3].replace(",", "")), 2),
                "high":   round(float(row[4].replace(",", "")), 2),
                "low":    round(float(row[5].replace(",", "")), 2),
                "close":  round(float(row[6].replace(",", "")), 2),
                "volume": int(row[1].replace(",", "")),
            })
        except Exception:
            continue
    candles.sort(key=lambda x: x["time"])

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
