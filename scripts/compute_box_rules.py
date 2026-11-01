"""
compute_box_rules.py — AI 型態判斷「箱型」分頁：規則版箱型（取自用戶朋友《股票型態.md》箱型規則，2026-11-01）。

只做箱型；其他型態（趨勢線／三角／M／W）不在此腳本。原本篩選器用的 box_patterns（compute_box.py，ATR 版）不動。

規則（日 K，上市＋上櫃普通股）：
  1. 範圍：近六個曆月；從最近一次已知除權息「之後」才起算（除權息當日與之前不用）。
     缺價／四價不合理／缺量的 K 棒切斷區段，不能跨段湊根數。
  2. 箱體至少 45 根有效日 K（含第 45 根）。
  3. 振幅 (H − L) ÷ L ≤ 16%（含 16%）。H＝區間最高 High、L＝區間最低 Low（含影線）。
  4. 量：區間內成交量由大到小，最大量 V1 ≤ 第二大量 V2 × 1.05（含等號），且 V2 > 0。
  5. 列入條件（二擇一）：
     A 箱內上方 25%：箱體最後一根收盤 C ≥ L + (H − L) × 0.75（且 C ≤ H，箱內必然成立）
     B 收盤突破：箱體後緊接的下一根（同區段、有效）收盤 > H；突破棒不算進箱體、不抬高箱頂
  6. 只列「型態終點」在最新三個共同交易日內者：A 的終點＝箱體最後一根；B 的終點＝突破棒。
  7. 同一檔多個候選只留一個代表：有收盤突破的優先（突破日較新 → 箱體較長）；
     否則取箱體最長（同長取較新）。每個終點都取「能成立的最長箱體」。
資料限制：除權息日期來自 exdiv_factor（證交所 TWT49U 每日累積，2026-08-12 起、僅上市）；
          更早或上櫃的除權息尚無日期，無法切段。
輸出：Supabase page_cache kind=ai_box_rules（單列覆寫）。
用法：python scripts/compute_box_rules.py [--dry-run]
"""
import datetime
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402  # DB_PATH
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KIND = "ai_box_rules"
VERSION = "box-rules-v1"
MIN_BARS = 45
MAX_AMP = 0.16
VOL_RATIO = 1.05
UPPER_FRAC = 0.75
RECENT_DAYS = 3
EPS = 1e-9


def months_back(iso, n):
    d = datetime.date.fromisoformat(iso)
    y, m = d.year, d.month - n
    while m <= 0:
        y, m = y - 1, m + 12
    nxt = datetime.date(y + (m == 12), m % 12 + 1, 1)
    return datetime.date(y, m, min(d.day, (nxt - datetime.timedelta(days=1)).day)).isoformat()


def valid(b):
    _, o, h, l, c, v = b
    if None in (o, h, l, c, v) or min(o, h, l, c) <= 0 or v < 0:
        return False
    return h >= max(o, c, l) and l <= min(o, c)


def longest_box(bars, s0, e):
    """以 e 為箱體最後一根，往左找能成立的最長起點 s（s ≥ s0）。回 (s, H, L, V1, V2) 或 None。"""
    hi, lo, v1, v2, best = 0.0, float("inf"), -1, -1, None
    for s in range(e, s0 - 1, -1):
        _, _, h, l, _, v = bars[s]
        hi, lo = max(hi, h), min(lo, l)
        if (hi - lo) / lo > MAX_AMP + EPS:
            break                                   # 再往左振幅只會更大
        if v > v1:
            v1, v2 = v, v1
        elif v > v2:
            v2 = v
        if e - s + 1 >= MIN_BARS and v2 > 0 and v1 <= v2 * VOL_RATIO + EPS:
            best = (s, hi, lo, v1, v2)
    return best


def scan_code(bars, recent):
    """bars 已是單一有效區段清單（日期遞增）。回代表候選 dict 或 None。"""
    n = len(bars)
    cands = []
    for e in range(MIN_BARS - 1, n):
        d_end = bars[e][0]
        nxt = bars[e + 1] if e + 1 < n else None
        is_a = d_end in recent
        is_b = nxt is not None and nxt[0] in recent
        if not (is_a or is_b):
            continue
        r = longest_box(bars, 0, e)
        if not r:
            continue
        s, hi, lo, v1, v2 = r
        base = {"s": s, "e": e, "H": hi, "L": lo, "V1": v1, "V2": v2}
        if is_b and nxt[4] > hi + EPS:
            cands.append(dict(base, kind="breakout", to=nxt[0], bo_close=nxt[4]))
        if is_a and bars[e][4] >= lo + (hi - lo) * UPPER_FRAC - EPS:
            cands.append(dict(base, kind="upper", to=d_end))
    if not cands:
        return None
    bo = [c for c in cands if c["kind"] == "breakout"]
    if bo:
        return max(bo, key=lambda c: (c["to"], c["e"] - c["s"], c["e"]))
    return max(cands, key=lambda c: (c["e"] - c["s"], c["e"]))


def segments(rows, start_after):
    """切出有效區段（除權息之後、遇無效棒切斷）；只回最後一段（終點要在最近三日，只有最後一段可能）。"""
    seg = []
    for b in rows:
        if start_after and b[0] <= start_after:
            continue
        if valid(b):
            seg.append(b)
        else:
            seg = []
    return seg


