from http.server import BaseHTTPRequestHandler
import json
import time
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime, timezone, timedelta

_TAIFEX_SESSION = {"cookie": "", "expires": 0}


def _taifex_cookie_str():
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
    _TAIFEX_SESSION["cookie"] = "; ".join(parts)
    _TAIFEX_SESSION["expires"] = now + 300
    return _TAIFEX_SESSION["cookie"]


def _parse_sessions(content):
    """Parse TAIFEX daily CSV → per-session rows for TX near-month contract.
    Returns list of {date, session, open, high, low, close, volume} sorted by (date, session)."""
    by_key = {}

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
        # Normalise both labels to 夜盤 for display
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
        existing = by_key.get(key)
        if existing is None or vol > existing["vol"]:
            by_key[key] = {
                "date": iso_date, "session": session,
                "o": o, "h": h, "l": l, "c": c, "vol": vol,
            }

    return [
        {"date": r["date"], "session": r["session"],
         "open": r["o"], "high": r["h"], "low": r["l"], "close": r["c"], "volume": r["vol"]}
        for r in sorted(by_key.values(), key=lambda x: (x["date"], x["session"]))
    ]


def fetch_tx_sessions(days=10):
    tz_offset = timedelta(hours=8)
    now_dt = datetime.now(tz=timezone(tz_offset))
    start_dt = now_dt - timedelta(days=min(days, 35))
    begin = start_dt.strftime("%Y/%m/%d")
    end = now_dt.strftime("%Y/%m/%d")

    try:
        cookie_str = _taifex_cookie_str()
    except Exception:
        return []

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
            return []
        return _parse_sessions(content)
    except Exception:
        return []


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _json(self, status, data, cache="no-store"):
        self.send_response(status)
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
        try:
            days = int((params.get("days") or ["10"])[0])
        except Exception:
            days = 10

        if code != "TX=F":
            self._json(400, {"error": "only TX=F supported"})
            return

        try:
            sessions = fetch_tx_sessions(days)
            self._json(200, {"code": code, "data": sessions},
                       cache="public, s-maxage=900, stale-while-revalidate=3600")
        except Exception as e:
            self._json(500, {"error": str(e)})
