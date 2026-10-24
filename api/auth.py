from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# 後台管理員白名單（與前端 VIEWER_EMAILS 一致；之後移到 admin_allowlist 表）
ADMIN_EMAILS = {"swe250165@gmail.com", "qa5518556130@gmail.com", "wenpin0617@gmail.com"}
# 會員等級＝合夥人 member-voucher-levels.sql 定義的 tier（＋free 一般會員）；choice 自選券屬券非常設等級
TIERS = {"free", "observation", "research", "advanced", "vip"}


def _verify_admin(token):
    """用呼叫者 JWT 取 email，∈白名單才回 email，否則 None。後台每個操作的真正防線。"""
    if not token:
        return None
    try:
        req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/user",
                                     headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=10) as r:
            u = json.loads(r.read())
        em = (u.get("email") or "").strip().lower()
        return em if em in ADMIN_EMAILS else None
    except Exception:
        return None


def _admin_api(path, method="GET", body=None):
    """用 service_role 打 Supabase Auth admin API（繞 RLS，只在後端）。回 (status, data)。缺金鑰回 (None, err)。"""
    if not SUPABASE_SERVICE_KEY:
        return None, {"error": "SUPABASE_SERVICE_KEY 未設定（請在 Vercel 專案環境變數新增）", "code": "NO_SERVICE_KEY"}
    url = f"{SUPABASE_URL}/auth/v1{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {"error": "admin api error"}


def _audit(admin_email, action, target, detail):
    """寫一筆後台稽核日誌（admin_audit_log）。失敗靜默，不擋主流程。"""
    if not SUPABASE_SERVICE_KEY:
        return
    try:
        url = f"{SUPABASE_URL}/rest/v1/admin_audit_log"
        row = {"admin_email": admin_email, "action": action, "target_user": target, "detail": detail}
        req = urllib.request.Request(url, data=json.dumps(row).encode(), method="POST", headers={
            "apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json", "Prefer": "return=minimal"})
        urllib.request.urlopen(req, timeout=8).read()
    except Exception:
        pass

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

        # ── 後台管理（action: admin_*）：JWT→email∈白名單 才放行；service_role 只在後端 ──
        if action.startswith("admin_"):
            token = (self.headers.get("Authorization") or "").replace("Bearer ", "").strip()
            admin_email = _verify_admin(token)
            if not admin_email:
                return self._json(403, {"error": "forbidden: 僅限管理員"})

            if action == "admin_members":
                st, data = _admin_api("/admin/users?per_page=200")
                if st is None:
                    return self._json(500, data)
                users = data.get("users", []) if isinstance(data, dict) else []
                out = []
                for u in users:
                    md = u.get("user_metadata") or {}
                    out.append({
                        "id": u.get("id"), "email": u.get("email"),
                        "tier": md.get("tier", "free"), "expires_at": md.get("expires_at"),
                        "banned": bool(md.get("banned")),
                        "created_at": u.get("created_at"), "last_sign_in_at": u.get("last_sign_in_at"),
                        "provider": (u.get("app_metadata") or {}).get("provider"),
                        "confirmed": bool(u.get("email_confirmed_at") or u.get("phone_confirmed_at")),
                        "is_admin": (u.get("email") or "").strip().lower() in ADMIN_EMAILS,
                    })
                out.sort(key=lambda x: x.get("created_at") or "")
                return self._json(200, {"members": out, "admins": sorted(ADMIN_EMAILS)})

            if action in ("admin_set_tier", "admin_set_expiry", "admin_ban"):
                uid = str(body.get("user_id", "")).strip()
                if not uid:
                    return self._json(400, {"error": "user_id required"})
                st, cur = _admin_api(f"/admin/users/{uid}")
                if st is None:
                    return self._json(500, cur)
                md = dict((cur.get("user_metadata") or {})) if st == 200 else {}
                if action == "admin_set_tier":
                    tier = str(body.get("tier", "")).strip()
                    if tier not in TIERS:
                        return self._json(400, {"error": "invalid tier"})
                    md["tier"] = tier; detail = {"tier": tier}
                elif action == "admin_set_expiry":
                    md["expires_at"] = body.get("expires_at") or None; detail = {"expires_at": md["expires_at"]}
                else:  # admin_ban
                    md["banned"] = bool(body.get("banned")); detail = {"banned": md["banned"]}
                st2, res = _admin_api(f"/admin/users/{uid}", method="PUT", body={"user_metadata": md})
                if st2 == 200:
                    _audit(admin_email, action, uid, detail)
                    return self._json(200, {"ok": True, **detail})
                return self._json(500, {"error": "update failed", "detail": res})

            if action == "admin_audit":
                if not SUPABASE_SERVICE_KEY:
                    return self._json(200, {"log": [], "note": "SUPABASE_SERVICE_KEY 未設定"})
                try:
                    url = f"{SUPABASE_URL}/rest/v1/admin_audit_log?select=*&order=ts.desc&limit=100"
                    req = urllib.request.Request(url, headers={"apikey": SUPABASE_SERVICE_KEY,
                                                               "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
                    with urllib.request.urlopen(req, timeout=10) as r:
                        return self._json(200, {"log": json.loads(r.read() or b"[]")})
                except Exception as e:
                    return self._json(200, {"log": [], "error": str(e)})

            return self._json(400, {"error": "unknown admin action"})

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