def load_exdiv(env, since):
    out, off = {}, 0
    while True:
        st, rows = bs._sb(env, "/exdiv_factor", params=[("select", "code,ex_date"), ("ex_date", f"gte.{since}"),
                                                        ("order", "ex_date.asc"), ("limit", "1000"), ("offset", str(off))])
        if st != 200 or not isinstance(rows, list):
            raise RuntimeError(f"exdiv_factor 讀取失敗 {st}")
        for r in rows:
            out[r["code"]] = max(out.get(r["code"], ""), r["ex_date"])
        if len(rows) < 1000:
            return out
        off += 1000


def main():
    dry = "--dry-run" in sys.argv
    env = bs._load_env()
    conn = sqlite3.connect(str(ba.DB_PATH))
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)).date().isoformat()
    dates = [r[0] for r in conn.execute(
        "select trade_date from stock_daily where trade_date<=? group by trade_date having sum(volume>0)>=500 "
        "order by trade_date desc limit ?", (today, RECENT_DAYS))]
    if len(dates) < 1:
        print("[error] 沒有收盤資料"); sys.exit(1)
    latest, recent = dates[0], set(dates)
    since = months_back(latest, 6)
    exdiv = load_exdiv(env, since)
    rows_all = conn.execute(
        "select code,trade_date,open,high,low,close,volume,market from stock_daily "
        "where trade_date>=? and trade_date<=? order by code,trade_date", (since, latest)).fetchall()
    # 全市場都零量的日子＝休市（例：2026-07-10 颱風）資料庫留有假K棒，整天剔除、不算進根數
    closed = {r[0] for r in conn.execute(
        "select trade_date from stock_daily where trade_date>=? and trade_date<=? group by trade_date "
        "having sum(volume>0)=0", (since, latest))}
    by_code, market = {}, {}
    for code, d, o, h, l, c, v, mk in rows_all:
        if not (len(code) == 4 and code.isdigit() and code[0] != "0"):   # 普通股（排除 ETF 00 開頭與權證等）
            continue
        if d in closed:
            continue
        by_code.setdefault(code, []).append((d, o, h, l, c, v))
        market[code] = mk
    recs, scanned = [], 0
    for code, rows in by_code.items():
        seg = segments(rows, exdiv.get(code))
        if len(seg) < MIN_BARS:
            continue
        scanned += 1
        c = scan_code(seg, recent)
        if not c:
            continue
        s, e, H, L = c["s"], c["e"], c["H"], c["L"]
        box = seg[s:e + 1]
        hd = next(b[0] for b in box if b[2] == H)
        ld = next(b[0] for b in box if b[3] == L)
        last = seg[-1]
        recs.append({
            "code": code, "market": market.get(code), "status": c["kind"],
            "from": box[0][0], "to": box[-1][0], "bars": len(box),
            "high": round(H, 4), "low": round(L, 4), "high_date": hd, "low_date": ld,
            "amp": round((H - L) / L * 100, 2),
            "v1": round(c["V1"] / 1000), "v2": round(c["V2"] / 1000),
            "box_close": round(box[-1][4], 4),
            "upper_line": round(L + (H - L) * UPPER_FRAC, 4),
            "breakout_date": c["to"] if c["kind"] == "breakout" else None,
            "breakout_close": round(c["bo_close"], 4) if c.get("bo_close") else None,
            "last_date": last[0], "last_close": round(last[4], 4),
            "exdiv_cut": exdiv.get(code),
        })
    # 排序：收盤突破在前（突破日新→舊），其次箱內上方 25%（代號）
    bo = sorted((r for r in recs if r["status"] == "breakout"), key=lambda r: r["code"])
    bo.sort(key=lambda r: r["breakout_date"], reverse=True)
    recs = bo + sorted((r for r in recs if r["status"] != "breakout"), key=lambda r: r["code"])
    payload = {
        "version": VERSION, "data_date": latest, "close_dates": sorted(recent), "since": since,
        "params": {"min_bars": MIN_BARS, "max_amp_pct": MAX_AMP * 100, "vol_ratio": VOL_RATIO, "upper_frac": UPPER_FRAC},
        "coverage": {"codes": len(by_code), "scanned": scanned, "matched": len(recs),
                     "breakout": sum(r["status"] == "breakout" for r in recs),
                     "upper": sum(r["status"] == "upper" for r in recs),
                     "exdiv_known": len(exdiv)},
        "records": recs,
    }
    size = len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    print(f"資料日 {latest}｜近三日 {sorted(recent)}｜六個月起 {since}｜普通股 {len(by_code)} 檔、可判 {scanned} 檔")
    print(f"箱型 {len(recs)} 檔（收盤突破 {payload['coverage']['breakout']}、箱內上方25% {payload['coverage']['upper']}）｜{size // 1024}KB")
    for r in recs[:12]:
        print(f"  {r['code']} {r['status']:8s} {r['from']}~{r['to']} {r['bars']}根 H{r['high']} L{r['low']} 振幅{r['amp']}% "
              f"V1/V2={r['v1']}/{r['v2']}張 收{r['box_close']}" + (f" 突破{r['breakout_date']} 收{r['breakout_close']}" if r['breakout_date'] else ""))
    if dry:
        print("（dry-run，未上傳）")
        return
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    row = {"kind": KIND, "trade_date": latest, "payload": payload,
           "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    bs._sb(env, "/page_cache", method="DELETE", params=[("kind", f"eq.{KIND}")])
    st, resp = bs._sb(env, "/page_cache", method="POST", body=[row])
    print(f"[page_cache] {KIND} 寫入 status={st}")
    if st not in (200, 201, 204):
        print(resp); sys.exit(1)


if __name__ == "__main__":
    main()
