"""
backfill_gaps.py — 資料自我修復：把「wantgoo_daily 有、但 stock_daily(股價) 或
broker_signals(訊號) 缺」的交易日補齊。

背景：每日排程各步驟原本只處理「最新一天」——fetch_prices 用 TWSE 當日端點、
broker_signals 只算 max(trade_date)。若某天排程漏跑（爬蟲卡死等），那天的股價/訊號
就永久缺漏，且隔天的每日流程也不會回頭補。本腳本比對缺口並逐日補齊：
  - 股價：TWSE MI_INDEX「指定日期」端點（當日端點抓不到過去日）→ stock_daily
  - 訊號：沿用 broker_signals.reupload_date 用目前門檻重算 → broker_signals

放進每日排程（wantgoo_daily_job 之後、broker_signals 之前）即可自我修復；
也可手動一鍵補全：python scripts/backfill_gaps.py [--days 30]
"""
import argparse
import json
import ssl
import sqlite3
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402
import broker_signals as bs           # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

MI_INDEX = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={ymd}&type=ALLBUT0999&response=json"
ALL_STOCKS = Path(__file__).resolve().parent / "all_stocks.txt"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _num(x):
    s = str(x).replace(",", "").strip()
    if s in ("", "--", "---", "X", "N/A", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _find(fields, *kw):
    for i, f in enumerate(fields):
        if all(k in f for k in kw):
            return i
    return None


def fetch_price_date(d_iso, universe):
    """TWSE MI_INDEX 指定日期全市場收盤 → [(code,date,o,h,l,c,v), ...]。非交易日/無資料回 []。"""
    ymd = d_iso.replace("-", "")
    req = urllib.request.Request(MI_INDEX.format(ymd=ymd),
                                 headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())
    tabs = j.get("tables") or []
    tab = next((t for t in tabs if _find(t.get("fields", []), "證券代號") is not None
                and _find(t.get("fields", []), "收盤價") is not None), None)
    if not tab:
        return []
    f = tab["fields"]
    ic = _find(f, "證券代號"); io = _find(f, "開盤價"); ih = _find(f, "最高價")
    il = _find(f, "最低價"); icl = _find(f, "收盤價"); iv = _find(f, "成交股數")
    rows = []
    for r in tab["data"]:
        code = str(r[ic]).strip()
        if universe and code not in universe:
            continue
        c = _num(r[icl])
        if c is None:
            continue
        o = _num(r[io]) or c; h = _num(r[ih]) or c; low = _num(r[il]) or c; v = _num(r[iv]) or 0
        rows.append((code, d_iso, o, h, low, c, int(v)))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30, help="檢查最近幾個交易日的缺口（預設 30）")
    args = ap.parse_args()

    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout=120000")
    wdates = sorted(r[0] for r in conn.execute(
        "select distinct trade_date from wantgoo_daily order by trade_date desc limit ?", (args.days,)))
    if not wdates:
        print("wantgoo_daily 無資料，結束"); return
    lo = wdates[0]

    # ── 1) 股價缺口：wantgoo_daily 有、stock_daily 缺 ──
    sdates = set(r[0] for r in conn.execute(
        "select distinct trade_date from stock_daily where trade_date>=?", (lo,)))
    missing_price = [d for d in wdates if d not in sdates]
    universe = set(l.strip() for l in ALL_STOCKS.read_text(encoding="utf-8").splitlines()
                   if l.strip() and not l.startswith("#"))
    print(f"股價缺口：{len(missing_price)} 天 {missing_price}")
    for d in missing_price:
        try:
            rows = fetch_price_date(d, universe)
        except Exception as e:
            print(f"  {d}: 股價抓取失敗 {e}"); continue
        if rows:
            conn.executemany("insert or replace into stock_daily values (?,?,?,?,?,?,?)", rows)
            conn.commit()
            print(f"  {d}: 補股價 {len(rows)} 支")
        else:
            print(f"  {d}: 無股價資料（非交易日？）")

    # ── 2) 訊號缺口：wantgoo_daily 有、broker_signals 缺 ──
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[warn] 缺 SUPABASE_SERVICE_KEY，跳過訊號補缺"); return
    _, sig = bs._sb(env, "/broker_signals",
                    params=[("select", "signal_date"), ("order", "signal_date.desc"), ("limit", "1000")])
    gset = set(x["signal_date"] for x in sig) if isinstance(sig, list) else set()
    missing_sig = [d for d in wdates if d not in gset]
    print(f"訊號缺口：{len(missing_sig)} 天 {missing_sig}")
    if missing_sig:
        prices = ba.load_prices(conn)
        top_lots, top_amt = bs.get_rankings(conn, prices)
        for d in missing_sig:
            bs.reupload_date(conn, prices, env, top_lots, top_amt, d)
    print("自我修復完成")


if __name__ == "__main__":
    main()
