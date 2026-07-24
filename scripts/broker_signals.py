"""
盤後主力分點追蹤：
1. 用本機 SQLite 重算兩種排行榜（張數制 300 張 / 金額制 3000 萬）各取前 20 名分點
2. 撈出這些分點「最新交易日」的買超個股
3. 上傳 Supabase broker_signals 表（網站上只有擁有者帳號可讀）

由 run_daily_job.bat 在每日分點爬蟲之後自動執行；也可手動跑：
  python scripts/broker_signals.py
"""
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba  # noqa: E402  重用排行榜引擎

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

TOP_N       = 20    # 每種方法追蹤前幾名
MIN_LOTS_TH = 300   # 張數制事件門檻（fallback 本機重算時用）
MIN_AMT_TH  = 3000  # 金額制事件門檻（萬元）
MIN_EVENTS  = 10
# 名次來源已改為 Supabase broker_rankings 表（broker_rankings.py 每週六產生），
# 本檔不再自行維護排行榜快取。
# 當日買超顯示門檻（2026-07-21 起與排行榜「事件」口徑一致：只顯示重手）
SHOW_MIN_LOTS = 300    # lots 榜：單日淨買超 ≥ 300 張
SHOW_MIN_WAN  = 3000   # amount 榜：單日淨買超金額 ≥ 3000 萬


def _load_env():
    env = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _sb(env, path, method="GET", body=None, params=None, retries=3):
    # broker_signals 表僅擁有者可讀（RLS），帶條件的 DELETE 需要列可見性，
    # 匿名金鑰做不到 → 必須用 service_role 金鑰（只存在本機 .env.local）
    key = env.get("SUPABASE_SERVICE_KEY") or env["SUPABASE_ANON_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    headers = {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": f"Bearer {key}",
        # 純 insert：RLS 只開 insert/delete 給匿名端，任何 on_conflict 模式都需要
        # select/update 權限（會被擋）。先 DELETE 當日資料再寫入即可保證不重複。
        "Prefer": "return=minimal",
    }
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, json.loads(raw) if raw else []
        except urllib.error.HTTPError as e:
            raw = e.read()
            return e.code, json.loads(raw) if raw else {}
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                print(f"  [retry] Supabase 連線失敗（{e}），5 秒後重試")
                time.sleep(5)
            else:
                return 0, {}


def collect_signals(conn, prices, sig_date, method, top_rows,
                    min_lots=None, min_wan=None):
    """top_rows: analyze() 排行榜前 N 名 → 撈當日買超，回傳 records。
    門檻可覆寫：預設用 SHOW_MIN_LOTS/SHOW_MIN_WAN（每日網站顯示=重手）；
    本機統計留存時傳入較低門檻（50/500）以同時涵蓋大單與小單。"""
    lot_th = SHOW_MIN_LOTS if min_lots is None else min_lots
    wan_th = SHOW_MIN_WAN if min_wan is None else min_wan
    id_rank = {r["broker_id"]: (i + 1, r) for i, r in enumerate(top_rows)}
    if not id_rank:
        return []
    ph = ",".join("?" * len(id_rank))
    q = (f"select broker_id, broker_name, code, buy_vol, sell_vol, buy_avg_price "
         f"from wantgoo_daily where trade_date = ? and broker_id in ({ph})")
    records = []
    for bid, bname, code, buy, sell, bavg in conn.execute(q, (sig_date, *id_rank.keys())):
        net = (buy or 0) - (sell or 0)
        if net <= 0:
            continue
        price = bavg or (prices.get(code) and prices[code][1].get(sig_date))
        amt_wan = round(net * 1000 * price / 10000, 1) if price else None
        # 門檻按榜單分流：與該排行榜自身的邏輯一致
        if method == "lots":
            if net < lot_th:
                continue
        else:  # amount
            if (amt_wan or 0) < wan_th:
                continue
        rank, r = id_rank[bid]
        records.append({
            "signal_date": sig_date,
            "method": method,
            "rank": rank,
            "broker_id": bid,
            "broker_name": bname or r.get("broker_name") or bid,
            "code": code,
            "net_lots": int(net),
            "net_amount_wan": amt_wan,
            "buy_avg_price": round(price, 2) if price else None,
            "win20": r.get("win20"),
            "year_events": r.get("events"),  # 該分點過去一年出重手總次數
        })
    records.sort(key=lambda x: (x["rank"], -(x["net_amount_wan"] or 0)))
    return records


