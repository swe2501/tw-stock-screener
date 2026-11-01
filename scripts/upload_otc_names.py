"""
upload_otc_names.py — 把 D:\\stock_data\\otc_names.json（上櫃 代號→名稱）中「主檔還沒有的代號」補進
Supabase 正規化主檔 security_master（market=otc、instrument_type=stock、source=otc_names）。

2026-11-01 正規化：舊 otc_names 表已刪除、改成從 security_master 即時讀的唯讀 view（前端／App 照舊可讀）。
主檔的股名以 stock_fundamentals／etf_products 為準（refresh_security_master 觸發器維護）；這支只補
基本資料表還沒涵蓋的新上櫃股（例：新上市初期），已存在的代號不覆寫。

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
    rows = [{"code": c, "current_name": n, "market": "otc", "instrument_type": "stock", "source": "otc_names"}
            for c, n in names.items() if c and n]
    url = f"{env['SUPABASE_URL']}/rest/v1/security_master?on_conflict=code"
    ok = 0
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(url, data=json.dumps(rows[i:i+500]).encode(), method="POST", headers={
            "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "resolution=ignore-duplicates,return=minimal"})   # 已有的代號不動（以基本資料為準）
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status in (200, 201):
                ok += len(rows[i:i+500])
    print(f"已比對 {ok}/{len(rows)} 檔上櫃股名，主檔缺的已補進 security_master")


if __name__ == "__main__":
    main()
