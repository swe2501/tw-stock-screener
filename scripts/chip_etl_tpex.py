"""
chip_etl_tpex.py — 台股籌碼 ETL（上櫃 TPEX）
  1) 三大法人（含自營自行/避險拆分）TPEX 3itrade_hedge_result → institutional_trades (market='tpex')
  2) 融資融券                        TPEX margin_bal_result       → margin_short (market='tpex')

註：TPEX openapi 只給「最新一天」，歷史回補須用官方帶日期的 web 端點（tpex.org.tw 自家，民國日期）。
單位：三大法人為「股」；融資融券個股表為「張」。交易日以端點 stat 是否 ok+有資料判定。
用法：python scripts/chip_etl_tpex.py --start 2026-07-27 --end 2026-07-31 --validate 3105
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
INST = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?d={roc}&s=0,asc&o=json"
MARG = "https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?d={roc}&o=json"


def _get(url):
    time.sleep(1.2)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json",
                                               "Referer": "https://www.tpex.org.tw/"})
    return json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())


def _num(x):
    s = str(x).replace(",", "").strip()
    if s in ("", "--", "---", "N/A", "X", "null"):
        return None
    try:
        return int(round(float(s)))
    except ValueError:
        return None


def _roc(d_iso):
    y, m, dd = d_iso.split("-")
    return f"{int(y) - 1911}/{m}/{dd}"


def _db():
    c = sqlite3.connect(DB); c.execute("pragma busy_timeout=60000")
    # 表沿用 chip_etl_twse 建立的 institutional_trades / margin_short
    c.execute("""create table if not exists institutional_trades(
        trade_date text, market text, stock_id text, investor_type text,
        buy_shares integer, sell_shares integer, net_shares integer, source text, fetched_at text,
        primary key(trade_date, stock_id, investor_type))""")
    c.execute("""create table if not exists margin_short(
        trade_date text, market text, stock_id text,
        margin_buy integer, margin_sell integer, margin_cash_repay integer,
        margin_prev_balance integer, margin_balance integer, margin_limit integer,
        short_buy integer, short_sell integer, short_stock_repay integer,
        short_prev_balance integer, short_balance integer, short_limit integer,
        offset_lots integer, unit text, source text, fetched_at text,
        primary key(trade_date, stock_id))""")
    c.commit()
    return c


def fetch_institutional(conn, d_iso, dry):
    """3itrade_hedge 24 欄固定順序：0代 1名 |外資不含自營 2-4|外資自營商 5-7|外資合計 8-10|
       投信 11-13|自營自行 14-16|自營避險 17-19|自營合計 20-22|三大法人合計 23。回 (交易日?, 列數)。"""
    try:
        j = _get(INST.format(roc=_roc(d_iso)))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise
        return None, 0
    if j.get("stat", "").lower() != "ok" or not j.get("tables"):
        return False, 0
    data = j["tables"][0].get("data", [])
    if not data:
        return False, 0
    now = datetime.now().isoformat(timespec="seconds")
    rows = []
    for r in data:
        code = str(r[0]).strip()
        if not code or len(code) > 6:
            continue
        g = lambda i: _num(r[i])
        var = {
            "foreign": (g(8), g(9)),
            "investment_trust": (g(11), g(12)),
            "dealer_self": (g(14), g(15)),
            "dealer_hedging": (g(17), g(18)),
        }
        var["dealer_total"] = (sum(v for v in (var["dealer_self"][0], var["dealer_hedging"][0]) if v is not None),
                               sum(v for v in (var["dealer_self"][1], var["dealer_hedging"][1]) if v is not None))
        var["institutional_total"] = (sum(v for v in (var["foreign"][0], var["investment_trust"][0], var["dealer_total"][0]) if v is not None),
                                      sum(v for v in (var["foreign"][1], var["investment_trust"][1], var["dealer_total"][1]) if v is not None))
        for vt, (b, s) in var.items():
            rows.append((d_iso, "tpex", code, vt, b, s,
                         (b - s) if (b is not None and s is not None) else None, "tpex_3insti_hedge", now))
    if not dry:
        conn.executemany("""insert or replace into institutional_trades
            (trade_date,market,stock_id,investor_type,buy_shares,sell_shares,net_shares,source,fetched_at)
            values (?,?,?,?,?,?,?,?,?)""", rows)
        conn.commit()
    return True, len(rows)


def fetch_margin(conn, d_iso, dry):
    """margin_bal 20 欄：0代 1名 |融資 2前餘 3買 4賣 5現償 6今餘 7證金 8使用率 9限額|
       融券 10前餘 11賣 12買 13現券 14今餘 15證金 16使用率 17限額|18資券互抵 19備註。單位張。"""
    try:
        j = _get(MARG.format(roc=_roc(d_iso)))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise
        return 0
    if j.get("stat", "").lower() != "ok" or not j.get("tables"):
        return 0
    data = j["tables"][0].get("data", [])
    now = datetime.now().isoformat(timespec="seconds")
    rows = []
    for r in data:
        code = str(r[0]).strip()
        if not code or len(code) > 6:
            continue
        g = lambda i: _num(r[i]) if i < len(r) else None
        rows.append((d_iso, "tpex", code,
                     g(3), g(4), g(5), g(2), g(6), g(9),      # 融資
                     g(12), g(11), g(13), g(10), g(14), g(17),  # 融券(買12/賣11)
                     g(18), "lots", "tpex_margin_bal", now))
    if not dry:
        conn.executemany("""insert or replace into margin_short
            (trade_date,market,stock_id,margin_buy,margin_sell,margin_cash_repay,margin_prev_balance,
             margin_balance,margin_limit,short_buy,short_sell,short_stock_repay,short_prev_balance,
             short_balance,short_limit,offset_lots,unit,source,fetched_at)
            values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
        conn.commit()
    return len(rows)


