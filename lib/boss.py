"""
boss.py — AI 研究室「總管」共用模組（2026-10-30）

總管＝雲端 Claude Agent，定時看所有排程狀態、判斷問題、寫報告、必要時申請重跑。
為了不把資料庫萬能鑰匙交給雲端，雲端只能經網站 /api/alert 的兩個入口工作（要帶 BOSS_TOKEN）：
  kind=boss_status  讀：collect() 收集的狀態
  kind=boss_report  寫：save_report() 存報告到 office:boss、enqueue() 申請重跑白名單排程、寄信
真正執行重跑的是本機 scripts/boss_runner.py（工作排程器每 5 分鐘），它也用本檔的 WHITELIST 再檢查一次。

資料都放 admin_settings（不新增資料表；RLS 只有 service_role 能讀寫）：
  office:boss   總管報告（AI 研究室顯示）
  boss:queue    重跑申請與結果
  boss:local    本機心跳：工作排程器各任務上次結果（boss_runner 每 5 分鐘寫）
只用標準庫；base/key 由呼叫端給（後端用環境變數、本機用 .env.local）。
"""
import datetime as dt
import gzip
import json
import urllib.parse
import urllib.request

TZ = dt.timezone(dt.timedelta(hours=8))
AGENTS = {"news": "新聞研究員", "chip": "籌碼分析師", "tech": "技術分析師", "macro": "總經研究員",
          "risk": "風控", "etf": "ETF 研究員", "data": "資料管理員"}

# ── 重跑白名單 ──
# task：整個 Windows 排程任務（schtasks /Run）；step：夜間排程的單一步驟（經 office_step.py 打卡執行）
# hours：只允許在這段台灣時間申請（避免盤中燒 Codex 額度、盤外重開盤中程式）；weekday：只限週一～五
TASKS = {
    "news_feed":      {"task": "AI_stock_news_feed", "label": "每日新聞"},
    "codex_topics":   {"task": "CodexHotTopicsHourly", "label": "話題族群（Codex）", "weekday": True, "hours": (9, 14)},
    "margin_catchup": {"task": "AI_stock_margin_catchup", "label": "融資維持率補當日值"},
    "taifex_catchup": {"task": "AI_stock_taifex_catchup", "label": "期交所資料補跑"},
    "intraday":       {"task": "AI_stock_Intraday", "label": "盤中掃盤", "weekday": True, "hours": (8, 13)},
}
# 夜間排程裡「重跑一次不會出事」的步驟：上傳／重算類、可重複寫入。
# 不收：玩股網爬蟲（wantgoo_*，一跑數小時）、broker_rankings 週重算、backfill_gaps、需登入瀏覽器的 margin_ratio／goodinfo、
#       upload_etf（曾清空 etf_products）、fetch_prices 系列（依賴爬蟲當晚狀態）。
STEPS = {
    "chip": ["broker_signals.py", "broker_highwin.py", "broker_rankings.py --daily-refresh", "inst_daily_push.py",
             "inst_market.py", "upload_institutional.py", "gov_broker.py", "gov_broker_moneylink.py", "sell_tracker.py",
             "chip_etl_twse.py --daily", "chip_etl_tpex.py --daily", "daytrade_etl.py --daily",
             "holder_flow_push.py --top 500", "otc_broker_daily.py"],
    "data": ["chip_brief.py", "page_cache_push.py", "themes_push.py", "job_health.py", "dividends_push.py",
             "fundamentals.py", "upload_otc_names.py", "limitup_precompute.py", "daily_slogan_rotate.py"],
    "etf": ["active_etf_flow.py", "upload_active_etf_holdings.py", "etf_daily.py", "upload_etf_div.py",
            "upload_etf_holders.py"],
    "macro": ["market_indicators.py", "fetch_otc_index.py --daily", "futures_market.py", "options_market.py",
              "option_sr.py", "txo_history.py", "index_history.py", "macro_env_push.py", "ust_yields_push.py",
              "foreign_hedge.py --daily", "home_intraday.py"],
    "news": ["upload_hot_topics.py", "mops_announce.py", "macro_events.py", "catalyst_lawshow.py"],
    "risk": ["breadth_daily.py", "breadth_ext.py", "compute_greed.py", "margin_maintenance_calc.py",
             "margin_market.py", "otc_market.py", "sector_turnover.py"],
    "tech": ["compute_box.py", "compute_strength.py", "liquidity_top.py", "mingdeng.py", "stock_sr.py",
             "stock_sr.py --src hour", "upload_price_window.py"],
}
MAX_PER_JOB_PER_DAY = 2
MAX_PENDING = 10


