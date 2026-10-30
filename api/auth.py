from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# 後台管理員白名單（與前端 VIEWER_EMAILS 一致；之後移到 admin_allowlist 表）
ADMIN_EMAILS = {"swe250165@gmail.com", "qa5518556130@gmail.com", "wenpin0617@gmail.com"}
# 2026-10-28 權限改以帳號 ID 判斷：註冊不驗證 Email，用 Email 判斷可被搶註冒充。
# 新增管理員：對方先註冊 → 把帳號 ID 加到這裡＋Supabase allowed_viewers.user_id（兩邊一致）。ADMIN_EMAILS 只用於顯示。
ADMIN_IDS = {"ef7193f4-15be-4ab0-b004-705d95b1a3dc",   # swe250165
             "93f16c68-d103-4092-b938-93e34012d3c1",   # qa5518556130
             "118f9b90-85d1-4195-ac50-20c16a8624e9"}   # wenpin0617
# 會員等級＝合夥人 member-voucher-levels.sql 定義的 tier（＋free 一般會員）；choice 自選券屬券非常設等級
TIERS = {"free", "observation", "research", "advanced", "vip"}

# ── 算法公式（話題熱度／強度／貪婪）：存後端＋DB，前端完全不內嵌，避免被開發者模式窺探 ──
# 預設只有管理者可見，且需後台「總開關 algo_visible」打開才回傳；DB admin_settings 有同名列時以 DB 為準。
# 字串含 {token} 佔位，由前端填入即時數字（數字本身非機密，機密在權重與錨點）。
ALGO_KEYS = ("topic_heat", "strength", "greed", "greed_method")

# 2026-10-24 用戶指示：話題熱度頁的說明整段（含公式）都改由這裡提供，前端不再內嵌任何說明文字
_ALGO_TOPIC_HEAT = (
    ' AI（Codex）盤中每小時搜出的話題族群。<b style="color:#ff7a3c">數字＝話題熱度</b>'
    '（Codex 依新聞量／新鮮度／是否牽涉大廠評 0~100，非門檻，由高到低列出，跟個股強度是兩回事）。<br>'
    '個股依「<b style="color:var(--text)">強度</b>」由高到低排：<br>'
    '　<b>強度</b> ＝ 0.6×相對強度(RS) ＋ 0.2×均線多頭(收＞MA20＞MA60 給100，否則0) ＋ 0.2×近波段高比×100<br>'
    '　<b>RS</b>＝該股「0.6×20日＋0.4×60日報酬」在全市場的百分位(0~100)。<br>'
    '　強度分數旁的小字（<b>RS·均線·近高</b>）＝該檔三項的實際值。<br>'
    '　<b>20日</b>＝近20個交易日的報酬率（區間漲跌幅，<b>不是</b>平均）。<br>'
    '　<b>主力</b>欄兩個訊號：<b style="color:#f85149">近5日N天</b>＝<b>全市場所有分點</b>近5交易日出現單日大單買超'
    '（≥300張 或 ≥3000萬）的天數（覆蓋廣）；'
    '<b style="color:#c678dd">前20：日期</b>＝<b>僅勝率排行榜前20名分點</b>的大單買超日，與 K 圖箭頭同源可對照（前20沒買到就空）。點個股開 K 線。'
)

_ALGO_STRENGTH = (
    '<div style="background:rgba(255,255,255,.05);padding:9px 11px;border-radius:6px;font-family:monospace;font-size:12px;line-height:1.7">'
    '強度 = 0.6×RS + 0.2×均線多頭 + 0.2×近高比×100<br>'
    '　　 = 0.6×{rs} + 0.2×{maScore} + 0.2×{nh100} = <b style="color:#67c23a">{strength}</b></div>'
    '<div style="margin-top:11px"><b style="color:var(--accent)">RS {rs}</b>（相對強度）：該檔「0.6×20日＋0.4×60日報酬」在全市場約 1080 檔的百分位，即贏過約 <b>{rs}%</b> 的股票。<br>'
    '<span style="color:var(--text-muted)">· 近20日報酬 {ret20sign}{ret20}%</span></div>'
    '<div style="margin-top:9px"><b style="color:var(--accent)">均線多頭</b>：收盤 &gt; MA20 &gt; MA60 → {maTxt}</div>'
    '<div style="margin-top:9px"><b style="color:var(--accent)">近波段高比</b>：收盤 ÷ 近60日最高 ＝ <b>{nh}</b>（×100＝{nh100}）。越接近 1 越貼近波段高。</div>'
)

