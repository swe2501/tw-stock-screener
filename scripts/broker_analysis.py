"""
分點勝率分析引擎。讀取本機 SQLite（D:\\stock_data\\wantgoo_full.db）：
  wantgoo_daily：分點每日買賣（全量）
  stock_daily  ：個股每日收盤價（fetch_prices.py 回補）

兩種算法：
  1. 事件法：分點單日大額淨買超 → N 天後收盤價 vs 買進均價 → 勝率
  2. FIFO 配對法：買賣配對還原已實現損益、平均持有天數 → 分點屬性分類

用法：
  python scripts/broker_analysis.py                          # 全市場
  python scripts/broker_analysis.py --codes 2330,3033        # 指定股票
  python scripts/broker_analysis.py --min-lots 300 --min-events 10
輸出：終端排行榜 + D:\\stock_data\\broker_rank.csv
"""
import argparse
import csv
import sqlite3
import sys
from bisect import bisect_left, bisect_right
from collections import defaultdict
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
OUT_CSV = Path(r"D:\stock_data\broker_rank.csv")

HOLD_DAYS = [5, 20]          # 事件法觀察天數
DAYTRADE_MAX_HOLD = 2.0      # 平均持有 ≤ 2 天 → 隔日沖


def load_prices(conn, codes=None):
    """回傳 {code: (dates_list, {date: close})}，dates 已排序供 bisect 用。"""
    q = "select code, trade_date, close from stock_daily"
    args = ()
    if codes:
        q += f" where code in ({','.join('?' * len(codes))})"
        args = tuple(codes)
    by_code = defaultdict(dict)
    for code, d, c in conn.execute(q, args):
        if c is not None:
            by_code[code][d] = c
    return {k: (sorted(v.keys()), v) for k, v in by_code.items()}


def close_after(prices, code, date, n):
    """date 之後第 n 個交易日的收盤價（不足 n 天回 None）。"""
    if code not in prices:
        return None
    dates, closes = prices[code]
    i = bisect_right(dates, date) - 1
    if i < 0 or dates[i] != date:
        i = bisect_left(dates, date)          # date 非交易日：取下一交易日當第 0 天
    j = i + n
    return closes[dates[j]] if j < len(dates) else None


def trading_days_between(prices, code, d1, d2):
    if code not in prices:
        return None
    dates, _ = prices[code]
    return max(bisect_right(dates, d2) - bisect_right(dates, d1), 0)


