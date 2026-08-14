"""
compute_strength.py — 每日算全市場個股「強度」→ Supabase stock_strength（P2 用）。

強度 = 價格相對強度(RS) + 均線多頭 + 近波段高，另附主力大單買超天數(籌碼)。
給 P4 話題儀表板用：hot_topics 的個股 join 此表 → 排出族群佼佼者。
價格資料變動是「每日」級，故掛每日排程即可（與話題的每小時脫鉤）。

RS 用「橫斷面百分位」(不需大盤指數)：某股 20/60 日報酬在全市場的名次百分位。
用法：python scripts/compute_strength.py
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402  # DB_PATH
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

WANTGOO_DB = r"D:\stock_data\wantgoo_full.db"
BIGBUY_LOTS = 300      # 單日單分點淨買超 ≥ 此張數 = 大單
BIGBUY_DAYS = 5        # 近幾個交易日


def _pctile_rank(values):
    """回傳 {code: 百分位0~100}（同分取平均名次）。"""
    order = sorted(values.items(), key=lambda kv: kv[1])
    n = len(order)
    out = {}
    for i, (code, _) in enumerate(order):
        out[code] = round(i / (n - 1) * 100, 1) if n > 1 else 50.0
    return out


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    conn = sqlite3.connect(str(ba.DB_PATH))
    dates = [r[0] for r in conn.execute(
        "select distinct trade_date from stock_daily order by trade_date desc limit 70")]
    if len(dates) < 61:
        print(f"stock_daily 交易日不足（{len(dates)}），中止"); return
    lo = dates[-1]
    rows = conn.execute(
        "select code, trade_date, close, high from stock_daily where trade_date>=? and close is not null",
        (lo,)).fetchall()
    by_code = {}
    for c, d, cl, h in rows:
        by_code.setdefault(c, []).append((d, cl, h))

    mom, feat = {}, {}
    for code, series in by_code.items():
        series.sort()
        closes = [x[1] for x in series]
        highs = [x[2] for x in series if x[2]]
        if len(closes) < 61:
            continue
        c0 = closes[-1]
        ret20 = c0 / closes[-21] - 1 if closes[-21] else 0
        ret60 = c0 / closes[-61] - 1 if closes[-61] else 0
        ma20 = sum(closes[-20:]) / 20
        ma60 = sum(closes[-60:]) / 60
        high60 = max(highs[-60:]) if highs else c0
        mom[code] = 0.6 * ret20 + 0.4 * ret60
        feat[code] = {
            "ret20": round(ret20 * 100, 2),
            "above_ma": bool(c0 > ma20 > ma60),
            "near_high": round(c0 / high60, 3) if high60 else 0,
        }
    if not mom:
        print("無足夠資料計算強度，中止"); return
    rs = _pctile_rank(mom)

    # 主力大單買超天數（近 5 交易日，任一分點單日淨買超 ≥300 張）
    bigbuy = {}
    try:
        wg = sqlite3.connect(WANTGOO_DB)
        wdates = [r[0] for r in wg.execute(
            "select distinct trade_date from wantgoo_daily order by trade_date desc limit ?", (BIGBUY_DAYS,))]
        if wdates:
            ph = ",".join("?" * len(wdates))
            for code, d in wg.execute(
                    f"select code, count(distinct trade_date) from wantgoo_daily "
                    f"where trade_date in ({ph}) and (buy_vol - sell_vol) >= ? group by code",
                    (*wdates, BIGBUY_LOTS)):
                bigbuy[code] = d
        wg.close()
    except Exception as e:
        print(f"  (主力大單買超讀取略過：{type(e).__name__})")

    recs = []
    for code, f in feat.items():
        strength = round(0.6 * rs[code] + 0.2 * (100 if f["above_ma"] else 0) + 0.2 * f["near_high"] * 100)
        recs.append({"code": code, "strength": strength, "rs": round(rs[code]),
                     "ret20": f["ret20"], "above_ma": f["above_ma"],
                     "near_high": f["near_high"], "bigbuy_5d": bigbuy.get(code, 0)})

    bs._sb(env, "/stock_strength", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(recs), 5000):
        s, r = bs._sb(env, "/stock_strength", method="POST", body=recs[i:i + 5000])
        if s in (200, 201):
            ok += len(recs[i:i + 5000])
        else:
            print(f"[error] 上傳失敗 ({s}): {r}"); return
    top = sorted(recs, key=lambda x: -x["strength"])[:5]
    print(f"已上傳 {ok} 檔強度到 stock_strength（資料日 {dates[0]}）")
    print("  強度前5:", ", ".join(f"{x['code']}({x['strength']})" for x in top))


if __name__ == "__main__":
    main()
