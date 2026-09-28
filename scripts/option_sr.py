"""
option_sr.py — 台指選擇權(TXO)「支撐壓力 OI 三層峰值」，供首頁選擇權支撐壓力卡（週選／月選兩個 tab）。

方法（2026-09-28 與用戶定案，比照玩股網 option/support-resistance）：
  參考價 ref＝台指期 TX 近月「一般盤結算價」（DailyMarketReportFut，同盤後截面），ref_kind='TX近月結算'；取不到才退回加權收盤。
  兩側分開：CALL 只看 strike > ref 找壓力、PUT 只看 strike < ref 找支撐；OI 缺／負／0 剔除。
  峰值＝下列 4 條件同時成立：
    ① OI ≥ 該側 OI 的第 70 百分位（P70）
    ② OI ≥ 該側最大 OI × 0.20
    ③ OI ≥ 前後各 5 個有效履約價 OI 中位數 × 1.5
    ④ 局部高點：OI ≥ 前後各 2 個有效履約價，且至少高於其中之一（平台只留一個代表：離 ref 最近者）
  峰群合併：相鄰峰值間距 ≤ 200 點視為同一群，保留群內 OI 最大者為代表。
  排序：壓力 strike 由低到高、支撐由高到低（離 ref 近→遠，不是依 OI 大小），各取前 3 層；不足 3 層標「候選不足」，不硬湊。
  每層回傳 strike／OI／OIΔ（今日 OI − 前一交易日 OI，本機 txo_daily；新履約價無前值→None）／距 ref 點數／同側百分位／中位數倍數／判定原因。
  另存 CALL/PUT 總 OI 與 Put/Call OI 比（市場情緒輔助）。舊欄位 res1/res2/sup1/sup2 填第 1、2 層（相容）。
合約：week＝最近的週三週選(W)、weekf＝最近的週五週選(F)、month＝最近月月選，三者分開計算不混算。實際到期日＝原定到期日遇休市（週末、證交所休市日期表、過去日期以本機實際交易日核對）順延至次一交易日。
資料源：TAIFEX openapi DailyMarketReportOpt（JSON/CSV 皆可，取「一般」盤）＋ DailyMarketReportFut。
→ Supabase option_sr(PK trade_date+kind)；新欄位 res_levels/sup_levels(jsonb)、ref_price、ref_kind（sql/option_sr_levels.sql）。
用法：python scripts/option_sr.py [--dry]
"""
import ssl, sys, csv, json, re, calendar, urllib.request
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
API = "https://openapi.taifex.com.tw/v1/DailyMarketReportOpt"

API_FUT = "https://openapi.taifex.com.tw/v1/DailyMarketReportFut"
PCT_MIN = 70          # ① 同側 P70
MAX_FRAC = 0.20       # ② 同側最大 OI × 0.20（2026-09-28 用戶定案方案 A；原 0.12 近端小峰太多）
MED_N, MED_MULT = 5, 1.5   # ③ 前後各 5 個有效履約價中位數 × 1.5
LOCAL_N = 2           # ④ 局部高點：前後各 2
MERGE_GAP = 200       # 峰群合併距離（點；方案 A，原 100 會把 46200/46000 同一片拆成兩層）
LAYERS = 3


def _num(x):
    x = str(x).replace(",", "").strip()
    return float(x) if re.match(r"^-?\d+(\.\d+)?$", x) else None


def _nth_weekday(y, m, weekday, n):
    days = [d for d in calendar.Calendar().itermonthdates(y, m) if d.month == m and d.weekday() == weekday]
    return days[n - 1] if n <= len(days) else None


def _expiry(code):
    """到期月份代碼 → 到期日。202610=第三個週三；202610W1=第1個週三；202609F4=第4個週五。"""
    m = re.match(r"^(\d{4})(\d{2})(?:([WF])(\d))?$", code)
    if not m:
        return None
    y, mo = int(m.group(1)), int(m.group(2))
    if not m.group(3):
        return _nth_weekday(y, mo, 2, 3)
    return _nth_weekday(y, mo, 2 if m.group(3) == "W" else 4, int(m.group(4)))


_HOL = None
_PAST = None


