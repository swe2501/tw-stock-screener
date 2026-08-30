"""
compute_box.py — 每日用「預設參數」掃全市場箱型型態 → Supabase box_patterns(篩選器用)。

箱型偵測邏輯見 box_pattern.py(規則型、無未來洩漏)。此腳本每日跑一次:
  讀本機 stock_daily 每檔最近 READ_BARS 根 → 於最新時點評估 → 有箱型者存快照(整表覆蓋)。
K圖的「可調參數」互動版由前端即時算(讀 price_window),不走這裡。

用法：python scripts/compute_box.py [--dry-run]
"""
import sqlite3
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402  # DB_PATH
import broker_signals as bs           # noqa: E402  # _load_env / _sb
import box_pattern as bp              # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

READ_BARS = 150       # 每檔讀最近根數(lookback 60 + ATR 暖身 + 狀態演進緩衝)
MIN_BARS = 40


def main():
    dry = "--dry-run" in sys.argv
    env = bs._load_env()
    if not dry and not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    conn = sqlite3.connect(str(ba.DB_PATH))
    codes = [r[0] for r in conn.execute("select distinct code from stock_daily")]
    latest = conn.execute("select max(trade_date) from stock_daily").fetchone()[0]

    recs = []
    for code in codes:
        rows = conn.execute(
            "select trade_date,open,high,low,close,volume from stock_daily "
            "where code=? order by trade_date desc limit ?", (code, READ_BARS)).fetchall()
        if len(rows) < MIN_BARS:
            continue
        rows.reverse()
        bars = [bp.Bar(d, o, h, l, c, v or 0) for d, o, h, l, c, v in rows]
        r = bp.evaluate(bars, len(bars) - 1)
        if not r:
            continue
        recs.append({
            "code": code, "status": r["status"],
            "upper_center": r["upper_center"], "lower_center": r["lower_center"],
            "upper_outer": r["upper_outer"], "lower_outer": r["lower_outer"],
            "breakout_date": str(r["breakout_timestamp"]) if r["breakout_timestamp"] else None,
            "breakout_direction": r["breakout_direction"], "breakout_reason": r["breakout_reason"],
            "window_start": str(r["window_start"]), "window_end": str(r["window_end"]),
            "data_date": latest,
        })

    dist = Counter(x["status"] for x in recs)
    print(f"掃描 {len(codes)} 檔,箱型 {len(recs)} 檔(資料日 {latest}){'（dry-run，未上傳）' if dry else ''}")
    print("  狀態分佈:", dict(dist))
    for st in ("CONFIRMED_UP", "CONFIRMED_DOWN", "FALSE_UP_THEN_DOWN", "FALSE_DOWN_THEN_UP"):
        ex = [x["code"] for x in recs if x["status"] == st][:8]
        if ex:
            print(f"    {st}: {ex}")
    if dry:
        return

    bs._sb(env, "/box_patterns", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(recs), 5000):
        s, resp = bs._sb(env, "/box_patterns", method="POST", body=recs[i:i + 5000])
        if s in (200, 201):
            ok += len(recs[i:i + 5000])
        else:
            print(f"[error] 上傳失敗 ({s}): {resp}"); return
    print(f"已上傳 {ok} 檔箱型到 box_patterns")


if __name__ == "__main__":
    main()
