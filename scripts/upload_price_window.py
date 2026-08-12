"""
upload_price_window.py — 把本機 stock_daily 的「近 N 個交易日」價格窗上傳 Supabase price_window。

用途：篩選器(screen.py,跑在 Vercel)算均線需要「每檔近 60 天收盤」——那是「每股一長串歷史」的
形狀,若在 Vercel 對 TWSE 一檔一檔抓會被擋。改由本機(每天用 STOCK_DAY_ALL 一次全市場抓、慢慢累積、
從不被擋)把近 N 天上傳,篩選器只讀 Supabase(0 個 TWSE 請求)。

每日排程跑(fetch_prices 之後);量約 1080 檔 × 250 天 ≈ 27 萬列 ≈ ~15MB,免費版(500MB)無感。
(250 根 = 給 MACD 足夠 EMA 暖身,柱狀體與 K 圖一致,不再有 0 軸附近的假交叉。)
用法：python scripts/upload_price_window.py [--days 250]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402  # DB_PATH
import broker_signals as bs           # noqa: E402  # _sb / _load_env
import sqlite3                        # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

CHUNK = 5000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=250, help="上傳近幾個交易日(預設 250)")
    args = ap.parse_args()

    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY,中止"); sys.exit(1)

    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout=60000")
    dates = [r[0] for r in conn.execute(
        "select distinct trade_date from stock_daily order by trade_date desc limit ?", (args.days,))]
    if not dates:
        print("stock_daily 無資料,中止"); return
    lo, hi = min(dates), max(dates)
    rows = conn.execute(
        "select code, trade_date, open, high, low, close, volume from stock_daily "
        "where trade_date>=? and close is not null", (lo,)).fetchall()
    recs = [{"code": c, "trade_date": d, "open": o, "high": h, "low": lw, "close": cl, "volume": v}
            for c, d, o, h, lw, cl, v in rows]

    # 整張換掉(近 N 天滾動,舊的自動退場)
    bs._sb(env, "/price_window", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(recs), CHUNK):
        s, r = bs._sb(env, "/price_window", method="POST", body=recs[i:i + CHUNK])
        if s in (200, 201):
            ok += len(recs[i:i + CHUNK])
        else:
            print(f"[error] 第 {i} 批上傳失敗 ({s}): {r}"); return
    print(f"已上傳 {ok} 列價格窗（近 {args.days} 交易日 {lo}~{hi}）到 price_window")


if __name__ == "__main__":
    main()