def _holidays():
    """證交所休市日期表（openapi holidaySchedule，當年度）：名稱含「開始交易」「最後交易」者為交易日，其餘為休市。"""
    global _HOL
    if _HOL is None:
        _HOL = set()
        try:
            req = urllib.request.Request("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule", headers={"User-Agent": "Mozilla/5.0"})
            for r in json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read().decode("utf-8-sig")):
                d = re.sub(r"\D", "", str(r.get("Date", "")))
                if len(d) >= 7 and not re.search(r"開始交易|最後交易", str(r.get("Name", ""))):
                    _HOL.add(date(int(d[:-4]) + 1911, int(d[-4:-2]), int(d[-2:])))
        except Exception as e:
            print(f"[warn] 休市日期表取得失敗（只排除週末）：{e}")
    return _HOL


def _past_days():
    """本機 stock_daily 已有的交易日（過去日期用實際資料判斷，可涵蓋颱風等臨時停市）。"""
    global _PAST
    if _PAST is None:
        try:
            import sqlite3
            import broker_analysis as ba
            c = sqlite3.connect(str(ba.DB_PATH))
            _PAST = {date.fromisoformat(r[0]) for r in c.execute("select distinct trade_date from stock_daily where trade_date>='2024-01-01'")}
        except Exception:
            _PAST = set()
    return _PAST


def _is_trading(d, asof):
    if d.weekday() >= 5 or d in _holidays():
        return False
    past = _past_days()
    if past and min(past) <= d <= max(past):      # 本機資料涵蓋範圍內：以實際有無交易為準（含颱風停市）
        return d in past
    return True


def _expiry_adj(code, asof):
    """實際到期日：原定到期日遇休市順延至次一交易日（實證：202510F2 10/10→10/13、202602 2/18→2/23）。"""
    d = _expiry(code)
    if not d:
        return None
    from datetime import timedelta
    for _ in range(15):
        if _is_trading(d, asof):
            return d
        d = d + timedelta(days=1)
    return d


def _taiex_latest(env):
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/taiex_daily?select=trade_date,close&order=trade_date.desc&limit=1",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    d = json.loads(urllib.request.urlopen(req, timeout=20).read())
    return float(d[0]["close"]) if d else None


def _tx_ref(dt):
    """台指期 TX 近月一般盤結算價（近月＝到期日 > 資料日的最早月份契約）。"""
    try:
        req = urllib.request.Request(API_FUT, headers={"User-Agent": "Mozilla/5.0"})
        t = urllib.request.urlopen(req, timeout=45, context=_CTX).read().decode("utf-8-sig", "replace")
        rows = json.loads(t) if t.lstrip().startswith("[") else []
        cand = []
        for r in rows:
            cm = str(r.get("ContractMonth(Week)", "")).strip()
            if r.get("Contract") != "TX" or r.get("TradingSession") != "一般" or not re.match(r"^\d{6}$", cm):
                continue
            sp, ex = _num(r.get("SettlementPrice")), _expiry_adj(cm, dt)
            if sp and ex and ex > dt:
                cand.append((ex, sp, cm))
        if cand:
            ex, sp, cm = min(cand)
            return sp, f"TX近月結算({cm})"
    except Exception as e:
        print(f"[warn] 台指期結算價取得失敗：{e}")
    return None, None


def _prev_oi(code, iso):
    """本機 txo_daily：該契約前一交易日各 (strike, cp) 的 OI。"""
    try:
        import sqlite3
        import broker_analysis as ba
        c = sqlite3.connect(str(ba.DB_PATH))
        d = c.execute("select max(trade_date) from txo_daily where contract=? and trade_date<?", (code, iso)).fetchone()[0]
        if not d:
            return {}
        return {(k, cp): oi for k, cp, oi in c.execute("select strike,cp,oi from txo_daily where contract=? and trade_date=?", (code, d))}
    except Exception as e:
        print(f"[warn] 讀前一日 OI 失敗：{e}")
        return {}


def _pct_rank(vals, v):
    return round(sum(1 for x in vals if x <= v) / len(vals) * 100, 1) if vals else None