def collect_pool(conn, prices, sig_date, method, top_rows, pool, min_v, max_v):
    """實測用：撈某族群(top_rows)當日、落在 [min_v, max_v) 區間的買超，回傳帶 pool 標記的列。
    method=lots 時 min_v/max_v 是張數；method=amount 時是萬元。max_v<=0 表無上限。"""
    ids = {r["broker_id"] for r in top_rows}
    if not ids:
        return []
    ph = ",".join("?" * len(ids))
    q = (f"select broker_id, broker_name, code, buy_vol, sell_vol, buy_avg_price "
         f"from wantgoo_daily where trade_date = ? and broker_id in ({ph})")
    out = []
    for bid, bname, code, buy, sell, bavg in conn.execute(q, (sig_date, *ids)):
        net = (buy or 0) - (sell or 0)
        if net <= 0:
            continue
        price = bavg or (prices.get(code) and prices[code][1].get(sig_date))
        amt_wan = round(net * 1000 * price / 10000, 1) if price else None
        v = net if method == "lots" else (amt_wan or 0)
        if v < min_v or (max_v > 0 and v >= max_v):
            continue
        out.append({
            "signal_date": sig_date, "pool": pool, "method": method,
            "broker_id": bid, "broker_name": bname or bid, "code": code,
            "net_lots": int(net), "net_amount_wan": amt_wan,
            "buy_avg_price": round(price, 2) if price else None,
        })
    return out


def get_rankings(conn, prices):
    """名單單一真相來源：直接讀 Supabase broker_rankings 表（由 broker_rankings.py 每週產生）
    的 year_large_lots / year_large_amount，確保「主力訊號」與「分點回測」名次完全一致。
    讀不到時（表為空）才 fallback 本機重算。"""
    env = _load_env()
    lots = _fetch_ranking_view(env, "year_large_lots")
    amt  = _fetch_ranking_view(env, "year_large_amount")
    if lots and amt:
        print(f"名單來源：Supabase broker_rankings（張數 {len(lots)}、金額 {len(amt)} 名）")
        return lots, amt
    # fallback：表為空時本機重算（不寫回，避免又出現第二份來源）
    print("[warn] broker_rankings 表為空，改本機重算名單")
    top_lots = ba.analyze(conn, prices, min_lots=MIN_LOTS_TH, min_events=MIN_EVENTS)[:TOP_N]
    top_amt = ba.analyze(conn, prices, min_events=MIN_EVENTS, min_amount_wan=MIN_AMT_TH)[:TOP_N]
    return top_lots, top_amt


def _fetch_ranking_view(env, view):
    """從 broker_rankings 表讀某個 view 的前 20 名，轉成 collect_signals 需要的格式。"""
    status, rows = _sb(env, "/broker_rankings", params=[
        ("select", "rank,broker_id,broker_name,win20,events"),
        ("view", f"eq.{view}"), ("order", "rank.asc")])
    if status != 200 or not rows:
        return []
    return [{"broker_id": r["broker_id"], "broker_name": r["broker_name"],
             "win20": r["win20"], "events": r["events"]} for r in rows]


def _local_signal_table(conn):
    """本機訊號留存表（實測勝率評分用）。pool=large/small 區分大單前20/小單前20 族群。"""
    conn.execute("""
        create table if not exists broker_signals_local (
            signal_date    text not null,
            pool           text not null,
            method         text not null,
            broker_id      text not null,
            broker_name    text,
            code           text not null,
            net_lots       integer,
            net_amount_wan real,
            buy_avg_price  real,
            ret8           real,
            ret20          real,
            primary key (signal_date, pool, method, broker_id, code)
        )
    """)
    conn.commit()


def save_signals_local(conn, records):
    _local_signal_table(conn)
    conn.executemany("""
        insert or replace into broker_signals_local
        (signal_date, pool, method, broker_id, broker_name, code,
         net_lots, net_amount_wan, buy_avg_price, ret8, ret20)
        values (:signal_date, :pool, :method, :broker_id, :broker_name, :code,
                :net_lots, :net_amount_wan, :buy_avg_price,
                coalesce((select ret8  from broker_signals_local
                          where signal_date=:signal_date and pool=:pool and method=:method
                            and broker_id=:broker_id and code=:code), null),
                coalesce((select ret20 from broker_signals_local
                          where signal_date=:signal_date and pool=:pool and method=:method
                            and broker_id=:broker_id and code=:code), null))
    """, records)
    conn.commit()


