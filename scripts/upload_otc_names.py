"""
upload_otc_names.py — 把上櫃名單中「主檔還沒有的代號」補進 Supabase 正規化主檔 security_master：
  1. 上櫃股票：D:\\stock_data\\otc_names.json（fetch_prices_otc.py 產生）→ market=otc、instrument_type=stock、source=otc_names
  2. 上櫃 ETF（00 開頭，例：00679B 債券 ETF）：櫃買中心 tpex_mainboard_daily_close_quotes → market=otc、instrument_type=etf、source=tpex_etf
     （2026-11-01 起；原本網站每次另抓 /api/screen?stat=otcetf 拼名單，現在統一由主檔提供）

2026-11-01 正規化：舊 otc_names 表已刪除、改成從 security_master 即時讀的唯讀 view（前端／App 照舊可讀）。
主檔的股名以 stock_fundamentals／etf_products 為準（refresh_security_master 觸發器維護）；這支只補
基本資料表還沒涵蓋的代號，已存在的不覆寫。

用法：python scripts/upload_otc_names.py
"""
import json, ssl, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

OTC_NAMES = Path(r"D:\stock_data\otc_names.json")
TPEX_QUOTES = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"


def _otc_etfs():
    """櫃買中心當日收盤行情中的 ETF（00 開頭）→ {code: name}；失敗回空（下次再補）。"""
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(TPEX_QUOTES, headers={"User-Agent": "Mozilla/5.0"})
        rows = json.loads(urllib.request.urlopen(req, timeout=30, context=ctx).read().decode("utf-8-sig"))
    except Exception as e:                                   # noqa: BLE001
        print(f"[warn] 櫃買 ETF 名單取得失敗：{type(e).__name__}")
        return {}
    out = {}
    for r in rows:
        c, n = str(r.get("SecuritiesCompanyCode", "")).strip(), str(r.get("CompanyName", "")).strip()
        if c.startswith("00") and n:
            out[c] = n
    return out


def _upsert(env, key, rows):
    url = f"{env['SUPABASE_URL']}/rest/v1/security_master?on_conflict=code"
    ok = 0
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(url, data=json.dumps(rows[i:i+500]).encode(), method="POST", headers={
            "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "resolution=ignore-duplicates,return=minimal"})   # 已有的代號不動（以基本資料為準）
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status in (200, 201):
                ok += len(rows[i:i+500])
    return ok


def main():
    env = bs._load_env()
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    if not OTC_NAMES.exists():
        print(f"[error] 找不到 {OTC_NAMES}（請先跑 fetch_prices_otc.py）"); sys.exit(1)

    names = json.loads(OTC_NAMES.read_text(encoding="utf-8"))
    rows = [{"code": c, "current_name": n, "market": "otc", "instrument_type": "stock", "source": "otc_names"}
            for c, n in names.items() if c and n and not c.startswith("00")]
    ok = _upsert(env, key, rows)
    print(f"上櫃股票：比對 {ok}/{len(rows)} 檔，主檔缺的已補進 security_master")
    etfs = _otc_etfs()
    erows = [{"code": c, "current_name": n, "market": "otc", "instrument_type": "etf", "source": "tpex_etf"}
             for c, n in etfs.items()]
    if erows:
        ok = _upsert(env, key, erows)
        print(f"上櫃 ETF：比對 {ok}/{len(erows)} 檔，主檔缺的已補進 security_master")


if __name__ == "__main__":
    main()