_ALGO_GREED = (
    '<div style="background:rgba(255,255,255,.05);padding:9px 11px;border-radius:6px;font-family:monospace;font-size:12px;line-height:1.7">'
    '貪婪 = 0.70×基礎 + 0.30×催化(取最強)<br>'
    '　　 = 0.70×{base} + 0.30×{catalyst}{catSrcParen} = <b style="color:#c678dd">{greed}</b></div>'
    '<div style="margin-top:11px"><b style="color:var(--accent)">基礎分 {base}</b>（70%，四維情緒/擁擠度{dataDateDot}）：</div>'
    '<div style="margin-top:5px;font-family:monospace;font-size:11.5px;color:var(--text);line-height:1.6">'
    '價格延伸 30% = <b>{priceS}</b>（BIAS＋布林%b）<br>'
    '動能強弱 25% = <b>{momS}</b>（RSI5＋RS vs大盤）<br>'
    '量能投機 25% = <b>{volS}</b>（量比＋當沖率）<br>'
    '籌碼擁擠 20% = <b>{chipS}</b>（前15大集中度＋融資增幅）</div>'
    '<div style="margin-top:11px"><b style="color:#c678dd">催化 {catalyst}</b>（30%，取三者最強{catSrcColon}）：</div>'
    '<div style="margin-top:5px;font-size:11.5px;line-height:1.6">'
    '・話題熱度 {topicHeat}：{topicLine}<br>'
    '・法說會 {lawScore}：{lawTxt}<br>'
    '・展覽 {exhScore}：{exhTxt}</div>'
    '{exhaustBlock}{capitulationBlock}'
    '<div style="margin-top:11px;font-size:11px;color:var(--text-muted)">區間：極度恐懼0–25・恐懼25–45・中立45–55・貪婪55–75・極度貪婪75–100。</div>'
    '{method}'
)

