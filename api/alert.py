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


def _fetch_realtime_prices(codes):
    """TWSE MIS 即時報價，只抓觀察清單的股票（同時試上市/上櫃）。"""
    if not codes:
        return {}
    ex_ch = "|".join(f"tse_{c}.tw|otc_{c}.tw" for c in codes)
    ts = int(datetime.now(TW_TZ).timestamp() * 1000)
    url = f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={ex_ch}&_={ts}"
    data = _http_json(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://mis.twse.com.tw/stock/index.jsp",
        "Accept": "application/json, text/plain, */*",
    })
    if not data or "msgArray" not in data:
        return {}
    stocks = {}
    for item in data["msgArray"]:
        code = str(item.get("c", "")).strip()
        z = str(item.get("z", "-")).strip()   # 最新成交價
        y = str(item.get("y", "0")).strip()   # 昨收
        if not code or z in ("-", ""):
            continue
        try:
            close = float(z)
            prev  = float(y) if y and y not in ("-", "") else 0
            if close <= 0:
                continue
            chg_pct = round((close - prev) / prev * 100, 2) if prev > 0 else 0
            stocks[code] = {
                "code": code,
                "name": str(item.get("n", "")).strip(),
                "close": close,
                "change_pct": chg_pct,
                "realtime": True,
            }
        except (ValueError, ZeroDivisionError):
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
    url = f"{SUPABASE_URL}/rest/v1/watchlist?select=id,code,name,note,target_price,rt_target_price,alert_type,price_streak,streak_date&order=added_at.desc"
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


def _sb_update_streak(token, item_id, price_streak, streak_date):
    url = f"{SUPABASE_URL}/rest/v1/watchlist?id=eq.{item_id}"
    payload = json.dumps({"price_streak": price_streak, "streak_date": streak_date}).encode()
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception:
        pass


# ── Email via Resend ───────────────────────────────────────────

def _limit_badge(chg_pct):
    if chg_pct >= 9.5:
        return '<span style="background:#e74c3c;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px">漲停</span>'
    if chg_pct <= -9.5:
        return '<span style="background:#26c281;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px">跌停</span>'
    return ""


def _send_test_email(to_email, subject):
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"
    date_str = datetime.now(TW_TZ).strftime("%Y/%m/%d %H:%M")
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#111;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#1a1a2e;border-radius:10px;padding:24px;color:#ddd">
    <h2 style="margin:0 0 12px;color:#f1c40f;font-size:18px">📨 測試信件</h2>
    <p style="margin:0 0 8px">這是一封來自台股篩選系統的測試信件。</p>
    <p style="margin:0;color:#aaa;font-size:12px">發送時間：{date_str} (台灣時間)</p>
  </div>
</body></html>"""
    payload = json.dumps({
        "from": "台股警示 <onboarding@resend.dev>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "tw-stock-screener/1.0",
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
            err_json = json.loads(raw)
            msg = err_json.get("message") or err_json.get("name") or raw
        except Exception:
            msg = raw[:300]
        return False, f"HTTP {e.code}: {msg}"
    except Exception as ex:
        return False, str(ex)


def _send_alert_email(matches, date_str, to_email, streak_days=3):
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"

    rows_html = ""
    for m in matches:
        chg = m["change_pct"]
        chg_color  = "#e74c3c" if chg >= 0 else "#26c281"
        note_html  = f'<span style="color:#aaa;font-size:12px">{m.get("note","")}</span>' if m.get("note") else ""
        tp         = m.get("target_price") or 0
        rows_html += f"""
        <tr style="border-bottom:1px solid #2a2a4a">
          <td style="padding:10px 14px;font-weight:700;color:#f1c40f">{m['code']}</td>
          <td style="padding:10px 14px">{m['name']}{_limit_badge(chg)}</td>
          <td style="padding:10px 14px;text-align:right;font-weight:600">{m['close']}</td>
          <td style="padding:10px 14px;text-align:right;color:{chg_color};font-weight:600">{'+' if chg>=0 else ''}{chg}%</td>
          <td style="padding:10px 14px;text-align:right;color:#f1c40f;font-weight:700">{tp:.2f}</td>
          <td style="padding:10px 14px;text-align:right;color:#aaa">{m.get('price_streak',0)} 天</td>
          <td style="padding:10px 14px">{note_html}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#111;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <div style="background:#1a1a2e;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.5)">
      <div style="background:linear-gradient(135deg,#1a1a3e,#2a1a4e);padding:20px 24px;border-bottom:1px solid #2a2a4a">
        <h2 style="margin:0;color:#f1c40f;font-size:20px">🔔 到價警示</h2>
        <p style="margin:4px 0 0;color:#aaa;font-size:14px">{date_str} &nbsp;·&nbsp; {len(matches)} 檔已連續達標 ≥{streak_days} 天</p>
      </div>
      <div style="padding:0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#12122a;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.5px">
              <th style="padding:8px 14px;text-align:left">代號</th>
              <th style="padding:8px 14px;text-align:left">名稱</th>
              <th style="padding:8px 14px;text-align:right">收盤</th>
              <th style="padding:8px 14px;text-align:right">漲跌幅</th>
              <th style="padding:8px 14px;text-align:right">目標價</th>
              <th style="padding:8px 14px;text-align:right">連續天數</th>
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
        "subject": f"🔔【到價警示】{date_str} 有 {len(matches)} 檔達到目標價",
        "html": html,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "tw-stock-screener/1.0",
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
            err_json = json.loads(raw)
            msg = err_json.get("message") or err_json.get("name") or raw
        except Exception:
            msg = raw[:300]
        return False, f"HTTP {e.code}: {msg}"
    except Exception as ex:
        return False, str(ex)