def _median(a):
    a = sorted(a); n = len(a)
    return None if not n else (a[n // 2] if n % 2 else (a[n // 2 - 1] + a[n // 2]) / 2)


def _levels(side, ref, up, prev, cp):
    """回傳 (前 3 層清單, 統計)。side＝{strike: oi}。"""
    pts = sorted((k, oi) for k, oi in side.items() if oi and oi > 0 and (k > ref if up else k < ref))
    if not pts:
        return [], {"n": 0}
    ois = [o for _, o in pts]
    p70 = sorted(ois)[max(0, int(round(0.70 * (len(ois) - 1))))]
    mx = max(ois)
    peaks = []
    n = len(pts)
    for i, (k, oi) in enumerate(pts):
        nb = [pts[j][1] for j in range(max(0, i - MED_N), min(n, i + MED_N + 1)) if j != i]
        med = _median(nb) or 0
        loc = [pts[j][1] for j in range(max(0, i - LOCAL_N), min(n, i + LOCAL_N + 1)) if j != i]
        c1, c2 = oi >= p70, oi >= mx * MAX_FRAC
        c3 = med > 0 and oi >= med * MED_MULT
        c4 = bool(loc) and all(oi >= x for x in loc) and any(oi > x for x in loc)
        if c1 and c2 and c3 and c4:
            peaks.append({"strike": k, "oi": oi, "med": med})
    # 平台（相鄰且 OI 相同）只留離 ref 最近者 → c4 已要求至少高於一鄰，平台兩端各自可能入選，這裡再去重
    ded = []
    for pk in peaks:
        if ded and pk["oi"] == ded[-1]["oi"] and abs(pk["strike"] - ded[-1]["strike"]) <= MERGE_GAP:
            if abs(pk["strike"] - ref) < abs(ded[-1]["strike"] - ref):
                ded[-1] = pk
            continue
        ded.append(pk)
    # 峰群合併（間距 ≤100 點），保留群內 OI 最大者
    groups = []
    for pk in ded:
        if groups and pk["strike"] - groups[-1][-1]["strike"] <= MERGE_GAP:
            groups[-1].append(pk)
        else:
            groups.append([pk])
    reps = [max(g, key=lambda x: (x["oi"], -abs(x["strike"] - ref))) for g in groups]
    reps.sort(key=lambda x: abs(x["strike"] - ref))          # 離 ref 近→遠
    out = []
    for pk in reps[:LAYERS]:
        k, oi = pk["strike"], pk["oi"]
        po = prev.get((k, cp))
        out.append({"strike": k, "oi": oi, "oi_delta": (oi - po) if po is not None else None,
                    "dist": round(k - ref, 1), "pct": _pct_rank(ois, oi), "med_mult": round(oi / pk["med"], 2) if pk["med"] else None,
                    "reason": f"OI≥P70({p70})、≥最大×0.12({round(mx * MAX_FRAC)})、≥鄰近中位數×1.5({round(pk['med'] * MED_MULT)})、局部高點"})
    return out, {"n": len(pts), "p70": p70, "max": mx, "peaks": len(reps), "short": len(out) < LAYERS}


def _build(kind, code, rows, ref, ref_kind, spot, iso):
    calls, puts = {}, {}
    for r in rows:
        if r[2].strip() != code:
            continue
        k = int(_num(r[3]))
        (calls if r[4] == "買權" else puts)[k] = int(_num(r[11]) or 0)
    if not calls and not puts:
        return None
    prev = _prev_oi(code, iso)
    res, rst = _levels(calls, ref, True, prev, "C")
    sup, sst = _levels(puts, ref, False, prev, "P")
    call_tot = sum(calls.values()); put_tot = sum(puts.values())
    L = lambda a, i, f: a[i][f] if len(a) > i else None
    return {
        "trade_date": iso, "kind": kind, "contract": code, "expiry": str(_expiry(code)),
        "spot": round(spot, 2) if spot else None, "ref_price": ref, "ref_kind": ref_kind,
        "atm": None, "atm_call": None, "atm_put": None,
        "res_levels": res, "sup_levels": sup,
        "res1_lo": L(res, 0, "strike"), "res1_hi": L(res, 0, "strike"), "res1_oi": L(res, 0, "oi"),
        "res2_lo": L(res, 1, "strike"), "res2_hi": L(res, 1, "strike"), "res2_oi": L(res, 1, "oi"),
        "sup1_lo": L(sup, 0, "strike"), "sup1_hi": L(sup, 0, "strike"), "sup1_oi": L(sup, 0, "oi"),
        "sup2_lo": L(sup, 1, "strike"), "sup2_hi": L(sup, 1, "strike"), "sup2_oi": L(sup, 1, "oi"),
        "resistance": L(res, 0, "strike"), "resistance_oi": L(res, 0, "oi"), "resistance2": L(res, 1, "strike"), "resistance2_oi": L(res, 1, "oi"),
        "support": L(sup, 0, "strike"), "support_oi": L(sup, 0, "oi"), "support2": L(sup, 1, "strike"), "support2_oi": L(sup, 1, "oi"),
        "call_oi_total": call_tot, "put_oi_total": put_tot,
        "pc_ratio": round(put_tot / call_tot, 2) if call_tot else None,
        "meta": {"method": "OI三層峰值", "res": rst, "sup": sst, "pct_min": PCT_MIN, "max_frac": MAX_FRAC,
                 "med": [MED_N, MED_MULT], "local_n": LOCAL_N, "merge_gap": MERGE_GAP},
    }


def main():
    dry = "--dry" in sys.argv
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    req = urllib.request.Request(API, headers={"User-Agent": "Mozilla/5.0"})
    text = urllib.request.urlopen(req, timeout=45, context=_CTX).read().decode("utf-8-sig", "replace")
    if text.lstrip().startswith("["):
        # 2026-09-28 起 openapi 改回傳 JSON：依原 CSV 欄位順序轉成列（0日期 1契約 2到期月份 3履約價 4買賣權 …10結算價 11未沖銷 …17交易時段）
        keys = ["Date", "Contract", "ContractMonth(Week)", "StrikePrice", "CallPut", "Open", "High", "Low", "Close",
                "Volume", "SettlementPrice", "OpenInterest", "BestBid", "BestAsk", "HistoricalHigh", "HistoricalLow",
                "TradingHalt", "TradingSession"]
        rows = [keys] + [[str(r.get(k, "")) for k in keys] for r in json.loads(text)]
    else:
        rows = list(csv.reader(text.splitlines()))
    if len(rows) < 2:
        print("[error] openapi 無資料"); return
    body = [r for r in rows[1:] if len(r) >= 18 and r[1] == "TXO" and r[17].strip() == "一般"]
    if not body:
        print("[error] openapi 無 TXO 一般盤資料"); return
    dt = datetime.strptime(body[0][0], "%Y%m%d").date()
    iso = dt.isoformat()

    codes = {r[2].strip() for r in body}
    live = [(c, _expiry_adj(c, dt)) for c in codes if _expiry_adj(c, dt) and _expiry_adj(c, dt) > dt]   # 依實際（休市順延後）到期日
    wed = sorted([x for x in live if re.search(r"W\d$", x[0])], key=lambda x: x[1])      # 週三週選系列
    fri = sorted([x for x in live if re.search(r"F\d$", x[0])], key=lambda x: x[1])      # 週五週選系列
    monthly = sorted([x for x in live if re.match(r"^\d{6}$", x[0])], key=lambda x: x[1])
    spot = _taiex_latest(env)
    ref, ref_kind = _tx_ref(dt)
    if ref is None:
        ref, ref_kind = spot, "加權收盤(備援)"

    out = []
    for kind, lst in (("week", wed), ("weekf", fri), ("month", monthly)):   # 週三／週五週選分開（比照玩股網），不混算
        if not lst:
            print(f"[warn] 找不到{kind}合約（{iso}）"); continue
        row = _build(kind, lst[0][0], body, ref, ref_kind, spot, iso)
        if row:
            sched = _expiry(lst[0][0])
            row["expiry"] = str(lst[0][1])
            if sched != lst[0][1]:
                row["meta"]["expiry_sched"] = str(sched)      # 原定到期日（遇休市已順延）
            out.append(row)
            fmt = lambda a: "、".join(f"{x['strike']}(OI {x['oi']:,} Δ{x['oi_delta'] if x['oi_delta'] is not None else '—'} PR{x['pct']} ×{x['med_mult']})" for x in a) or "無"
            print(f"[{kind}] {row['contract']}(到期 {row['expiry']}) ref {ref}（{ref_kind}）\n  壓力 {fmt(row['res_levels'])}"
                  f"{'（候選不足）' if row['meta']['res'].get('short') else ''}\n  支撐 {fmt(row['sup_levels'])}"
                  f"{'（候選不足）' if row['meta']['sup'].get('short') else ''}\n  P/C {row['pc_ratio']}")
    if dry or not out:
        return
    key = env["SUPABASE_SERVICE_KEY"]
    preq = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/option_sr?on_conflict=trade_date,kind",
                                  data=json.dumps(out).encode(), method="POST",
                                  headers={"Content-Type": "application/json", "apikey": key,
                                           "Authorization": f"Bearer {key}", "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(preq, timeout=30) as r:
        print(f"已寫入 option_sr {iso}：{len(out)} 列（status {r.status}）")


if __name__ == "__main__":
    main()
