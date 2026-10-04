# -*- coding: utf-8 -*-
"""holder_flow_push.py — 大戶/散戶 週買賣超（Phase 2，2026-10-04）
TDCC 集保股權分散表(holding_distribution，週) + stock_daily 當週收盤(市值換算) → 算每檔每週
大戶/散戶 持股與週增減 → 推 Supabase holder_flow。前端 K 圖「籌碼」頁-大戶/散戶(週) 讀此表。

門檻（用戶 2026-10-03 定案）：
  大戶 = 持股≥300張 或 市值≥3000萬 → 等效門檻股 = min(300*1000, 30,000,000 / 收盤)
  散戶 = 持股<20張 或 市值<100萬  → 等效門檻股 = max(20*1000,  1,000,000 / 收盤)
  跨門檻的 TDCC 級距用均勻分布線性內插（近似）。
週增減(net) = 本週持股 − 上週持股，單位張。覆蓋：熱門前 N(預設300) 檔（依近20日成交值）。

用法：
  python scripts/holder_flow_push.py --compute-only            # 只用現有 TDCC 資料算+推(不抓TDCC，快)
  python scripts/holder_flow_push.py --compute-only --stocks 2330,2317
  python scripts/holder_flow_push.py --top 300 --weeks 16      # 抓前300檔最近16週TDCC(缺才抓)+算+推
  python scripts/holder_flow_push.py --top 300                 # 每日排程用(只補最新週、斷點跳過)
"""
import argparse
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  (_load_env / _sb)
import broker_analysis as ba          # noqa: E402  (DB_PATH)
import chip_etl_tdcc as tdcc          # noqa: E402  (TDCC 逐股週抓取)

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BATCH = 500
BIG_LOTS, BIG_VALUE = 300, 30_000_000     # 大戶：300張 或 3000萬
RET_LOTS, RET_VALUE = 20, 1_000_000       # 散戶：<20張 或 <100萬


def top_codes(conn, n, lookback=20):
    """近 lookback 交易日平均成交值(close*volume) 前 n 檔。"""
    days = [r[0] for r in conn.execute(
        "select distinct trade_date from stock_daily order by trade_date desc limit ?", (lookback,)).fetchall()]
    if not days:
        return []
    cut = days[-1]
    rows = conn.execute(
        "select code, avg(close*volume) av from stock_daily "
        "where trade_date>=? and close is not null and volume is not null and volume>0 "
        "group by code order by av desc limit ?", (cut, n)).fetchall()
    return [r[0] for r in rows]


def week_close(conn, code, week_date):
    """當週(含)之前最近一個交易日收盤。"""
    r = conn.execute(
        "select close from stock_daily where code=? and trade_date<=? and close is not null "
        "order by trade_date desc limit 1", (code, week_date)).fetchone()
    return r[0] if r and r[0] else None


def classify(levels, price):
    """levels: [(level_code,min_shares,max_shares,shares)] 單位股。回 (big_shares, retail_shares, total)。"""
    t_big = min(BIG_LOTS * 1000, BIG_VALUE / price)      # 大戶：持股 >= t_big(股)
    t_ret = max(RET_LOTS * 1000, RET_VALUE / price)      # 散戶：持股 <  t_ret(股)
    big = ret = 0.0
    total = 0
    for code, lo, hi, s in levels:
        if code > 15 or not s:        # 排除 差異調整(16)/合計(17)
            continue
        total += s
        if lo is None:
            continue
        # 大戶：持股 >= t_big
        if hi is None:                # 最高開放級距(1,000,001以上) → 視為全大戶
            big += s
        elif lo >= t_big:
            big += s
        elif hi > t_big:              # 跨門檻 → 內插(高於門檻的比例)
            big += s * max(0.0, min(1.0, (hi - t_big) / (hi - lo)))
        # 散戶：持股 < t_ret
        if hi is not None:
            if hi <= t_ret:
                ret += s
            elif lo < t_ret:          # 跨門檻 → 內插(低於門檻的比例)
                ret += s * max(0.0, min(1.0, (t_ret - lo) / (hi - lo)))
    return int(round(big)), int(round(ret)), total


def compute_rows(conn, code):
    """回該檔所有週的 holder_flow 記錄(含週增減)。需 holding_distribution 有資料。"""
    weeks = [r[0] for r in conn.execute(
        "select distinct data_date from holding_distribution where stock_id=? order by data_date", (code,)).fetchall()]
    out = []
    prev_big = prev_ret = None
    for wk in weeks:
        px = week_close(conn, code, wk)
        if not px or px <= 0:
            prev_big = prev_ret = None      # 無收盤 → 斷鏈，net 從下一筆重算
            continue
        levels = conn.execute(
            "select level_code,minimum_shares,maximum_shares,shares from holding_distribution "
            "where stock_id=? and data_date=?", (code, wk)).fetchall()
        big, ret, total = classify(levels, px)
        if total <= 0:
            prev_big = prev_ret = None
            continue
        big_net = round((big - prev_big) / 1000) if prev_big is not None else None
        ret_net = round((ret - prev_ret) / 1000) if prev_ret is not None else None
        out.append({
            "code": code, "week_date": wk,
            "big_shares": big, "retail_shares": ret, "total_shares": total,
            "big_pct": round(big / total * 100, 2), "retail_pct": round(ret / total * 100, 2),
            "big_net": big_net, "retail_net": ret_net, "close_px": px,
        })
        prev_big, prev_ret = big, ret
    return out