def step_jobs():
    """step 工作的代號 → (角色, 指令)。代號＝指令本身，例 'page_cache_push.py'、'stock_sr.py --src hour'。"""
    return {cmd: (agent, cmd) for agent, cmds in STEPS.items() for cmd in cmds}


def whitelist_text():
    return {"task": {k: v["label"] for k, v in TASKS.items()}, "step": sorted(step_jobs())}


def now():
    return dt.datetime.now(TZ)


# ── Supabase ──
def _req(base, key, path, method="GET", body=None, prefer=None, timeout=12):
    h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json",
         "Accept-Encoding": "gzip"}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(base.rstrip("/") + "/rest/v1" + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if raw and (r.headers.get("Content-Encoding") or "").lower() == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw) if raw else None


def get_setting(base, key, name, default=None):
    rows = _req(base, key, "/admin_settings?select=value,updated_at&key=eq." + urllib.parse.quote(name)) or []
    if not rows:
        return default
    try:
        return json.loads(rows[0]["value"])
    except Exception:                                       # noqa: BLE001
        return default


def _setting_from(rows, default=None):
    try:
        return json.loads(rows[0]["value"]) if rows else default
    except Exception:                                       # noqa: BLE001
        return default


def put_setting(base, key, name, value):
    _req(base, key, "/admin_settings?on_conflict=key", method="POST",
         body=[{"key": name, "value": json.dumps(value, ensure_ascii=False),
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}],
         prefer="resolution=merge-duplicates,return=minimal")