def _dates(start, end):
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    out = []; d = d0
    while d <= d1:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start"); ap.add_argument("--end")
    ap.add_argument("--daily", action="store_true", help="自動抓『DB 最新日+1 ~ 今天』(每日排程用)")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--force", action="store_true")
    ap.add_argument("--validate")
    args = ap.parse_args()
    conn = _db()
    if args.daily:
        last = conn.execute("select max(trade_date) from institutional_trades where market='tpex'").fetchone()[0]
        start = (date.fromisoformat(last) + timedelta(days=1)).isoformat() if last else (date.today() - timedelta(days=7)).isoformat()
        end = date.today().isoformat()
        if start > end:
            print(f"[daily] 已是最新（DB 最新 {last}），無需回補"); return
        args.start, args.end = start, end
    elif not (args.start and args.end):
        ap.error("需 --start/--end 或 --daily")
    dates = _dates(args.start, args.end)
    done = {r[0] for r in conn.execute("select distinct trade_date from institutional_trades where market='tpex'")}
    print(f"TPEX {args.start}~{args.end}（{len(dates)} 平日）{'[dry]' if args.dry_run else ''}")
    oi = om = sk = 0
    for d in dates:
        if not args.force and d in done:
            sk += 1; continue
        try:
            td, ni = fetch_institutional(conn, d, args.dry_run)
            if td is False:
                print(f"  {d}: 非交易日/無資料"); continue
            nm = fetch_margin(conn, d, args.dry_run)
            print(f"  {d}: 三大法人 {ni} 列、融資融券 {nm} 列"); oi += bool(ni); om += bool(nm)
        except urllib.error.HTTPError as e:
            print(f"  {d}: HTTP {e.code} → 停止"); break
    print(f"完成：三大法人 {oi} 日、融資融券 {om} 日；斷點跳過 {sk}")

    if args.validate:
        s = args.validate
        print(f"\n=== 驗證 {s}（上櫃）===")
        for d, in conn.execute("select distinct trade_date from institutional_trades where stock_id=? and market='tpex' order by trade_date", (s,)):
            m = dict(conn.execute("select investor_type,net_shares from institutional_trades where stock_id=? and market='tpex' and trade_date=?", (s, d)).fetchall())
            calc = (m.get("foreign", 0) or 0) + (m.get("investment_trust", 0) or 0) + (m.get("dealer_total", 0) or 0)
            print(f"  {d} 外資{m.get('foreign')} 投信{m.get('investment_trust')} 自營自行{m.get('dealer_self')} 避險{m.get('dealer_hedging')} → 合計計算{calc} vs 存{m.get('institutional_total')} {'OK' if calc==m.get('institutional_total') else '✗'}")


if __name__ == "__main__":
    main()
