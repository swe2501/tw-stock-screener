# -*- coding: utf-8 -*-
"""明燈與冥燈 回測引擎（Phase 1，2026-10-01）
讀 Supabase mingdeng_calls（管理者登錄的真人點名）→ 用本機自有日K(stock_daily)回測每筆 →
彙總每位真人(person,direction)績效 → 寫回 mingdeng_scores。前端神燈/冥燈天梯讀 scores。

每筆點名評分（與前端 mdNote 算法說明、用戶 2026-10-01 確認一致）：
  進場 entry = 點名日次一交易日「開盤」
  一買即跌  = T+1 收盤 < entry
  T+20 報酬 = 第20交易日收盤 / entry − 1（不足20日＝尚未成熟，不列入計分）
  MDD       = T+1..T+20 min(最低價)/entry − 1（負值）
  看多勝=T+20>0；看空勝=T+20<0（跌＝看對）
分類（門檻已定案）：
  明燈：勝率≥70% 且 平均|MDD|≤8% 且 一買即跌率≤15% 且 樣本≥10
  冥燈：反向勝率≥75%(勝率≤25%) 且 一買即跌率≥80% 且 樣本≥10
  其餘：觀察
用法：python scripts/mingdeng.py
"""
import json, sys, urllib.request, sqlite3
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
import broker_analysis as ba

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

H = 20          # 回測持有交易日
MIN_N = 10      # 列入天梯的最低成熟樣本數


def _bars(conn, code):
    rows = conn.execute(
        "select trade_date,open,high,low,close from stock_daily where code=? and close is not null order by trade_date",
        (code,)).fetchall()
    return [r for r in rows if r[1] and r[2] and r[3] and r[4]]


def backtest_call(bars, call_date, direction):
    """回 dict 或 None（資料不足/尚未成熟）。需滿 H 交易日才算成熟。"""
    idx = next((i for i, b in enumerate(bars) if b[0] == call_date), None)
    if idx is None or idx + 1 >= len(bars):
        return None
    fwd = bars[idx + 1: idx + 1 + H]
    if len(fwd) < H:
        return None     # 尚未滿 20 交易日 → 不列入計分
    entry = bars[idx + 1][1]
    if not entry or entry <= 0:
        return None
    t1_ret = fwd[0][4] / entry - 1
    t20_ret = fwd[-1][4] / entry - 1
    mdd = min(b[3] / entry - 1 for b in fwd)
    win = (t20_ret < 0) if direction == "short" else (t20_ret > 0)
    follow = -t20_ret if direction == "short" else t20_ret
    return {"t20": t20_ret, "mdd": mdd, "follow": follow, "buy_drop": t1_ret < 0, "win": win}


def _fetch_calls(env):
    url = env["SUPABASE_URL"] + "/rest/v1/mingdeng_calls?select=person,platform,code,call_date,direction"
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _classify(n, win_rate, buy_drop_rate, avg_mdd):
    if n < MIN_N:
        return "觀察"
    if win_rate >= 70 and abs(avg_mdd) <= 8 and buy_drop_rate <= 15:
        return "明燈"
    if (100 - win_rate) >= 75 and buy_drop_rate >= 80:
        return "冥燈"
    return "觀察"


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    calls = _fetch_calls(env)
    print(f"讀到 {len(calls)} 筆點名")
    if not calls:
        print("無點名資料，結束。"); return

    conn = sqlite3.connect(str(ba.DB_PATH))
    barscache = {}
    groups = defaultdict(list)       # (person,direction) -> [metrics]
    latest = defaultdict(str)        # (person,direction) -> 最近點名日
    matured = 0
    for c in calls:
        code = str(c.get("code") or "").strip()
        person = (c.get("person") or "").strip()
        direction = c.get("direction") or "long"
        cd = c.get("call_date")
        if not code or not person or not cd:
            continue
        k = (person, direction)
        if cd > latest[k]:
            latest[k] = cd
        if code not in barscache:
            barscache[code] = _bars(conn, code)
        m = backtest_call(barscache[code], cd, direction)
        if m:
            groups[k].append(m); matured += 1
    conn.close()
    print(f"成熟(滿{H}交易日)樣本 {matured} 筆，{len(groups)} 位真人")

    rows = []
    # 所有出現過的 person+direction 都寫一列（未成熟者 n=0、label=觀察）
    allkeys = set(latest.keys()) | set(groups.keys())
    for k in allkeys:
        person, direction = k
        ms = groups.get(k, [])
        n = len(ms)
        if n:
            win_rate = round(sum(1 for x in ms if x["win"]) / n * 100, 1)
            buy_drop = round(sum(1 for x in ms if x["buy_drop"]) / n * 100, 1)
            avg_mdd = round(sum(x["mdd"] for x in ms) / n * 100, 2)
            avg_follow = round(sum(x["follow"] for x in ms) / n * 100, 2)
        else:
            win_rate = buy_drop = avg_mdd = avg_follow = None
        label = _classify(n, win_rate or 0, buy_drop or 0, avg_mdd or 0)
        rows.append({
            "person": person, "direction": direction, "n": n,
            "win_rate": win_rate, "rev_win_rate": (round(100 - win_rate, 1) if win_rate is not None else None),
            "avg_follow_ret": avg_follow, "avg_mdd": avg_mdd, "buy_drop_rate": buy_drop,
            "label": label, "latest_date": latest.get(k) or None,
        })

    # upsert scores
    key = env["SUPABASE_SERVICE_KEY"]
    url = env["SUPABASE_URL"] + "/rest/v1/mingdeng_scores?on_conflict=person,direction"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"已寫入 mingdeng_scores {len(rows)} 列（status {r.status}）")
    for x in rows:
        if x["label"] != "觀察":
            print(f"  [{x['label']}] {x['person']} {x['direction']} n={x['n']} 勝率{x['win_rate']}% MDD{x['avg_mdd']}% 一買即跌{x['buy_drop_rate']}%")


if __name__ == "__main__":
    main()
