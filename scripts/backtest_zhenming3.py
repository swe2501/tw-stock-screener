"""
backtest_zhenming3.py — 「真名三式」歷史回測（判定函式與網站篩選器共用 api/screen.py 的 zhenming3_at）。

資料：本機 SQLite stock_daily（上市 twse／上櫃 otc 普通股，2024-07 起，未還原價）。
交易規則（依合夥人文件 SOP，文件未明定處取保守做法）：
  進場：訊號日「次一交易日開盤」買進（避免用當日收盤的前視偏誤）。
  停損：任何一天最低價 ≤ 停損參考價 → 以停損價出場（若開盤已跳空跌破，以開盤價出場）；全部部位。
  第一目標：最高價 > 前高（長黑前 20 日最高）→ 以前高價賣出一半（開盤已跳空越過則以開盤價）。
  剩餘一半：收盤跌破 10 日均線 → 當日收盤出場；最長持有 60 個交易日後收盤出場。
  同日同時觸及停損與目標 → 保守視為先觸停損。
  成本：手續費 0.1425%×2＋證交稅 0.3%（來回約 0.585%）。
  勝＝整筆交易（加權兩段部位）扣成本後報酬 > 0。
結果寫到 scripts/backtest_zhenming3_result.json，並印出摘要。本回測為歷史統計，不代表未來績效。
用法：python scripts/backtest_zhenming3.py
"""
import json
import sqlite3
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "scripts"))
import screen  # noqa: E402  共用 zhenming3_at
import broker_analysis as ba  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

COST = 0.001425 * 2 + 0.003
MAX_HOLD = 60


def load():
    c = sqlite3.connect(str(ba.DB_PATH))
    bars = defaultdict(list)
    for code, d, o, h, l, cl, v in c.execute(
            "select code,trade_date,open,high,low,close,volume from stock_daily where close is not null order by code,trade_date"):
        if o and h and l:
            bars[code].append((d, o, h, l, cl, v or 0))
    return bars


def simulate(b, t, sig):
    """回 dict 或 None（資料不足以進場）。"""
    e = t + 1
    if e >= len(b):
        return None
    entry = b[e][1]
    stop, target = sig["stop"], sig["target"]
    half_done, half_px, exit_px, exit_i, reason = False, None, None, None, None
    for i in range(e, min(len(b), e + MAX_HOLD)):
        d, o, h, l, c, v = b[i]
        # 停損（全部部位；已賣一半則剩餘一半）
        if l <= stop:
            px = o if o < stop else stop
            exit_px, exit_i, reason = px, i, "停損"
            break
        if not half_done and h > target:
            half_px = o if o > target else target
            half_done = True
        closes = [x[4] for x in b[max(0, i - 9):i + 1]]
        if half_done and len(closes) == 10 and c < sum(closes) / 10:
            exit_px, exit_i, reason = c, i, "跌破10MA"
            break
    if exit_px is None:
        i = min(len(b), e + MAX_HOLD) - 1
        if i == len(b) - 1 and i < e + MAX_HOLD - 1:
            reason = "未結束(持有中)"
        else:
            reason = "持有滿60日"
        exit_px, exit_i = b[i][4], i
    if half_done:
        ret = 0.5 * (half_px / entry - 1) + 0.5 * (exit_px / entry - 1)
    else:
        ret = exit_px / entry - 1
    ret -= COST
    return {"date": b[t][0], "entry_date": b[e][0], "entry": entry, "ret": ret, "hold": exit_i - e + 1,
            "tp1": half_done, "reason": reason, "vol": sig["vol"]}


def summarize(trades):
    if not trades:
        return {"n": 0}
    r = [x["ret"] for x in trades]
    return {"n": len(r), "win_rate": round(sum(1 for x in r if x > 0) / len(r) * 100, 1),
            "avg_ret": round(statistics.mean(r) * 100, 2), "median_ret": round(statistics.median(r) * 100, 2),
            "tp1_rate": round(sum(1 for x in trades if x["tp1"]) / len(trades) * 100, 1),
            "stop_rate": round(sum(1 for x in trades if x["reason"] == "停損") / len(trades) * 100, 1),
            "avg_hold": round(statistics.mean(x["hold"] for x in trades), 1),
            "best": round(max(r) * 100, 1), "worst": round(min(r) * 100, 1)}


def main():
    bars = load()
    trades, fwd = [], defaultdict(list)
    for code, b in bars.items():
        for t in range(25, len(b)):
            sig = screen.zhenming3_at(b, t)
            if not sig:
                continue
            tr = simulate(b, t, sig)
            if tr:
                tr["code"] = code
                trades.append(tr)
            for k in (5, 10, 20):   # 參考：訊號日收盤後第 k 日收盤報酬（不含停損停利）
                if t + k < len(b):
                    fwd[(k, sig["vol"])].append(b[t + k][4] / b[t][4] - 1)
    closed = [x for x in trades if not x["reason"].startswith("未結束")]
    out = {
        "period": [min(x["date"] for x in trades), max(x["date"] for x in trades)] if trades else None,
        "universe": len(bars), "cost_roundtrip_pct": round(COST * 100, 3),
        "all": summarize(closed), "vol": summarize([x for x in closed if x["vol"]]),
        "novol": summarize([x for x in closed if not x["vol"]]),
        "open_positions": len(trades) - len(closed),
        "fwd": {f"{k}d_{'vol' if v else 'novol'}": {"n": len(a), "win_rate": round(sum(1 for x in a if x > 0) / len(a) * 100, 1),
                                                   "avg": round(statistics.mean(a) * 100, 2)}
                for (k, v), a in sorted(fwd.items()) if a},
        "exit_reasons": {r: sum(1 for x in closed if x["reason"] == r) for r in sorted({x["reason"] for x in closed})},
    }
    (ROOT / "scripts" / "backtest_zhenming3_result.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
