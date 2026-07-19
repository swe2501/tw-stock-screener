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
# 當日買超顯示門檻（按榜單分流：張數榜只看張數、金額榜只看金額）
SHOW_MIN_LOTS = 50    # lots 榜：買超 ≥ 50 張
SHOW_MIN_WAN  = 500   # amount 榜：買超金額 ≥ 500 萬


def _load_env():
    env = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _sb(env, path, method="GET", body=None, params=None, retries=3):
    url = f"{env['SUPABASE_URL']}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    headers = {
        "Content-Type": "application/json",
        "apikey": env["SUPABASE_ANON_KEY"],
        "Authorization": f"Bearer {env['SUPABASE_ANON_KEY']}",
        "Prefer": "return=minimal",  # 純 insert（先 DELETE 再寫入，不用 upsert，避免需要 update 權限）
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


def collect_signals(conn, prices, sig_date, method, top_rows):
    """top_rows: analyze() 排行榜前 N 名 → 撈當日買超，回傳 records。"""
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
            if net < SHOW_MIN_LOTS:
                continue
        else:  # amount
            if (amt_wan or 0) < SHOW_MIN_WAN:
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
        })
    records.sort(key=lambda x: (x["rank"], -(x["net_amount_wan"] or 0)))
    return records


def main():
    env = _load_env()
    conn = sqlite3.connect(str(ba.DB_PATH))

    sig_date = conn.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]
    print(f"訊號日期：{sig_date}")

    print("載入收盤價...")
    prices = ba.load_prices(conn)

    print(f"重算排行榜（張數制 ≥{MIN_LOTS_TH} 張）...")
    top_lots = ba.analyze(conn, prices, min_lots=MIN_LOTS_TH, min_events=MIN_EVENTS)[:TOP_N]
    print(f"重算排行榜（金額制 ≥{MIN_AMT_TH} 萬）...")
    top_amt = ba.analyze(conn, prices, min_events=MIN_EVENTS,
                         min_amount_wan=MIN_AMT_TH)[:TOP_N]

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


if __name__ == "__main__":
    main()
