"""
/api/sell_alert — 出場追蹤 Email（Vercel cron，每日排程算完後執行）。
讀 broker_sell_alerts 中 notified=false（＝最新交易日的新賣超事件），
併上 broker_watchlist 的累積回吐狀態，寄一封摘要信到 ALERT_EMAIL，寄完標 notified=true。
本機 19:00 排程沒有 Resend key，故 Email 統一在 Vercel 端發。
授權：x-vercel-cron 或 x-cron-secret；一律用 service key（bypass RLS、可更新 notified）。
"""
from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error, urllib.parse, traceback
from datetime import datetime, timezone, timedelta

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY    = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
RESEND_API_KEY       = os.environ.get("RESEND_API_KEY", "")
ALERT_EMAIL          = os.environ.get("ALERT_EMAIL", "swe250165@gmail.com")
CRON_SECRET          = os.environ.get("CRON_SECRET", "")
TW_TZ = timezone(timedelta(hours=8))

TIER_LABEL = {"warn25": ("🟡 減碼", "#e6a23c"), "half50": ("🟠 過半", "#ff9f43"),
              "exit90": ("🔴 出清", "#e74c3c"), "none": ("持有中", "#888")}


def _sb(path, method="GET", body=None, params=None, prefer="return=representation"):
    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "apikey": key,
               "Authorization": f"Bearer {key}", "Prefer": prefer}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}
        except Exception:
            return e.code, {}


def _send_email(html, subject, to_email):
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"
    payload = json.dumps({"from": "台股出場追蹤 <onboarding@resend.dev>", "to": [to_email],
                          "subject": subject, "html": html}).encode("utf-8")
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, method="POST",
                                 headers={"Authorization": f"Bearer {RESEND_API_KEY}",
                                          "Content-Type": "application/json",
                                          "User-Agent": "tw-stock-screener/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return True, json.loads(r.read()).get("id", "sent")
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}"
    except Exception as ex:
        return False, str(ex)


def _compose(groups, date_str):
    """groups: list of (watch_info, [alerts])，watch_info 含 stock_name/giveback/tier。"""
    sections = ""
    for w, evs in groups:
        tlabel, tcolor = TIER_LABEL.get(w.get("tier") or "none", TIER_LABEL["none"])
        gv = w.get("giveback_pct")
        head = (f"{w.get('code')} {w.get('stock_name') or ''}"
                f" — 追蹤分點 {w.get('broker_name') or w.get('broker_id')}")
        meta = (f"回吐 {gv}%（{tlabel}）｜峰值 {w.get('peak_lots')} 張 → 目前 {w.get('cur_lots')} 張"
                if gv is not None else "")
        rows = ""
        for e in sorted(evs, key=lambda x: (not x["is_anchor"], -(x.get("net_sell_lots") or 0))):
            who = "本尊" if e["is_anchor"] else (e.get("sell_broker_name") or e.get("sell_broker_id"))
            wcolor = "#e74c3c" if e["is_anchor"] else "#ddd"
            amt = f"{e['net_sell_amount_wan']:,.0f} 萬" if e.get("net_sell_amount_wan") else "–"
            rows += (f"<tr style='border-bottom:1px solid #2a2a4a'>"
                     f"<td style='padding:6px 10px'>{e['trade_date']}</td>"
                     f"<td style='padding:6px 10px;color:{wcolor};font-weight:600'>{who}</td>"
                     f"<td style='padding:6px 10px;text-align:right'>{e.get('net_sell_lots'):,} 張</td>"
                     f"<td style='padding:6px 10px;text-align:right;color:#aaa'>{amt}</td></tr>")
        sections += (f"<div style='margin:0 0 18px'>"
                     f"<div style='color:#f1c40f;font-weight:700;font-size:15px'>{head}</div>"
                     f"<div style='color:{tcolor};font-size:12px;margin:2px 0 6px'>{meta}</div>"
                     f"<table style='width:100%;border-collapse:collapse;font-size:13px;color:#ddd'>"
                     f"<thead><tr style='color:#666;font-size:11px'>"
                     f"<th style='padding:4px 10px;text-align:left'>日期</th>"
                     f"<th style='padding:4px 10px;text-align:left'>賣超分點</th>"
                     f"<th style='padding:4px 10px;text-align:right'>張數</th>"
                     f"<th style='padding:4px 10px;text-align:right'>金額</th></tr></thead>"
                     f"<tbody>{rows}</tbody></table></div>")
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#111;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;background:#1a1a2e;border-radius:10px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#1a1a3e,#2a1a4e);padding:20px 24px">
      <h2 style="margin:0;color:#f1c40f;font-size:20px">🔻 出場追蹤提醒</h2>
      <p style="margin:4px 0 0;color:#aaa;font-size:14px">{date_str}｜追蹤中的股票今日出現賣超</p>
    </div>
    <div style="padding:20px 24px">{sections}</div>
    <div style="padding:12px 24px;border-top:1px solid #2a2a4a">
      <p style="margin:0;color:#444;font-size:11px">由台股篩選系統自動發送 · 請勿回覆</p>
    </div>
  </div>