_ALGO_GREED_METHOD = (
    '<details style="margin-top:12px;border-top:1px solid var(--border);padding-top:9px">'
    '<summary style="cursor:pointer;font-size:12px;color:#c678dd;font-weight:600">＋ 完整計分規則</summary>'
    '<div style="margin-top:9px;font-size:11.5px;line-height:1.55">'
    '<b style="color:var(--accent)">最終公式</b>：貪婪 = 0.70×基礎 + 0.30×催化(取話題/法說/展覽最強者)，四捨五入 0~100。<br>'
    '<b style="color:var(--accent)">基礎(四維)</b> = 0.30×價格延伸 + 0.25×動能 + 0.25×量能 + 0.20×籌碼；每維 = 該維各指標「分段線性內插分」的<b>平均</b>（缺值維度自動重歸一化權重）。'
    '<div style="margin-top:8px;color:var(--text)"><b>各指標錨點（x→分，中間線性內插）</b></div>'
    '<table style="border-collapse:collapse;font-size:11px;margin-top:3px">'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">BIAS20 %</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">-10→0, -5→30, -3→40, 8→60, 15→80, 25→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">布林 %b</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">0→0, 0.2→30, 0.3→40, 0.8→60, 1.0→80, 1.2→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">RSI(5)</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">10→0, 30→39, 45→40, 70→60, 85→80, 95→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">RS(超額報酬,近20日個股−大盤%)</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">-10→0, -5→30, 0→50, 5→70, 10→85, 20→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">量比(量/20日均量)</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">0.3→0, 0.5→30, 0.8→40, 1.7→59, 1.8→60, 3→80, 5→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">當沖率 %(只加貪婪;OTC缺則略)</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">0→40, 35→55, 60→80, 80→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">主力集中度 %(前15大淨買/總量)</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">-30→0, 0→40, 30→60, 50→80, 70→100</td></tr>'
    '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text)">融資單週增幅 %</td><td style="padding:2px 0;color:var(--text-muted);font-family:monospace">-10→30, 0→45, 10→60, 20→80, 40→100</td></tr>'
    '</table>'
    '<div style="margin-top:8px;color:var(--text)"><b>催化(取最強者)</b></div>'
    '<div style="color:var(--text-muted)">'
    '・話題：hot_topics 熱度分（所屬最熱話題）<br>'
    '・法說：≤3天100 / 4~7天80 / 8~14天50 / 剛開完0~3天前60<br>'
    '・展覽：展中100 / 展前1~7天90 / 展前8~30天60 / 展後5天內40（需族群對得上）'
    '</div>'
    '<div style="margin-top:8px;color:var(--text)"><b>利多出盡 / 利空出盡</b></div>'
    '<div style="color:var(--text-muted)">利多出盡＝貪婪高分(≥80) 且 <b>法說會當天或開完1~2交易日內</b> 且 頂部反轉K（爆量長黑 或 爆量長上影跌破5日線）。利空出盡＝極度悲觀(≤20) 且 底部反轉K（爆量長紅 或 爆量長下影站回5日線）。上影比=(高−max(開,收))/收、下影比=(min(開,收)−低)/收。</div>'
    '<div style="margin-top:8px;color:var(--text)"><b>資料源</b></div>'
    '<div style="color:var(--text-muted)">stock_daily(價量,證交所/櫃買)、day_trade(當沖,上市)、wantgoo_daily(集中度,含上櫃分點)、margin_short(融資,含上櫃)、taiex_daily/otc_index_daily(大盤,算RS)、catalyst_events(法說會)。每日夜間排程重算(greed_base 快照)。上櫃已納入；上櫃當沖無官方個股源故量能以量比為主。</div>'
    '</div></details>'
)

_ALGO_DEFAULTS = {
    "topic_heat": _ALGO_TOPIC_HEAT,
    "strength": _ALGO_STRENGTH,
    "greed": _ALGO_GREED,
    "greed_method": _ALGO_GREED_METHOD,
}


def _settings_get(keys):
    """讀 admin_settings 指定 key（service_role）。回 {key: value}；缺金鑰或失敗回 {}。"""
    try:
        q = "in.(" + ",".join(keys) + ")"
        st, rows = _rest(f"/admin_settings?select=key,value&key={urllib.parse.quote(q, safe='().,')}")
        if st == 200 and isinstance(rows, list):
            return {r.get("key"): r.get("value") for r in rows}
    except Exception:
        pass
    return {}


def _algo_formulas():
    """DB 有就用 DB，缺列就回內嵌預設（確保未 seed 也可運作）。"""
    db = _settings_get(["formula_" + k for k in ALGO_KEYS])
    return {k: (db.get("formula_" + k) or _ALGO_DEFAULTS[k]) for k in ALGO_KEYS}


def _verify_admin(token):
    """用呼叫者 JWT 取帳號，ID ∈ ADMIN_IDS 才回 email（稽核日誌用），否則 None。後台每個操作的真正防線。"""
    if not token:
        return None
    try:
        req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/user",
                                     headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=10) as r:
            u = json.loads(r.read())
        em = (u.get("email") or "").strip().lower()
        return em if u.get("id") in ADMIN_IDS else None
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


