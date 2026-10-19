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
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        result = json.loads(e.read())
        if "MEMBER_DEVICE_LIMIT" in str(result):
            return 403, {"error": "此帳號已有 2 台裝置登入，請先登出其中一台後再試。", "code": "MEMBER_DEVICE_LIMIT"}
        return e.code, result


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
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
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 <= length <= 32768:
                return self._json(413, {"error": "request too large"})
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict): raise ValueError()
        except (ValueError, TypeError):
            return self._json(400, {"error": "invalid request"})
        action = body.get("action", "")

        if action == "phone_policy":
            from lib.member_phone import required
            return self._json(200, {"required": required(), "version": 1})

        if action == "strategy_assistant":
            from lib.strategy_assistant import respond
            auth = self.headers.get("Authorization", "")
            token = auth[7:].strip() if auth.startswith("Bearer ") else ""
            from lib.member_phone import check
            blocked = check(token)
            if blocked:
                return self._json(*blocked)
            status, data = respond(body, token)
            return self._json(status, data)

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
                    "user": {k: data["user"].get(k) for k in ("id", "email", "phone", "phone_confirmed_at")},
                })
            return self._json(401, {"error": "session expired, please login again"})

        if action == "logout":
            token = (self.headers.get("Authorization") or "").replace("Bearer ", "")
            if token:
                status, data = _sb("/logout?scope=local", {}, token=token)
                if status not in (200, 204, 401):
                    return self._json(503, {"error": "登出尚未完成，請稍後重試；裝置名額尚未釋放。"})
            return self._json(200, {"ok": True})

        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        if not email or not password:
            return self._json(400, {"error": "email and password required"})

        if action == "register":
            confirmation = body.get("password_confirm")
            if not isinstance(password, str) or len(password) < 6:
                return self._json(400, {"error": "密碼至少 6 個字元"})
            if not isinstance(confirmation, str) or confirmation != password:
                return self._json(400, {"error": "兩次輸入的密碼不一致，請重新確認"})
            status, data = _sb("/signup", {"email": email, "password": password})
            if status in (200, 201) and data.get("access_token"):
                return self._json(200, {
                    "access_token":  data["access_token"],
                    "refresh_token": data.get("refresh_token", ""),
                    "user": {k: data["user"].get(k) for k in ("id", "email", "phone", "phone_confirmed_at")},
                })
            err = (data.get("msg") or data.get("error_description") or data.get("error") or "registration failed")
            return self._json(400, {"error": err})

        elif action == "login":
            status, data = _sb("/token?grant_type=password", {"email": email, "password": password})
            if status == 200 and data.get("access_token"):
                return self._json(200, {
                    "access_token":  data["access_token"],
                    "refresh_token": data.get("refresh_token", ""),
                    "user": {k: data["user"].get(k) for k in ("id", "email", "phone", "phone_confirmed_at")},
                })
            err = (data.get("error_description") or data.get("msg") or "invalid email or password")
            return self._json(401, {"error": err})

        else:
            return self._json(400, {"error": "unknown action"})
