"""
upload_otc_names.py — 把 D:\\stock_data\\otc_names.json（上櫃 代號→名稱）灌到 Supabase otc_names 表，
供前端首頁搜尋（含上櫃、模糊、下拉）與搜尋/篩選結果的『上市/上櫃』市場別標註。

表結構（先在 Supabase SQL editor 建好）：
  create table otc_names(code text primary key, name text);
  enable row level security + policy anon_read_otc_names for select using(true);

用法：python scripts/upload_otc_names.py
"""
import json, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

OTC_NAMES = Path(r"D:\stock_data\otc_names.json")


def main():
    env = bs._load_env()
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    if not OTC_NAMES.exists():
        print(f"[error] 找不到 {OTC_NAMES}（請先跑 fetch_prices_otc.py）"); sys.exit(1)

    names = json.loads(OTC_NAMES.read_text(encoding="utf-8"))
    rows = [{"code": c, "name": n} for c, n in names.items()]
    url = f"{env['SUPABASE_URL']}/rest/v1/otc_names?on_conflict=code"
    ok = 0
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(url, data=json.dumps(rows[i:i+500]).encode(), method="POST", headers={
            "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status in (200, 201):
                ok += len(rows[i:i+500])
    print(f"已上傳 {ok}/{len(rows)} 檔上櫃股名到 otc_names")


if __name__ == "__main__":
    main()
