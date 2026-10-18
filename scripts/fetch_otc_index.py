"""
fetch_otc_index.py — 抓「櫃買指數」(TPEx 加權股價指數) 日 OHLC → Supabase otc_index_daily。
供上櫃個股貪婪分數的 RS(超額報酬)以「櫃買指數」為大盤基準（比照上市用加權 taiex_daily）。

資料源：TPEx 新站 https://www.tpex.org.tw/www/zh-tw/indexInfo/inx  (POST date=YYYY/MM/01)
  回 {tables:[{fields:[日期,開市,最高,最低,收市,漲/跌], data:[["2026/08/03","349.29",...,"362.89","15.04"],...]}]}
  日期為西元 YYYY/MM/DD；收市=第5欄。TPEx 有 WAF 但此 www AJAX 端點本機可存取。

用法：
  python scripts/fetch_otc_index.py                 # 回補近 8 個月
  python scripts/fetch_otc_index.py --months 12     # 回補近 N 個月
  python scripts/fetch_otc_index.py --daily         # 只更新當月
表 otc_index_daily：trade_date(text pk), open/high/low/close(double)；RLS anon 可讀。
"""
import argparse, json, ssl, sys, time, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_TW = timezone(timedelta(hours=8))
URL = "https://www.tpex.org.tw/www/zh-tw/indexInfo/inx"
_HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://www.tpex.org.tw/zh-tw/indices/stock-index/industrial/inxh.html"}


def _num(s):
    s = str(s).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _fetch_month(y, m):
    body = f"date={y}/{m:02d}/01&response=json".encode()
    req = urllib.request.Request(URL, data=body, headers=_HDR)
    d = json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())
    tables = d.get("tables") or []
    if not tables:
        return []
    out = []
    for row in (tables[0].get("data") or []):
        # [日期(西元 YYYY/MM/DD), 開市, 最高, 最低, 收市, 漲/跌]
        dd = str(row[0]).strip().replace("/", "-")
        c = _num(row[4]) if len(row) > 4 else None
        if not dd or c is None:
            continue
        o = _num(row[1]) or c; hi = _num(row[2]) or c; lo = _num(row[3]) or c
        out.append({"trade_date": dd, "open": o, "high": hi, "low": lo, "close": c})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=8)
    ap.add_argument("--daily", action="store_true")
    args = ap.parse_args()
    env = bs._load_env()
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    now = datetime.now(_TW)
    n = 1 if args.daily else args.months
    months = []
    y, m = now.year, now.month
    for _ in range(n):
        months.append((y, m))
        m -= 1
        if m == 0:
            y -= 1; m = 12

    rows = []
    for (yy, mm) in months:
        try:
            r = _fetch_month(yy, mm)
            rows.extend(r)
            print(f"  {yy}/{mm:02d}: {len(r)} 列")
        except Exception as e:
            print(f"  {yy}/{mm:02d} 失敗: {str(e)[:60]}")
        time.sleep(1.0)
    # 去重（同日取後者）
    dedup = {r["trade_date"]: r for r in rows}
    rows = [dedup[k] for k in sorted(dedup)]
    if not rows:
        print("[warn] 無資料"); return

    url = f"{env['SUPABASE_URL']}/rest/v1/otc_index_daily?on_conflict=trade_date"
    ok = 0
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(url, data=json.dumps(rows[i:i+500]).encode(), method="POST", headers={
            "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=60) as rr:
            if rr.status in (200, 201):
                ok += len(rows[i:i+500])
    print(f"已上傳 {ok} 列櫃買指數到 otc_index_daily（{rows[0]['trade_date']}~{rows[-1]['trade_date']}）")


if __name__ == "__main__":
    main()
