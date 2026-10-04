# -*- coding: utf-8 -*-
"""inst_daily_push.py — 把本機 institutional_trades（三大法人逐日）推到 Supabase inst_daily，
供前端 K 圖「籌碼」tab 畫三大法人每日淨買賣超堆疊柱。（2026-10-03）

資料源：本機 D:\\stock_data\\wantgoo_full.db 的 institutional_trades（含上市+上櫃、完整歷史）。
單位換算：net_shares（股）÷1000 四捨五入 → 張。
欄位：foreign=外資、investment_trust=投信、dealer_total=自營合計、institutional_total=三大法人合計。
保留：滾動最近 120 交易日（約 6 個月）；每次推送刪除更舊列（防無限長大，對應 sql/inst_daily.sql 容量估算 ~28MB）。

用法：
  python scripts/inst_daily_push.py              # 每日：只補最新交易日 + 修剪舊列（快）
  python scripts/inst_daily_push.py --backfill   # 首次/補洞：重建整個 120 日窗
  python scripts/inst_daily_push.py --force       # 略過新鮮度防呆（來源日未比既有新也照寫）
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402
import broker_analysis as ba  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KEEP_DAYS = 120   # 滾動保留交易日數（對齊 3mo/6mo 日K 視窗）
BATCH = 1000

_MAP = {
    "foreign": "foreign_net",
    "investment_trust": "trust_net",
    "dealer_total": "dealer_net",
    "institutional_total": "total_net",
}


def _lots(shares):
    """股 → 張（四捨五入）。None/空 視為 0。"""
    try:
        return int(round(float(shares) / 1000.0))
    except Exception:
        return 0


def _trading_days(conn):
    """回傳 DB 內最近 KEEP_DAYS 個交易日（新→舊）與 cutoff（第 KEEP_DAYS 新的日期）。"""
    days = [r[0] for r in conn.execute(
        "select distinct trade_date from institutional_trades order by trade_date desc limit ?",
        (KEEP_DAYS,)).fetchall()]
    return days, (days[-1] if days else None)


def _build(conn, where_sql, params):
    """把 institutional_trades 的多列 investor_type 收斂成每檔每日一列。"""
    rows = conn.execute(
        f"select stock_id, trade_date, investor_type, net_shares "
        f"from institutional_trades where {where_sql}", params).fetchall()
    agg = {}   # (code,date) -> rec
    for stock_id, date, itype, net in rows:
        col = _MAP.get(itype)
        if not col:
            continue
        code = str(stock_id).strip()
        if not code:
            continue
        k = (code, date)
        rec = agg.get(k)
        if rec is None:
            rec = {"code": code, "trade_date": date,
                   "foreign_net": 0, "trust_net": 0, "dealer_net": 0, "total_net": 0}
            agg[k] = rec
        rec[col] = _lots(net)
    return list(agg.values())


def _push(env, recs):
    ok = 0
    for i in range(0, len(recs), BATCH):
        s, r = bs._sb(env, "/inst_daily", method="POST", body=recs[i:i + BATCH])
        if s in (200, 201):
            ok += len(recs[i:i + BATCH])
        else:
            print(f"[error] 第 {i} 批寫入失敗 ({s}): {r}")
            sys.exit(1)
    return ok


def main():
    backfill = "--backfill" in sys.argv
    force = "--force" in sys.argv
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止")
        sys.exit(1)

    conn = sqlite3.connect(str(ba.DB_PATH))
    days, cutoff = _trading_days(conn)
    if not days:
        print("[error] 本機 institutional_trades 無資料")
        return
    latest_local = days[0]
    print(f"本機最新交易日 {latest_local}，保留窗 {cutoff} ~ {latest_local}（{len(days)} 交易日）")

    # 新鮮度防呆：Supabase 既有最新日已 >= 本機最新日 → 不重複寫（--force 可略過）
    if not force and not backfill:
        remote = bs.latest_trade_date(env, "inst_daily")
        if remote and remote >= latest_local:
            print(f"Supabase inst_daily 最新日 {remote} 未落後本機 {latest_local}，略過（--force 可強制）")
            conn.close()
            return

    if backfill:
        recs = _build(conn, "trade_date >= ?", (cutoff,))
        print(f"[backfill] 整窗 {len(recs)} 檔日，清空重建…")
        bs._sb(env, "/inst_daily", method="DELETE", params=[("code", "neq.__none__")])
        ok = _push(env, recs)
        print(f"[backfill] 已寫入 {ok} 列")
    else:
        recs = _build(conn, "trade_date = ?", (latest_local,))
        print(f"[daily] {latest_local} 共 {len(recs)} 檔，覆蓋當日…")
        bs._sb(env, "/inst_daily", method="DELETE", params=[("trade_date", f"eq.{latest_local}")])
        ok = _push(env, recs)
        print(f"[daily] 已寫入 {ok} 列")

    # 修剪：刪除超出保留窗（< cutoff）的舊列
    s, _ = bs._sb(env, "/inst_daily", method="DELETE", params=[("trade_date", f"lt.{cutoff}")])
    print(f"修剪 < {cutoff} 舊列（status {s}）")
    conn.close()


if __name__ == "__main__":
    main()
