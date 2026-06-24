from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, urllib.parse, traceback
from datetime import datetime, timezone, timedelta

SUPABASE_URL        = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY   = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
RESEND_API_KEY      = os.environ.get("RESEND_API_KEY", "")
ALERT_EMAIL         = os.environ.get("ALERT_EMAIL", "swe250165@gmail.com")
CRON_SECRET         = os.environ.get("CRON_SECRET", "")

TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw",
}

TW_TZ = timezone(timedelta(hours=8))


# ── TWSE data ─────────────────────────────────────────────────

def _http_json(url, headers=None, data=None, method="GET"):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read()
        if not raw or not raw.strip():
            return None
        return json.loads(raw)
    except Exception:
        return None


def _parse_openapi(rows):
    stocks = {}
    for r in rows:
        try:
            code = str(r.get("Code", r.get("股票代號", ""))).strip()
            name = str(r.get("Name", r.get("股票名稱", ""))).strip()
            o  = float(str(r.get("OpeningPrice", r.get("開盤價", 0))).replace(",", "") or 0)
            h  = float(str(r.get("HighestPrice", r.get("最高價", 0))).replace(",", "") or 0)
            l  = float(str(r.get("LowestPrice",  r.get("最低價",  0))).replace(",", "") or 0)
            c  = float(str(r.get("ClosingPrice", r.get("收盤價", 0))).replace(",", "") or 0)
            pc = float(str(r.get("Change", r.get("漲跌價差", 0))).replace(",","").replace("+","") or 0)
            vol = float(str(r.get("TradeVolume", r.get("成交股數", 0))).replace(",", "") or 0)
            if c <= 0 or o <= 0:
                continue
            prev = round(c - pc, 2)
            if prev <= 0:
                continue
            stocks[code] = {
                "code": code, "name": name,
                "open": o, "high": h, "low": l, "close": c,
                "change_pct": round(pc / prev * 100, 2),
                "candle_pct": round((c - o) / prev * 100, 2),
                "volume_lots": int(vol) // 1000,
            }
        except Exception:
            continue
    return stocks


def _parse_legacy(data):
    stocks = {}
    fields = data.get("fields", [])
    for row in data.get("data", []):
        try:
            d   = dict(zip(fields, row))
            code = str(d.get("證券代號", "")).strip()
            name = str(d.get("證券名稱", "")).strip()
            o  = float(str(d.get("開盤價", 0)).replace(",", "") or 0)
            h  = float(str(d.get("最高價", 0)).replace(",", "") or 0)
            l  = float(str(d.get("最低價", 0)).replace(",", "") or 0)
            c  = float(str(d.get("收盤價", 0)).replace(",", "") or 0)
            pc_raw = str(d.get("漲跌(+/-)", d.get("漲跌幅", "0"))).replace(",","").replace("+","")
            pc  = float(pc_raw or 0)
            vol = float(str(d.get("成交股數", 0)).replace(",", "") or 0)
            if c <= 0 or o <= 0:
                continue
            prev = round(c - pc, 2)
            if prev <= 0:
                continue
            stocks[code] = {
                "code": code, "name": name,
                "open": o, "high": h, "low": l, "close": c,
                "change_pct": round(pc / prev * 100, 2),
                "candle_pct": round((c - o) / prev * 100, 2),
                "volume_lots": int(vol) // 1000,
            }
        except Exception:
            continue
    return stocks


def _fetch_all_stocks():
    rows = _http_json(
        "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
        headers=TWSE_HEADERS,
    )
    if isinstance(rows, list) and rows:
        return _parse_openapi(rows)
    data = _http_json(
        "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json",
        headers=TWSE_HEADERS,
    )
    if isinstance(data, dict) and data.get("data"):
        return _parse_legacy(data)
    return {}


# ── Supabase ───────────────────────────────────────────────────

def _sb_get_watchlist(token):
    url = f"{SUPABASE_URL}/rest/v1/watchlist?select=code,name,note&order=added_at.desc"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        return data if isinstance(data, list) else []
    except Exception:
        return []


# ── Email via Resend ───────────────────────────────────────────

def _limit_badge(chg_pct):
    if chg_pct >= 9.5:
        return '<span style="background:#e74c3c;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px">漲停</span>'
    if chg_pct <= -9.5:
        return '<span style="background:#26c281;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px">跌停</span>'
    return ""


