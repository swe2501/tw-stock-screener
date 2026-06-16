from http.server import BaseHTTPRequestHandler
import json
import time
import urllib.request
import urllib.parse
import http.cookiejar
import zipfile
import io
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed


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

def _parse_taifex_chunk(content):
    """Parse TAIFEX CSV (TX only) → 台指近全 daily candles.
    Keeps highest-volume row per (date, session) = near-month contract.
    Combines 一般 + 夜盤 into a single candle: 一般 open, merged H/L, 夜盤 close, sum volume."""
    by_session = {}  # (date, session) → near-month row

    def _f(s):
        try:
            return float(s.replace(",", "").replace(" ", ""))
        except Exception:
            return None

    for line in content.split("\n"):
        if not line or not line[0].isdigit():
            continue
        cols = line.split(",")
        if len(cols) < 18:
            continue
        if cols[1].strip() != "TX":
            continue
        session = cols[17].strip()
        if session not in ("一般", "夜盤", "盤後"):
            continue
        if session == "盤後":
            session = "夜盤"
        iso_date = cols[0].strip().replace("/", "-")
        o, h, l, c = _f(cols[3]), _f(cols[4]), _f(cols[5]), _f(cols[6])
        if None in (o, h, l, c) or o == 0:
            continue
        try:
            vol = int(cols[9].replace(",", "").strip() or "0")
        except Exception:
            vol = 0
        key = (iso_date, session)
        existing = by_session.get(key)
        if existing is None or vol > existing["vol"]:
            by_session[key] = {"time": iso_date, "o": o, "h": h, "l": l, "c": c, "vol": vol, "session": session}

    # Merge sessions per date: 一般 open + max H / min L + 夜盤 close (or 一般 if no 夜盤)
    by_date = {}
    for (date, session), r in by_session.items():
        if date not in by_date:
            by_date[date] = {"time": date, "open": None, "high": r["h"], "low": r["l"], "close": None, "volume": 0}
        d = by_date[date]
        d["high"] = max(d["high"], r["h"])
        d["low"]  = min(d["low"],  r["l"])
        d["volume"] += r["vol"]
        if session == "一般":
            if d["open"] is None:
                d["open"] = r["o"]
            if d["close"] is None:
                d["close"] = r["c"]   # fallback if no 夜盤
        elif session == "夜盤":
            d["close"] = r["c"]       # 夜盤 close = final price of the full trading day

    return {date: row for date, row in by_date.items()
            if row["open"] is not None and row["close"] is not None}


_TAIFEX_SESSION = {"cookie": "", "expires": 0.0}


def _taifex_cookie_str():
    """GET TAIFEX session cookie; cache for 5 min within the same warm process."""
    now = time.time()
    if _TAIFEX_SESSION["cookie"] and now < _TAIFEX_SESSION["expires"]:
        return _TAIFEX_SESSION["cookie"]
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [
        ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
        ("Accept", "text/html,application/xhtml+xml,*/*;q=0.9"),
        ("Accept-Language", "zh-TW,zh;q=0.9"),
    ]
    opener.open("https://www.taifex.com.tw/cht/3/dlFutDailyMarketView", timeout=6)
    parts = [f"{c.name}={c.value}" for c in jar]
    cookie_str = "; ".join(parts)
    _TAIFEX_SESSION["cookie"] = cookie_str
    _TAIFEX_SESSION["expires"] = now + 300
    return cookie_str


