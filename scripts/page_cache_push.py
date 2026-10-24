"""
page_cache_push.py — 把「產業地圖／題材列表」整頁資料先算好存進 Supabase page_cache，前端直接讀表。

做法：呼叫正式站既有的彙整端點（/api/screen?stat=sectors、stat=themes，算法不變），
驗證有內容後覆寫 page_cache 對應的那一列（每個 kind 只留 1 列）。
排在每日排程尾端（price_window 等上傳完之後）執行。

用法：python scripts/page_cache_push.py
"""
import datetime
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

API = "https://tw-stock-screener-neon.vercel.app/api/screen?stat="
# kind -> 驗證函式（回傳 True 才寫入，避免把錯誤或空資料蓋掉昨天的好資料）
KINDS = {
    "sectors": lambda d: isinstance(d.get("sectors"), list) and len(d["sectors"]) >= 10,
    "themes": lambda d: isinstance(d.get("listed"), list) and len(d["listed"]) >= 5,
    "overview": lambda d: bool(d.get("date")) and isinstance(d.get("turnover"), list),           # 今日焦點總覽/排行榜
    "themeall": lambda d: isinstance(d.get("themes"), dict) and len(d["themes"]) >= 10,           # 所有題材詳情（點題材秒開）
    "sectorall": lambda d: isinstance(d.get("sectors"), dict) and len(d["sectors"]) >= 10,        # 所有官方產業類指數成分股（點產業秒開）
}


_VALUE_RE = re.compile(r'"(tradeValue|value)": *[1-9]')
_VALUE_KINDS = ("themes", "overview", "themeall")   # 有成交值欄位的快照（sectors 本來就沒有、sectorall 另有來源）


def _has_values(kind, d):
    """成交值不能全為 0：行情抓失敗退回 price_window 時成交值全是 0，不可寫入覆蓋好資料（2026-10-24）。"""
    if kind not in _VALUE_KINDS:
        return True
    return bool(_VALUE_RE.search(json.dumps(d, ensure_ascii=False)))


def _get(kind, tries=3):
    last = None
    for i in range(tries):
        try:
            url = f"{API}{kind}&_={int(time.time())}"      # 帶時間戳避開 CDN 快取，拿當下現算的
            req = urllib.request.Request(url, headers={"User-Agent": "page-cache-push"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:                              # noqa: BLE001
            last = e
            time.sleep(5 * (i + 1))
    raise last


def main():
    env = bs._load_env()
    ok = 0
    for kind, valid in KINDS.items():
        try:
            d = _get(kind)
        except Exception as e:                              # noqa: BLE001
            print(f"[page_cache] {kind} 抓取失敗：{e}")
            continue
        if not isinstance(d, dict) or d.get("error") or not valid(d) or not _has_values(kind, d):
            print(f"[page_cache] {kind} 內容不完整或成交值全為 0，保留原資料不覆寫")
            continue
        td = str(d.get("date") or "").replace("/", "-")[:10] or None
        if td and len(td) == 8 and td.isdigit():
            td = f"{td[:4]}-{td[4:6]}-{td[6:]}"
        row = {"kind": kind, "trade_date": td, "payload": d,
               "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        bs._sb(env, "/page_cache", method="DELETE", params=[("kind", f"eq.{kind}")])
        st, _ = bs._sb(env, "/page_cache", method="POST", body=[row])
        size = len(json.dumps(d, ensure_ascii=False).encode("utf-8"))
        print(f"[page_cache] {kind} 寫入 status={st} 資料日={td} 大小={size // 1024}KB")
        ok += 1
    # 2026-10-21 uat 版快照：用 origin/uat 的後端程式在本機算，寫 <kind>@uat；uat 網站優先讀這份
    uat_ok = 0
    try:
        import env_screen as es
        us = es.load_screen("uat", env)
        funcs = {"sectors": us._fetch_sectors, "themes": us._fetch_themes, "overview": us._fetch_overview,
                 "themeall": us._fetch_theme_all, "sectorall": us._fetch_sector_all}
        for kind, valid in KINDS.items():
            if kind not in funcs:
                continue
            d = None
            # 2026-10-24 本機算 uat 版時證交所一時沒回應，程式會默默退回 price_window（無成交值、無上櫃、股名變代號），
            # 10/24 01:03 就寫進全是 0 的快照。改為檢查成交值，不合格就重新載入程式、隔 90 秒重算，最多 3 次。
            for attempt in range(3):
                try:
                    d = funcs[kind]()
                except Exception as e:                  # noqa: BLE001
                    print(f"[page_cache] {kind}@uat 計算失敗：{type(e).__name__}")
                    d = None
                if isinstance(d, dict) and not d.get("error") and valid(d) and _has_values(kind, d):
                    break
                print(f"[page_cache] {kind}@uat 內容不完整或成交值全為 0（第 {attempt + 1} 次），稍後重算")
                d = None
                if attempt < 2:
                    time.sleep(90)
                    es._cache.pop("uat", None)
                    us = es.load_screen("uat", env)
                    funcs = {"sectors": us._fetch_sectors, "themes": us._fetch_themes, "overview": us._fetch_overview,
                             "themeall": us._fetch_theme_all, "sectorall": us._fetch_sector_all}
            if d is None:
                print(f"[page_cache] {kind}@uat 重算 3 次仍不合格，保留原資料不覆寫")
                continue
            td = str(d.get("date") or "").replace("/", "-")[:10] or None
            if td and len(td) == 8 and td.isdigit():
                td = f"{td[:4]}-{td[4:6]}-{td[6:]}"
            k2 = es.kind_for(kind, "uat")
            row = {"kind": k2, "trade_date": td, "payload": d,
                   "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            bs._sb(env, "/page_cache", method="DELETE", params=[("kind", f"eq.{k2}")])
            st, _ = bs._sb(env, "/page_cache", method="POST", body=[row])
            print(f"[page_cache] {k2} 寫入 status={st} 資料日={td}")
            uat_ok += 1
    except Exception as e:                              # noqa: BLE001
        print(f"[page_cache] uat 版快照失敗（不影響正式站）：{type(e).__name__}: {e}")
    research_ok = False
    try:
        from groupbook_research_push import run as run_research
        run_research(env)
        research_ok = True
    except Exception as e:
        print(f"[page_cache] research failed; previous snapshot retained: {type(e).__name__}")
    focus_ok = False
    try:
        from focus_precompute import run as run_focus
        run_focus(env, "prod")
        focus_ok = True
    except Exception as e:
        print(f"[page_cache] focus failed; previous snapshot retained: {type(e).__name__}")
    try:
        run_focus(env, "uat")                           # uat 版失敗不影響正式站
    except Exception as e:
        print(f"[page_cache] focus@uat failed: {type(e).__name__}")
    groupbook_ok = False
    try:
        from groupbook_precompute import run
        run(env, env_name="prod")
        groupbook_ok = True
    except Exception as e:
        print(f"[page_cache] groupbook failed; previous snapshots retained: {type(e).__name__}")
    try:
        run(env, env_name="uat")
    except Exception as e:
        print(f"[page_cache] groupbook@uat failed: {type(e).__name__}")
    print(f"[page_cache] 完成 {ok}/{len(KINDS)}; groupbook={groupbook_ok}; uat版 {uat_ok}/{len(KINDS)}")
    return 0 if ok == len(KINDS) and groupbook_ok and focus_ok and research_ok else 1


if __name__ == "__main__":
    sys.exit(main())
