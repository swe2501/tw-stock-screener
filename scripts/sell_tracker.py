"""
sell_tracker.py — 出場追蹤（每日 19:00 排程）

讀 Supabase broker_watchlist（使用者在「出手明細」打勾要盯的分點+股票），對每一檔算：
  1) 累積回吐：以「該分點對此檔最早買超日」起算，逐日累加淨買賣得到淨持倉軌跡，
     回吐% =(峰值淨持倉 − 目前淨持倉)/峰值淨持倉；分級 25/50/90(或淨持倉≤0=出清)。
  2) 賣超事件 → broker_sell_alerts：
     - 本尊(該分點自己)單日淨賣超 ≥ 中位數買超日×1/3 或 ≥ 峰值持倉×20%（OR，符合其一即記）
     - 其他分點 單日淨賣超 ≥ 300 張 或 ≥ 3000 萬（大單門檻）；每檔取最大的前 OTHER_CAP 筆
  事件用 upsert(ignore-duplicates) 寫入，保留既有 notified（Vercel 端寄信後標記）。

資料只在本機（wantgoo_daily 全量），網站讀不到 → 計算放這支排程。
用法：python scripts/sell_tracker.py   [--dry-run]
"""
import json
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402  # DB_PATH
import broker_signals as bs           # noqa: E402  # _load_env
import sqlite3                        # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

TW_TZ            = timezone(timedelta(hours=8))
LARGE_LOTS       = 300      # 其他分點大單門檻：張
LARGE_AMOUNT_WAN = 3000     # 其他分點大單門檻：萬
OTHER_CAP        = 300      # 每檔「其他分點」賣超事件上限（取最大者），避免 2330 這類爆表
ANCHOR_CAP       = 200      # 每檔「本尊」賣超事件上限（當沖型分點會很多，取最大者）
TIER_WARN, TIER_HALF, TIER_EXIT = 25, 50, 90   # 回吐% 分級


def _sb(env, path, method="GET", body=None, params=None, prefer="return=minimal", retries=3):
    key = env.get("SUPABASE_SERVICE_KEY") or env["SUPABASE_ANON_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "apikey": key,
               "Authorization": f"Bearer {key}", "Prefer": prefer}
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, json.loads(raw) if raw else []
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw) if raw else {}
            except Exception:
                return e.code, {"raw": raw[:300].decode("utf-8", "replace")}
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                print(f"  [retry] Supabase 連線失敗（{e}），5 秒後重試"); time.sleep(5)
            else:
                return 0, {}


def _tier(giveback_pct, cur_lots):
    if cur_lots <= 0 or giveback_pct >= TIER_EXIT:
        return "exit90"
    if giveback_pct >= TIER_HALF:
        return "half50"
    if giveback_pct >= TIER_WARN:
        return "warn25"
    return "none"


def _anchor_stats(conn, broker_id, code):
    """回傳該分點對此檔：buy_from、total_buy、peak、cur、giveback%、median買超日、last_sell、
    以及視窗內每日 (date, net, sell_avg_price)。無買超日回 None。"""
    rows = conn.execute(
        "select trade_date, buy_vol, sell_vol, sell_avg_price from wantgoo_daily "
        "where broker_id=? and code=? order by trade_date asc", (broker_id, code)).fetchall()
    buys = [(d, (b or 0) - (s or 0)) for d, b, s, _ in rows if (b or 0) - (s or 0) > 0]
    if not buys:
        return None
    buy_from = buys[0][0]
    win = [(d, (b or 0) - (s or 0), sap) for d, b, s, sap in rows if d >= buy_from]
    cum = peak = 0
    for _, net, _sap in win:
        cum += net
        peak = max(peak, cum)
    cur = cum
    buy_day_lots = [net for _, net, _ in win if net > 0]
    total_buy = sum(buy_day_lots)
    median_buy = statistics.median(buy_day_lots) if buy_day_lots else 0
    giveback = round((peak - cur) / peak * 100, 1) if peak > 0 else 0.0
    if cur <= 0:
        giveback = 100.0
    sells = [d for d, net, _ in win if net < 0]
    return {"buy_from": buy_from, "total_buy": total_buy, "peak": peak, "cur": cur,
            "giveback": giveback, "median_buy": median_buy,
            "last_sell": max(sells) if sells else None, "win": win}


def _anchor_sell_events(st, broker_id, broker_name, code):
    """本尊單日賣超事件：淨賣超 ≥ min(中位數買超日/3, 峰值持倉×20%)（OR 邏輯 → 取較小門檻）。"""
    thresh = min(st["median_buy"] / 3.0, st["peak"] * 0.20)
    thresh = max(1, round(thresh))     # 至少 1 張、避免門檻為 0
    out = []
    for d, net, sap in st["win"]:
        if net >= 0:
            continue
        nsell = -net
        if nsell < thresh:
            continue
        amt = round(nsell * 1000 * sap / 10000, 1) if sap else None
        out.append({"broker_id": broker_id, "code": code, "trade_date": d,
                    "sell_broker_id": broker_id, "sell_broker_name": broker_name,
                    "is_anchor": True, "net_sell_lots": int(nsell), "net_sell_amount_wan": amt})
    out.sort(key=lambda x: x["net_sell_lots"], reverse=True)
    return out          # 全部回傳；上限由呼叫端裁切（計數要用完整數量）