def evaluate_signals(conn, prices):
    """對觀察期已滿的訊號計算 8/20 日報酬（用收盤價 vs 買進均價）。"""
    _local_signal_table(conn)
    updated = 0
    rows = conn.execute("""
        select rowid, code, signal_date, buy_avg_price, ret8, ret20
        from broker_signals_local
        where (ret8 is null or ret20 is null) and buy_avg_price is not null
    """).fetchall()
    for rowid, code, d, entry, ret8, ret20 in rows:
        sets = {}
        if ret8 is None:
            c8 = ba.close_after(prices, code, d, 8)
            if c8:
                sets["ret8"] = round((c8 - entry) / entry * 100, 2)
        if ret20 is None:
            c20 = ba.close_after(prices, code, d, 20)
            if c20:
                sets["ret20"] = round((c20 - entry) / entry * 100, 2)
        if sets:
            conn.execute(
                f"update broker_signals_local set {', '.join(k + '=?' for k in sets)} where rowid=?",
                (*sets.values(), rowid))
            updated += 1
    conn.commit()
    print(f"實測評分：更新 {updated} 筆（8/20 日觀察期滿的訊號）")


def upload_signal_stats(conn, env):
    """彙總實測勝率，依 (pool 族群 × method 榜別) 分組，整表覆蓋上傳 signal_stats。
    pool=large 大單前20族群的大單訊號、pool=small 小單前20族群的小單訊號。"""
    stats = []
    rows = conn.execute(
        "select distinct pool, method, broker_id from broker_signals_local").fetchall()
    for pool, method, bid in rows:
        bname = conn.execute(
            "select max(broker_name) from broker_signals_local where broker_id=? and pool=? and method=?",
            (bid, pool, method)).fetchone()[0]
        total, n8, win8, avg8, n20, win20, avg20 = conn.execute("""
            select count(*),
                   count(ret8),  avg(case when ret8  > 0 then 100.0 else 0 end),  avg(ret8),
                   count(ret20), avg(case when ret20 > 0 then 100.0 else 0 end), avg(ret20)
            from broker_signals_local where broker_id=? and pool=? and method=?
        """, (bid, pool, method)).fetchone()
        if not total:
            continue
        stats.append({
            "broker_id": bid, "broker_name": bname, "pool": pool, "method": method,
            "signals_total": total,
            "n8": n8,  "win8_pct":  round(win8, 1)  if n8  else None,
            "avg_ret8":  round(avg8, 2)  if avg8  is not None else None,
            "n20": n20, "win20_pct": round(win20, 1) if n20 else None,
            "avg_ret20": round(avg20, 2) if avg20 is not None else None,
        })
    if not stats:
        return
    _sb(env, "/signal_stats", method="DELETE", params=[("broker_id", "neq.__none__")])
    status, resp = _sb(env, "/signal_stats", method="POST", body=stats)
    if status in (200, 201):
        print(f"實測統計已上傳 {len(stats)} 列（分點 × 大小單）")
    else:
        print(f"[warn] 實測統計上傳失敗 ({status}): {resp}")


SIGNAL_START = "2026-07-17"   # 純實測起算日（此日起每日累積，不含之前的後見之明回填）


def get_pool_rankings(env):
    """讀 broker_rankings 表的四個年回測名單，回傳 dict。"""
    return {
        ("large", "lots"):   _fetch_ranking_view(env, "year_large_lots"),
        ("large", "amount"): _fetch_ranking_view(env, "year_large_amount"),
        ("small", "lots"):   _fetch_ranking_view(env, "year_small_lots"),
        ("small", "amount"): _fetch_ranking_view(env, "year_small_amount"),
    }


