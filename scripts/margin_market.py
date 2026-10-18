"""
margin_market.py — 全市場融資融券餘額(上市) + 供「融資動能背離」用的歷史序列。
資料源：TWSE MI_MARGN?selectType=MS(信用交易統計)
  融資(交易單位=張)  前日/今日餘額
  融資金額(仟元)      買進/賣出/前日餘額/今日餘額  ← 融資餘額金額(=合夥人 5,838.78億)
  融券(交易單位=張)  前日/今日餘額
→ Supabase margin_market(date PK, 累積)。
用法：python scripts/margin_market.py [--days N]   # 預設最近交易日；--days 回補歷史(算背離用)
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
        return None


def _twse(date_str):
    # 舊 /exchangeReport/MI_MARGN 已 307 轉址→改用新 rwd 路徑(TWSE 2026 起)
    url = f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={date_str}&selectType=MS&response=json"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0",
                                               "Referer": "https://www.twse.com.tw/"})
    with urllib.request.urlopen(req, timeout=30, context=_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def _compute(date_str):
    j = _twse(date_str)
    if j.get("stat") != "OK":
        return None
    data = []
    for t in (j.get("tables") or []):
        data = t.get("data") or []
        if data:
            break
    if len(data) < 3:
        return None
    fin_lots, short_lots, fin_amt = data[0], data[1], data[2]  # 融資(張)/融券(張)/融資金額(仟元)
    return {
        "date": f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}",
        "fin_bal_k": _num(fin_amt[5]), "fin_bal_prev_k": _num(fin_amt[4]),
        "fin_buy_k": _num(fin_amt[1]), "fin_sell_k": _num(fin_amt[2]),
        "fin_bal_lots": _num(fin_lots[5]),                       # 融資餘額(張),供券資比
        "short_bal_lots": _num(short_lots[5]), "short_bal_prev_lots": _num(short_lots[4]),
    }


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/margin_market?on_conflict=date"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1)
    args = ap.parse_args()
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    rows, tried, d = [], 0, datetime.now()
    while tried < args.days + 8 and len(rows) < args.days:
        ds = d.strftime("%Y%m%d")
        try:
            r = _compute(ds)
            if r:
                rows.append(r)
                print(f"  {r['date']}: 融資餘額 {r['fin_bal_k']/1e5:.2f}億  融券 {r['short_bal_lots']:,}張")
        except Exception as e:
            print(f"  {ds} err: {str(e)[:70]}")
        d -= timedelta(days=1); tried += 1

    if not rows:
        print("[warn] 無資料"); return
    st = _upsert(env, rows)
    print(f"已 upsert {len(rows)} 天到 margin_market (status {st})")


if __name__ == "__main__":
    main()
