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
import ssl
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
# TWSE 官方「當日全上市股」收盤（一次請求拿全市場，收盤後定案，供每日更新用）
TWSE_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"


def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("pragma busy_timeout = 60000")  # 與 backfill 併發時等鎖，避免 database is locked
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


def _num(x):
    """TWSE 數字字串轉 float（去逗號）；'--'、空值等非數字回 None。"""
    if x is None:
        return None
    s = str(x).replace(",", "").strip()
    if not s or s in ("--", "---", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _roc_to_iso(s):
    """民國日期 '1150724' -> '2026-07-24'（年為 3 碼 +1911）。"""
    s = str(s).strip()
    if len(s) != 7 or not s.isdigit():
        return None
    return f"{int(s[:3]) + 1911:04d}-{s[3:5]}-{s[5:7]}"


def fetch_twse_all(universe=None):
    """TWSE 官方『當日全上市股』收盤，回傳 ([(code,date,o,h,l,c,v), ...], 略過數)。
    只保留 universe（追蹤清單）內的股票；當日無成交（無收盤）者略過。"""
    # TWSE openapi 憑證缺 Subject Key Identifier，過不了 Python 預設驗證；
    # 公開資料端點、無需登入，比照 broker_highwin 以不驗證憑證的 context 存取。
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(TWSE_ALL_URL, headers=YF_HEADERS)
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        data = json.loads(r.read().decode("utf-8"))
    out, skipped = [], 0
    for row in data:
        code = str(row.get("Code", "")).strip()
        if universe and code not in universe:
            continue
        d = _roc_to_iso(row.get("Date"))
        c = _num(row.get("ClosingPrice"))
        if not d or c is None:            # 無收盤（當日無成交）→ 跳過
            skipped += 1
            continue
        o = _num(row.get("OpeningPrice")) or c
        h = _num(row.get("HighestPrice")) or c
        low = _num(row.get("LowestPrice")) or c
        v = _num(row.get("TradeVolume"))
        out.append((code, d, o, h, low, c, int(v) if v is not None else 0))
    return out, skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", help="只抓指定代碼（逗號分隔），用 Yahoo 抓整年歷史")
    parser.add_argument("--yahoo", action="store_true",
                        help="全市場改用 Yahoo 抓整年歷史（回補/初次建庫用）；預設用 TWSE 當日")
    args = parser.parse_args()

    universe = [l.strip() for l in ALL_STOCKS_FILE.read_text(encoding="utf-8").splitlines()
                if l.strip() and not l.startswith("#")]
    conn = _db()

    # ── 預設：TWSE 官方當日全市場（一次請求、收盤定案，每日更新用）──
    if not args.code and not args.yahoo:
        try:
            rows, skipped = fetch_twse_all(set(universe))
        except Exception as e:
            print(f"[error] TWSE 當日抓取失敗：{e}")
            return
        if rows:
            conn.executemany(
                "insert or replace into stock_daily values (?,?,?,?,?,?,?)", rows)
            conn.commit()
            print(f"TWSE 當日（{rows[0][1]}）：寫入 {len(rows):,} 支，"
                  f"略過 {skipped} 支（當日無成交/非追蹤清單）")
        else:
            print("[warn] TWSE 當日無資料（假日或 API 異常）")
        return

    # ── Yahoo 整年：--code 指定股，或 --yahoo 全市場回補 ──
    codes = ([c.strip() for c in args.code.split(",") if c.strip()]
             if args.code else universe)
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
