"""
backtest_zhenming3_intraday.py — 用永豐 1 分 K 回測「真名三式」不同進場點（2026-10-31）。

訊號判定、停損／目標、出場規則、成本都跟 scripts/backtest_zhenming3.py 相同（共用 screen.zhenming3_at 與 simulate），
只換「進場價」，比較進場點本身的差異：
  A 收盤價（現行回測假設；實務上收盤前不知道收盤價，數字偏樂觀）
  B 尾盤 13:24 買（收盤集合競價 13:25 前最後一根 1 分 K 收盤；看到「已成立」再買，實務可執行）
  C 盤中觸及長黑實體中點就買（不等收盤確認；母體＝「多頭＋長黑後第一次碰中點」的所有日子，含當天最後沒成立的）
  D 盤中「已像訊號」就買：第一根 1 分 K 收盤同時 ≥ 中點 且 漲幅 (價−開)/價 ≥ 3%（母體同 C，但需盤中達條件）
  E 次一交易日開盤（2026-09-30 前的舊假設）
出場一律自訊號日次一交易日起，用日 K 依原規則（停損全出、破前高賣半、剩餘破 10MA 出、最長 60 日）。
分 K：本機 D:/stock_data/kbars_1m.db；缺的「代號×訊號日」會用永豐 kbars 補抓（只抓那一天、那一檔）。
用法：python scripts/backtest_zhenming3_intraday.py [--no-fetch] [--since 2024-08-01]
本回測為歷史統計，不代表未來績效。
"""
import json
import sqlite3
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "scripts"))
import screen  # noqa: E402
import backtest_zhenming3 as bz  # noqa: E402
import sj_kbars  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def candidate_at(b, t):
    """C/D 的母體：t 日之前 1~12 日有長黑、長黑前一日多頭、長黑後到 t−1 都沒收上中點、t 日最高 ≥ 中點。
    回 (mid, stop_ref, target) 或 None。"""
    if t < 25:
        return None
    bi = None
    for k in range(1, screen.ZM3_WINDOW + 1):
        j = t - k
        if j < 21:
            break
        _, bo, bh, bl, bc, bv = b[j]
        if bo and bc and bo > bc and (bo - bc) / bc * 100 >= screen.ZM3_BLACK:
            bi = j
            break
    if bi is None:
        return None
    closes = [x[4] for x in b[:bi]]
    if len(closes) < 20:
        return None
    m5, m10, m20 = (sum(closes[-p:]) / p for p in (5, 10, 20))
    if not (closes[-1] > m20 and m5 > m10 > m20):
        return None
    mid = (b[bi][1] + b[bi][4]) / 2
    if b[t][2] < mid or any(b[j][4] >= mid for j in range(bi + 1, t)):
        return None
    stop = min(x[3] for x in b[bi:t + 1] if x[3])
    target = max(x[2] for x in b[max(0, bi - screen.ZM3_PRIOR_HIGH_N + 1):bi + 1] if x[2])
    return {"mid": mid, "stop": round(stop, 2), "target": round(target, 2), "vol": False}


def sim_entry(b, t, sig, entry):
    """沿用 bz.simulate 的出場邏輯，只把進場價換掉。"""
    if t + 1 >= len(b) or not entry:
        return None
    return bz.simulate(b, t, sig, entry)


def fetch_missing(conn, need):
    """need＝{code: set(iso)}；只抓本機 kbar_day 沒紀錄的。"""
    have = {(r[0], r[1]) for r in conn.execute("select code, d from kbar_day")}
    todo = {c: sorted(d for d in ds if (c, d) not in have) for c, ds in need.items()}
    todo = {c: v for c, v in todo.items() if v}
    n = sum(len(v) for v in todo.values())
    print(f"分 K 需要 {sum(len(v) for v in need.values())} 檔日，本機缺 {n} 檔日（{len(todo)} 檔）")
    if not n:
        return
    api = sj_kbars.sj_daily.login()
    t0, done = time.time(), 0
    for code, isos in sorted(todo.items()):
        try:
            contract = api.Contracts.Stocks[code]
        except Exception:
            contract = None
        if contract is None:
            conn.executemany("insert or replace into kbar_day values (?,?,0)", [(d, code) for d in isos])
            continue
        for iso in isos:                       # 只抓那一天（訊號日分散，合併區段反而多抓）
            kb = None
            for attempt in range(3):
                try:
                    kb = dict(api.kbars(contract, start=iso, end=iso)); break
                except Exception as ex:
                    if attempt == 2:
                        print(f"[warn] {code} {iso} 失敗：{ex}")
                    time.sleep(2)
            time.sleep(sj_kbars.GAP)
            if kb is None:
                continue
            rows = []
            for j, ts in enumerate(kb.get("ts") or []):
                tt = sj_kbars.dt.datetime.fromtimestamp(ts / 1e9, sj_kbars.dt.timezone.utc)
                if tt.date().isoformat() != iso:
                    continue
                rows.append((code, iso, tt.hour * 100 + tt.minute, kb["Open"][j], kb["High"][j], kb["Low"][j],
                             kb["Close"][j], int(kb["Volume"][j] or 0), kb["Amount"][j]))
            conn.executemany("insert or replace into kbar_1m values (?,?,?,?,?,?,?,?,?)", rows)
            conn.execute("insert or replace into kbar_day values (?,?,?)", (iso, code, len(rows)))
            done += 1
            if done % 300 == 0:
                conn.commit()
                print(f"  補抓 {done}/{n}｜{time.time() - t0:.0f}s")
    conn.commit()
    u = api.usage()
    print(f"補抓完成 {done} 檔日｜{time.time() - t0:.0f}s｜永豐今日已用 {u.bytes / 1e6:.1f}MB／{u.limit_bytes / 1e6:.0f}MB")
    api.logout()


