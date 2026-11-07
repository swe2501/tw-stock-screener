from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
TW_TZ = timezone(timedelta(hours=8))


def _send_vol_email(code, name, vol, vol_target, to_email):
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"
    now = datetime.now(TW_TZ).strftime("%Y/%m/%d %H:%M")
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#111;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <div style="background:#1a1a2e;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.5)">
      <div style="background:linear-gradient(135deg,#1a2a1e,#1a3a2e);padding:20px 24px;border-bottom:1px solid #2a3a2a">
        <h2 style="margin:0;color:#2ecc71;font-size:20px">📊 到量警示</h2>
        <p style="margin:4px 0 0;color:#aaa;font-size:14px">{now}</p>
      </div>
      <div style="padding:20px 24px">
        <table style="width:100%;border-collapse:collapse;color:#ddd">
          <tr style="border-bottom:1px solid #2a2a4a">
            <td style="padding:10px 0;color:#888;font-size:13px">代號</td>
            <td style="padding:10px 0;font-weight:700;color:#f1c40f">{code}</td>
          </tr>
          <tr style="border-bottom:1px solid #2a2a4a">
            <td style="padding:10px 0;color:#888;font-size:13px">名稱</td>
            <td style="padding:10px 0">{name}</td>
          </tr>
          <tr style="border-bottom:1px solid #2a2a4a">
            <td style="padding:10px 0;color:#888;font-size:13px">目標量</td>
            <td style="padding:10px 0;color:#2ecc71;font-weight:700">{int(vol_target):,} 張</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888;font-size:13px">目前量</td>
            <td style="padding:10px 0;font-weight:600">{int(vol):,} 張</td>
          </tr>
        </table>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #2a2a4a">
        <p style="margin:0;color:#444;font-size:11px">由台股篩選系統自動發送 · 請勿回覆此信件</p>
      </div>
    </div>
  </div>
</body></html>"""

    payload = json.dumps({
        "from": "台股警示 <onboarding@resend.dev>",
        "to": [to_email],
        "subject": f"📊【到量警示】{code} {name} 成交量已達 {int(vol_target):,} 張",
        "html": html,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        return True, result.get("id", "sent")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            msg = json.loads(raw).get("message") or raw
        except Exception:
            msg = raw[:300]
        return False, f"HTTP {e.code}: {msg}"
    except Exception as ex:
        return False, str(ex)


def _verify_user_email(token):
    """Verify a Supabase JWT via /auth/v1/user.
    Returns (200, email) on success, (401, None) for invalid token / config,
    (403, None) when the user has no confirmed email."""
    base = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not token or len(token) > 8192 or not base or not key:
        return 401, None
    try:
        req = urllib.request.Request(base.rstrip("/") + "/auth/v1/user",
                                     headers={"apikey": key, "Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=10) as r:
            u = json.loads(r.read(65536))
    except Exception:
        return 401, None
    if not isinstance(u, dict) or not u.get("id"):
        return 401, None
    email = str(u.get("email") or "").strip()
    if not email or "@" not in email or not u.get("email_confirmed_at"):
        return 403, None
    return 200, email


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            auth = self.headers.get("Authorization", "") or ""
            token = auth[7:].strip() if auth.startswith("Bearer ") else ""
            if not token:
                return self._json(401, {"error": "unauthorized"})
            status, to_email = _verify_user_email(token)
            if status != 200:
                if status == 403:
                    return self._json(403, {"error": "verified email required"})
                return self._json(401, {"error": "unauthorized"})
            from lib.member_phone import check
            blocked = check(token)
            if blocked:
                return self._json(*blocked)

            length = int(self.headers.get("Content-Length", 0) or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                return self._json(400, {"error": "invalid body"})

            code       = str(body.get("code", "")).strip()
            name       = str(body.get("name", code)).strip()
            vol        = float(body.get("vol", 0))
            vol_target = float(body.get("vol_target", 0))
            # recipient comes only from the verified Supabase user, never from body

            if not (code and vol_target > 0):
                return self._json(400, {"error": "missing required fields"})

            ok, detail = _send_vol_email(code, name, vol, vol_target, to_email)
            self._json(200, {"ok": ok, "detail": detail})
        except Exception:
            try:
                self._json(500, {"error": "internal error"})
            except Exception:
                pass
