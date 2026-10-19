"""
upload_slogan.py — 上傳每日首頁 slogan(兩段式投資智慧,風格如「先看資金／再看故事」)。
由每日排程呼叫:python scripts/upload_slogan.py "第一段" "第二段"
→ Supabase daily_slogan(date PK)。首頁 loadSlogan() 讀最新一筆。
"""
import sys, json, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def main():
    if len(sys.argv) < 3:
        print('用法: python scripts/upload_slogan.py "第一段" "第二段"'); sys.exit(1)
    line1, line2 = sys.argv[1].strip(), sys.argv[2].strip()
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    today = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    row = {"date": today, "line1": line1, "line2": line2}
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/daily_slogan?on_conflict=date"
    req = urllib.request.Request(url, data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"[ok] {today}｜{line1}，{line2}。 (status {r.status})")


if __name__ == "__main__":
    main()
