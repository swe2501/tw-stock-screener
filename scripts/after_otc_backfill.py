"""
after_otc_backfill.py - 上櫃分點回補（otc_backfill.py）全部結束後，自動全量重算主力分點排行（2026-10-24 用戶指示）

流程：
  1. 每 10 分鐘檢查一次：還有 otc_backfill.py 在跑就繼續等
  2. 都結束後看剩餘量（otc_backfill._plan）：
     - 剩餘 ≤ 2000（檔×日）→ 視為補完，跑 broker_rankings.py（全量重算名次＋明細＋買賣訊號，上傳 Supabase）
     - 剩太多（程式中途當掉、登入失效等）→ 不重算，寫警告到 log，等人處理
  3. 避開夜間排程時段（18:50–23:30）才開始重算
紀錄：scripts/after_otc_backfill.log
"""
import json
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
LOG = HERE / "after_otc_backfill.log"
PY = sys.executable
LEFT_OK = 2000


def log(msg):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def backfill_running():
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "(Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | "
         "Where-Object { $_.CommandLine -like '*otc_backfill.py*' -and $_.CommandLine -notlike '*--status*' "
         "-and $_.CommandLine -notlike '*after_otc_backfill*' }).Count"],   # 2026-10-27 排除自己（檔名也含 otc_backfill.py，原本會永遠等不到 0）
        capture_output=True, text=True, timeout=60).stdout.strip()
    try:
        return int(out or 0)
    except ValueError:
        return 1


def remaining():
    import otc_backfill as ob
    import wantgoo_scraper as ws
    conn = sqlite3.connect(f"file:{ws.LOCAL_DB_PATH}?mode=ro", uri=True, timeout=300)
    codes = sorted(json.load(open(ob.OTC_NAMES, encoding="utf-8")).keys())
    plans = ob._plan(conn, codes, ob._done_set())
    return sum(len(d) for _, d in plans)


def in_nightly_window():
    hm = (datetime.now().hour, datetime.now().minute)
    return (18, 50) <= hm < (23, 30)


def main():
    log("開始等待上櫃分點回補結束")
    try:
        import office_report as office            # AI 研究室：資料管理員回報回補進度（失敗不影響）
    except Exception:                             # noqa: BLE001
        office = None
    while True:
        n = backfill_running()
        if n == 0:
            break
        if office:
            office.set_activity("data", "work", "上櫃分點回補",
                                [f"上櫃回補剩 {office.backfill_left():,} 筆", f"{n} 個回補程式執行中"])
        time.sleep(600)
    left = remaining()
    log(f"回補程式已全部結束；剩餘未補 {left}（檔×日）")
    if office:
        office.set_activity("data", "done" if left <= LEFT_OK else "stuck", None if left <= LEFT_OK else "上櫃分點回補",
                            [f"上櫃回補剩 {left:,} 筆", "回補程式已結束"])
    if left > LEFT_OK:
        log(f"[warn] 剩餘 {left} > {LEFT_OK}，判定回補沒有跑完（可能中途當掉或登入失效），不重算排行。"
            "處理方式：重新啟動 otc_backfill.py --worker 0/1 --workers 2，補完後再跑本程式。")
        return
    while in_nightly_window():
        log("夜間排程時段，等到 23:30 再重算")
        time.sleep(600)
    log("開始全量重算主力分點排行（broker_rankings.py）")
    r = subprocess.run([PY, str(HERE / "broker_rankings.py")], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
    for line in (r.stdout or "").splitlines()[-15:]:
        log("  " + line)
    if r.returncode != 0:
        log(f"[error] broker_rankings.py 失敗（exit {r.returncode}）：{(r.stderr or '')[-800:]}")
        return
    log("重算完成（排行、出手明細、買賣訊號已上傳）")


if __name__ == "__main__":
    main()
