"""
daytrade_etl.py — 當日沖銷(當沖)資料 ETL → 本機 SQLite day_trade 表。

用途：貪婪指標「量能與投機度」維度的「當沖率」= 當沖成交股數 / 該股總成交股數
      （總成交股數取自 stock_daily.volume，單位皆為「股」）。

資料源：TWSE 上市『當日沖銷交易標的及成交量值』TWTB4U（含個股當沖成交股數）。
        ※ TPEX 上櫃僅公開「當沖標的名單」不含個股成交量，故 OTC 當沖率暫缺（量能維度退回只用量比）。

表 day_trade：primary key(trade_date, stock_id)，insert or replace（回補安全、自我修復）。
用法：
  python scripts/daytrade_etl.py --daily
  python scripts/daytrade_etl.py --start 2026-08-01 --end 2026-08-28 [--force] [--dry-run]
"""
import argparse
import json
import ssl
import sqlite3
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB = r"D:\stock_data\wantgoo_full.db"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
TWTB4U = "https://www.twse.com.tw/exchangeReport/TWTB4U?date={d}&response=json"


def _get(url, rate=1.0):
    time.sleep(rate)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())


def _num(x):
    s = str(x).replace(",", "").strip()
    if s in ("", "--", "---", "N/A", "X", "null", "None"):
        return None
    try:
        return int(round(float(s)))
    except ValueError:
        return None


def _db():
    c = sqlite3.connect(DB)
    c.execute("pragma busy_timeout=60000")
    c.execute("""create table if not exists day_trade(
        trade_date text, market text, stock_id text,
        daytrade_shares integer, daytrade_buy_amt integer, daytrade_sell_amt integer,
        source text, fetched_at text,
        primary key(trade_date, stock_id))""")
    return c


def fetch_twse(conn, d_iso, dry):
    """TWTB4U → day_trade（market='twse'）。回傳 (是否交易日, 寫入檔數)。"""
    ymd = d_iso.replace("-", "")
    try:
        j = _get(TWTB4U.format(d=ymd))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise
        return None, 0
    if j.get("stat") != "OK" or not j.get("tables"):
        return False, 0                                  # 非交易日/無資料
    # 個股表 = 標題含「標的」、首欄為證券代號、欄數 6
    tab = next((t for t in j["tables"]
                if "標的" in (t.get("title") or "") and len(t.get("fields", [])) >= 6), None)
    if not tab:
        return False, 0
    now = datetime.now().isoformat(timespec="seconds")
    rows = []
    for r in tab["data"]:
        code = str(r[0]).strip()
        if not code or len(code) > 6:
            continue
        rows.append((d_iso, "twse", code, _num(r[3]), _num(r[4]), _num(r[5]),
                     "twse_twtb4u", now))
    if not dry and rows:
        conn.executemany("""insert or replace into day_trade
            (trade_date,market,stock_id,daytrade_shares,daytrade_buy_amt,daytrade_sell_amt,source,fetched_at)
            values (?,?,?,?,?,?,?,?)""", rows)
        conn.commit()
    return True, len(rows)


def _dates(start, end):
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    out, d = [], d0
    while d <= d1:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start"); ap.add_argument("--end")
    ap.add_argument("--daily", action="store_true", help="自動抓『DB 最新日+1 ~ 今天』")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="重抓已存在的日期")
    args = ap.parse_args()

    conn = _db()
    if args.daily:
        last = conn.execute("select max(trade_date) from day_trade where market='twse'").fetchone()[0]
        start = (date.fromisoformat(last) + timedelta(days=1)).isoformat() if last else (date.today() - timedelta(days=7)).isoformat()
        end = date.today().isoformat()
        if start > end:
            print(f"[daily] 已是最新（DB 最新 {last}），無需回補"); return
        args.start, args.end = start, end
    elif not (args.start and args.end):
        ap.error("需 --start/--end 或 --daily")

    dates = _dates(args.start, args.end)
    done = {r[0] for r in conn.execute("select distinct trade_date from day_trade where market='twse'")}
    print(f"當沖 ETL {args.start}~{args.end}（{len(dates)} 個平日）{'[dry-run]' if args.dry_run else ''}")
    ok = skip = 0
    for d in dates:
        if not args.force and d in done:
            skip += 1; continue
        try:
            is_td, n = fetch_twse(conn, d, args.dry_run)
            if is_td is False:
                print(f"  {d}: 非交易日/無資料，略過"); continue
            print(f"  {d}: 當沖 {n} 檔")
            ok += 1 if n else 0
        except urllib.error.HTTPError as e:
            print(f"  {d}: HTTP {e.code} → 停止批次"); break
    print(f"完成：新抓 {ok} 日；斷點跳過 {skip} 日")


if __name__ == "__main__":
    main()
