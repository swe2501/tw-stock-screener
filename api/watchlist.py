from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.parse

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def _sb(path, method="GET", body=None, token=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}" if token else f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer": "return=representation",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else {}


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def _token(self):
        return self.headers.get("Authorization", "").replace("Bearer ", "").strip() or None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        status, data = _sb("/watchlist", token=token,
                           params={"select": "*", "order": "added_at.desc"})
        self._json(status, data)

    def do_POST(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        status, data = _sb("/watchlist", method="POST", body=body, token=token)
        self._json(status, data)

    def do_PATCH(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        item_id = body.pop("id", None)
        if not item_id:
            return self._json(400, {"error": "id required"})
        status, data = _sb("/watchlist", method="PATCH", body=body, token=token,
                           params={"id": f"eq.{item_id}"})
        self._json(status, data)

    def do_DELETE(self):
        token = self._token()
        if not token:
            return self._json(401, {"error": "unauthorized"})
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = (qs.get("code") or [None])[0]
        if not code:
            return self._json(400, {"error": "code required"})
        _sb("/watchlist", method="DELETE", token=token,
            params={"code": f"eq.{code}"})
        self._json(200, {"ok": True})
