"""
產生 6 種分點排名並上傳 Supabase broker_rankings（網站主力訊號面板讀取）：

  年回測（一整年資料）：
    year_large_lots    大單·張數  淨買超 ≥300 張
    year_large_amount  大單·金額  淨買超金額 ≥3000 萬
    year_small_lots    小單·張數  淨買超 50~300 張
    year_small_amount  小單·金額  淨買超金額 500~3000 萬
  90 日回測（近 90 交易日）：
    d90_small_lots     小單·張數
    d90_small_amount   小單·金額

每檔取該指標 20 日勝率前 20 名，欄位：rank, broker_id, broker_name, win8, win20, events。
事件數 <10 由前端標示警（次數太少）。

用法：
  python scripts/broker_rankings.py           # 全部重算並上傳
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402
import broker_signals as bs           # noqa: E402  # 重用 _sb / _load_env
import sqlite3                        # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

TOP_N      = 20
MIN_EVENTS = 10    # 至少 10 次事件才進榜（樣本夠才排得進前 20）
HOLD_DAYS  = (8, 20)
D90_DAYS   = 90    # 90 日窗口


def _d90_from(conn):
    dates = [r[0] for r in conn.execute(
        "select distinct trade_date from wantgoo_daily order by trade_date desc limit ?",
        (D90_DAYS,))]
    return min(dates) if dates else None


def _rank(conn, prices, **kw):
    rows = ba.analyze(conn, prices, min_events=MIN_EVENTS, hold_days=HOLD_DAYS, **kw)
    rows.sort(key=lambda r: (r.get("win20") or 0, r.get("win8") or 0), reverse=True)
    out = []
    for i, r in enumerate(rows[:TOP_N], 1):
        out.append({
            "rank": i, "broker_id": r["broker_id"], "broker_name": r["broker_name"],
            "win8": r.get("win8"), "win20": r.get("win20"), "events": r["events"],
            "n8": r.get("n8"), "n20": r.get("n20"),  # 已滿 8/20 日、實際算勝率的筆數
        })
    return out


# 各 view 的明細窗口與門檻（供 broker_trades 逐筆明細用）
TRADE_DETAIL_DAYS = 365   # year 系列明細抓一年；d90 系列改抓 90 天
TRADE_CAP = 120           # 每個分點最多存幾筆（小單很多，設上限避免爆量）
_NAME_CACHE = {}


def _stock_names():
    """TWSE 股票代號→簡稱對照（快取）。"""
    if _NAME_CACHE:
        return _NAME_CACHE
    import json as _json, ssl as _ssl, urllib.request as _u
    ctx = _ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = _ssl.CERT_NONE
    try:
        req = _u.Request("https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
                         headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        for row in _json.loads(_u.urlopen(req, context=ctx, timeout=30).read()):
            _NAME_CACHE[str(row.get("公司代號", "")).strip()] = str(row.get("公司簡稱", "")).strip()
    except Exception as e:
        print(f"[warn] 股名抓取失敗：{e}")
    return _NAME_CACHE


def upload_broker_trades(conn, env, views, d90):
    """把 6 個榜前 20 名分點的逐筆買超明細算好上傳 broker_trades（供網站點分點展開）。
    直接讀 Supabase 現有排名決定名單，不用重算排行榜。"""
    from datetime import date, timedelta
    names = _stock_names()
    today = conn.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]
    year_cut = (date.fromisoformat(today) - timedelta(days=TRADE_DETAIL_DAYS)).isoformat()
    # 每個 view 的門檻
    thresh = {
        "year_large_lots":   ("lots", 300, 0,    year_cut),
        "year_large_amount": ("amt",  3000, 0,   year_cut),
        "year_small_lots":   ("lots", 50, 300,   year_cut),
        "year_small_amount": ("amt",  500, 3000, year_cut),
        "d90_small_lots":    ("lots", 50, 300,   d90),
        "d90_small_amount":  ("amt",  500, 3000, d90),
    }
    prices = ba.load_prices(conn)
    all_rows = []
    for view, (kind, lo, hi, cut) in thresh.items():
        st, ranked = bs._sb(env, "/broker_rankings",
                            params=[("select", "broker_id"), ("view", f"eq.{view}"), ("order", "rank.asc")])
        if st != 200:
            continue
        for r in ranked:
            bid = r["broker_id"]
            recs = conn.execute("""select code, trade_date, buy_vol, sell_vol, buy_avg_price
                from wantgoo_daily where broker_id=? and trade_date>=? order by trade_date desc""",
                (bid, cut)).fetchall()
            picked = []
            for code, d, buy, sell, bavg in recs:
                net = (buy or 0) - (sell or 0)
                if net <= 0:
                    continue
                price = bavg or (prices.get(code) and prices[code][1].get(d))
                amt = round(net * 1000 * price / 10000, 1) if price else None
                v = net if kind == "lots" else (amt or 0)
                if v < lo or (hi > 0 and v >= hi):
                    continue
                picked.append({"view": view, "broker_id": bid, "trade_date": d,
                               "code": code, "name": names.get(code, ""),
                               "net_lots": int(net), "net_amount_wan": amt})
                if len(picked) >= TRADE_CAP:
                    break
            all_rows.extend(picked)
    bs._sb(env, "/broker_trades", method="DELETE", params=[("view", "neq.__none__")])
    status, resp = bs._sb(env, "/broker_trades", method="POST", body=all_rows)
    if status in (200, 201):
        print(f"已上傳 {len(all_rows)} 筆明細到 broker_trades")
    else:
        print(f"[error] broker_trades 上傳失敗 ({status}): {resp}")


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)
    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout = 60000")
    print("載入收盤價...")
    prices = ba.load_prices(conn)
    d90 = _d90_from(conn)
    print(f"90 日窗口起算日：{d90}")

    views = {
        "year_large_lots":   dict(min_lots=300),
        "year_large_amount": dict(min_amount_wan=3000),
        "year_small_lots":   dict(min_lots=50,  max_lots=300),
        "year_small_amount": dict(min_amount_wan=500, max_amount_wan=3000),
        "d90_small_lots":    dict(min_lots=50,  max_lots=300, date_from=d90),
        "d90_small_amount":  dict(min_amount_wan=500, max_amount_wan=3000, date_from=d90),
    }

    # --trades-only：跳過重算排行榜，只更新明細（讀現有名單，快）
    if "--trades-only" in sys.argv:
        upload_broker_trades(conn, env, views, d90)
        return

    all_records = []
    for view, kw in views.items():
        print(f"計算 {view} ...")
        for r in _rank(conn, prices, **kw):
            all_records.append({"view": view, **r})
        print(f"  {view}: 前 {min(TOP_N, len([x for x in all_records if x['view']==view]))} 名")

    bs._sb(env, "/broker_rankings", method="DELETE", params=[("view", "neq.__none__")])
    status, resp = bs._sb(env, "/broker_rankings", method="POST", body=all_records)
    if status in (200, 201):
        print(f"已上傳 {len(all_records)} 列到 broker_rankings")
    else:
        print(f"[error] 上傳失敗 ({status}): {resp}")

    append_history_snapshot(env, all_records)
    upload_broker_trades(conn, env, views, d90)


def append_history_snapshot(env, all_records):
    """把本次名次存一份快照到 broker_rankings_history（供日後查『長期霸榜』分點）。
    同一天重跑先刪當日再寫，確保一天一筆。"""
    from datetime import date
    today = date.today().isoformat()
    snap = [{"snapshot_date": today, "view": r["view"], "rank": r["rank"],
             "broker_id": r["broker_id"], "broker_name": r["broker_name"],
             "win20": r["win20"], "events": r["events"]} for r in all_records]
    bs._sb(env, "/broker_rankings_history", method="DELETE",
           params=[("snapshot_date", f"eq.{today}")])
    status, resp = bs._sb(env, "/broker_rankings_history", method="POST", body=snap)
    if status in (200, 201):
        print(f"已存快照 {today}（{len(snap)} 列）到 broker_rankings_history")
    else:
        print(f"[warn] 快照存檔失敗 ({status}): {resp}")


if __name__ == "__main__":
    main()
