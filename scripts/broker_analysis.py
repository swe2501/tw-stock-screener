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


def analyze(conn, prices, codes=None, min_lots=300, min_events=5, hold_days=(5, 20)):
    """
    單次掃描 wantgoo_daily（依 broker_id, code, trade_date 排序）同時計算：
      事件法統計 + FIFO 配對統計，彙整到 broker 層級。
    hold_days：事件法觀察的交易日窗口，可多組（如 3,10,60）。
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
    args = ()
    if codes:
        q += f" where code in ({','.join('?' * len(codes))})"
        args = tuple(codes)
    q += " order by broker_id, code, trade_date"

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

        # ── 事件法：單日淨買超 ≥ min_lots ──
        if net >= min_lots:
            entry = bavg or (prices.get(code) and prices[code][1].get(d))
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", help="限定股票代碼（逗號分隔），預設全市場")
    ap.add_argument("--min-lots", type=int, default=300, help="事件門檻：單日淨買超張數")
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
    print(f"分析分點（事件門檻 淨買超≥{args.min_lots}張，最少{args.min_events}次，窗口 {hold_days} 日）...")
    rows = analyze(conn, prices, codes, args.min_lots, args.min_events, hold_days)
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

    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [])
        w.writeheader()
        w.writerows(rows)
    print(f"\n完整結果已存 {OUT_CSV}")


if __name__ == "__main__":
    main()