# ── 收集狀態 ──
# (標籤, 路徑, 日期欄位)：這些表的最新日期應該跟 price_window 最新交易日一致
FRESH = [
    ("加權指數", "/taiex_daily?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("盤後籌碼摘要", "/chip_brief_daily?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("期貨法人", "/futures_daily?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("選擇權支撐壓力", "/option_sr?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("三大法人", "/inst_market_daily?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("融資餘額", "/margin_market?select=date&order=date.desc&limit=1", "date"),
    ("融資維持率", "/margin_maintenance?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("外資空單", "/foreign_hedge_daily?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("大盤廣度", "/breadth_daily?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("主力分點明細", "/broker_trades?select=trade_date&order=trade_date.desc&limit=1", "trade_date"),
    ("主動ETF加碼", "/active_etf_flow?select=data_date&order=data_date.desc&limit=1", "data_date"),
    ("箱型", "/box_patterns?select=data_date&order=data_date.desc&limit=1", "data_date"),
]
SNAP_KINDS = ("sectors", "themes", "overview", "themeall", "sectorall")
VERSIONED_KINDS = ("focus", "limitup")


def _iso_age_min(ts, ref):
    try:
        t = dt.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=TZ)
        return round((ref - t).total_seconds() / 60)
    except Exception:                                       # noqa: BLE001
        return None


def _prev_weekday(d):
    d -= dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d


def _prefetch(base, key):
    """所有查詢同時發出（逐一查約 6~7 秒，網站後端有時間上限），回傳 {路徑: 結果或例外}。"""
    from concurrent.futures import ThreadPoolExecutor
    keys = ",".join('"office:%s"' % a for a in AGENTS)
    paths = ["/admin_settings?select=key,value,updated_at&key=" + urllib.parse.quote("in.(" + keys + ")", safe='().,"'),
             "/price_window?select=trade_date&code=eq.2330&order=trade_date.desc&limit=1",
             "/news_feed?select=fetched_at&order=fetched_at.desc&limit=1",
             "/hot_topics?select=captured_at&order=captured_at.desc&limit=1",
             LOCAL_PATH, QUEUE_PATH, REPORT_PATH]
    paths += [p for _, p, _ in FRESH]
    paths += [_snap_path(k) for k in SNAP_KINDS + VERSIONED_KINDS]

    def one(p):
        try:
            return _req(base, key, p)
        except Exception as e:                              # noqa: BLE001
            return e
    with ThreadPoolExecutor(max_workers=12) as ex:
        return dict(zip(paths, ex.map(one, paths)))


def _snap_path(k):
    flt = f"kind=eq.{k}" if k in SNAP_KINDS else f"kind=like.{k}__*"
    return f"/page_cache?{flt}&select=kind,trade_date,updated_at&order=updated_at.desc&limit=1"


LOCAL_PATH = "/admin_settings?select=value,updated_at&key=eq.boss%3Alocal"
QUEUE_PATH = "/admin_settings?select=value,updated_at&key=eq.boss%3Aqueue"
REPORT_PATH = "/admin_settings?select=value,updated_at&key=eq.office%3Aboss"


class _Cached:
    """讓 collect() 照原寫法呼叫，但結果取自預先並行抓好的資料。"""
    def __init__(self, pre):
        self.pre = pre

    def __call__(self, base, key, path, **kw):
        if path not in self.pre:
            return _req(base, key, path, **kw)
        r = self.pre[path]
        if isinstance(r, Exception):
            raise r
        return r


def collect(base, key):
    """回傳總管要看的全部狀態＋規則判定的問題清單（flags）。任何單項失敗只記在 errors，不整個失敗。"""
    ref = now()
    _q = _Cached(_prefetch(base, key))
    out = {"now": ref.isoformat(timespec="seconds"), "weekday": ref.isoweekday(), "agents": {},
           "freshness": [], "snapshots": [], "local": None, "queue": [], "cloud": None,
           "whitelist": whitelist_text(), "flags": [], "errors": []}
    flags = out["flags"]

    def flag(level, msg):
        flags.append({"level": level, "msg": msg})

    # 1) 研究室各角色打卡（office:*）
    try:
        keys = ",".join('"office:%s"' % a for a in AGENTS)
        rows = _q(base, key, "/admin_settings?select=key,value,updated_at&key=" +
                    urllib.parse.quote("in.(" + keys + ")", safe='().,"')) or []
        for r in rows:
            a = r["key"].split(":", 1)[1]
            try:
                st = json.loads(r.get("value") or "{}")
            except Exception:                               # noqa: BLE001
                continue
            steps = st.get("steps") or []
            last = {}
            for s in steps:
                if (_iso_age_min(s.get("start"), ref) or 0) > 20 * 60:
                    continue
                if "end" in s:
                    last[s.get("step")] = s
            failed = [{"step": k, "end": v.get("end"), "detail": v.get("detail"), "tail": v.get("tail")}
                      for k, v in last.items() if not v.get("ok")]
            running = [{"step": s.get("step"), "start": s.get("start"), "minutes": _iso_age_min(s.get("start"), ref)}
                       for s in steps if "end" not in s and s.get("start")]
            ends = [s.get("end") for s in steps if s.get("end")]
            out["agents"][a] = {"name": AGENTS[a], "status": st.get("status"), "current": st.get("current"),
                                "last_end": max(ends) if ends else None, "steps_20h": len(last),
                                "failed": failed, "running": running, "bubble": st.get("bubble")}
            for f in failed:
                flag("bad", f"{AGENTS[a]}：{f['step']} 失敗未重跑成功（{f.get('detail') or ''}）")
            for rn in running:
                if (rn["minutes"] or 0) > 120:
                    flag("bad", f"{AGENTS[a]}：{rn['step']} 已跑 {rn['minutes']} 分鐘未結束")
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"office: {type(e).__name__} {e}")

    # 2) 資料新鮮度：以 price_window（2330）最新日期為準
    latest = None
    try:
        pw = _q(base, key, "/price_window?select=trade_date&code=eq.2330&order=trade_date.desc&limit=1") or []
        latest = str(pw[0]["trade_date"]) if pw else None
        out["latest_trade_date"] = latest
        expect = ref.date() if ref.hour >= 23 and ref.weekday() < 5 else _prev_weekday(ref.date())
        if ref.hour >= 8 and latest and latest < expect.isoformat():
            flag("warn", f"收盤價停在 {latest}，預期應到 {expect.isoformat()}（若那天休市可忽略）")
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"price_window: {type(e).__name__} {e}")
    for label, path, col in FRESH:
        try:
            r = _q(base, key, path) or []
            d = str(r[0][col])[:10] if r else None
            out["freshness"].append({"label": label, "date": d})
            if latest and (not d or d < latest):
                flag("warn", f"{label} 停在 {d or '無資料'}（收盤價已到 {latest}）")
        except Exception as e:                              # noqa: BLE001
            out["errors"].append(f"{label}: {type(e).__name__}")
    for k in SNAP_KINDS + VERSIONED_KINDS:
        try:
            r = _q(base, key, _snap_path(k)) or []
            td = str(r[0].get("trade_date") or "") if r else ""
            out["snapshots"].append({"kind": k, "trade_date": td or None, "updated_at": r[0].get("updated_at") if r else None})
            if latest and td < latest:
                flag("warn", f"網頁快照 {k} 停在 {td or '無'}（收盤價已到 {latest}）")
        except Exception as e:                              # noqa: BLE001
            out["errors"].append(f"page_cache {k}: {type(e).__name__}")
    try:
        r = _q(base, key, "/news_feed?select=fetched_at&order=fetched_at.desc&limit=1") or []
        age = _iso_age_min(r[0]["fetched_at"], ref) if r else None
        out["news_age_min"] = age
        if age is None or age > 6 * 60:
            flag("warn", f"每日新聞 {age if age is not None else '?'} 分鐘沒更新（每 4 小時一次）")
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"news_feed: {type(e).__name__}")
    try:
        r = _q(base, key, "/hot_topics?select=captured_at&order=captured_at.desc&limit=1") or []
        out["hot_topics_at"] = r[0]["captured_at"] if r else None
        if ref.weekday() < 5 and ref.hour >= 14 and r and str(r[0]["captured_at"])[:10] < ref.date().isoformat():
            flag("warn", "今天盤中話題族群沒有更新（Codex 排程 09:00～13:00）")
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"hot_topics: {type(e).__name__}")

    # 3) 本機心跳（boss_runner 每 5 分鐘寫）
    try:
        loc = _setting_from(_q(base, key, LOCAL_PATH))
        out["local"] = loc
        age = _iso_age_min((loc or {}).get("ts"), ref)
        if age is None or age > 20:
            flag("bad", f"本機 {age if age is not None else '?'} 分鐘沒回報（電腦可能關機、睡眠，或總管助手沒在跑）")
        for t in (loc or {}).get("tasks") or []:
            res = t.get("result")
            if res not in (0, 267009, 267011, 267014, None):    # 0 成功、267009 執行中、267011 從未執行、267014 被使用者停止
                flag("warn", f"工作排程 {t.get('name')} 上次結果代碼 {res}（{t.get('last_run')}）")
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"boss:local: {type(e).__name__}")

    # 4) 重跑申請與結果
    try:
        q = _setting_from(_q(base, key, QUEUE_PATH)) or {}
        out["queue"] = (q.get("items") or [])[-15:]
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"boss:queue: {type(e).__name__}")

    # 4b) 總管自己上一份報告（判斷問題是新的還是已經報過）
    try:
        prev = _setting_from(_q(base, key, REPORT_PATH)) or {}
        out["prev_report"] = prev.get("report")
        out["mail_today"] = (prev.get("mail") or {}).get("count", 0) if (prev.get("mail") or {}).get("date") == ref.date().isoformat() else 0
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"office:boss: {type(e).__name__}")

    # 5) GitHub 雲端排程（公開 repo，不用金鑰；被限流就略過）
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/swe2501/tw-stock-screener/actions/workflows/daily-cloud-jobs.yml/runs?per_page=1",
            headers={"User-Agent": "tw-stock-boss", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=8) as r:
            runs = json.loads(r.read()).get("workflow_runs") or []
        if runs:
            x = runs[0]
            out["cloud"] = {"status": x.get("status"), "conclusion": x.get("conclusion"),
                            "created_at": x.get("created_at"), "url": x.get("html_url")}
            if x.get("conclusion") not in (None, "success"):
                flag("warn", f"GitHub 雲端排程上次結果 {x.get('conclusion')}（{x.get('created_at')}）")
    except Exception as e:                                  # noqa: BLE001
        out["errors"].append(f"github: {type(e).__name__}")

    return out


