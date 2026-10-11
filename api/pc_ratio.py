"""Read TAIFEX's daily official Put/Call open-interest percentage, independent of expiry."""
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
import json
import math
import time
import urllib.request

SOURCE = "https://www.taifex.com.tw/cht/3/pcRatio"
_cache = None
_cache_time = 0


class RatioTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
            self.cell = None


def parse_ratio(html, today):
    parser = RatioTable()
    parser.feed(html)
    candidates = []
    header_seen = False
    for cells in parser.rows:
        if len(cells) == 7 and cells[0] == "日期" and "買賣權未平倉量比率" in cells[-1]:
            header_seen = True
            continue
        if not header_seen or len(cells) != 7:
            continue
        try:
            date = datetime.strptime(cells[0], "%Y/%m/%d").date()
            put_oi, call_oi = (int(cells[i].replace(",", "")) for i in (4, 5))
            ratio = float(cells[6].replace("%", "").replace(",", ""))
        except (ValueError, TypeError):
            continue
        if date > today or put_oi < 0 or call_oi <= 0 or not math.isfinite(ratio):
            continue
        if abs(ratio - put_oi / call_oi * 100) > 0.02:
            continue
        candidates.append({"trade_date": date.isoformat(), "ratio_pct": ratio,
                           "put_oi": put_oi, "call_oi": call_oi, "source": SOURCE})
    if not candidates:
        raise ValueError("TAIFEX has no valid daily open-interest ratio")
    return max(candidates, key=lambda item: item["trade_date"])


def fetch_ratio():
    global _cache, _cache_time
    if _cache is not None and time.time() - _cache_time < 300:
        return _cache
    today = datetime.now(timezone(timedelta(hours=8))).date()
    request = urllib.request.Request(SOURCE,
                                     headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=12) as response:
        html = response.read().decode("utf-8")
    result = parse_ratio(html, today)
    _cache, _cache_time = result, time.time()
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            result, status = fetch_ratio(), 200
        except Exception:
            result, status = {"error": "Official TAIFEX ratio temporarily unavailable"}, 502
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
