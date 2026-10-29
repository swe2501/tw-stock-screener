"""
boss_runner.py — AI 研究室「總管」的本機助手（2026-10-30；Windows 工作排程器 BossRunner 每 5 分鐘）

雲端總管看不到這台電腦，也不能直接動它，所以由這支在本機做兩件事：
  1) 心跳：讀 Windows 工作排程器各任務的狀態／上次結果，寫 admin_settings boss:local
  2) 執行重跑：讀 boss:queue 的待辦，依 lib/boss.py 白名單「再檢查一次」後才執行
     - task：schtasks /Run 啟動整個排程任務（立即返回）
     - step：經 office_step.py 打卡執行夜間排程的單一步驟（等它跑完，記下結束碼）
     夜間主排程（WantgooDailyScrape）執行中時，step 先不跑（留在排隊），避免搶資源；排超過 6 小時就作廢。
任何錯誤只印到紀錄檔，不影響其他排程。輸出：scripts\\boss_runner.log（由 run_boss_runner.bat 轉向）
"""
import datetime as dt
import json
import shlex
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
from lib import boss                  # noqa: E402
import broker_signals as bs           # noqa: E402  # _load_env

if sys.stdout and hasattr(sys.stdout, "reconfigure"):  # pythonw 下 sys.stdout 是 None
    sys.stdout.reconfigure(errors="replace")

TASK_NAMES = ["WantgooDailyScrape", "AI_stock_Intraday", "CodexHotTopicsHourly", "AI_stock_news_feed",
              "AI_stock_margin_catchup", "AI_stock_taifex_catchup", "BrokerRankingsWeekly"]
STEP_TIMEOUT = 60 * 60
NO_WINDOW = 0x08000000


def log(msg):
    print(f"[{boss.now():%m-%d %H:%M:%S}] {msg}", flush=True)


def task_info():
    ps = ("$ErrorActionPreference='SilentlyContinue';"
          "Get-ScheduledTask -TaskName " + ",".join(TASK_NAMES) + " | ForEach-Object {"
          " $i = $_ | Get-ScheduledTaskInfo;"
          " [pscustomobject]@{name=$_.TaskName; state=[string]$_.State;"
          " last_run=$(if($i.LastRunTime){$i.LastRunTime.ToString('s')}else{$null});"
          " result=[int64]$i.LastTaskResult;"
          " next_run=$(if($i.NextRunTime){$i.NextRunTime.ToString('s')}else{$null})} } | ConvertTo-Json -Compress")
    out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                         capture_output=True, timeout=120, creationflags=NO_WINDOW)
    txt = out.stdout.decode("utf-8", "replace").strip()
    if not txt:
        return []
    data = json.loads(txt)
    return data if isinstance(data, list) else [data]


def heartbeat(base, key):
    tasks = []
    try:
        tasks = task_info()
    except Exception as e:                                  # noqa: BLE001
        log(f"讀工作排程失敗：{type(e).__name__} {e}")
    disk = None
    try:
        import shutil
        disk = round(shutil.disk_usage("D:\\").free / 1e9, 1)
    except Exception:                                       # noqa: BLE001
        pass
    boss.put_setting(base, key, "boss:local", {"ts": boss.now().isoformat(timespec="seconds"),
                                               "tasks": tasks, "disk_free_gb_D": disk})
    return {t["name"]: t for t in tasks}


def _save(base, key, q):
    q["items"] = (q.get("items") or [])[-40:]
    boss.put_setting(base, key, "boss:queue", q)


def run_queue(base, key, tasks):
    q = boss.get_setting(base, key, "boss:queue", {}) or {}
    items = q.get("items") or []
    nightly = (tasks.get("WantgooDailyScrape") or {}).get("state") == "Running"
    for it in items:
        if it.get("status") != "pending":
            continue
        ref = boss.now()
        age_h = (ref - dt.datetime.fromisoformat(it["requested_at"])).total_seconds() / 3600
        ok, why, spec = boss.check_job(it.get("job"), ref)
        if not ok:
            it.update(status="rejected", result=why, finished_at=ref.isoformat(timespec="seconds"))
            _save(base, key, q)
            log(f"拒絕 {it.get('job')}：{why}")
            continue
        if spec["type"] == "task":
            if (tasks.get(spec["task"]) or {}).get("state") == "Running":
                it.update(status="rejected", result="該排程正在執行中", finished_at=ref.isoformat(timespec="seconds"))
            else:
                r = subprocess.run(["schtasks", "/Run", "/TN", spec["task"]], capture_output=True,
                                   timeout=60, creationflags=NO_WINDOW)
                ok2 = r.returncode == 0
                it.update(status="done" if ok2 else "failed",
                          result="已啟動排程 " + spec["task"] if ok2 else f"啟動失敗 code {r.returncode}",
                          finished_at=boss.now().isoformat(timespec="seconds"))
            _save(base, key, q)
            log(f"{it['job']} → {it['status']}：{it['result']}")
            continue
        # step
        if nightly:
            if age_h > 6:
                it.update(status="expired", result="夜間排程一直在跑，排超過 6 小時作廢",
                          finished_at=ref.isoformat(timespec="seconds"))
                _save(base, key, q)
            continue                                        # 等夜間排程跑完再說
        parts = shlex.split(spec["cmd"])
        cmd = [sys.executable, str(HERE / "office_step.py"), spec["agent"], str(HERE / parts[0])] + parts[1:]
        it.update(status="running", started_at=ref.isoformat(timespec="seconds"))
        _save(base, key, q)
        log(f"執行 {spec['cmd']}（{it.get('reason')}）")
        try:
            r = subprocess.run(cmd, cwd=str(HERE), timeout=STEP_TIMEOUT, creationflags=NO_WINDOW)
            code = r.returncode
        except subprocess.TimeoutExpired:
            code = "timeout"
        it.update(status="done" if code == 0 else "failed", result=f"結束碼 {code}",
                  finished_at=boss.now().isoformat(timespec="seconds"))
        # 跑很久期間可能有新申請進來：重讀後只更新這一筆
        fresh = boss.get_setting(base, key, "boss:queue", {}) or {}
        fi = fresh.get("items") or []
        for x in fi:
            if x.get("id") == it["id"]:
                x.update({k: it[k] for k in ("status", "result", "started_at", "finished_at")})
        q = fresh
        _save(base, key, q)
        log(f"{spec['cmd']} → {it['status']}（{it['result']}）")
        return                                              # 一次只跑一個 step，下一輪（5 分鐘後）再接


def _self_log():
    """--log：由工作排程器用 pythonw（不跳黑色視窗）啟動時，自己把輸出接到 boss_runner.log，並先修剪成只留 7 天。"""
    lp = HERE / "boss_runner.log"
    try:
        subprocess.run([sys.executable, str(HERE / "trim_log.py"), str(lp), "7"], capture_output=True,
                       timeout=60, creationflags=NO_WINDOW)
    except Exception:                                       # noqa: BLE001
        pass
    f = open(lp, "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = f


def main():
    if "--log" in sys.argv:
        _self_log()
    print(f"==== {boss.now():%Y-%m-%d %H:%M:%S} boss_runner ====", flush=True)   # trim_log.py 依這行修剪
    env = bs._load_env()
    base, key = env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]
    tasks = {}
    try:
        tasks = heartbeat(base, key)
    except Exception as e:                                  # noqa: BLE001
        log(f"心跳失敗：{type(e).__name__} {e}")
    try:
        run_queue(base, key, tasks)
    except Exception as e:                                  # noqa: BLE001
        log(f"處理重跑失敗：{type(e).__name__} {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