def analyze(conn, prices, codes=None, min_lots=300, min_events=5, hold_days=(5, 20),
            min_amount_wan=0, max_lots=0, max_amount_wan=0, date_from=None,
            or_amount_wan=0):
    """
    單次掃描 wantgoo_daily（依 broker_id, code, trade_date 排序）同時計算：
      事件法統計 + FIFO 配對統計，彙整到 broker 層級。
    hold_days：事件法觀察的交易日窗口，可多組（如 3,10,60）。
    事件門檻擇一：min_amount_wan > 0 時用金額制（淨買超金額 ≥ 此值萬元），否則用張數制。
    max_lots / max_amount_wan：上限（>0 時啟用），用於「小單區間」如 50~300 張。
    date_from：只統計此日期(含)之後的交易日（YYYY-MM-DD），用於 90 日窗口回測。
    """
    stat = defaultdict(lambda: {
        "name": "", "events": 0,
        "win": {n: 0 for n in hold_days},
        "cnt": {n: 0 for n in hold_days},
        "ret": {n: 0.0 for n in hold_days},
        "closed": 0, "closed_win": 0, "pnl_ret": 0.0, "hold_sum": 0.0,
    })

    q = ("select broker_id, broker_name, code, trade_date, buy_vol, sell_vol, "
         "buy_avg_price, sell_avg_price from wantgoo_daily")
    conds, args = [], []
    if codes:
        conds.append(f"code in ({','.join('?' * len(codes))})")
        args.extend(codes)
    if date_from:
        conds.append("trade_date >= ?")
        args.append(date_from)
    if conds:
        q += " where " + " and ".join(conds)
    q += " order by broker_id, code, trade_date"
    args = tuple(args)

    cur_key = None
    fifo = []  # [(qty, price, date), ...]

    def settle(broker, code, sell_qty, sell_price, sell_date):
        s = stat[broker]
        while sell_qty > 0 and fifo:
            qty, price, bdate = fifo[0]
            take = min(qty, sell_qty)
            if price and sell_price:
                s["closed"] += 1
                ret = (sell_price - price) / price
                s["pnl_ret"] += ret
                if ret > 0:
                    s["closed_win"] += 1
                hd = trading_days_between(prices, code, bdate, sell_date)
                s["hold_sum"] += hd if hd is not None else 0
            if take == qty:
                fifo.pop(0)
            else:
                fifo[0] = (qty - take, price, bdate)
            sell_qty -= take

    for bid, bname, code, d, buy, sell, bavg, savg in conn.execute(q, args):
        key = (bid, code)
        if key != cur_key:
            cur_key = key
            fifo = []
        s = stat[bid]
        if bname:
            s["name"] = bname
        net = (buy or 0) - (sell or 0)

        # ── 事件法：張數制（淨買超 ≥ min_lots 張）或金額制（淨買超金額 ≥ min_amount 萬元）──
        # 可加上限（小單區間）：max_lots / max_amount_wan
        # or_amount_wan > 0：大單聯集定義，net≥min_lots 張 或 金額≥or_amount_wan 萬 擇一即算
        entry_ref = bavg or (prices.get(code) and prices[code][1].get(d))
        amt = net * 1000 * entry_ref if (net > 0 and entry_ref) else 0
        if or_amount_wan > 0:
            is_event = (net >= min_lots) or (amt >= or_amount_wan * 10000)
        elif min_amount_wan > 0:
            # 金額 = 張數 × 1000 股 × 價格；門檻單位為萬元
            is_event = (amt >= min_amount_wan * 10000
                        and (max_amount_wan <= 0 or amt < max_amount_wan * 10000))
        else:
            is_event = (net >= min_lots
                        and (max_lots <= 0 or net < max_lots))
        if is_event:
            entry = entry_ref
            if entry:
                s["events"] += 1
                for n in hold_days:
                    c_after = close_after(prices, code, d, n)
                    if c_after:
                        s["cnt"][n] += 1
                        s["ret"][n] += (c_after - entry) / entry
                        if c_after > entry:
                            s["win"][n] += 1

        # ── FIFO 配對 ──
        if net > 0:
            fifo.append((net, bavg, d))
        elif net < 0:
            settle(bid, code, -net, savg, d)

    # ── 彙整輸出 ──
    rows = []
    for bid, s in stat.items():
        if s["events"] < min_events:
            continue
        avg_hold = s["hold_sum"] / s["closed"] if s["closed"] else None
        kind = ("隔日沖" if avg_hold is not None and avg_hold <= DAYTRADE_MAX_HOLD
                else "波段" if avg_hold is not None else "收籌碼/未平倉")
        row = {
            "broker_id": bid, "broker_name": s["name"], "type": kind,
            "events": s["events"],
        }
        for n in hold_days:
            cnt = s["cnt"][n]
            row[f"win{n}"] = round(s["win"][n] / cnt * 100, 1) if cnt else None
            row[f"ret{n}"] = round(s["ret"][n] / cnt * 100, 2) if cnt else None
            row[f"n{n}"] = cnt   # 已滿 n 日、實際納入勝率計算的筆數（分母）
        row.update({
            "closed_trades": s["closed"],
            "closed_win":  round(s["closed_win"] / s["closed"] * 100, 1) if s["closed"] else None,
            "avg_ret":     round(s["pnl_ret"] / s["closed"] * 100, 2) if s["closed"] else None,
            "avg_hold":    round(avg_hold, 1) if avg_hold is not None else None,
        })
        rows.append(row)
    # 用最長窗口的勝率排序
    sort_key = f"win{max(hold_days)}"
    rows.sort(key=lambda r: (r[sort_key] or 0), reverse=True)
    return rows


