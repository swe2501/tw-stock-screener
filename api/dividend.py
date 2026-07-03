from http.server import BaseHTTPRequestHandler
import json, ssl, time, urllib.parse, urllib.request

# TWSE 除權除息預告表（TWT48U_ALL），約 84KB，全市場一次抓
TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL"

# TWSE 憑證缺 Subject Key Identifier，部分環境驗證會失敗，跳過驗證
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# 模組層快取（warm instance 之間共用），除權息公告一天更新一次，快取 6 小時
_cache = {"ts": 0.0, "by_code": {}}
CACHE_TTL = 6 * 3600


def _roc_to_iso(roc: str) -> str | None:
    """1150716 -> 2026-07-16"""
    roc = (roc or "").strip()
    if not roc.isdigit() or len(roc) != 7:
        return None
    return f"{int(roc[:3]) + 1911}-{roc[3:5]}-{roc[5:]}"


def _num(s):
    try:
        v = float(str(s).replace(",", ""))
        return v if v else None
    except (ValueError, TypeError):
        return None


def _load_events() -> dict:
    """回傳 {code: [event, ...]}，事件依除權息日期排序。"""
    now = time.time()
    if _cache["by_code"] and now - _cache["ts"] < CACHE_TTL:
        return _cache["by_code"]

    req = urllib.request.Request(
        TWSE_URL,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, context=_SSL_CTX, timeout=20) as r:
        data = json.loads(r.read())

    by_code: dict[str, list] = {}
    for row in data:
        code = str(row.get("Code", "")).strip()
        ex_date = _roc_to_iso(row.get("Date", ""))
        if not code or not ex_date:
            continue
        by_code.setdefault(code, []).append({
            "ex_date":       ex_date,
            "kind":          (row.get("Exdividend") or "").strip(),  # 息 / 權 / 權息
            "cash_dividend": _num(row.get("CashDividend")),
            "stock_ratio":   _num(row.get("StockDividendRatio")),
        })
    for events in by_code.values():
        events.sort(key=lambda e: e["ex_date"])

    _cache["ts"] = now
    _cache["by_code"] = by_code
    return by_code


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type",  "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        qs   = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = (qs.get("code") or [""])[0].strip()
        if not code:
            return self._json(400, {"error": "code required"})
        try:
            events = _load_events().get(code, [])
        except Exception as e:
            return self._json(502, {"error": f"TWSE fetch failed: {e}"})
        self._json(200, {"code": code, "events": events})