# ── 重跑申請 ──
def check_job(job, ref=None):
    """回傳 (ok, 說明, 規格)。規格：{'type':'task','task':...} 或 {'type':'step','agent':...,'cmd':...}"""
    ref = ref or now()
    if job in TASKS:
        spec = TASKS[job]
        if spec.get("weekday") and ref.weekday() >= 5:
            return False, "只限週一～五", None
        h = spec.get("hours")
        if h and not (h[0] <= ref.hour <= h[1]):
            return False, f"只限 {h[0]}:00～{h[1]}:59", None
        return True, spec["label"], {"type": "task", "task": spec["task"]}
    sj = step_jobs()
    if job in sj:
        agent, cmd = sj[job]
        return True, cmd, {"type": "step", "agent": agent, "cmd": cmd}
    return False, "不在白名單", None


def enqueue(base, key, jobs, by="boss"):
    """jobs：[{job, reason}]。回傳每項的受理結果。"""
    ref = now()
    q = get_setting(base, key, "boss:queue", {}) or {}
    items = q.get("items") or []
    today = ref.date().isoformat()
    res = []
    for j in (jobs or [])[:5]:
        job = str((j or {}).get("job") or "").strip()
        reason = str((j or {}).get("reason") or "")[:200]
        ok, why, _ = check_job(job, ref)
        if ok:
            pending = [x for x in items if x.get("job") == job and x.get("status") in ("pending", "running")]
            used = [x for x in items if x.get("job") == job and str(x.get("requested_at", ""))[:10] == today]
            if pending:
                ok, why = False, "已在排隊中"
            elif len(used) >= MAX_PER_JOB_PER_DAY:
                ok, why = False, f"今天已申請 {len(used)} 次（上限 {MAX_PER_JOB_PER_DAY}）"
            elif sum(1 for x in items if x.get("status") == "pending") >= MAX_PENDING:
                ok, why = False, "排隊太多"
        if ok:
            items.append({"id": ref.strftime("%m%d%H%M%S") + str(len(items)), "job": job, "reason": reason,
                          "by": by, "requested_at": ref.isoformat(timespec="seconds"), "status": "pending"})
        res.append({"job": job, "accepted": ok, "note": why})
    q["items"] = items[-40:]
    put_setting(base, key, "boss:queue", q)
    return res


