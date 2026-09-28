"""
etf_daily.py — 上市／上櫃 ETF 日K 存本機 SQLite etf_daily（供 breadth_ext.py「含 ETF」版本計算）。

  每日（預設）：官方當日收盤——上市 TWSE STOCK_DAY_ALL（openapi）、上櫃 TPEx tpex_mainboard_daily_close_quotes，代號 00 開頭者。
  回補（--backfill）：Yahoo v8 chart range=2y（上市 .TW／上櫃 .TWO；未還原價）。
資料量：約 350 檔 × 530 日 ≈ 19 萬列（本機 SQLite，約 10MB）。
用法：python scripts/etf_daily.py [--backfill]
"""
import json
import re
import sqlite3
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402  # DB_PATH

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

TW = timezone(timedelta(hours=8))
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _get(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=timeout, context=_CTX).read().decode("utf-8-sig", errors="replace")


def _num(v):
    try:
        s = str(v).replace(",", "").strip()
        return float(s) if s not in ("", "--", "-", "---") else None
    except Exception:
        return None


def _roc(d):
    d = re.sub(r"\D", "", str(d or ""))
    return f"{int(d[:-4]) + 1911}-{d[-4:-2]}-{d[-2:]}" if len(d) >= 7 else None


def _db():
    c = sqlite3.connect(str(ba.DB_PATH)); c.execute("pragma busy_timeout=60000")
    c.execute("""create table if not exists etf_daily (code text not null, trade_date text not null, open real, high real,
                 low real, close real, volume integer, market text, primary key (code, trade_date))""")
    return c


def official_today():
    """回 [(code, date, o, h, l, c, v, market)]。"""
    rows = []
    for r in json.loads(_get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")):
        code = str(r.get("Code", "")).strip()
        if not code.startswith("00"):
            continue
        d = _roc(r.get("Date"))
        c = _num(r.get("ClosingPrice"))
        if d and c:
            rows.append((code, d, _num(r.get("OpeningPrice")), _num(r.get("HighestPrice")), _num(r.get("LowestPrice")), c,
                         int(_num(r.get("TradeVolume")) or 0), "tse"))
    for r in json.loads(_get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes")):
        code = str(r.get("SecuritiesCompanyCode", "")).strip()
        if not code.startswith("00"):
            continue
        d = _roc(r.get("Date"))
        c = _num(r.get("Close"))
        if d and c:
            rows.append((code, d, _num(r.get("Open")), _num(r.get("High")), _num(r.get("Low")), c,
                         int(_num(r.get("TradingShares")) or 0), "otc"))
    return rows


def yahoo_2y(code, market):
    sym = code + (".TWO" if market == "otc" else ".TW")
    j = json.loads(_get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=2y&interval=1d"))
    res = (j.get("chart", {}).get("result") or [None])[0]
    if not res or not res.get("timestamp"):
        return []
    q = res["indicators"]["quote"][0]
    out = []
    for i, t in enumerate(res["timestamp"]):
        c = q["close"][i]
        if c is None:
            continue
        d = datetime.fromtimestamp(t, TW)
        if d.weekday() >= 5:
            continue
        out.append((code, d.strftime("%Y-%m-%d"), q["open"][i], q["high"][i], q["low"][i], round(c, 4), int(q["volume"][i] or 0), market))
    return out


def main():
    conn = _db()
    today = official_today()
    ins = "insert or replace into etf_daily values (?,?,?,?,?,?,?,?)"
    if "--backfill" in sys.argv:
        codes = sorted({(r[0], r[7]) for r in today})
        print(f"回補 {len(codes)} 檔 ETF（Yahoo 2 年）…")
        n = 0
        for i, (code, mk) in enumerate(codes):
            try:
                rows = yahoo_2y(code, mk)
                conn.executemany(ins, rows); n += len(rows)
            except Exception as e:
                print(f"  [warn] {code} {str(e)[:60]}")
            if (i + 1) % 25 == 0:
                conn.commit(); print(f"  {i + 1}/{len(codes)}（累計 {n} 列）")
            time.sleep(0.4)
        conn.commit()
    conn.executemany(ins, today); conn.commit()     # 官方當日覆蓋 Yahoo
    d = max((r[1] for r in today), default="—")
    print(f"etf_daily：官方當日 {len(today)} 檔（{d}）；總列數 {conn.execute('select count(*) from etf_daily').fetchone()[0]}")


if __name__ == "__main__":
    main()