def _send_alert_email(matches, date_str, to_email):
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"

    rows_html = ""
    for m in matches:
        chg = m["change_pct"]
        can = m["candle_pct"]
        chg_color = "#e74c3c" if chg >= 0 else "#26c281"
        can_color  = "#e74c3c" if can >= 0 else "#26c281"
        note_html  = f'<span style="color:#aaa;font-size:12px">{m.get("note","")}</span>' if m.get("note") else ""
        rows_html += f"""
        <tr style="border-bottom:1px solid #2a2a4a">
          <td style="padding:10px 14px;font-weight:700;color:#f1c40f">{m['code']}</td>
          <td style="padding:10px 14px">{m['name']}{_limit_badge(chg)}</td>
          <td style="padding:10px 14px;text-align:right;font-weight:600">{m['close']}</td>
          <td style="padding:10px 14px;text-align:right;color:{chg_color};font-weight:600">{'+' if chg>=0 else ''}{chg}%</td>
          <td style="padding:10px 14px;text-align:right;color:{can_color};font-weight:600">{'+' if can>=0 else ''}{can}%</td>
          <td style="padding:10px 14px;text-align:right;color:#aaa">{m['volume_lots']:,}</td>
          <td style="padding:10px 14px">{note_html}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#111;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto">
    <div style="background:#1a1a2e;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.5)">
      <div style="background:linear-gradient(135deg,#1a1a3e,#2a1a4e);padding:20px 24px;border-bottom:1px solid #2a2a4a">
        <h2 style="margin:0;color:#f1c40f;font-size:20px">⭐ 觀察清單警示</h2>
        <p style="margin:4px 0 0;color:#aaa;font-size:14px">{date_str} &nbsp;·&nbsp; {len(matches)} 檔符合篩選條件</p>
      </div>
      <div style="padding:0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#12122a;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.5px">
              <th style="padding:8px 14px;text-align:left">代號</th>
              <th style="padding:8px 14px;text-align:left">名稱</th>
              <th style="padding:8px 14px;text-align:right">收盤</th>
              <th style="padding:8px 14px;text-align:right">漲跌幅</th>
              <th style="padding:8px 14px;text-align:right">紅棒幅</th>
              <th style="padding:8px 14px;text-align:right">量(張)</th>
              <th style="padding:8px 14px;text-align:left">備註</th>
            </tr>
          </thead>
          <tbody style="color:#ddd">{rows_html}</tbody>
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
        "subject": f"⭐【台股警示】{date_str} 觀察清單有 {len(matches)} 檔符合條件",
        "html": html,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        return True, result.get("id", "sent")
    except urllib.error.HTTPError as e:
        return False, e.read().decode("utf-8", errors="replace")
    except Exception as ex:
        return False, str(ex)


# ── Core logic ─────────────────────────────────────────────────

def _run_alert(token, min_candle_pct, to_email):
    date_str = datetime.now(TW_TZ).strftime("%Y/%m/%d")

    watchlist = _sb_get_watchlist(token)
    if not watchlist:
        return {"ok": True, "sent": False, "message": "觀察清單是空的", "date": date_str}

    watch_map = {w["code"]: w for w in watchlist}
    all_stocks = _fetch_all_stocks()

    if not all_stocks:
        return {"ok": False, "sent": False, "message": "無法取得今日股價資料", "date": date_str}

    matches = []
    for code, info in watch_map.items():
        s = all_stocks.get(code)
        if s and s["close"] > s["open"] and s["candle_pct"] >= min_candle_pct:
            matches.append({**s, "note": info.get("note", "")})

    matches.sort(key=lambda x: x["candle_pct"], reverse=True)

    if not matches:
        return {
            "ok": True, "sent": False,
            "message": f"今日觀察清單 {len(watch_map)} 檔皆未符合條件（紅棒≥{min_candle_pct}%）",
            "checked": len(watch_map), "date": date_str,
        }

    sent, result = _send_alert_email(matches, date_str, to_email)
    return {
        "ok": sent, "sent": sent,
        "matches": len(matches),
        "stocks": [m["code"] for m in matches],
        "email": to_email,
        "result": result,
        "date": date_str,
    }


# ── HTTP handler ───────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-cron-secret")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

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

    def _handle(self):
        # Auth: accept user JWT or CRON_SECRET
        auth_header = self.headers.get("Authorization", "").strip()
        cron_header  = self.headers.get("x-vercel-cron", "")
        cron_secret_hdr = self.headers.get("x-cron-secret", "")

        is_cron = bool(cron_header) or (CRON_SECRET and cron_secret_hdr == CRON_SECRET)

        if is_cron:
            # Cron uses service key to bypass RLS
            token = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
        elif auth_header.startswith("Bearer "):
            token = auth_header[7:]
        else:
            return self._json(401, {"error": "Unauthorized"})

        # Parse body params
        body = {}
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length:
                body = json.loads(self.rfile.read(length))
        except Exception:
            pass

        min_candle_pct = float(body.get("min_candle_pct", os.environ.get("ALERT_MIN_CANDLE_PCT", "2.0")))
        to_email = body.get("email", ALERT_EMAIL)

        try:
            result = _run_alert(token, min_candle_pct, to_email)
            self._json(200, result)
        except Exception:
            self._json(500, {"error": traceback.format_exc()})

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()