def analyze_events_sql(conn, prices, min_lots=300, or_amount_wan=0, min_events=5,
                       hold_days=(5, 10, 20), date_from=None, codes=None):
    """事件法「快速版」：只算大單買超事件的 N 日勝率／期望值，不做 FIFO 配對。

    與 analyze() 的事件統計等價，但把「找事件」這步交給 SQL 的 WHERE 在 C 層完成，
    Python 只需對濾出的幾萬筆事件算勝率 → 免掉全表 7 千萬列的 Python 逐列掃與排序。
    供 broker_highwin 快速重算；analyze() 維持原樣供週排行／每日訊號使用。

    事件定義與 analyze() 一致：淨買超>0、買均價存在，且
      or_amount_wan>0：淨買超 ≥min_lots 張 或 金額 ≥or_amount_wan 萬（擇一）
      否則：淨買超 ≥min_lots 張
    進場價 entry＝買均價（buy_avg_price）；勝率用 close_after 查 N 交易日後收盤（與 analyze 同一函式）。
    """
    conds = ["(buy_vol - sell_vol) > 0", "buy_avg_price > 0"]
    args = []
    if date_from:
        conds.append("trade_date >= ?"); args.append(date_from)
    if codes:
        conds.append(f"code in ({','.join('?' * len(codes))})"); args.extend(codes)
    if or_amount_wan > 0:
        conds.append("((buy_vol - sell_vol) >= ? "
                     "or (buy_vol - sell_vol) * 1000.0 * buy_avg_price >= ?)")
        args.extend([min_lots, or_amount_wan * 10000])
    else:
        conds.append("(buy_vol - sell_vol) >= ?"); args.append(min_lots)
    q = ("select broker_id, broker_name, code, trade_date, buy_avg_price, (buy_vol - sell_vol) "
         "from wantgoo_daily where " + " and ".join(conds))

    stat = defaultdict(lambda: {
        "name": "", "last": "", "events": 0,
        "win": {n: 0 for n in hold_days},
        "cnt": {n: 0 for n in hold_days},
        "ret": {n: 0.0 for n in hold_days},
    })
    for bid, bname, code, d, entry, net in conn.execute(q, tuple(args)):
        s = stat[bid]
        s["events"] += 1
        if bname and d >= s["last"]:          # 取最近日期的分點名
            s["name"] = bname; s["last"] = d
        for n in hold_days:
            c_after = close_after(prices, code, d, n)
            if c_after:
                s["cnt"][n] += 1
                s["ret"][n] += (c_after - entry) / entry
                if c_after > entry:
                    s["win"][n] += 1

    rows = []
    for bid, s in stat.items():
        if s["events"] < min_events:
            continue
        row = {"broker_id": bid, "broker_name": s["name"], "events": s["events"]}
        for n in hold_days:
            cnt = s["cnt"][n]
            row[f"win{n}"] = round(s["win"][n] / cnt * 100, 1) if cnt else None
            row[f"ret{n}"] = round(s["ret"][n] / cnt * 100, 2) if cnt else None
            row[f"n{n}"] = cnt
        rows.append(row)
    sort_key = f"win{max(hold_days)}"
    rows.sort(key=lambda r: (r[sort_key] or 0), reverse=True)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", help="限定股票代碼（逗號分隔），預設全市場")
    ap.add_argument("--min-lots", type=int, default=300, help="事件門檻（張數制）：單日淨買超張數")
    ap.add_argument("--min-amount", type=int, default=0,
                    help="事件門檻（金額制，萬元）：單日淨買超金額，例 3000=3000萬。指定後取代張數制")
    ap.add_argument("--min-events", type=int, default=5, help="至少幾次事件才列入排行")
    ap.add_argument("--top", type=int, default=30, help="顯示前幾名")
    ap.add_argument("--days", default="5,20", help="事件法觀察天數，逗號分隔（例：3,10,60）")
    args = ap.parse_args()

    hold_days = sorted({int(x) for x in args.days.split(",") if x.strip()})
    codes = [c.strip() for c in args.codes.split(",")] if args.codes else None
    conn = sqlite3.connect(str(DB_PATH))
    print("載入收盤價...")
    prices = load_prices(conn, codes)
    print(f"  {len(prices)} 支股票有價格資料")
    th_desc = (f"淨買超金額≥{args.min_amount}萬元" if args.min_amount > 0
               else f"淨買超≥{args.min_lots}張")
    print(f"分析分點（事件門檻 {th_desc}，最少{args.min_events}次，窗口 {hold_days} 日）...")
    rows = analyze(conn, prices, codes, args.min_lots, args.min_events, hold_days,
                   min_amount_wan=args.min_amount)
    print(f"  符合條件分點：{len(rows)} 個\n")

    day_hdr = "".join(f"{str(n)+'日勝率':>9}{str(n)+'日均報':>9}" for n in hold_days)
    hdr = f"{'分點':<20}{'屬性':<8}{'事件':>5}{day_hdr}{'平倉筆':>7}{'平倉勝率':>9}{'均持有':>7}"
    print(hdr)
    print("-" * len(hdr))
    for r in rows[:args.top]:
        day_cells = "".join(f"{str(r[f'win{n}']) + '%':>9}{str(r[f'ret{n}']) + '%':>9}" for n in hold_days)
        print(f"{(r['broker_name'] or r['broker_id'])[:18]:<20}{r['type']:<8}{r['events']:>5}"
              f"{day_cells}"
              f"{r['closed_trades']:>7}{str(r['closed_win']) + '%':>9}{str(r['avg_hold']):>7}")

    out = OUT_CSV
    try:
        f = open(out, "w", newline="", encoding="utf-8-sig")
    except PermissionError:
        # 原檔被 Excel 開啟鎖住 → 改存帶時間戳的檔名
        from datetime import datetime as _dt
        out = OUT_CSV.with_name(f"broker_rank_{_dt.now():%Y%m%d_%H%M%S}.csv")
        f = open(out, "w", newline="", encoding="utf-8-sig")
    with f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [])
        w.writeheader()
        w.writerows(rows)
    print(f"\n完整結果已存 {out}")


if __name__ == "__main__":
    main()
