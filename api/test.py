from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import math
from datetime import datetime, timezone, timedelta

YF_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_GET(self):
        results = {}
        code = "6270"

        # Try .TW (上市) and .TWO (上櫃)
        for suffix in [".TW", ".TWO"]:
            try:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}{suffix}?interval=1d&range=1mo"
                req = urllib.request.Request(url, headers=YF_HEADERS)
                with urllib.request.urlopen(req, timeout=10) as r:
                    d = json.loads(r.read())
                res = d["chart"]["result"][0]
                meta = res.get("meta", {})
                ts_list = res.get("timestamp") or []
                q = (res.get("indicators", {}).get("quote") or [{}])[0]
                closes = q.get("close") or []
                last3 = []
                for i in range(max(0, len(ts_list)-3), len(ts_list)):
                    dt = datetime.fromtimestamp(ts_list[i], tz=timezone(timedelta(hours=8)))
                    last3.append({"date": dt.strftime("%Y-%m-%d"), "close": closes[i]})
                results[f"yf{suffix}"] = {
                    "ok": True,
                    "exchange": meta.get("exchangeName"),
                    "name": meta.get("longName") or meta.get("shortName"),
                    "last3_rows": last3
                }
            except Exception as e:
                results[f"yf{suffix}"] = {"ok": False, "error": str(e)[:60]}

        # Check GTSM (上櫃) monthly data
        try:
            url2 = "https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=115%2F06&stkno=6270&s=0,asc,0"
            req2 = urllib.request.Request(url2, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
            with urllib.request.urlopen(req2, timeout=10) as r:
                d2 = json.loads(r.read())
            results["tpex_data"] = {"aaData": d2.get("aaData", [])[:5]}
        except Exception as e:
            results["tpex_error"] = str(e)[:80]

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(results, ensure_ascii=False).encode("utf-8"))