def record_pools(conn, prices, sig_date, pools):
    """把某日兩族群的訊號存進本機表：大單前20→大單訊號、小單前20→小單訊號。"""
    recs = []
    # 大單族群：張數≥300、金額≥3000（無上限）
    recs += collect_pool(conn, prices, sig_date, "lots",   pools[("large", "lots")],   "large", 300, 0)
    recs += collect_pool(conn, prices, sig_date, "amount", pools[("large", "amount")], "large", 3000, 0)
    # 小單族群：張數 50~300、金額 500~3000
    recs += collect_pool(conn, prices, sig_date, "lots",   pools[("small", "lots")],   "small", 50, 300)
    recs += collect_pool(conn, prices, sig_date, "amount", pools[("small", "amount")], "small", 500, 3000)
    if recs:
        save_signals_local(conn, recs)
    return len(recs)


def rebuild_since(conn, prices, env, start):
    """清空本機實測表，從 start 日起（純實測）重建兩族群訊號並重算統計。"""
    pools = get_pool_rankings(env)
    conn.execute("drop table if exists broker_signals_local")
    conn.commit()
    _local_signal_table(conn)
    dates = [r[0] for r in conn.execute(
        "select distinct trade_date from wantgoo_daily where trade_date >= ? order by trade_date",
        (start,))]
    total = 0
    for d in dates:
        total += record_pools(conn, prices, d, pools)
    print(f"純實測重建：{start} 起 {len(dates)} 個交易日、{total} 筆（大單前20+小單前20）")
    evaluate_signals(conn, prices)
    upload_signal_stats(conn, env)


def reupload_date(conn, prices, env, top_lots, top_amt, d):
    """用目前門檻重算指定日期的訊號並覆蓋上傳網站（改門檻後修正歷史用）。"""
    recs = (collect_signals(conn, prices, d, "lots", top_lots)
            + collect_signals(conn, prices, d, "amount", top_amt))
    _sb(env, "/broker_signals", method="DELETE", params=[("signal_date", f"eq.{d}")])
    if recs:
        status, resp = _sb(env, "/broker_signals", method="POST", body=recs)
        print(f"  {d}: 重傳 {len(recs)} 筆（{status}）")
    else:
        print(f"  {d}: 0 筆（已清空）")


def main():
    do_rebuild = "--rebuild" in sys.argv   # 清空並從 SIGNAL_START 起純實測重建
    reup_dates = []
    if "--reupload" in sys.argv:  # --reupload 2026-07-17,2026-07-20
        reup_dates = sys.argv[sys.argv.index("--reupload") + 1].split(",")
    env = _load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] .env.local 缺少 SUPABASE_SERVICE_KEY（上傳訊號需要），中止")
        sys.exit(1)
    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout = 60000")  # 與爬蟲併行時等待鎖，不直接失敗

    sig_date = conn.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]
    print(f"訊號日期：{sig_date}")

    print("載入收盤價...")
    prices = ba.load_prices(conn)

    top_lots, top_amt = get_rankings(conn, prices)

    if do_rebuild:
        rebuild_since(conn, prices, env, SIGNAL_START)
        print("純實測重建完成")
        return

    if reup_dates:
        print(f"用目前門檻重傳 {len(reup_dates)} 個日期到網站...")
        for d in reup_dates:
            reupload_date(conn, prices, env, top_lots, top_amt, d.strip())
        print("重傳完成")
        return

    records = (collect_signals(conn, prices, sig_date, "lots", top_lots)
               + collect_signals(conn, prices, sig_date, "amount", top_amt))
    print(f"當日訊號：{len(records)} 筆")
    if not records:
        print("無訊號可上傳")
        return

    # 先刪除同日舊資料再上傳（重跑安全）
    status, _ = _sb(env, "/broker_signals", method="DELETE",
                    params=[("signal_date", f"eq.{sig_date}")])
    if status not in (200, 204):
        print(f"[warn] 刪除舊資料失敗 ({status})")
    status, resp = _sb(env, "/broker_signals", method="POST", body=records)
    if status in (200, 201):
        print(f"已上傳 {len(records)} 筆到 Supabase broker_signals")
    else:
        print(f"[error] 上傳失敗 ({status}): {resp}")

    # 實測勝率（純實測）：記錄大單前20+小單前20 兩族群當日訊號，評分後上傳
    n = record_pools(conn, prices, sig_date, get_pool_rankings(env))
    print(f"實測留存：{n} 筆（大單前20+小單前20）")
    evaluate_signals(conn, prices)
    upload_signal_stats(conn, env)


if __name__ == "__main__":
    main()