def _other_sell_events(conn, broker_id, code, buy_from):
    """其他分點大單賣超（≥300張 或 ≥3000萬）；取最大前 OTHER_CAP 筆。"""
    rows = conn.execute(
        "select trade_date, broker_id, broker_name, buy_vol, sell_vol, sell_avg_price "
        "from wantgoo_daily where code=? and trade_date>=? and broker_id<>? "
        "and (sell_vol-buy_vol) > 0", (code, buy_from, broker_id)).fetchall()
    ev = []
    for d, sbid, sbname, b, s, sap in rows:
        nsell = (s or 0) - (b or 0)
        amt = round(nsell * 1000 * sap / 10000, 1) if sap else None
        if nsell >= LARGE_LOTS or (amt is not None and amt >= LARGE_AMOUNT_WAN):
            ev.append({"broker_id": broker_id, "code": code, "trade_date": d,
                       "sell_broker_id": sbid, "sell_broker_name": sbname,
                       "is_anchor": False, "net_sell_lots": int(nsell),
                       "net_sell_amount_wan": amt})
    ev.sort(key=lambda x: x["net_sell_lots"], reverse=True)
    return ev[:OTHER_CAP]


def main():
    dry = "--dry-run" in sys.argv
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    st, watch = _sb(env, "/broker_watchlist",
                    params={"select": "id,broker_id,broker_name,code,stock_name"},
                    prefer="return=representation")
    if st != 200:
        print(f"[error] 讀 broker_watchlist 失敗（{st}）：{watch}"); sys.exit(1)
    print(f"追蹤清單 {len(watch)} 檔{'（dry-run）' if dry else ''}")
    if not watch:
        print("清單為空，結束"); return

    conn = sqlite3.connect(str(ba.DB_PATH))
    conn.execute("pragma busy_timeout=60000")
    latest_date = conn.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]

    watched_pairs = {(w["broker_id"], w["code"]) for w in watch}
    all_events = []
    now = datetime.now(TW_TZ).isoformat(timespec="seconds")

    for w in watch:
        bid, code, bname = w["broker_id"], w["code"], w.get("broker_name") or w["broker_id"]
        stt = _anchor_stats(conn, bid, code)
        if not stt:
            print(f"  {bid} {code}：查無買超紀錄，略過")
            continue
        # 當沖型判斷：峰值淨持倉 ≪ 總買量(<10%) → 沒真的建倉，回吐% 不適用
        is_churn = stt["total_buy"] > 0 and stt["peak"] < stt["total_buy"] * 0.10
        if is_churn:
            tier, giveback = "churn", None
        else:
            tier, giveback = _tier(stt["giveback"], stt["cur"]), stt["giveback"]
        a_ev_all = _anchor_sell_events(stt, bid, bname, code)
        anchor_ct = len(a_ev_all)
        last_anchor = max((e["trade_date"] for e in a_ev_all), default=None)
        a_ev = a_ev_all[:ANCHOR_CAP]
        o_ev = _other_sell_events(conn, bid, code, stt["buy_from"])
        all_events.extend(a_ev); all_events.extend(o_ev)
        print(f"  {bid} {bname} {code} {w.get('stock_name') or ''}："
              f"買進日起 {stt['buy_from']}｜累積買 {stt['total_buy']} 張｜峰值 {stt['peak']}｜"
              f"目前 {stt['cur']}｜回吐 {giveback}%｜{tier}｜"
              f"本尊賣事件 {anchor_ct}(最近 {last_anchor})、他人大單賣 {len(o_ev)}")
        if not dry:
            _sb(env, "/broker_watchlist", method="PATCH",
                params={"id": f"eq.{w['id']}"},
                body={"buy_from_date": stt["buy_from"], "total_buy_lots": stt["total_buy"],
                      "peak_lots": stt["peak"], "cur_lots": stt["cur"],
                      "giveback_pct": giveback, "tier": tier,
                      "anchor_sell_ct": anchor_ct, "last_anchor_sell": last_anchor,
                      "last_sell_date": stt["last_sell"], "updated_at": now})

    # 清掉已取消追蹤(broker,code) 的舊警示
    st, existing = _sb(env, "/broker_sell_alerts",
                       params={"select": "broker_id,code"}, prefer="return=representation")
    if st == 200:
        stale = {(r["broker_id"], r["code"]) for r in existing} - watched_pairs
        for bid, code in stale:
            if not dry:
                _sb(env, "/broker_sell_alerts", method="DELETE",
                    params={"broker_id": f"eq.{bid}", "code": f"eq.{code}"})
        if stale:
            print(f"清除已取消追蹤的舊警示 {len(stale)} 組")

    # notified 政策：只有「最新交易日」的事件才會寄信(false)，歷史事件標 true(只進面板不寄)
    for ev in all_events:
        ev["notified"] = ev["trade_date"] < latest_date

    # upsert 事件（保留既有 notified）：ignore-duplicates，只插入新事件
    if not dry and all_events:
        s, r = _sb(env, "/broker_sell_alerts", method="POST", body=all_events,
                   params={"on_conflict": "broker_id,code,trade_date,sell_broker_id"},
                   prefer="return=minimal,resolution=ignore-duplicates")
        print(f"寫入賣超事件：{len(all_events)} 筆（新事件 notified=false）status={s}"
              if s in (200, 201) else f"[error] 事件寫入失敗 status={s}：{r}")
    elif dry:
        print(f"（dry-run）本可寫入 {len(all_events)} 筆賣超事件")
    print("完成")


if __name__ == "__main__":
    main()
