"""
chip_etl_tdcc.py — TDCC 集保戶股權分散表（逐股歷史，官方 smWeb 查詢，免費）
  存原始 15 級距 → holding_distribution；算大戶/散戶指標 → holder_indicators。

TDCC openapi(1-5)只給最新一週；歷史須用官方逐股查詢 smWeb/qryStock（帶 SYNCHRONIZER_TOKEN + session cookie）。
逐股查詢：一次一股，適合關注個股回補；全市場歷史不切實際（會被限流）。
門檻對齊 TDCC 級距邊界（20張=20,000股、400張=400,001股、1000張=1,000,001股），不拆級距。
用法：python scripts/chip_etl_tdcc.py --stock 2330 [--start 2025-08-01 --end 2026-07-31]
"""
import argparse
import http.cookiejar
import html as H
import re
import ssl
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB = r"D:\stock_data\wantgoo_full.db"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
URL = "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock"


def _opener():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj),
                                     urllib.request.HTTPSHandler(context=_CTX))
    op.addheaders = [("User-Agent", "Mozilla/5.0")]
    return op


def _num(x):
    s = str(x).replace(",", "").strip()
    if s in ("", "--", "N/A"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _pf(x):
    s = str(x).replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _minmax(label):
    """'1-999'→(1,999)；'1,000,001以上'→(1000001,None)；差異/合計→(None,None)。"""
    s = label.replace(",", "").strip()
    m = re.match(r"^(\d+)-(\d+)$", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r"^(\d+)", s) if "以上" in s else None
    if m:
        return int(m.group(1)), None
    return None, None


def _db():
    c = sqlite3.connect(DB); c.execute("pragma busy_timeout=60000")
    c.execute("""create table if not exists holding_distribution(
        data_date text, stock_id text, level_code integer, level_label text,
        minimum_shares integer, maximum_shares integer,
        holders integer, shares integer, percentage real,
        source text, fetched_at text,
        primary key(data_date, stock_id, level_code))""")
    c.execute("""create table if not exists holder_indicators(
        data_date text, stock_id text,
        retail_under_20_lots_ratio real, large_over_400_lots_ratio real,
        large_over_1000_lots_ratio real, total_holders integer, total_shares integer,
        calculation_version text, source text, fetched_at text,
        primary key(data_date, stock_id))""")
    c.commit()
    return c


def _fetch_dates(op):
    g = op.open(URL, timeout=30).read().decode("utf-8", "replace")
    tok = re.search(r'name="SYNCHRONIZER_TOKEN" value="([^"]+)"', g).group(1)
    dates = sorted(set(re.findall(r'<option value="(\d{8})"', g)))
    return tok, dates


def _query(op, tok, date, stock):
    body = urllib.parse.urlencode({
        "SYNCHRONIZER_TOKEN": tok, "SYNCHRONIZER_URI": "/portal/zh/smWeb/qryStock",
        "method": "submit", "firDate": date, "scaDate": date,
        "sqlMethod": "StockNo", "stockNo": stock, "stockName": ""}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded", "Referer": URL})
    r = op.open(req, timeout=30).read().decode("utf-8", "replace")
    m = re.search(r'name="SYNCHRONIZER_TOKEN" value="([^"]+)"', r)   # CSRF 一次性 → 取下一個
    next_tok = m.group(1) if m else None
    levels = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", r, re.S):
        cells = [H.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) >= 5 and cells[0].strip().isdigit():
            lo, hi = _minmax(cells[1])
            levels.append({"code": int(cells[0]), "label": cells[1], "min": lo, "max": hi,
                           "holders": _num(cells[2]), "shares": _num(cells[3]), "pct": _pf(cells[4])})
    return levels, next_tok


def _indicators(levels):
    reg = [x for x in levels if x["code"] <= 15]        # 只用 1-15 級距（排除差異調整/合計）
    def s(cond):
        return round(sum(x["pct"] or 0 for x in reg if cond(x)), 2)
    total = next((x for x in levels if x["code"] == 17), None)
    return {
        "retail_under_20": s(lambda x: x["max"] is not None and x["max"] <= 20000),
        "large_over_400":  s(lambda x: x["min"] is not None and x["min"] >= 400001),
        "large_over_1000": s(lambda x: x["min"] is not None and x["min"] >= 1000001),
        "total_holders": total["holders"] if total else None,
        "total_shares": total["shares"] if total else None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stock", required=True)
    ap.add_argument("--start"); ap.add_argument("--end")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    conn = _db()
    op = _opener()
    tok, all_dates = _fetch_dates(op)
    dates = [d for d in all_dates
             if (not args.start or d >= args.start.replace("-", ""))
             and (not args.end or d <= args.end.replace("-", ""))]
    done = {r[0].replace("-", "") for r in conn.execute("select distinct data_date from holding_distribution where stock_id=?", (args.stock,))}
    print(f"TDCC {args.stock}：{len(dates)} 週（可選 {len(all_dates)}）{'[dry]' if args.dry_run else ''}")
    now = datetime.now().isoformat(timespec="seconds")
    ok = skip = 0
    for d in dates:
        if not args.force and d in done:
            skip += 1; continue
        time.sleep(1.2)
        try:
            levels, tok2 = _query(op, tok, d, args.stock)
            if not levels:                       # token 失效 → 重新 GET 換新 token 再試一次
                tok, _ = _fetch_dates(op); time.sleep(1.0)
                levels, tok2 = _query(op, tok, d, args.stock)
            if tok2:
                tok = tok2                        # 輪替一次性 token
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429):
                print(f"  {d}: HTTP {e.code} → 停止"); break
            print(f"  {d}: HTTP {e.code}"); continue
        if not levels:
            print(f"  {d}: 無資料"); continue
        diso = f"{d[:4]}-{d[4:6]}-{d[6:]}"
        if not args.dry_run:
            conn.executemany("""insert or replace into holding_distribution
                (data_date,stock_id,level_code,level_label,minimum_shares,maximum_shares,holders,shares,percentage,source,fetched_at)
                values (?,?,?,?,?,?,?,?,?,?,?)""",
                [(diso, args.stock, x["code"], x["label"], x["min"], x["max"], x["holders"], x["shares"], x["pct"], "tdcc_smweb", now) for x in levels])
            ind = _indicators(levels)
            conn.execute("""insert or replace into holder_indicators
                (data_date,stock_id,retail_under_20_lots_ratio,large_over_400_lots_ratio,large_over_1000_lots_ratio,total_holders,total_shares,calculation_version,source,fetched_at)
                values (?,?,?,?,?,?,?,?,?,?)""",
                (diso, args.stock, ind["retail_under_20"], ind["large_over_400"], ind["large_over_1000"], ind["total_holders"], ind["total_shares"], "tdcc-1.0", "tdcc_smweb", now))
            conn.commit()
        ok += 1
    print(f"完成：新抓 {ok} 週；斷點跳過 {skip}")

    # 摘要
    print(f"\n=== {args.stock} 大戶/散戶指標（近幾週）===")
    for d, r20, l400, l1000, th in conn.execute(
            """select data_date,retail_under_20_lots_ratio,large_over_400_lots_ratio,large_over_1000_lots_ratio,total_holders
               from holder_indicators where stock_id=? order by data_date desc limit 6""", (args.stock,)):
        print(f"  {d}: 散戶(≤20張){r20}%  大戶(≥400張){l400}%  超級大戶(≥1000張){l1000}%  股東{format(th, ',') if th else '?'}人")


if __name__ == "__main__":
    main()
