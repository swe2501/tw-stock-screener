"""
job_health.py — 每日排程健康檢查（跑在 run_daily_job.bat 最後一步）。

爬蟲已有每股逾時+重建分頁,不會再無限卡死;但若 wantgoo 限流/異常導致大量股票逾時,
或整批中途失敗(例如瀏覽器無法啟動),你該早點知道。本腳本檢查今天的 daily_job.log:
  1) 今天沒有「本次完成」紀錄 → 爬蟲中途失敗/沒跑完
  2) 今天「逾時/失敗」股票數 > 門檻 → wantgoo 可能限流/異常
有問題就透過 Vercel /api/alert?kind=health 寄 Email(本機無 Resend key,故走雲端)。
無問題則安靜(不寄信)。
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

LOG = Path(__file__).resolve().parent / "daily_job.log"
PROD_ALERT = "https://tw-stock-screener-neon.vercel.app/api/alert?kind=health"
WARN_THRESHOLD = 30   # 今日逾時/失敗股票數超過此值就警示（正常應個位數）


def main():
    env = bs._load_env()
    today = date.today().isoformat()
    if not LOG.exists():
        print("[health] 無 daily_job.log,略過"); return
    lines = [l for l in LOG.read_text(encoding="utf-8", errors="replace").splitlines()
             if l.startswith(f"[{today}]")]
    if not lines:
        print("[health] 今天沒有排程紀錄（非交易日或未觸發），略過"); return

    warns = [l for l in lines if "[warn]" in l]
    done = [l for l in lines if "本次完成" in l]
    processed = None
    if done:
        m = re.search(r"處理 (\d+) 支", done[-1])
        processed = int(m.group(1)) if m else None

    problems = []
    if not done:
        problems.append("爬蟲今天沒有「本次完成」紀錄 → 可能中途失敗/沒跑完（例：瀏覽器無法啟動）")
    if len(warns) > WARN_THRESHOLD:
        problems.append(f"爬蟲逾時/失敗 {len(warns)} 支（門檻 {WARN_THRESHOLD}）→ wantgoo 可能限流/異常")

    if not problems:
        print(f"[health] 今日排程正常（處理 {processed} 支、逾時/失敗 {len(warns)} 支）"); return

    msg = (f"日期：{today}\n\n偵測到問題：\n" + "\n".join("• " + p for p in problems)
           + f"\n\n本次處理：{processed} 支\n逾時/失敗：{len(warns)} 支\n完成紀錄：{'有' if done else '無'}"
           + "\n\n建議：檢查 wantgoo 登入/網路;必要時手動執行 backfill_gaps.py 補齊資料。")
    print("[health] 偵測到問題,寄警示：" + msg.replace("\n", " | "))

    key = env.get("SUPABASE_SERVICE_KEY", "")
    payload = json.dumps({"kind": "health", "subject": f"⚠️【排程健康警示】{today}", "message": msg}).encode()
    req = urllib.request.Request(PROD_ALERT, data=payload, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"[health] 已寄警示 Email（HTTP {r.status}）")
    except Exception as e:
        print(f"[health] 寄警示失敗：{e}")


if __name__ == "__main__":
    main()
