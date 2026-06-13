from http.server import BaseHTTPRequestHandler
import json
import time
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime, timezone, timedelta


YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}
TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}

RANGE_DAYS = {"1mo": 35, "3mo": 95, "6mo": 185, "1y": 370, "3y": 1100}
YF_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]

def _parse_taifex_csv(content):
    """Parse TAIFEX CSV; groups by date, keeps highest-volume row (near-month)."""
    by_date = {}
    for line in content.split("\n"):
        cols = [c.strip().strip('"') for c in line.split(",")]
        if len(cols) < 9:
            continue
        date_raw = cols[0].strip()
        if not date_raw or not date_raw[0].isdigit():
            continue
        sep = "/" if "/" in date_raw else ("." if "." in date_raw else None)
        if not sep:
            continue
        dp = date_raw.split(sep)
        if len(dp) != 3:
            continue
        try:
            yr = int(dp[0])
            if yr < 200:
                yr += 1911
            iso_date = f"{yr}-{dp[1].zfill(2)}-{dp[2].zfill(2)}"
        except Exception:
            continue

        def _f(s):
            try:
                return float(s.replace(",", "").replace(" ", ""))
            except Exception:
                return None

        o = _f(cols[3]) if len(cols) > 3 else None
        h = _f(cols[4]) if len(cols) > 4 else None
        l = _f(cols[5]) if len(cols) > 5 else None
        c = _f(cols[6]) if len(cols) > 6 else None
        v = _f(cols[9]) if len(cols) > 9 else None

        if None in (o, h, l, c) or o == 0:
            continue
        vol = int(v) if v else 0
        existing = by_date.get(iso_date)
        if existing is None or vol > existing["volume"]:
            by_date[iso_date] = {
                "time": iso_date, "open": o, "high": h,
                "low": l, "close": c, "volume": vol,
            }
    if not by_date:
        return None
    return sorted(by_date.values(), key=lambda x: x["time"])


def _parse_stooq_csv(content):
    """Parse Stooq CSV (Date,Open,High,Low,Close,Volume)."""
    lines = content.strip().split("\n")
    if len(lines) < 2:
        return None
    candles = []
    for line in lines[1:]:
        cols = line.strip().split(",")
        if len(cols) < 5:
            continue
        try:
            o, h, l, c = float(cols[1]), float(cols[2]), float(cols[3]), float(cols[4])
            if o == 0 or h == 0:
                continue
            v = int(float(cols[5])) if len(cols) > 5 and cols[5].strip() else 0
            candles.append({"time": cols[0], "open": o, "high": h, "low": l, "close": c, "volume": v})
        except Exception:
            continue
    return sorted(candles, key=lambda x: x["time"]) if candles else None


def fetch_tx(range_str="3y"):
    """Fetch TX 台指期 via TAIFEX → Stooq (multi-attempt fallback)."""
    days = RANGE_DAYS.get(range_str, 1100)
    tz_offset = timedelta(hours=8)
    now_dt = datetime.now(tz=timezone(tz_offset))
    start_dt = now_dt - timedelta(days=days)
    d1 = start_dt.strftime("%Y%m%d")
    d2 = now_dt.strftime("%Y%m%d")
    d1s = start_dt.strftime("%Y/%m/%d")
    d2s = now_dt.strftime("%Y/%m/%d")

    base_hdrs = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                 "Accept": "*/*"}

    # ── Strategy 1: TAIFEX (session-cookie + POST download) ───────────────────
    taifex_hdrs = {
        **base_hdrs,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9",
        "Referer": "https://www.taifex.com.tw/cht/3/futDailyMarketReport",
        "Origin": "https://www.taifex.com.tw",
    }
    for commodity_id in ("TX", "TXF"):
        for qtype in ("2", "1"):
            for begin, end in [(d1s, d2s), (d1, d2)]:
                try:
                    # Step 1: grab session cookie from main page
                    jar = http.cookiejar.CookieJar()
                    opener = urllib.request.build_opener(
                        urllib.request.HTTPCookieProcessor(jar))
                    opener.addheaders = list(taifex_hdrs.items())
                    opener.open(
                        "https://www.taifex.com.tw/cht/3/futDailyMarketReport",
                        timeout=4)
                    # Step 2: POST download with session cookie
                    post_data = urllib.parse.urlencode({
                        "queryType": qtype, "marketCode": "0",
                        "commodity_id": commodity_id, "period": "",
                        "beginDate": begin, "endDate": end,
                    }).encode()
                    dl_url = ("https://www.taifex.com.tw/cht/3/"
                              "futDailyMarketReport_download")
                    req = urllib.request.Request(
                        dl_url, data=post_data, headers=taifex_hdrs)
                    with opener.open(req, timeout=7) as r:
                        raw = r.read()
                    content = None
                    for enc in ("utf-8-sig", "utf-8", "big5"):
                        try:
                            content = raw.decode(enc); break
                        except Exception:
                            pass
                    if content:
                        candles = _parse_taifex_csv(content)
                        if candles:
                            return {"code": "TX=F", "name": "台指期貨 (TX)",
                                    "currency": "TWD", "data": candles}
                except Exception:
                    continue

    # ── Strategy 2: Stooq ────────────────────────────────────────────────────
    for sym in ["txf.tw", "tx.tw", "txf"]:
        try:
            url = f"https://stooq.com/q/d/l/?s={sym}&d1={d1}&d2={d2}&i=d"
            req = urllib.request.Request(url, headers=base_hdrs)
            with urllib.request.urlopen(req, timeout=8) as r:
                content = r.read().decode("utf-8")
            candles = _parse_stooq_csv(content)
            if candles:
                return {"code": "TX=F", "name": "台指期貨 (TX)", "currency": "TWD", "data": candles}
        except Exception:
            continue

    return None


