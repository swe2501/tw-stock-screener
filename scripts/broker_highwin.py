"""
高勝流通比篩選 — 計算三層資料並上傳 Supabase：

Tab1 broker_highwin：近一年大單(≥300張)交易 ≥15 次、期望值(20日均報)>0、
     且 5/10/20 日勝率至少一項 ≥70% 的分點。
Tab2/3 broker_streaks：上述分點在同一股「連續 ≥3 交易日淨買超」的區段，
     附累積買超張數、同期總成交量(張)、流通比(=累積買超/總成交量)。
     Tab2 顯示全部區段；Tab3 前端再篩 vol_ratio ≥15%。

用法： python scripts/broker_highwin.py
"""
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

MIN_EVENTS = 15    # 大單交易次數門檻
WIN_TH = 70        # 5/10/20 日勝率至少一項 ≥ 此值
LARGE_LOTS = 300   # 大單 = 單日淨買超 ≥ 此張數
LARGE_WAN  = 3000  # 或 淨買超金額 ≥ 此萬元（張數/金額擇一達標即算大單）
MIN_STREAK = 3     # 連續買超天數門檻
STREAK_MIN_LOTS = 100   # 連買區段累積買超 ≥ 此張數
STREAK_MIN_WAN  = 1000  # 或 累積金額 ≥ 此萬元（擇一達標才列入，濾掉冷門股雜訊）


def _names():
    import json, ssl, urllib.request
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    out = {}
    try:
        req = urllib.request.Request("https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
                                     headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        for row in json.loads(urllib.request.urlopen(req, context=ctx, timeout=30).read()):
            out[str(row.get("公司代號", "")).strip()] = str(row.get("公司簡稱", "")).strip()
    except Exception as e:
        print(f"[warn] 股名抓取失敗：{e}")
    return out


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)
    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout = 60000")
    print("載入收盤價...")
    prices = ba.load_prices(conn)
    names = _names()
    today = conn.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]
    year_cut = (date.fromisoformat(today) - timedelta(days=365)).isoformat()

    # ── Tab1：高勝率分點（一次全量掃描，算 5/10/20 日勝率＋期望值）──
    print("計算高勝率分點（大單≥300張 或 ≥3000萬、≥15次、5/10/20日）...")
    rows = ba.analyze(conn, prices, min_lots=LARGE_LOTS, or_amount_wan=LARGE_WAN,
                      min_events=MIN_EVENTS, hold_days=(5, 10, 20))
    highwin = []
    for r in rows:
        w5, w10, w20 = r.get("win5") or 0, r.get("win10") or 0, r.get("win20") or 0
        avg = r.get("ret20")  # 期望值＝20日平均報酬
        if (avg or 0) > 0 and max(w5, w10, w20) >= WIN_TH:
            highwin.append({
                "broker_id": r["broker_id"], "broker_name": r["broker_name"],
                "events": r["events"], "win5": r.get("win5"), "win10": r.get("win10"),
                "win20": r.get("win20"), "avg_ret": round(avg, 2),
            })
    print(f"  高勝率分點：{len(highwin)} 個")

    # 全市場交易日序列（判斷「連續交易日」用）
    all_dates = [x[0] for x in conn.execute(
        "select distinct trade_date from wantgoo_daily where trade_date>=? order by trade_date", (year_cut,))]
    idx_of = {d: i for i, d in enumerate(all_dates)}

    # ── Tab2/3：連續買超區段＋流通比 ──
    streaks = []
    for hw in highwin:
        bid, bname = hw["broker_id"], hw["broker_name"]
        # 該分點近一年每檔每日淨買超
        per_stock = {}
        for code, d, buy, sell, bavg in conn.execute(
                "select code, trade_date, buy_vol, sell_vol, buy_avg_price from wantgoo_daily "
                "where broker_id=? and trade_date>=? order by code, trade_date", (bid, year_cut)):
            net = (buy or 0) - (sell or 0)
            if net > 0:
                price = bavg or (prices.get(code) and prices[code][1].get(d))
                per_stock.setdefault(code, []).append((d, net, price))
        for code, days in per_stock.items():
            # 找連續交易日 run（依全市場交易日序列相鄰）
            run = []
            for rec in days:
                d = rec[0]
                if run and idx_of.get(d, -99) == idx_of.get(run[-1][0], -1) + 1:
                    run.append(rec)
                else:
                    if len(run) >= MIN_STREAK:
                        _emit(streaks, conn, names, bid, bname, code, run)
                    run = [rec]
            if len(run) >= MIN_STREAK:
                _emit(streaks, conn, names, bid, bname, code, run)
    print(f"  連續買超區段：{len(streaks)} 筆")

    # ── 上傳 ──
    bs._sb(env, "/broker_highwin", method="DELETE", params=[("broker_id", "neq.__none__")])
    st1, r1 = bs._sb(env, "/broker_highwin", method="POST", body=highwin)
    bs._sb(env, "/broker_streaks", method="DELETE", params=[("broker_id", "neq.__none__")])
    st2, r2 = bs._sb(env, "/broker_streaks", method="POST", body=streaks) if streaks else (200, [])
    print(f"上傳 highwin={st1}（{len(highwin)}）, streaks={st2}（{len(streaks)}）")


def _emit(streaks, conn, names, bid, bname, code, run):
    start, end = run[0][0], run[-1][0]
    cum = sum(r[1] for r in run)
    cum_wan = round(sum(r[1] * 1000 * (r[2] or 0) for r in run) / 10000, 1)
    # 門檻：累積買超 ≥100 張 或 ≥1000 萬，否則視為雜訊不列入
    if cum < STREAK_MIN_LOTS and cum_wan < STREAK_MIN_WAN:
        return
    # 同期總成交量（張）＝ stock_daily.volume/1000 加總
    vol = conn.execute(
        "select sum(volume) from stock_daily where code=? and trade_date between ? and ?",
        (code, start, end)).fetchone()[0]
    total_lots = round((vol or 0) / 1000, 1) if vol else None
    ratio = round(cum / total_lots * 100, 1) if total_lots else None
    streaks.append({
        "broker_id": bid, "broker_name": bname, "code": code, "name": names.get(code, ""),
        "start_date": start, "end_date": end, "days": len(run),
        "cum_lots": int(cum), "cum_amount_wan": cum_wan,
        "total_vol_lots": total_lots, "vol_ratio": ratio,
    })


if __name__ == "__main__":
    main()
