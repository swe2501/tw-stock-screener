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
MIN_LOTS_TH = 300   # 張數制事件門檻
MIN_AMT_TH  = 3000  # 金額制事件門檻（萬元）
MIN_EVENTS  = 10
RANK_CACHE  = Path(r"D:\stock_data\broker_rankings.json")  # 排行榜快取
RANK_TTL_DAYS = 7   # 快取超過幾天自動重算（排行榜每週更新一次即可）
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


def get_rankings(conn, prices, force=False):
    """排行榜每週重算一次，其餘日子讀快取（重算要掃兩遍全量資料，30~60 分鐘）。"""
    if not force and RANK_CACHE.exists():
        try:
            data = json.loads(RANK_CACHE.read_text(encoding="utf-8"))
            age_days = (time.time() - data.get("computed_ts", 0)) / 86400
            if age_days < RANK_TTL_DAYS:
                print(f"使用排行榜快取（{data.get('computed_at')} 計算，{age_days:.1f} 天前）")
                return data["lots"], data["amount"]
        except Exception:
            pass  # 快取壞掉就重算
    print(f"重算排行榜（張數制 ≥{MIN_LOTS_TH} 張）...")
    top_lots = ba.analyze(conn, prices, min_lots=MIN_LOTS_TH, min_events=MIN_EVENTS)[:TOP_N]
    print(f"重算排行榜（金額制 ≥{MIN_AMT_TH} 萬）...")
    top_amt = ba.analyze(conn, prices, min_events=MIN_EVENTS,
                         min_amount_wan=MIN_AMT_TH)[:TOP_N]
    from datetime import datetime as _dt
    RANK_CACHE.write_text(json.dumps({
        "computed_ts": time.time(),
        "computed_at": f"{_dt.now():%Y-%m-%d %H:%M}",
        "lots": top_lots, "amount": top_amt,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"排行榜已存快取 {RANK_CACHE}")
    return top_lots, top_amt


def _local_signal_table(conn):
    """本機訊號留存表（實測勝率評分用）。"""
    conn.execute("""
        create table if not exists broker_signals_local (
            signal_date    text not null,
            method         text not null,
            rank           integer,
            broker_id      text not null,
            broker_name    text,
            code           text not null,
            net_lots       integer,
            net_amount_wan real,
            buy_avg_price  real,
            ret8           real,   -- 8 個交易日後報酬 %（期滿才填）
            ret20          real,   -- 20 個交易日後報酬 %
            primary key (signal_date, method, broker_id, code)
        )
    """)
    conn.commit()


def save_signals_local(conn, records):
    _local_signal_table(conn)
    conn.executemany("""
        insert or replace into broker_signals_local
        (signal_date, method, rank, broker_id, broker_name, code,
         net_lots, net_amount_wan, buy_avg_price, ret8, ret20)
        values (:signal_date, :method, :rank, :broker_id, :broker_name, :code,
                :net_lots, :net_amount_wan, :buy_avg_price,
                coalesce((select ret8  from broker_signals_local
                          where signal_date=:signal_date and method=:method
                            and broker_id=:broker_id and code=:code), null),
                coalesce((select ret20 from broker_signals_local
                          where signal_date=:signal_date and method=:method
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
    """彙總每個分點的實測勝率，分「大單/小單」兩層，整表覆蓋上傳 signal_stats。
    大單：lots≥300 張 或 amount≥3000 萬；小單：50~300 張 或 500~3000 萬。"""
    # 每個 method 的大/小單 net 判斷式
    tier_cond = {
        ("lots", "large"):   "net_lots >= 300",
        ("lots", "small"):   "net_lots >= 50  and net_lots < 300",
        ("amount", "large"): "net_amount_wan >= 3000",
        ("amount", "small"): "net_amount_wan >= 500 and net_amount_wan < 3000",
    }
    stats = []
    for method in ("lots", "amount"):
        brokers = [r[0] for r in conn.execute(
            "select distinct broker_id from broker_signals_local where method=?", (method,))]
        for bid in brokers:
            bname = conn.execute(
                "select max(broker_name) from broker_signals_local where broker_id=? and method=?",
                (bid, method)).fetchone()[0]
            for tier in ("large", "small"):
                cond = tier_cond[(method, tier)]
                row = conn.execute(f"""
                    select count(*),
                           count(ret8),  avg(case when ret8  > 0 then 100.0 else 0 end),  avg(ret8),
                           count(ret20), avg(case when ret20 > 0 then 100.0 else 0 end), avg(ret20)
                    from broker_signals_local
                    where broker_id=? and method=? and {cond}
                """, (bid, method)).fetchone()
                total, n8, win8, avg8, n20, win20, avg20 = row
                if not total:
                    continue
                stats.append({
                    "broker_id": bid, "broker_name": bname, "method": method, "tier": tier,
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


def backfill_signals(conn, prices, top_lots, top_amt, days):
    """用目前名單回填過去 N 個交易日的訊號到本機表（供實測勝率立即有樣本）。
    注意：回填部分含後見之明成分（名單由涵蓋該期間的資料選出），
    正式的純實測樣本從每日排程啟用日起累積。"""
    dates = [r[0] for r in conn.execute(
        "select distinct trade_date from wantgoo_daily order by trade_date desc limit ?",
        (days,))]
    total = 0
    for d in sorted(dates):
        # 本機留存用低門檻（50 張/500 萬），涵蓋大單與小單，供兩層統計
        recs = (collect_signals(conn, prices, d, "lots", top_lots, min_lots=50)
                + collect_signals(conn, prices, d, "amount", top_amt, min_wan=500))
        if recs:
            save_signals_local(conn, recs)
            total += len(recs)
    print(f"回填 {len(dates)} 個交易日、{total} 筆訊號到本機表（含大小單）")


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
    force = "--recompute" in sys.argv  # 手動強制重算排行榜
    backfill_days = 0
    if "--backfill-days" in sys.argv:
        backfill_days = int(sys.argv[sys.argv.index("--backfill-days") + 1])
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

    top_lots, top_amt = get_rankings(conn, prices, force=force)

    if backfill_days > 0:
        backfill_signals(conn, prices, top_lots, top_amt, backfill_days)
        evaluate_signals(conn, prices)
        upload_signal_stats(conn, env)
        print("回填完成")
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

    # 實測勝率：本機另存低門檻（50/500）版本，涵蓋大小單供兩層統計
    local_recs = (collect_signals(conn, prices, sig_date, "lots", top_lots, min_lots=50)
                  + collect_signals(conn, prices, sig_date, "amount", top_amt, min_wan=500))
    save_signals_local(conn, local_recs)
    evaluate_signals(conn, prices)
    upload_signal_stats(conn, env)


if __name__ == "__main__":
    main()