def _yf_symbol(code):
    """Return Yahoo Finance symbol. Indices (^) and futures (=F) are used as-is."""
    if code.startswith("^") or "=" in code:
        return code
    return f"{code}.TW"


def fetch_chart(code, range_str="3mo", interval="1d"):
    # TX=F → TAIFEX → Stooq → ^TWII fallback
    if code == "TX=F":
        result = fetch_tx(range_str)
        if result:
            return result
        # Final fallback: Taiwan Weighted Index (prices nearly identical to TX futures)
        twii = fetch_chart("^TWII", range_str, interval)
        if twii:
            twii["code"] = "TX=F"
            twii["name"] = "台指期（大盤指數近似）"
        return twii
    yf_sym = _yf_symbol(code)
    is_daily = interval == "1d"
    is_tw_stock = yf_sym.endswith(".TW")

    if is_daily:
        days = RANGE_DAYS.get(range_str, 95)
        now = int(time.time())
        period1 = now - days * 86400
        period2 = now + 86400
        url_params = f"interval=1d&period1={period1}&period2={period2}"
        url_params_alt = f"interval=1d&range={range_str}"
    else:
        url_params = f"interval={interval}&range={range_str}"
        url_params_alt = None

    encoded_sym = urllib.parse.quote(yf_sym)
    attempts = []
    for host in YF_HOSTS:
        attempts.append(f"https://{host}/v8/finance/chart/{encoded_sym}?{url_params}")
        if url_params_alt:
            attempts.append(f"https://{host}/v8/finance/chart/{encoded_sym}?{url_params_alt}")

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
        except Exception:
            continue

    if not best_result:
        return None

    meta = best_result.get("meta", {})
    timestamps = best_result.get("timestamp") or []
    q = (best_result.get("indicators", {}).get("quote") or [{}])[0]
    opens   = q.get("open")   or []
    highs   = q.get("high")   or []
    lows    = q.get("low")    or []
    closes  = q.get("close")  or []
    volumes = q.get("volume") or []

    tz_offset = timedelta(hours=8)
    candles = []
    for i, ts in enumerate(timestamps):
        o = opens[i]  if i < len(opens)   else None
        h = highs[i]  if i < len(highs)   else None
        l = lows[i]   if i < len(lows)    else None
        c = closes[i] if i < len(closes)  else None
        v = volumes[i] if i < len(volumes) else None
        if None in (o, h, l, c):
            continue
        if is_daily:
            dt = datetime.fromtimestamp(ts, tz=timezone(tz_offset))
            t_val = dt.strftime("%Y-%m-%d")
        else:
            t_val = int(ts)
        candles.append({
            "time":   t_val,
            "open":   round(float(o), 4),
            "high":   round(float(h), 4),
            "low":    round(float(l), 4),
            "close":  round(float(c), 4),
            "volume": int(v) if v else 0,
        })

    # TWSE supplement: only for daily TW stocks (Yahoo Finance CDN may lag)
    if is_daily and is_tw_stock:
        def _twse_latest_candle(code_str):
            now_dt = datetime.now(tz=timezone(tz_offset))
            for delta in (0, -1):
                m = now_dt.month + delta
                y = now_dt.year
                if m < 1:
                    m, y = 12, y - 1
                yyyymm01 = f"{y}{m:02d}01"
                url = (f"https://www.twse.com.tw/exchangeReport/STOCK_DAY"
                       f"?response=json&date={yyyymm01}&stockNo={code_str}")
                try:
                    req = urllib.request.Request(url, headers=TWSE_HEADERS)
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        d = json.loads(resp.read())
                    if d.get("stat") != "OK":
                        continue
                    rows = d.get("data") or []
                    if not rows:
                        continue
                    row = rows[-1]
                    parts = row[0].split("/")
                    twse_date = f"{int(parts[0])+1911}-{parts[1]}-{parts[2]}"
                    return {
                        "time":   twse_date,
                        "open":   round(float(row[3].replace(",", "")), 2),
                        "high":   round(float(row[4].replace(",", "")), 2),
                        "low":    round(float(row[5].replace(",", "")), 2),
                        "close":  round(float(row[6].replace(",", "")), 2),
                        "volume": int(row[1].replace(",", "")),
                    }
                except Exception:
                    continue
            return None

        last_yf = candles[-1]["time"] if candles else "0000-00-00"
        twse_candle = _twse_latest_candle(code)
        if twse_candle and twse_candle["time"] > last_yf:
            candles.append(twse_candle)
            candles.sort(key=lambda x: x["time"])

    return {
        "code": code,
        "name": meta.get("longName") or meta.get("shortName") or code,
        "currency": meta.get("currency", ""),
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
        interval = (params.get("interval") or ["1d"])[0].strip()

        if not code:
            self._json(400, {"error": "missing code parameter"})
            return

        try:
            result = fetch_chart(code, range_str, interval)
            if not result:
                self._json(404, {"error": f"no data for {code}"})
                return
            self._json(200, result)
        except Exception as e:
            self._json(500, {"error": str(e)})