# ── Core logic ─────────────────────────────────────────────────

def _run_alert(token, to_email, streak_days=3):
    today = datetime.now(TW_TZ).strftime("%Y-%m-%d")
    date_str = datetime.now(TW_TZ).strftime("%Y/%m/%d")

    watchlist = _sb_get_watchlist(token)
    if not watchlist:
        return {"ok": True, "sent": False, "message": "觀察清單是空的", "date": date_str}

    # 只處理有目標價且 alert_type = 'close'（收盤警示）的股票
    targets = [w for w in watchlist if w.get("target_price") and w.get("alert_type", "close") == "close"]
    if not targets:
        return {"ok": True, "sent": False, "message": "觀察清單中沒有股票設定目標價", "date": date_str}

    # 優先用即時報價，失敗才 fallback 到日收盤資料
    codes = [w["code"] for w in targets]
    all_stocks = _fetch_realtime_prices(codes)
    source = "realtime"
    if not all_stocks:
        all_stocks = _fetch_all_stocks()
        source = "daily"
    if not all_stocks:
        return {"ok": False, "sent": False, "message": "無法取得今日股價資料", "date": date_str}

    matches = []
    for info in targets:
        code = info["code"]
        s = all_stocks.get(code)
        if not s:
            continue
        tp = float(info["target_price"])
        prev_streak = int(info.get("price_streak") or 0)
        prev_date   = str(info.get("streak_date") or "")

        if s["close"] >= tp:
            # 累積 streak（避免同一天重複計算）
            new_streak = prev_streak + 1 if prev_date != today else prev_streak
        else:
            new_streak = 0

        # 更新 Supabase（只在 streak 有變動時）
        if new_streak != prev_streak or prev_date != today:
            _sb_update_streak(token, info["id"], new_streak, today)

        # 達到門檻才加入通知清單
        if new_streak >= streak_days:
            matches.append({
                **s,
                "note": info.get("note", ""),
                "target_price": tp,
                "price_streak": new_streak,
            })

    matches.sort(key=lambda x: x["price_streak"], reverse=True)

    if not matches:
        return {
            "ok": True, "sent": False,
            "message": f"目前無股票連續達標 {streak_days} 天（有目標價的股票共 {len(targets)} 檔）",
            "checked": len(targets), "date": date_str, "source": source,
        }

    sent, result = _send_alert_email(matches, date_str, to_email, streak_days)
    return {
        "ok": sent, "sent": sent,
        "matches": len(matches),
        "stocks": [m["code"] for m in matches],
        "email": to_email,
        "result": result,
        "date": date_str,
        "source": source,
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

        to_email    = body.get("email", ALERT_EMAIL)
        streak_days = int(body.get("streak_days", os.environ.get("ALERT_STREAK_DAYS", "3")))

        # 測試寄信模式
        if body.get("test"):
            subject = body.get("subject", "台股警示系統 — 測試信件")
            try:
                sent, result = _send_test_email(to_email, subject)
                self._json(200, {"sent": sent, "result": result})
            except Exception:
                self._json(500, {"error": traceback.format_exc()})
            return

        try:
            result = _run_alert(token, to_email, streak_days)
            self._json(200, result)
        except Exception:
            self._json(500, {"error": traceback.format_exc()})

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()