def _fetch_taifex_chunk(cookie_str, start_dt, end_dt):
    """POST one ≤85-day chunk for TX futures. Returns parsed by_date dict or {}."""
    begin = start_dt.strftime("%Y/%m/%d")
    end   = end_dt.strftime("%Y/%m/%d")
    post_data = urllib.parse.urlencode({
        "down_type": "1", "commodity_id": "TX", "commodity_id2": "",
        "queryStartDate": begin, "queryEndDate": end,
    }).encode()
    req = urllib.request.Request(
        "https://www.taifex.com.tw/cht/3/futDataDown",
        data=post_data,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.taifex.com.tw/cht/3/dlFutDailyMarketView",
            "Origin": "https://www.taifex.com.tw",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie_str,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = r.read()
        content = None
        for enc in ("utf-8-sig", "utf-8", "ms950", "big5"):
            try:
                content = raw.decode(enc)
                break
            except Exception:
                pass
        if not content or "alert" in content[:500]:
            return {}
        return _parse_taifex_chunk(content)
    except Exception:
        return {}


def _parse_tx_from_zip(zip_bytes):
    """Decode TAIFEX annual ZIP and extract TX 一般 rows."""
    if not zip_bytes or len(zip_bytes) < 100:
        return {}
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            if not names:
                return {}
            with zf.open(names[0]) as f:
                raw = f.read()
        for enc in ("ms950", "big5", "utf-8-sig", "utf-8"):
            try:
                return _parse_taifex_chunk(raw.decode(enc))
            except Exception:
                pass
    except Exception:
        pass
    return {}


def _fetch_annual_zip(year):
    """Download TAIFEX annual futures ZIP for given year; return TX by_date dict."""
    post_data = urllib.parse.urlencode({
        "down_type": "2", "his_year": str(year),
    }).encode()
    req = urllib.request.Request(
        "https://www.taifex.com.tw/cht/3/futDataDown",
        data=post_data,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.taifex.com.tw/cht/3/dlFutDailyMarketView",
            "Origin": "https://www.taifex.com.tw",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": _taifex_cookie_str(),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return _parse_tx_from_zip(r.read())
    except Exception:
        return {}


def fetch_tx(range_str="3y"):
    """Real TX 近月期貨 data:
    1. Annual ZIPs (down_type=2) for past complete years — correct TX prices.
       TAIFEX serves ZIPs sequentially (~8-9s each); 3y = ~25s first load.
       Vercel CDN caches the response for 1h so subsequent requests are instant.
    2. ^TWII proxy via Yahoo for current-year data (Jan 1 → today).
       TAIFEX down_type=1 is IP-restricted from Vercel; TWII ≈ TX within 0.5%.
    3. TAIFEX monthly chunk for last 35 days — correct TX prices (overwrites TWII proxy)."""
    days = RANGE_DAYS.get(range_str, 1100)
    tz_offset = timedelta(hours=8)
    now_dt = datetime.now(tz=timezone(tz_offset))
    start_dt = now_dt - timedelta(days=days)
    current_year = now_dt.year
    taifex_cutoff = now_dt - timedelta(days=35)

    by_date = {}

    # 1. Annual ZIPs for past complete years (sequential due to TAIFEX rate-limit)
    for year in range(start_dt.year, current_year):
        by_date.update(_fetch_annual_zip(year))

    # 2. TWII proxy for entire current year (Jan 1 → today); TAIFEX chunk overwrites if available
    gap_start = max(datetime(current_year, 1, 1, tzinfo=now_dt.tzinfo), start_dt)
    twii = fetch_chart("^TWII", range_str, "1d")
    if twii and twii.get("data"):
        gs = gap_start.strftime("%Y-%m-%d")
        for c in twii["data"]:
            if c["time"] >= gs:
                # Scale TWII volume (~7M shares) down to TX futures contract scale (~130K)
                proxy = {**c, "volume": int(c.get("volume", 0) // 54)}
                by_date.setdefault(c["time"], proxy)  # don't overwrite real TX

    # 3. Real TX for last 35 days (overwrites TWII proxy where available)
    try:
        cookie_str = _taifex_cookie_str()
        by_date.update(_fetch_taifex_chunk(cookie_str, taifex_cutoff, now_dt))
    except Exception:
        pass

    if not by_date:
        return None
    candles = sorted(by_date.values(), key=lambda x: x["time"])
    return {"code": "TX=F", "name": "台指期貨 (TX)", "currency": "TWD", "data": candles}


def _yf_symbol(code):
    """Return Yahoo Finance symbol. Indices (^) and futures (=F) are used as-is."""
    if code.startswith("^") or "=" in code:
        return code
    return f"{code}.TW"


def fetch_chart(code, range_str="3mo", interval="1d"):
    # TX=F daily → TAIFEX annual ZIPs + TWII proxy
    if code == "TX=F" and interval == "1d":
        result = fetch_tx(range_str)
        if result:
            return result
        twii = fetch_chart("^TWII", range_str, interval)
        if twii:
            twii["code"] = "TX=F"
            twii["name"] = "台指期（大盤指數近似）"
        return twii
    # TX=F intraday → Yahoo Finance TX=F directly (falls through to YF code below)
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
    opens      = q.get("open")   or []
    highs      = q.get("high")   or []
    lows       = q.get("low")    or []
    closes     = q.get("close")  or []
    volumes    = q.get("volume") or []
    adjcloses  = ((best_result.get("indicators", {}).get("adjclose") or [{}])[0].get("adjclose") or [])

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
        # Apply dividend/split adjustment ratio so chart matches 還原日 view
        ac = adjcloses[i] if i < len(adjcloses) else None
        if ac and c and abs(c) > 1e-9:
            r = ac / c
            o, h, l, c = o * r, h * r, l * r, c * r
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

    def _json(self, code, data, cache="no-store"):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", cache)
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
            # TX=F intraday: Yahoo Finance has no TX=F 5m data → fall back to ^TWII
            if not result and code == "TX=F" and interval != "1d":
                result = fetch_chart("^TWII", range_str, interval)
                if result:
                    result["code"] = "TX=F"
                    result["name"] = "台指期貨走勢（大盤近似）"
            if not result:
                self._json(404, {"error": f"no data for {code}"})
                return
            # TX=F daily: CDN-cache 1h so the slow ZIP first-load is amortised
            if code == "TX=F" and interval == "1d":
                cache = "public, s-maxage=3600, stale-while-revalidate=86400"
            else:
                cache = "no-store"
            self._json(200, result, cache=cache)
        except Exception as e:
            self._json(500, {"error": str(e)})
