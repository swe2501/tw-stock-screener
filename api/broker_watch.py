"""
/api/broker_watch — 出場追蹤清單（使用者在分點出手明細打勾的股票）。
  GET                     列出自己的追蹤清單（含每日排程算出的累積回吐統計）
  POST  {broker_id,broker_name,code,stock_name}   加入追蹤
  DELETE ?broker_id=&code=                          取消追蹤
授權：使用者 JWT（RLS 依 user_id 隔離）。累積統計由 scripts/sell_tracker.py 每日更新。
"""
from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, urllib.parse

SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def _sb(path, method="GET", body=None, token=None, params=None, prefer="return=representation"):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}" if token else f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer": prefer,
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}
        except Exception:
            return e.code, {}


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _token(self):
        return self.headers.get("Authorization", "").replace("Bearer ", "").strip() or None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        status, data = _sb("/broker_watchlist", token=token, params={
            "select": ("id,broker_id,broker_name,code,stock_name,buy_from_date,"
                       "total_buy_lots,peak_lots,cur_lots,giveback_pct,tier,anchor_sell_ct,"
                       "last_anchor_sell,last_sell_date,updated_at,added_at"),
            "order": "giveback_pct.desc.nullslast,added_at.desc"})
        self._json(status, data)

    def do_POST(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        row = {k: body.get(k) for k in ("broker_id", "broker_name", "code", "stock_name")}
        if not row.get("broker_id") or not row.get("code"):
            return self._json(400, {"error": "broker_id and code required"})
        # upsert：同一分點+股票只留一列（user_id 由 RLS/default auth.uid() 帶入）
        status, data = _sb("/broker_watchlist", method="POST", body=row, token=token,
                           params={"on_conflict": "user_id,broker_id,code"},
                           prefer="return=representation,resolution=merge-duplicates")
        self._json(status, data)

    def do_DELETE(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        broker_id = (qs.get("broker_id") or [None])[0]
        code = (qs.get("code") or [None])[0]
        if not broker_id or not code:
            return self._json(400, {"error": "broker_id and code required"})
        _sb("/broker_watchlist", method="DELETE", token=token, prefer="return=minimal",
            params={"broker_id": f"eq.{broker_id}", "code": f"eq.{code}"})
        self._json(200, {"ok": True})