# ── 報告 ──
MAX_EMAIL_PER_DAY = 4


def save_report(base, key, report):
    """report：{status: ok|warn|bad, headline, items:[str], diagnosis, actions:[str]}。存 office:boss（研究室顯示）。
    回傳 (state, 今天第幾封信可用)。"""
    ref = now()
    old = get_setting(base, key, "office:boss", {}) or {}
    status = report.get("status") if report.get("status") in ("ok", "warn", "bad") else "warn"
    clip = lambda s, n: str(s or "")[:n]                    # noqa: E731
    entry = {"at": ref.isoformat(timespec="seconds"), "status": status,
             "headline": clip(report.get("headline"), 120),
             "items": [clip(x, 200) for x in (report.get("items") or [])[:12]],
             "diagnosis": clip(report.get("diagnosis"), 1500),
             "actions": [clip(x, 200) for x in (report.get("actions") or [])[:8]]}
    hist = (old.get("history") or [])[-20:] + [entry]
    today = ref.date().isoformat()
    mail = old.get("mail") or {}
    if mail.get("date") != today:
        mail = {"date": today, "count": 0}
    state = {"agent": "boss", "name": "總管", "date": today,
             "status": {"ok": "done", "warn": "work", "bad": "stuck"}[status],
             "current": None if status == "ok" else entry["headline"],
             "since": entry["at"], "bubble": [entry["headline"][:24], f"{ref:%m/%d %H:%M} 巡查"],
             "report": entry, "history": hist, "mail": mail, "steps": []}
    put_setting(base, key, "office:boss", state)
    return state


def take_mail_slot(base, key, state):
    mail = state.get("mail") or {}
    if mail.get("count", 0) >= MAX_EMAIL_PER_DAY:
        return False
    mail["count"] = mail.get("count", 0) + 1
    state["mail"] = mail
    put_setting(base, key, "office:boss", state)
    return True
