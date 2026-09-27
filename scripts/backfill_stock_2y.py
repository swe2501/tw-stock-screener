"""
backfill_stock_2y.py — 上市＋上櫃個股回補約 2.2 年日K 到本機 stock_daily（供 stock_sr.py 分價量表 480 日用）。
來源：Yahoo Finance chart API（上市 .TW、上櫃 .TWO；quote 為未還原價、volume 為股數，與既有資料一致）。
只補缺的日期（insert or ignore），不覆蓋既有官方(TWSE/TPEx)資料；順便補齊漏抓的交易日。

代號來源：scripts/all_stocks.txt（上市）、D:\\stock_data\\otc_names.json（上櫃）。
用法：python scripts/backfill_stock_2y.py [--days 800] [--code 2330,6488]
"""
import argparse, json, sqlite3, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
ALL_STOCKS_FILE = Path(__file__).resolve().parent / "all_stocks.txt"
OTC_NAMES = Path(r"D:\stock_data\otc_names.json")
YF_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
TW_TZ = timezone(timedelta(hours=8))


def fetch(code, suffix, days):
    p2 = int(time.time()); p1 = p2 - days * 86400
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.{suffix}?interval=1d&period1={p1}&period2={p2}"
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=YF_HEADERS), timeout=20) as r:
                data = json.loads(r.read())
            r0 = data["chart"]["result"][0]
            ts = r0.get("timestamp") or []
            q = (r0["indicators"]["quote"] or [{}])[0]
            rows = []
            for i, t0 in enumerate(ts):
                c = q["close"][i]
                if c is None or not q["high"][i] or not q["low"][i]:
                    continue
                d = datetime.fromtimestamp(t0, tz=TW_TZ).strftime("%Y-%m-%d")
                rows.append((code, d, q["open"][i], q["high"][i], q["low"][i], c, int(q["volume"][i] or 0)))
            return rows
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            time.sleep(3 * (t + 1))
        except Exception:
            time.sleep(3 * (t + 1))
    print(f"  [warn] {code}.{suffix} 抓取失敗")
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=800)
    ap.add_argument("--code")
    args = ap.parse_args()
    twse = [l.strip() for l in ALL_STOCKS_FILE.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    otc = list(json.loads(OTC_NAMES.read_text(encoding="utf-8")).keys()) if OTC_NAMES.exists() else []
    todo = [(c, "TW", "twse") for c in twse] + [(c, "TWO", "otc") for c in otc]
    if args.code:
        want = set(args.code.split(","))
        todo = [x for x in todo if x[0] in want]
    conn = sqlite3.connect(str(DB_PATH)); conn.execute("pragma busy_timeout = 60000")
    added = 0
    for i, (code, sfx, mkt) in enumerate(todo, 1):
        rows = fetch(code, sfx, args.days)
        if rows:
            before = conn.total_changes
            conn.executemany("insert or ignore into stock_daily (code,trade_date,open,high,low,close,volume,market) "
                             f"values (?,?,?,?,?,?,?,'{mkt}')", rows)
            conn.commit(); added += conn.total_changes - before
        if i % 100 == 0:
            print(f"[{i}/{len(todo)}] 新增 {added:,} 筆", flush=True)
        time.sleep(0.3)
    print(f"完成：{len(todo)} 支，新增 {added:,} 筆")


if __name__ == "__main__":
    main()
