from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.parse

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

def _sb(path, body, token=None):
    url = f"{SUPABASE_URL}/auth/v1{path}"
    data = json.dumps(body).encode()
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        action = body.get("action", "")

        # Token refresh — 不需要 email/password
        if action == "refresh":
            rt = body.get("refresh_token", "")
            if not rt:
                return self._json(400, {"error": "refresh_token required"})
            status, data = _sb("/token?grant_type=refresh_token", {"refresh_token": rt})
            if status == 200 and data.get("access_token"):
                return self._json(200, {
                    "access_token":  data["access_token"],
                    "refresh_token": data.get("refresh_token", rt),
                    "user": {"id": data["user"]["id"], "email": data["user"]["email"]},
                })
            return self._json(401, {"error": "session expired, please login again"})

        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        if not email or not password:
            return self._json(400, {"error": "email and password required"})

        if action == "register":
            status, data = _sb("/signup", {"email": email, "password": password})
            if status in (200, 201) and data.get("access_token"):
                return self._json(200, {
                    "access_token":  data["access_token"],
                    "refresh_token": data.get("refresh_token", ""),
                    "user": {"id": data["user"]["id"], "email": data["user"]["email"]},
                })
            err = (data.get("msg") or data.get("error_description") or data.get("error") or "registration failed")
            return self._json(400, {"error": err})

        elif action == "login":
            status, data = _sb("/token?grant_type=password", {"email": email, "password": password})
            if status == 200 and data.get("access_token"):
                return self._json(200, {
                    "access_token":  data["access_token"],
                    "refresh_token": data.get("refresh_token", ""),
                    "user": {"id": data["user"]["id"], "email": data["user"]["email"]},
                })
            err = (data.get("error_description") or data.get("msg") or "invalid email or password")
            return self._json(401, {"error": err})

        elif action == "logout":
            token = (self.headers.get("Authorization") or "").replace("Bearer ", "")
            if token:
                _sb("/logout", {}, token=token)
            return self._json(200, {"ok": True})

        else:
            return self._json(400, {"error": "unknown action"})
