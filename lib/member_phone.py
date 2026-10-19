"""Verified-phone rollout guard. Never trust client profile or user_metadata."""
import json
import os
import urllib.request
import urllib.error


def required():
    return os.environ.get("MEMBER_REQUIRE_VERIFIED_PHONE", "").lower() in ("1", "true")


def verified(user):
    return isinstance(user, dict) and bool(user.get("id") and user.get("phone") and user.get("phone_confirmed_at"))


def check(token):
    if not required():
        return None
    base, key = os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_ANON_KEY", "")
    if not token or len(token) > 8192:
        return 401, {"error": "請先登入會員", "code": "MEMBER_LOGIN_REQUIRED"}
    if not base or not key:
        return 503, {"error": "會員驗證服務暫不可用", "code": "MEMBER_CHECK_UNAVAILABLE"}
    try:
        req = urllib.request.Request(base.rstrip("/") + "/auth/v1/user", headers={"apikey": key, "Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=6) as response:
            user = json.loads(response.read(65536))
        if not isinstance(user, dict) or not user.get("id"):
            return 401, {"error": "請重新登入會員", "code": "MEMBER_LOGIN_REQUIRED"}
        if not verified(user):
            return 403, {"error": "請先完成手機驗證", "code": "MEMBER_PHONE_REQUIRED"}
    except urllib.error.HTTPError as error:
        return (401 if error.code in (401, 403) else 503), {"error": "會員驗證未完成", "code": "MEMBER_CHECK_UNAVAILABLE"}
    except Exception:
        return 503, {"error": "會員驗證服務暫不可用", "code": "MEMBER_CHECK_UNAVAILABLE"}
    return None