def fetch_tdcc(codes, weeks_limit, only_latest):
    """為每檔補抓缺少的 TDCC 週(限流；斷點跳過已存)。weeks_limit=最近幾週；only_latest=只補最新一週。"""
    conn = tdcc._db()
    op = tdcc._opener()
    try:
        tok, all_dates = tdcc._fetch_dates(op)
    except Exception as e:
        print(f"[warn] 取得 TDCC 日期失敗：{e}（改用現有資料計算）")
        conn.close(); return
    dates = sorted(all_dates)
    if only_latest:
        dates = dates[-1:]
    elif weeks_limit:
        dates = dates[-weeks_limit:]
    import datetime as _dt
    now = _dt.datetime.now().isoformat(timespec="seconds")
    for i, code in enumerate(codes, 1):
        done = {r[0].replace("-", "") for r in conn.execute(
            "select distinct data_date from holding_distribution where stock_id=?", (code,))}
        todo = [d for d in dates if d not in done]
        if not todo:
            continue
        got = 0
        for d in todo:
            time.sleep(1.2)
            try:
                levels, tok2 = tdcc._query(op, tok, d, code)
                if not levels:
                    tok, _ = tdcc._fetch_dates(op); time.sleep(1.0)
                    levels, tok2 = tdcc._query(op, tok, d, code)
                if tok2:
                    tok = tok2
            except Exception as e:
                code_err = getattr(e, "code", None)
                if code_err in (401, 403, 429):
                    print(f"[stop] {code} {d}: HTTP {code_err} → TDCC 限流，停止抓取"); conn.close(); return
                continue
            if not levels:
                continue
            diso = f"{d[:4]}-{d[4:6]}-{d[6:]}"
            conn.executemany(
                "insert or replace into holding_distribution "
                "(data_date,stock_id,level_code,level_label,minimum_shares,maximum_shares,holders,shares,percentage,source,fetched_at) "
                "values (?,?,?,?,?,?,?,?,?,?,?)",
                [(diso, code, x["code"], x["label"], x["min"], x["max"], x["holders"], x["shares"], x["pct"], "tdcc_smweb", now) for x in levels])
            conn.commit()
            got += 1
        if got:
            print(f"  [{i}/{len(codes)}] {code}: 新抓 {got} 週")
    conn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=300)
    ap.add_argument("--stocks", help="指定代號(逗號分隔)，覆蓋 --top")
    ap.add_argument("--weeks", type=int, default=0, help="TDCC 補抓最近幾週(0=只補最新週)")
    ap.add_argument("--compute-only", action="store_true", help="不抓 TDCC，只用現有資料算+推")
    args = ap.parse_args()

    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    conn = sqlite3.connect(str(ba.DB_PATH))
    if args.stocks:
        codes = [s.strip() for s in args.stocks.split(",") if s.strip()]
    else:
        codes = top_codes(conn, args.top)
    print(f"標的 {len(codes)} 檔{'（compute-only）' if args.compute_only else ''}")

    if not args.compute_only:
        fetch_tdcc(codes, args.weeks, only_latest=(args.weeks == 0))

    # 計算 + 推送
    all_rows = []
    have = 0
    for code in codes:
        rows = compute_rows(conn, code)
        if rows:
            have += 1
            all_rows.extend(rows)
    conn.close()
    print(f"有 TDCC 資料可算的 {have}/{len(codes)} 檔，共 {len(all_rows)} 筆週記錄")
    if not all_rows:
        print("無可推送資料（TDCC 尚未抓到）。"); return

    # 先刪除本次涉及代號的舊列（冪等：每檔都重算完整歷史後重寫）
    wrote_codes = sorted({row["code"] for row in all_rows})
    for i in range(0, len(wrote_codes), 100):
        grp = wrote_codes[i:i + 100]
        bs._sb(env, "/holder_flow", method="DELETE",
               params=[("code", "in.(" + ",".join(grp) + ")")])

    ok = 0
    for i in range(0, len(all_rows), BATCH):
        chunk = all_rows[i:i + BATCH]
        s, r = bs._sb(env, "/holder_flow", method="POST", body=chunk)
        if s in (200, 201):
            ok += len(chunk)
        else:
            print(f"[error] 批 {i} 失敗 ({s}): {r}"); return
    print(f"已寫入 holder_flow {ok} 筆")


if __name__ == "__main__":
    main()
