"""
抓全市場上市股一年日 K（開高低收量）存入本機 SQLite（D:\\stock_data\\wantgoo_full.db 的 stock_daily 表）。
供分點勝率分析使用。來源：Yahoo Finance（一支一請求）。

用法：
  python scripts/fetch_prices.py            # 回補/更新全部
  python scripts/fetch_prices.py --code 2330
"""
import argparse
import json
import sqlite3
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
ALL_STOCKS_FILE = Path(__file__).resolve().parent / "all_stocks.txt"
YF_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
TW_TZ = timezone(timedelta(hours=8))


def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        create table if not exists stock_daily (
            code       text not null,
            trade_date text not null,
            open real, high real, low real, close real,
            volume integer,
            primary key (code, trade_date)
        )
    """)
    conn.commit()
    return conn


def fetch_year(code: str):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW?interval=1d&range=1y"
    req = urllib.request.Request(url, headers=YF_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        r0 = data["chart"]["result"][0]
        ts = r0.get("timestamp") or []
        q = (r0["indicators"]["quote"] or [{}])[0]
        rows = []
        for i, t in enumerate(ts):
            d = datetime.fromtimestamp(t, tz=TW_TZ).strftime("%Y-%m-%d")
            o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
            v = q["volume"][i]
            if c is None:
                continue
            rows.append((code, d, o, h, l, c, int(v or 0)))
        return rows
    except Exception as e:
        print(f"  [warn] {code} 抓取失敗：{e}")
        return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", help="只抓指定代碼（逗號分隔）")
    args = parser.parse_args()

    if args.code:
        codes = [c.strip() for c in args.code.split(",") if c.strip()]
    else:
        codes = [l.strip() for l in ALL_STOCKS_FILE.read_text(encoding="utf-8").splitlines()
                 if l.strip() and not l.startswith("#")]

    conn = _db()
    total = 0
    for i, code in enumerate(codes, 1):
        rows = fetch_year(code)
        if rows:
            conn.executemany(
                "insert or replace into stock_daily values (?,?,?,?,?,?,?)", rows)
            conn.commit()
            total += len(rows)
        if i % 100 == 0:
            print(f"[{i}/{len(codes)}] 累計 {total:,} 筆")
        time.sleep(0.25)  # 控速
    print(f"完成：{len(codes)} 支，共寫入 {total:,} 筆")


if __name__ == "__main__":
    main()