</body></html>"""


def _run():
    date_str = datetime.now(TW_TZ).strftime("%Y/%m/%d")
    st, alerts = _sb("/broker_sell_alerts",
                     params={"select": "id,broker_id,code,trade_date,sell_broker_id,"
                             "sell_broker_name,is_anchor,net_sell_lots,net_sell_amount_wan",
                             "notified": "eq.false", "order": "trade_date.desc"})
    if st != 200:
        return {"ok": False, "message": f"讀 alerts 失敗 {st}", "detail": alerts}
    if not alerts:
        return {"ok": True, "sent": False, "message": "無未通知的新賣超事件"}

    st2, watch = _sb("/broker_watchlist",
                     params={"select": "broker_id,broker_name,code,stock_name,giveback_pct,"
                             "tier,peak_lots,cur_lots"})
    wmap = {(w["broker_id"], w["code"]): w for w in (watch if st2 == 200 else [])}

    groups = {}
    for a in alerts:
        groups.setdefault((a["broker_id"], a["code"]), []).append(a)
    ordered = sorted(groups.items(),
                     key=lambda kv: -(wmap.get(kv[0], {}).get("giveback_pct") or 0))
    glist = [(wmap.get(k, {"broker_id": k[0], "code": k[1]}), evs) for k, evs in ordered]

    html = _compose(glist, date_str)
    n_stock, n_ev = len(glist), len(alerts)
    sent, result = _send_email(html, f"🔻【出場追蹤】{date_str} {n_stock} 檔出現賣超（{n_ev} 筆）", ALERT_EMAIL)
    if sent:
        ids = [a["id"] for a in alerts]
        # 分批標記 notified（避免 URL 過長）
        for i in range(0, len(ids), 200):
            chunk = ids[i:i + 200]
            _sb("/broker_sell_alerts", method="PATCH", body={"notified": True},
                params={"id": f"in.({','.join(str(x) for x in chunk)})"}, prefer="return=minimal")
    return {"ok": sent, "sent": sent, "stocks": n_stock, "events": n_ev, "result": result}


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-cron-secret")
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        if self.headers.get("x-vercel-cron"):
            return True
        if CRON_SECRET and self.headers.get("x-cron-secret") == CRON_SECRET:
            return True
        # 也允許帶 service key 的 Bearer（本機排程可主動觸發）
        auth = self.headers.get("Authorization", "").replace("Bearer ", "").strip()
        return bool(SUPABASE_SERVICE_KEY) and auth == SUPABASE_SERVICE_KEY

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-cron-secret")
        self.end_headers()

    def _handle(self):
        if not self._authed():
            return self._json(401, {"error": "unauthorized"})
        try:
            self._json(200, _run())
        except Exception:
            self._json(500, {"error": traceback.format_exc()})

    def do_GET(self):  self._handle()
    def do_POST(self): self._handle()
