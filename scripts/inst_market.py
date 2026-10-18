"""
inst_market.py — §1 現貨三大法人「市場合計」(上市)。
資料源：TWSE BFI82U(三大法人買賣金額統計表)。買賣差為元。
  外資 = 外資及陸資(不含外資自營) + 外資自營
  投信 = 投信
  自營 = 自營商(自行買賣) + 自營商(避險)
  合計 = 合計列
→ Supabase inst_market_daily(trade_date PK, 累積)。
用法：python scripts/inst_market.py [--days N]   # 預設最近交易日
"""
import ssl, sys, json, argparse, urllib.request
from datetime import datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl._create_unverified_context()


def _num(s):
    try:
        return int(str(s).replace(",", "").strip())
    except Exception:
        return 0


def _twse(ds):
    url = f"https://www.twse.com.tw/fund/BFI82U?response=json&dayDate={ds}&type=day"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0",
                                               "Referer": "https://www.twse.com.tw/"})
    with urllib.request.urlopen(req, timeout=30, context=_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def _compute(ds):
    j = _twse(ds)
    if j.get("stat") != "OK":
        return None
    f = t = d = tot = 0
    for row in (j.get("data") or []):
        name, diff = str(row[0]), _num(row[3])
        if "合計" in name:
            tot = diff
        elif "外資" in name:
            f += diff
        elif "投信" in name:
            t += diff
        elif "自營" in name:
            d += diff
    return {"trade_date": f"{ds[:4]}-{ds[4:6]}-{ds[6:]}",
            "foreign_net": f, "trust_net": t, "dealer_net": d, "total_net": tot}


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/inst_market_daily?on_conflict=trade_date"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--days", type=int, default=1); a = ap.parse_args()
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    rows, tried, d = [], 0, datetime.now()
    while tried < a.days + 8 and len(rows) < a.days:
        ds = d.strftime("%Y%m%d")
        try:
            r = _compute(ds)
            if r:
                rows.append(r)
                print(f"  {r['trade_date']}: 外資 {r['foreign_net']/1e8:.1f}億 投信 {r['trust_net']/1e8:.1f}億 "
                      f"自營 {r['dealer_net']/1e8:.1f}億 合計 {r['total_net']/1e8:.1f}億")
        except Exception as e:
            print(f"  {ds} err: {str(e)[:70]}")
        d -= timedelta(days=1); tried += 1
    if not rows:
        print("[warn] 無資料"); return
    print(f"已 upsert {len(rows)} 天到 inst_market_daily (status {_upsert(env, rows)})")


if __name__ == "__main__":
    main()
