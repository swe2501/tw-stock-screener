"""本人自選清單；以 Auth 已驗證的 JWT 身分加上明確 owner 條件。"""
from http.server import BaseHTTPRequestHandler
from functools import wraps
import json, logging, os, traceback, urllib.request, urllib.error, urllib.parse
from uuid import UUID

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
_LOG = logging.getLogger(__name__)


def _log_error(endpoint, operation, error):
    # 不記錄例外文字、URL、headers、body、locals 或會員身分。
    frames = [(os.path.basename(f.filename), f.name, f.lineno)
              for f in traceback.extract_tb(error.__traceback__)]
    _LOG.error("watchlist_error endpoint=%s operation=%s kind=%s frames=%s",
               endpoint, operation, type(error).__name__, frames)


def _safe_request(fn):
    @wraps(fn)
    def wrapped(self):
        try:
            return fn(self)
        except Exception as error:
            _log_error(self.ENDPOINT, fn.__name__, error)
            return self._json(500, {"error": "internal_error"})
    return wrapped


def _verified_user_id(token):
    """只信任既有 Auth /user 對 JWT 的驗證結果，不解碼未驗簽 claims。"""
    if not token or len(token) > 8192:
        return 401, None
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return 503, None
    try:
        req = urllib.request.Request(SUPABASE_URL.rstrip("/") + "/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=10) as response:
            user = json.loads(response.read(65536))
        if not isinstance(user, dict) or not isinstance(user.get("id"), str):
            return 401, None
        # UUID 正規化同時防止將上游異常值插入 PostgREST filter。
        try:
            return 200, str(UUID(user["id"]))
        except ValueError:
            return 401, None
    except urllib.error.HTTPError as error:
        _LOG.error("watchlist_auth_error status=%d", error.code)
        return (401 if error.code in (401, 403) else 503), None
    except Exception as error:
        _log_error("watchlist_auth", "verify_user", error)
        return 503, None


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
    except urllib.error.HTTPError as error:
        # 上游錯誤 body 可能帶資料、SQL、路徑；不要解析、回傳或寫 log。
        _LOG.error("watchlist_rest_error status=%d", error.code)
        return error.code, {}


class _OwnerHandler(BaseHTTPRequestHandler):
    ENDPOINT = "watchlist"

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
        auth = self.headers.get("Authorization", "") or ""
        return auth[7:].strip() if auth.startswith("Bearer ") else None

    def _identity(self):
        token = self._token()
        if not token:
            self._json(401, {"error": "unauthorized"})
            return None
        from lib.member_phone import check
        blocked = check(token)
        if blocked:
            self._json(*blocked)
            return None
        status, user_id = _verified_user_id(token)
        if status != 200 or not user_id:
            self._json(status if status != 200 else 401,
                       {"error": "unauthorized" if status in (200, 401, 403) else "internal_error"})
            return None
        return token, user_id

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length < 0:
                raise ValueError()
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError()
            return body
        except (ValueError, UnicodeDecodeError):
            self._json(400, {"error": "invalid_request"})
            return None

    def _backend_result(self, status, data):
        if status >= 400:
            _LOG.error("watchlist_backend_error endpoint=%s status=%d", self.ENDPOINT, status)
            errors = {400: "invalid_request", 401: "unauthorized", 403: "forbidden",
                      404: "not_found", 409: "conflict", 429: "rate_limited"}
            return self._json(status, {"error": errors.get(status, "internal_error")})
        return self._json(status, data)


class handler(_OwnerHandler):
    @_safe_request
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    @_safe_request
    def do_GET(self):
        identity = self._identity()
        if not identity:
            return
        token, user_id = identity
        status, data = _sb("/watchlist", token=token,
            params={"select": "*", "order": "added_at.desc", "user_id": f"eq.{user_id}"})
        self._backend_result(status, data)

    @_safe_request
    def do_POST(self):
        identity = self._identity()
        if not identity:
            return
        token, user_id = identity
        body = self._read_body()
        if body is None:
            return
        body["user_id"] = user_id
        status, data = _sb("/watchlist", method="POST", body=body, token=token)
        self._backend_result(status, data)

    @_safe_request
    def do_PATCH(self):
        identity = self._identity()
        if not identity:
            return
        token, user_id = identity
        body = self._read_body()
        if body is None:
            return
        item_id = body.pop("id", None)
        body.pop("user_id", None)  # owner 不可從客戶端變更。
        if not item_id:
            return self._json(400, {"error": "id required"})
        status, data = _sb("/watchlist", method="PATCH", body=body, token=token,
            params={"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"})
        self._backend_result(status, data)

    @_safe_request
    def do_DELETE(self):
        identity = self._identity()
        if not identity:
            return
        token, user_id = identity
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code = (qs.get("code") or [None])[0]
        if not code:
            return self._json(400, {"error": "code required"})
        status, data = _sb("/watchlist", method="DELETE", token=token,
            params={"code": f"eq.{code}", "user_id": f"eq.{user_id}"})
        if status >= 400:
            return self._backend_result(status, data)
        self._json(200, {"ok": True})
