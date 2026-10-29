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
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

LOG = Path(__file__).resolve().parent / "daily_job.log"
PROD_ALERT = "https://tw-stock-screener-neon.vercel.app/api/alert?kind=health"
WARN_THRESHOLD = 30   # 今日逾時/失敗股票數超過此值就警示（正常應個位數）


SNAP_KINDS = ("sectors", "themes", "overview", "themeall", "sectorall")   # 每個 kind 只有一列
VERSIONED_KINDS = ("focus", "limitup")                                    # kind__<版本> 多列，取最新


def _snapshot_problems(env):
    """2026-10-29 快照比股價舊就警示（今日焦點 10/23~10/28 默默沒更新的教訓）。"""
    out = []
    try:
        _, pw = bs._sb(env, "/price_window", params=[("select", "trade_date"), ("code", "eq.2330"),
                                                     ("order", "trade_date.desc"), ("limit", "1")])
        latest = str(pw[0]["trade_date"]) if pw else None
        if not latest:
            return ["讀不到 price_window 最新日期"]
        for k in SNAP_KINDS + VERSIONED_KINDS:
            flt = ("kind", f"eq.{k}") if k in SNAP_KINDS else ("kind", f"like.{k}__*")
            _, rows = bs._sb(env, "/page_cache", params=[flt, ("select", "trade_date"),
                                                         ("order", "updated_at.desc"), ("limit", "1")])
            td = str(rows[0].get("trade_date") or "") if isinstance(rows, list) and rows else ""
            if td < latest:
                out.append(f"網頁快照 {k} 停在 {td or '無'}（股價已到 {latest}）")
    except Exception as e:                                      # noqa: BLE001
        out.append(f"快照檢查失敗：{type(e).__name__}")
    return out


def _office_problems():
    """2026-10-29 研究室：20 小時內失敗且沒有重跑成功的步驟。"""
    out = []
    try:
        import office_report as office
        for a, name in office.AGENTS.items():
            f = office._unresolved_failures((office._get(a) or {}).get("steps") or [])
            if f:
                out.append(f"{name}：{'、'.join(f)} 失敗")
    except Exception as e:                                      # noqa: BLE001
        out.append(f"研究室檢查失敗：{type(e).__name__}")
    return out


def main():
    env = bs._load_env()
    # 2026-10-29 夜間排程通常跑過午夜才到這步，用「今天」會找不到昨晚紀錄而每次略過 → 今天沒有就看昨天
    today = date.today().isoformat()
    all_lines = LOG.read_text(encoding="utf-8", errors="replace").splitlines() if LOG.exists() else []
    lines = []
    for d in (today, (date.today() - timedelta(days=1)).isoformat()):
        lines = [l for l in all_lines if l.startswith(f"[{d}]")]
        if lines:
            today = d
            break

    warns = [l for l in lines if "[warn]" in l]
    done = [l for l in lines if "本次完成" in l]
    processed = None
    if done:
        m = re.search(r"處理 (\d+) 支", done[-1])
        processed = int(m.group(1)) if m else None

    problems = []
    if lines and not done:
        problems.append("爬蟲今天沒有「本次完成」紀錄 → 可能中途失敗/沒跑完（例：瀏覽器無法啟動）")
    if len(warns) > WARN_THRESHOLD:
        problems.append(f"爬蟲逾時/失敗 {len(warns)} 支（門檻 {WARN_THRESHOLD}）→ wantgoo 可能限流/異常")
    problems += _snapshot_problems(env)
    problems += _office_problems()

    if not problems:
        print(f"[health] {today} 排程正常（處理 {processed} 支、逾時/失敗 {len(warns)} 支、快照皆為最新）"); return

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