def summarize(trades):
    s = bz.summarize([x for x in trades if not x["reason"].startswith("未結束")])
    return s


def main():
    since = sys.argv[sys.argv.index("--since") + 1] if "--since" in sys.argv else "2024-08-01"
    bars = bz.load()
    sigs, cands = [], []             # (code, t, sig)
    for code, b in bars.items():
        for t in range(25, len(b)):
            if b[t][0] < since:
                continue
            s = screen.zhenming3_at(b, t)
            if s:
                sigs.append((code, t, s))
            c = candidate_at(b, t)
            if c:
                cands.append((code, t, c))
    print(f"訊號 {len(sigs)} 筆、盤中碰中點母體 {len(cands)} 筆（{since} 起）")
    conn = sj_kbars.open_db()
    need = defaultdict(set)
    for code, t, _ in sigs + cands:
        need[code].add(bars[code][t][0])
    if "--no-fetch" not in sys.argv:
        fetch_missing(conn, need)

    dmap = {code: {x[0]: x for x in b} for code, b in bars.items()}
    bad = set()

    def kb(code, iso):
        """分 K 與日 K 對不上（減資／面額變更／還原價等，收盤差 >1% 或最高超出日 K 最高 1%）→ 該日不用。"""
        k = conn.execute("select t, open, high, low, close from kbar_1m where code=? and d=? order by t",
                         (code, iso)).fetchall()
        day = dmap[code].get(iso)
        if not k or not day:
            return []
        if abs(k[-1][4] / day[4] - 1) > 0.01 or max(x[2] for x in k) > day[2] * 1.01:
            bad.add((code, iso))
            return []
        return k

    res = defaultdict(list)
    for code, t, s in sigs:
        b = bars[code]
        k = kb(code, b[t][0])
        if not k:
            continue
        pre = [x for x in k if x[0] <= 1324]
        for name, px in (("A_收盤", b[t][4]), ("B_尾盤1324", pre[-1][4] if pre else None),
                         ("E_次日開盤", b[t + 1][1] if t + 1 < len(b) else None)):
            tr = sim_entry(b, t, s, px)
            if tr:
                tr["vol"] = s["vol"]
                res[name].append(tr)
    confirmed = {(code, t) for code, t, _ in sigs}
    for code, t, c in cands:
        b = bars[code]
        k = kb(code, b[t][0])
        if not k:
            continue
        day_open = b[t][1]
        # C：第一根最高 ≥ 中點的 1 分 K；開盤就在中點上方則以該根開盤價成交
        pc = next(((x[1] if x[1] >= c["mid"] else c["mid"]) for x in k if x[2] >= c["mid"]), None)
        # D：第一根收盤同時 ≥ 中點且 (價−開)/價 ≥ 長紅門檻 → 以該根收盤價成交
        pd = next((x[4] for x in k if x[4] >= c["mid"] and day_open and (x[4] - day_open) / x[4] * 100 >= screen.ZM3_RED), None)
        ok = (code, t) in confirmed
        for name, px in (("C_盤中碰中點", pc), ("D_盤中已像訊號", pd)):
            tr = sim_entry(b, t, c, px)
            if tr:
                tr["confirmed"] = ok
                res[name].append(tr)
    out = {"since": since, "n_signals": len(sigs), "n_candidates": len(cands), "excluded_mismatch_days": len(bad),
           "excluded_examples": sorted(bad)[:10]}
    for name in sorted(res):
        out[name] = summarize(res[name])
        if name[0] in "CD":
            out[name + "｜當天收盤成立"] = summarize([x for x in res[name] if x["confirmed"]])
            out[name + "｜當天收盤沒成立"] = summarize([x for x in res[name] if not x["confirmed"]])
    # 同一批訊號：B 尾盤價相對收盤的差
    pairs = []
    for code, t, s in sigs:
        k = kb(code, bars[code][t][0])
        pre = [x for x in k if x[0] <= 1324]
        if pre:
            pairs.append(pre[-1][4] / bars[code][t][4] - 1)
    if pairs:
        out["B相對收盤價差_中位數%"] = round(statistics.median(pairs) * 100, 3)
        out["B相對收盤價差_平均%"] = round(statistics.mean(pairs) * 100, 3)
    (ROOT / "scripts" / "backtest_zhenming3_intraday_result.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