def _rest(path, method="GET", body=None, prefer=None):
    """用 service_role 打 Supabase PostgREST（member_tiers 等）。回 (status, data)。缺金鑰回 (None, err)。"""
    if not SUPABASE_SERVICE_KEY:
        return None, {"error": "SUPABASE_SERVICE_KEY 未設定", "code": "NO_SERVICE_KEY"}
    url = f"{SUPABASE_URL}/rest/v1{path}"
    headers = {"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
               "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {"error": "rest error"}


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

        # ── 算法公式：只有管理者＋總開關開 才回傳公式文字；其餘一律 visible:false（文字不落前端） ──
        if action == "algo_info":
            token = (self.headers.get("Authorization") or "").replace("Bearer ", "").strip()
            admin_email = _verify_admin(token)
            if not admin_email:
                return self._json(200, {"visible": False})
            vis = (_settings_get(["algo_visible"]).get("algo_visible") or "false").lower() == "true"
            if not vis:
                return self._json(200, {"visible": False})
            return self._json(200, {"visible": True, "formulas": _algo_formulas()})

        # ── 後台管理（action: admin_*）：JWT→email∈白名單 才放行；service_role 只在後端 ──
        if action.startswith("admin_"):
            token = (self.headers.get("Authorization") or "").replace("Bearer ", "").strip()
            admin_email = _verify_admin(token)
            if not admin_email:
                return self._json(403, {"error": "forbidden: 僅限管理員"})

            if action in ("admin_office_tasks_list", "admin_office_tasks_get", "admin_office_tasks_create", "admin_office_tasks_update"):
                from lib.office_tasks import handle
                status, result = handle(action, body, admin_email, _rest)
                return self._json(status, result)

            if action in ("admin_pattern_reviews", "admin_pattern_review_save"):
                from lib.pattern_review import handle
                status, result = handle(action, body, admin_email, _rest)
                return self._json(status, result)

            if action == "admin_members":
                st, data = _admin_api("/admin/users?per_page=200")
                if st is None:
                    return self._json(500, data)
                users = data.get("users", []) if isinstance(data, dict) else []
                # 等級以 member_tiers 表為準（RLS/功能 gate 讀同一張）；3 位白名單一律 admin
                tmap = {}
                tst, trows = _rest("/member_tiers?select=user_id,tier")
                if tst == 200 and isinstance(trows, list):
                    tmap = {r.get("user_id"): r.get("tier") for r in trows}
                out = []
                for u in users:
                    md = u.get("user_metadata") or {}
                    em = (u.get("email") or "").strip().lower()
                    tier = "admin" if u.get("id") in ADMIN_IDS else tmap.get(u.get("id"), "free")
                    out.append({
                        "id": u.get("id"), "email": u.get("email"),
                        "name": md.get("name") or md.get("full_name") or md.get("display_name"),   # LINE 登入沒有 Email，列表改顯示名稱
                        "tier": tier, "expires_at": md.get("expires_at"),
                        "banned": bool(md.get("banned")),
                        "created_at": u.get("created_at"), "last_sign_in_at": u.get("last_sign_in_at"),
                        "provider": (u.get("app_metadata") or {}).get("provider"),
                        "confirmed": bool(u.get("email_confirmed_at") or u.get("phone_confirmed_at")),
                        "is_admin": u.get("id") in ADMIN_IDS,
                    })
                out.sort(key=lambda x: x.get("created_at") or "")
                return self._json(200, {"members": out, "admins": sorted(ADMIN_EMAILS)})

            if action == "admin_set_tier":
                uid = str(body.get("user_id", "")).strip()
                tier = str(body.get("tier", "")).strip()
                if not uid:
                    return self._json(400, {"error": "user_id required"})
                if tier not in TIERS:
                    return self._json(400, {"error": "invalid tier"})
                # option(a)：寫持久化 member_tiers（RLS 與功能 gate 讀的單一來源）
                st2, res = _rest("/member_tiers?on_conflict=user_id", method="POST",
                                 body=[{"user_id": uid, "tier": tier, "set_by": admin_email}],
                                 prefer="resolution=merge-duplicates,return=minimal")
                if st2 is None:
                    return self._json(500, res)
                if st2 in (200, 201, 204):
                    _audit(admin_email, "admin_set_tier", uid, {"tier": tier})
                    return self._json(200, {"ok": True, "tier": tier})
                return self._json(500, {"error": "update failed", "detail": res})

            if action in ("admin_set_expiry", "admin_ban"):
                uid = str(body.get("user_id", "")).strip()
                if not uid:
                    return self._json(400, {"error": "user_id required"})
                st, cur = _admin_api(f"/admin/users/{uid}")
                if st is None:
                    return self._json(500, cur)
                md = dict((cur.get("user_metadata") or {})) if st == 200 else {}
                if action == "admin_set_expiry":
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

            # 2026-10-27 AI 研究室：7 個角色（＝排程分組）的打卡狀態，存 admin_settings key=office:<角色>（本機 scripts/office_report.py 寫入）
            if action == "admin_office":
                # 2026-10-30 加 boss（雲端總管報告）；boss:queue 重跑申請、boss:local 本機心跳一併給研究室顯示
                agents = ("news", "chip", "tech", "macro", "risk", "etf", "data", "boss")
                q = "in.(" + ",".join(['"office:%s"' % a for a in agents] + ['"boss:queue"', '"boss:local"']) + ")"
                st2, rows = _rest("/admin_settings?select=key,value,updated_at&key=" + urllib.parse.quote(q, safe='().,"'))
                if st2 is None:
                    return self._json(500, rows)
                out = {}
                for r in (rows if isinstance(rows, list) else []):
                    try:
                        k = r["key"]
                        out[("_" + k.split(":", 1)[1]) if k.startswith("boss:") else k.split(":", 1)[1]] = json.loads(r.get("value") or "{}")
                    except Exception:
                        pass
                return self._json(200, {"agents": out})

            # 算法公式總開關狀態（給後台切換用）＋目前公式內容（供後台預覽/編輯）
            if action == "admin_algo_get":
                vis = (_settings_get(["algo_visible"]).get("algo_visible") or "false").lower() == "true"
                return self._json(200, {"algo_visible": vis, "formulas": _algo_formulas()})

            # 切換總開關：on=true → 管理者才看得到公式；預設 false（連管理者都不顯示，避免直播/分享外洩）
            if action == "admin_set_algo_visible":
                on = "true" if bool(body.get("on")) else "false"
                st2, res = _rest("/admin_settings?on_conflict=key", method="POST",
                                 body=[{"key": "algo_visible", "value": on}],
                                 prefer="resolution=merge-duplicates,return=minimal")
                if st2 is None:
                    return self._json(500, res)
                if st2 in (200, 201, 204):
                    _audit(admin_email, "admin_set_algo_visible", "-", {"on": on})
                    return self._json(200, {"ok": True, "algo_visible": on == "true"})
                return self._json(500, {"error": "update failed", "detail": res})

            # 一次把內嵌預設公式寫入 DB（冪等；讓 DB 成為可改來源，不需本機金鑰）
            if action == "admin_seed_algo":
                rows = [{"key": "formula_" + k, "value": _ALGO_DEFAULTS[k]} for k in ALGO_KEYS]
                rows.append({"key": "algo_visible", "value": (_settings_get(["algo_visible"]).get("algo_visible") or "false")})
                st2, res = _rest("/admin_settings?on_conflict=key", method="POST",
                                 body=rows, prefer="resolution=merge-duplicates,return=minimal")
                if st2 is None:
                    return self._json(500, res)
                if st2 in (200, 201, 204):
                    _audit(admin_email, "admin_seed_algo", "-", {"keys": [r["key"] for r in rows]})
                    return self._json(200, {"ok": True, "seeded": [r["key"] for r in rows]})
                return self._json(500, {"error": "seed failed", "detail": res})

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
