"""
txo_history.py — 台指選擇權(TXO)每日行情歷史，存本機 SQLite（D:\\stock_data\\wantgoo_full.db 的 txo_daily 表）。
供 option_nday.py 算「N 日大量區」（5/10/20/60/120/240/480 交易日）。明細只存本機、不上 Supabase（約百萬列）。

資料源：TAIFEX「選擇權每日交易行情下載」POST https://www.taifex.com.tw/cht/3/optDataDown
  （down_type=1、commodity_id=TXO、日期區間；回傳 MS950 CSV；urllib 可讀）。只存「一般」盤。
  欄位(0起)：0交易日期 1契約 2到期月份(週別) 3履約價 4買賣權 …9成交量 10結算價 11未沖銷契約數 …17交易時段。

用法：
  python scripts/txo_history.py                 # 每日：補最近 10 天（自癒，已存在的覆蓋）
  python scripts/txo_history.py --backfill 760  # 回補最近 760 個日曆天（≈ 500 交易日），按月分段抓
"""
import argparse, csv, io, re, sqlite3, ssl, sys, time, urllib.parse, urllib.request
from datetime import date, timedelta
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
URL = "https://www.taifex.com.tw/cht/3/optDataDown"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("pragma busy_timeout = 60000")
    conn.execute("""create table if not exists txo_daily (
        trade_date text not null, contract text not null, strike integer not null, cp text not null,
        volume integer, settle real, oi integer,
        primary key (trade_date, contract, strike, cp))""")
    return conn


def _num(x):
    x = str(x).replace(",", "").strip()
    return float(x) if re.match(r"^-?\d+(\.\d+)?$", x) else None


def fetch(start: date, end: date):
    body = urllib.parse.urlencode({
        "down_type": "1", "commodity_id": "TXO", "commodity_id2": "",
        "queryStartDate": start.strftime("%Y/%m/%d"), "queryEndDate": end.strftime("%Y/%m/%d"),
    }).encode()
    req = urllib.request.Request(URL, data=body, method="POST", headers={
        "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"})
    for t in range(4):
        try:
            raw = urllib.request.urlopen(req, timeout=120, context=_CTX).read()
            break
        except Exception as e:
            print(f"  [retry {t + 1}] {start}~{end}: {e}")
            time.sleep(5 * (t + 1))
    else:
        return []
    text = raw.decode("cp950", "replace")
    rows = []
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 18 or r[1].strip() != "TXO" or r[17].strip() != "一般":
            continue
        k = _num(r[3])
        if k is None:
            continue
        rows.append((r[0].strip().replace("/", "-"), r[2].strip(), int(k), "C" if r[4].strip() == "買權" else "P",
                     int(_num(r[9]) or 0), _num(r[10]), int(_num(r[11]) or 0)))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", type=int, help="回補最近 N 個日曆天")
    args = ap.parse_args()
    days = args.backfill or 10
    end = date.today(); start = end - timedelta(days=days)
    conn = _db(); total = 0
    s = start
    while s <= end:                       # 按月分段（每段 ≤ 31 天）
        e = min(s + timedelta(days=30), end)
        rows = fetch(s, e)
        if rows:
            conn.executemany("insert or replace into txo_daily values (?,?,?,?,?,?,?)", rows)
            conn.commit(); total += len(rows)
        print(f"{s}~{e}：{len(rows):,} 列（{len({r[0] for r in rows})} 個交易日）")
        s = e + timedelta(days=1)
        if s <= end:
            time.sleep(2)
    n = conn.execute("select count(distinct trade_date), min(trade_date), max(trade_date) from txo_daily").fetchone()
    print(f"完成：寫入 {total:,} 列；txo_daily 共 {n[0]} 個交易日（{n[1]} ~ {n[2]}）")


if __name__ == "__main__":
    main()
