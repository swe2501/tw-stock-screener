"""
office_report.py - 「AI 研究室」打卡與摘要（2026-10-27，後台管理分頁用）

每個 AI 角色＝一組既有排程。排程每一步經 office_step.py 執行時呼叫這裡：
  record(agent, step, 'start')  → 角色狀態變「工作中」、記下目前步驟
  record(agent, step, 'end', ok, secs) → 記錄這步成敗與耗時，並重算泡泡摘要
狀態存 Supabase admin_settings（key = office:<agent>，value = JSON；RLS 只有 service_role 能讀寫，
前端讀不到，經後端 /api/auth action=admin_office 給管理者）。不新增資料表。
任何錯誤都吞掉，絕不影響排程本身。
"""
import datetime as dt
import json
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

TZ = dt.timezone(dt.timedelta(hours=8))
AGENTS = {
    "news": "新聞研究員", "chip": "籌碼分析師", "tech": "技術分析師", "macro": "總經研究員",
    "risk": "風控", "etf": "ETF 研究員", "data": "資料管理員",
}
_ENV = None


def _env():
    global _ENV
    if _ENV is None:
        import broker_signals as bs
        _ENV = bs._load_env()
    return _ENV


def _req(path, method="GET", body=None, prefer=None, timeout=15):
    e = _env()
    url = e["SUPABASE_URL"] + "/rest/v1" + path
    h = {"apikey": e["SUPABASE_SERVICE_KEY"], "Authorization": "Bearer " + e["SUPABASE_SERVICE_KEY"],
         "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def _get(agent):
    rows = _req("/admin_settings?select=value&key=eq." + urllib.parse.quote("office:" + agent))
    if rows:
        try:
            return json.loads(rows[0]["value"])
        except Exception:
            pass
    return {}


def _put(agent, state):
    _req("/admin_settings?on_conflict=key", method="POST",
         body=[{"key": "office:" + agent, "value": json.dumps(state, ensure_ascii=False),
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}],
         prefer="resolution=merge-duplicates,return=minimal")


def _now():
    return dt.datetime.now(TZ)


def _unresolved_failures(steps):
    """回傳 20 小時內失敗、且之後沒有再成功過的步驟名稱（依出現順序）。"""
    last = {}
    for s in steps:
        try:
            if (_now() - dt.datetime.fromisoformat(s.get("start") or "")).total_seconds() > 20 * 3600:
                continue
        except Exception:
            continue
        if "end" in s:
            last[s.get("step")] = bool(s.get("ok"))
    return [k for k, v in last.items() if not v]


def record(agent, step, phase, ok=None, secs=None, detail=None, tail=None):
    try:
        st = _get(agent)
        today = _now().date().isoformat()
        if st.get("date") != today:
            # 2026-10-29 夜間排程會跨午夜：最近 14 小時內還有步驟就沿用（不清掉），才看得到整晚各步耗時
            last = max((s.get("start") or "" for s in st.get("steps") or []), default="")
            recent = False
            try:
                recent = bool(last) and (_now() - dt.datetime.fromisoformat(last)).total_seconds() < 14 * 3600
            except Exception:
                pass
            if recent:
                st["date"] = today
            else:
                st = {"agent": agent, "name": AGENTS.get(agent, agent), "date": today, "steps": [],
                      "bubble": st.get("bubble") or []}
        now = _now().isoformat(timespec="seconds")
        # 2026-10-29 排程被系統強制停掉時，那一步不會有結束紀錄 → 超過 3 小時沒結束的視為中斷（失敗）
        for s in st.get("steps") or []:
            if "end" not in s and s.get("start"):
                try:
                    if (_now() - dt.datetime.fromisoformat(s["start"])).total_seconds() > 3 * 3600:
                        s.update({"end": now, "ok": False, "detail": "中斷（排程被停掉，沒有結束紀錄）"})
                except Exception:
                    pass
        if phase == "start":
            st["status"] = "work"
            st["current"] = step
            st["since"] = now
            st["steps"].append({"step": step, "start": now})
        else:
            for s in reversed(st["steps"]):
                if s.get("step") == step and "end" not in s:
                    s.update({"end": now, "ok": bool(ok), "secs": round(secs or 0)})
                    if detail:
                        s["detail"] = str(detail)[:120]
                    if tail:  # 2026-10-30 失敗時最後幾十行輸出，給總管判斷原因
                        s["tail"] = str(tail)[-1500:]
                    break
            st["status"] = "done" if ok else "stuck"
            st["current"] = None if ok else step
            st["since"] = now
            if ok:
                try:
                    b = summarize(agent)
                    if b:
                        st["bubble"] = b
                except Exception as e:                      # noqa: BLE001
                    st["bubble_err"] = type(e).__name__
            else:
                st["bubble"] = [f"{step} 失敗", f"耗時 {round(secs or 0)} 秒"]
            # 2026-10-29 燈號原本只看最後一步：前面失敗、後面成功就變綠燈（10/28 ETF 兩步失敗仍顯示完成）。
            # 改為這一輪只要有步驟失敗、且之後沒有重跑成功，就維持「卡住」。
            failed = _unresolved_failures(st["steps"])
            if ok and failed:
                st["status"] = "stuck"
                st["current"] = failed[0]
                st["bubble"] = [f"{'、'.join(failed[:2])}{' 等' if len(failed) > 2 else ''} 失敗",
                                (st.get("bubble") or [""])[0]]
        st["steps"] = st["steps"][-80:]
        _put(agent, st)
    except Exception as e:                                  # noqa: BLE001
        print(f"[office] 打卡失敗（不影響排程）：{type(e).__name__} {e}", flush=True)


# ── 泡泡摘要：每個角色兩行重點（只讀資料，失敗就回 None 保留舊泡泡） ──
def _one(path):
    r = _req(path)
    return r[0] if r else None


def _md(d):
    return f"{int(d[5:7])}/{int(d[8:10])}" if d and len(d) >= 10 else "—"


def _sum_news():
    h = _req("/hot_topics?select=captured_at,sector&order=captured_at.desc&limit=60") or []
    if not h:
        return None
    last = h[0]["captured_at"][:16]
    batch = [x for x in h if x["captured_at"][:16] == last]
    t = dt.datetime.fromisoformat(h[0]["captured_at"].replace("Z", "+00:00")).astimezone(TZ)
    return [f"上輪 {len(batch)} 則、{len({x['sector'] for x in batch})} 族群", f"更新 {t:%m/%d %H:%M}"]


def _sum_chip():
    r = _one("/broker_trades?select=trade_date&order=trade_date.desc&limit=1")
    if not r:
        return None
    d = r["trade_date"]
    rows = _req(f"/broker_trades?select=view,broker_id,code,name&trade_date=eq.{d}&limit=2000") or []
    sell = sum(1 for x in rows if x["view"].endswith(("_sell", "_exit")))
    buy = sum(1 for x in rows if x["view"] in ("year_large_lots", "year_large_amount"))
    ex = next((x for x in rows if x["view"].endswith("_exit")), None)
    line1 = f"{_md(d)} 買入 {buy}、賣出 {sell} 筆"
    if ex:
        rk = _one(f"/broker_rankings?select=broker_name&broker_id=eq.{urllib.parse.quote(ex['broker_id'])}&limit=1")
        nm = (rk or {}).get("broker_name") or ex["broker_id"]
        return [f"{nm}出清 {ex['code']}", line1]
    return [line1, "主力訊號已更新"]


def _sum_tech():
    b = _one("/box_patterns?select=data_date&order=data_date.desc&limit=1")
    d = (b or {}).get("data_date")
    n = len(_req(f"/box_patterns?select=code&data_date=eq.{d}&limit=2000") or []) if d else 0
    p = _one("/price_window?select=trade_date&code=eq.2330&order=trade_date.desc&limit=1")
    return [f"箱型 {n} 檔", f"收盤價到 {_md((p or {}).get('trade_date'))}"]


def _sum_macro():
    u = _one("/ust_yields?select=trade_date,y10&order=trade_date.desc&limit=1")
    v = _one("/index_history?select=trade_date,close&code=eq.vixtwn&order=trade_date.desc&limit=1")
    l1 = f"美 10 年債 {u['y10']}%" if u else "美債待更新"
    l2 = f"VIX {v['close']}（{_md(v['trade_date'])}）" if v else "VIX 待更新"
    return [l1, l2]


def _sum_risk():
    m = _one("/margin_maintenance?select=trade_date,maintenance_ratio&exclude_etf=eq.false&order=trade_date.desc&limit=1")
    b = _one("/breadth_daily?select=trade_date,ma20_pct&market=eq.tse&order=trade_date.desc&limit=1")
    l1 = f"融資維持率 {m['maintenance_ratio']}%" if m else "維持率待更新"
    l2 = f"站上月線 {b['ma20_pct']}%" if b else "廣度待更新"
    return [l1, l2]


def _sum_etf():
    nav = _req("/etf_products?select=code&nav=not.is.null&limit=1000") or []
    p = _one("/etf_products?select=data_date&order=data_date.desc.nullslast&limit=1")
    return [f"淨值 {len(nav)} 檔", f"資料日 {_md((p or {}).get('data_date'))}"]


def _sum_data():
    rows = _req("/page_cache?select=kind,updated_at&kind=in.(overview,themes,sectors,themeall,sectorall)") or []
    today = _now().date()
    fresh = sum(1 for r in rows if dt.datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00")).astimezone(TZ).date() == today)
    left = backfill_left()
    l2 = f"上櫃回補剩 {left:,} 筆" if left else "上櫃回補完成"
    return [f"快照 {fresh}/5 今日更新", l2]


def backfill_left():
    """讀兩個回補程式最後一行「累計 a/b」估剩餘量（不掃資料庫，快）。"""
    left = 0
    for w in (0, 1):
        f = HERE / f"otc_backfill_w{w}.log"
        if not f.exists():
            continue
        tail = f.read_text(encoding="utf-8", errors="replace").splitlines()[-30:]
        for line in reversed(tail):
            m = re.search(r"累計 (\d+)/(\d+)", line)
            if m:
                left += max(0, int(m.group(2)) - int(m.group(1)))
                break
            if "全部完成" in line:
                break
    return left


SUMMARY = {"news": _sum_news, "chip": _sum_chip, "tech": _sum_tech, "macro": _sum_macro,
           "risk": _sum_risk, "etf": _sum_etf, "data": _sum_data}


def summarize(agent):
    fn = SUMMARY.get(agent)
    return fn() if fn else None


def set_activity(agent, status, current=None, bubble=None):
    """背景工作（例：上櫃分點回補）回報目前狀態；不新增步驟紀錄。"""
    try:
        st = _get(agent)
        today = _now().date().isoformat()
        if st.get("date") != today:
            st = {"agent": agent, "name": AGENTS.get(agent, agent), "date": today, "steps": [],
                  "bubble": st.get("bubble") or []}
        if st.get("status") != status or st.get("current") != current:
            st["since"] = _now().isoformat(timespec="seconds")
        st["status"], st["current"] = status, current
        if bubble:
            st["bubble"] = bubble
        st["heartbeat"] = _now().isoformat(timespec="seconds")
        _put(agent, st)
    except Exception as e:                                  # noqa: BLE001
        print(f"[office] 狀態回報失敗：{type(e).__name__}", flush=True)


def init_all(reset=False):
    """初始化／重設所有角色：補上泡泡摘要；reset=True 清掉今天的步驟紀錄（測試後用）。"""
    for a in AGENTS:
        st = {} if reset else _get(a)
        if not st or reset:
            st = {"agent": a, "name": AGENTS[a], "date": _now().date().isoformat(), "steps": [],
                  "status": "idle", "current": None, "since": _now().isoformat(timespec="seconds")}
        try:
            st["bubble"] = summarize(a) or st.get("bubble") or []
        except Exception:                                   # noqa: BLE001
            pass
        _put(a, st)
        print(a, st.get("status"), st.get("bubble"))


if __name__ == "__main__":
    if "--init" in sys.argv or "--reset" in sys.argv:
        init_all(reset="--reset" in sys.argv)
        sys.exit(0)
    # 手動檢查：python office_report.py  → 印出每個角色目前的泡泡摘要（不寫入）
    for a in AGENTS:
        try:
            print(a, summarize(a))
        except Exception as e:                              # noqa: BLE001
            print(a, "ERR", type(e).__name__, e)
