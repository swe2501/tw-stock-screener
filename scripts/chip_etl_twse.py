"""
chip_etl_twse.py — 台股籌碼 ETL（第一個增量：TWSE 上市）
  1) 三大法人買賣超  TWSE T86（動態欄位對映）→ institutional_trades
  2) 融資融券        TWSE MI_MARGN 個股表      → margin_short

官方公開 API、免登入、有限速/timeout。交易日以 T86 是否回傳資料判定。
單位：T86 為「股」；MI_MARGN 個股表為「張」(交易單位)，原值保存不自行 ×1000。
用法：
  python scripts/chip_etl_twse.py --start 2026-07-27 --end 2026-07-31
  python scripts/chip_etl_twse.py --start ... --end ... --dry-run
  python scripts/chip_etl_twse.py --validate 2330 --start ... --end ...
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
T86 = "https://www.twse.com.tw/rwd/zh/fund/T86?date={d}&selectType=ALLBUT0999&response=json"
MARGN = "https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={d}&selectType=ALL&response=json"
PARSER_VER = "twse-1.0"


def _get(url, rate=1.0):
    time.sleep(rate)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())


def _num(x):
    s = str(x).replace(",", "").replace("＋", "").strip()
    if s in ("", "--", "---", "N/A", "X", "null", "None"):
        return None
    try:
        return int(round(float(s)))
    except ValueError:
        return None


def _find(fields, *kw):
    for i, f in enumerate(fields):
        if all(k in f for k in kw):
            return i
    return None


def _db():
    c = sqlite3.connect(DB)
    c.execute("pragma busy_timeout=60000")
    c.execute("""create table if not exists institutional_trades(
        trade_date text, market text, stock_id text, investor_type text,
        buy_shares integer, sell_shares integer, net_shares integer,
        source text, fetched_at text,
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
    """T86 → institutional_trades（六種 investor_type / 檔）。回傳 (交易日?, 寫入檔數)。"""
    ymd = d_iso.replace("-", "")
    try:
        j = _get(T86.format(d=ymd))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise
        return None, 0
    if j.get("stat") != "OK" or not j.get("data"):
        return False, 0                      # 非交易日/無資料
    f, data = j["fields"], j["data"]
    ic = _find(f, "證券代號")
    # 動態欄位（外資=外陸資+外資自營商，以對上三大法人合計）
    cols = {
        "for_main":  (_find(f, "外陸資買進"), _find(f, "外陸資賣出")),
        "for_deal":  (_find(f, "外資自營商買進"), _find(f, "外資自營商賣出")),
        "it":        (_find(f, "投信買進"), _find(f, "投信賣出")),
        "d_self":    (_find(f, "自營商買進股數(自行買賣)"), _find(f, "自營商賣出股數(自行買賣)")),
        "d_hedge":   (_find(f, "自營商買進股數(避險)"), _find(f, "自營商賣出股數(避險)")),
    }
    now = datetime.now().isoformat(timespec="seconds")
    rows = []
    for r in data:
        code = str(r[ic]).strip()
        if not code or len(code) > 6:
            continue
        def bs(key):
            bi, si = cols[key]
            return (_num(r[bi]) if bi is not None else None,
                    _num(r[si]) if si is not None else None)
        fmb, fms = bs("for_main"); fdb, fds = bs("for_deal")
        f_b = (fmb or 0) + (fdb or 0); f_s = (fms or 0) + (fds or 0)
        it_b, it_s = bs("it")
        ds_b, ds_s = bs("d_self")
        dh_b, dh_s = bs("d_hedge")
        variants = {
            "foreign": (f_b, f_s),
            "investment_trust": (it_b or 0, it_s or 0),
            "dealer_self": (ds_b or 0, ds_s or 0),
            "dealer_hedging": (dh_b or 0, dh_s or 0),
        }
        variants["dealer_total"] = (variants["dealer_self"][0] + variants["dealer_hedging"][0],
                                    variants["dealer_self"][1] + variants["dealer_hedging"][1])
        variants["institutional_total"] = (
            f_b + variants["investment_trust"][0] + variants["dealer_total"][0],
            f_s + variants["investment_trust"][1] + variants["dealer_total"][1])
        for vt, (b, s) in variants.items():
            rows.append((d_iso, "twse", code, vt, b, s, (b - s) if (b is not None and s is not None) else None,
                         "twse_t86", now))
    if not dry:
        conn.executemany("""insert or replace into institutional_trades
            (trade_date,market,stock_id,investor_type,buy_shares,sell_shares,net_shares,source,fetched_at)
            values (?,?,?,?,?,?,?,?,?)""", rows)
        conn.commit()
    return True, len(rows)


def fetch_margin(conn, d_iso, dry):
    """MI_MARGN 個股表 → margin_short（單位：張）。固定區塊順序對映。"""
    ymd = d_iso.replace("-", "")
    try:
        j = _get(MARGN.format(d=ymd))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise
        return 0
    tabs = j.get("tables", [])
    # 個股表 = 欄數 16、首欄為「代號」
    tab = next((t for t in tabs if len(t.get("fields", [])) >= 15
                and _find(t["fields"], "代號") == 0), None)
    if not tab:
        return 0
    # 已知固定順序：0代號 1名稱 | 融資 2買 3賣 4現償 5前餘 6今餘 7限額 | 融券 8買 9賣 10現償 11前餘 12今餘 13限額 | 14資券互抵 15註記
    now = datetime.now().isoformat(timespec="seconds")
    rows = []
    for r in tab["data"]:
        code = str(r[0]).strip()
        if not code or len(code) > 6:
            continue
        g = lambda i: _num(r[i]) if i < len(r) else None
        rows.append((d_iso, "twse", code,
                     g(2), g(3), g(4), g(5), g(6), g(7),
                     g(8), g(9), g(10), g(11), g(12), g(13), g(14),
                     "lots", "twse_mi_margn", now))
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
    out = []
    d = d0
    while d <= d1:
        if d.weekday() < 5:            # 先排除週末；非交易日由 T86 無資料再跳過
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--validate", help="驗證某股票代號")
    args = ap.parse_args()

    conn = _db()
    dates = _dates(args.start, args.end)
    print(f"日期範圍 {args.start}~{args.end}（{len(dates)} 個平日）{'[dry-run]' if args.dry_run else ''}")
    ok_i = ok_m = 0
    for d in dates:
        try:
            is_td, ni = fetch_institutional(conn, d, args.dry_run)
            if is_td is False:
                print(f"  {d}: 非交易日/無資料，略過"); continue
            nm = fetch_margin(conn, d, args.dry_run)
            print(f"  {d}: 三大法人 {ni} 列、融資融券 {nm} 列")
            ok_i += 1 if ni else 0; ok_m += 1 if nm else 0
        except urllib.error.HTTPError as e:
            print(f"  {d}: HTTP {e.code} → 停止此來源批次"); break
    print(f"完成：三大法人 {ok_i} 日、融資融券 {ok_m} 日")

    if args.validate:
        s = args.validate
        print(f"\n=== 驗證 {s} ===")
        for d, vt, b, sl, n in conn.execute(
                "select trade_date,investor_type,buy_shares,sell_shares,net_shares from institutional_trades "
                "where stock_id=? order by trade_date, investor_type", (s,)):
            chk = "" if (b is None or sl is None or n == b - sl) else " ✗net"
            print(f"  {d} {vt:20} 買{b} 賣{sl} 淨{n}{chk}")
        # institutional_total = foreign+it+dealer_total
        for d, in conn.execute("select distinct trade_date from institutional_trades where stock_id=? order by trade_date", (s,)):
            m = dict(conn.execute("select investor_type,net_shares from institutional_trades where stock_id=? and trade_date=?", (s, d)).fetchall())
            calc = (m.get("foreign", 0) or 0) + (m.get("investment_trust", 0) or 0) + (m.get("dealer_total", 0) or 0)
            tot = m.get("institutional_total")
            print(f"  {d} 合計驗證：計算 {calc} vs 存 {tot} {'OK' if calc == tot else '✗差 '+str((tot or 0)-calc)}")


if __name__ == "__main__":
    main()
