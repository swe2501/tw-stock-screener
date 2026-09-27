"""
option_sr.py — 台指選擇權(TXO)「支撐壓力區」，供首頁「今日判讀」卡片（週選／月選兩個 tab）。

方法（2026-09-27 與合夥人定案）：
  1. 合約：週選＝到期日在資料日之後、最近的週選(W=週三/F=週五)；月選＝最近月(未過第三個週三→當月，否則次月)。
  2. 價平(ATM)：T字報價中「買權結算價 ≒ 賣權結算價」(|C−P| 最小) 的履約價；若無結算價則退回最接近加權指數的履約價。
  3. 大量：窗口內該側(價平以上 CALL／價平以下 PUT) OI ≥ 窗口內平均 OI × 1.3。
     相鄰大量履約價(間距 ≤100 點)合併成一個區間。
  4. 主要＝離價平最近的大量區；次要＝再往外的下一個大量區。
     窗口先取價平 ±5%，找不到再擴到 ±10%，再找不到就不限範圍。
  另存 CALL/PUT 總 OI 與 Put/Call OI 比(市場情緒輔助)。
資料源：TAIFEX openapi `DailyMarketReportOpt`（CSV，urllib 可讀；固定欄位、含交易時段，取「一般」盤）。
  欄位(0起)：0日期 1契約 2到期月份(週選如 202610W1/202609F4) 3履約價 4買賣權 …9成交量 10結算價 11未沖銷契約量 …17交易時段。
  openapi 僅最新一交易日；spot＝taiex_daily 最新收盤。
→ Supabase option_sr(PK trade_date+kind，kind=week/month)。
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

WINDOWS = (0.05, 0.10, None)   # 價平 ±5% → ±10% → 不限
BIG_MULT = 1.3                 # 大量＝窗口內平均 OI × 1.3
MERGE_GAP = 100                # 相鄰大量履約價間距 ≤100 點合併成區間


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


def _taiex_latest(env):
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/taiex_daily?select=trade_date,close&order=trade_date.desc&limit=1",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    d = json.loads(urllib.request.urlopen(req, timeout=20).read())
    return float(d[0]["close"]) if d else None


def _atm(calls, puts, spot):
    """T字價平：買權、賣權結算價最接近的履約價；無結算價則取最接近指數者。"""
    both = [k for k in calls if k in puts and calls[k][0] and puts[k][0]]
    if both:
        return min(both, key=lambda k: abs(calls[k][0] - puts[k][0])), "T字"
    ks = sorted(set(calls) | set(puts))
    return (min(ks, key=lambda k: abs(k - spot)), "指數") if spot and ks else (None, None)


def _zones(side, atm, up, w):
    """回傳 (大量區列表(依離價平由近到遠), 門檻)。大量區＝[(lo, hi, oi合計)]。"""
    cand = [(k, oi) for k, (_, oi) in side.items()
            if (k > atm if up else k < atm) and oi > 0 and (w is None or abs(k - atm) <= atm * w)]
    if not cand:
        return [], None
    thr = sum(o for _, o in cand) / len(cand) * BIG_MULT
    big = sorted(k for k, o in cand if o >= thr)
    groups = []
    for k in big:
        if groups and k - groups[-1][-1] <= MERGE_GAP:
            groups[-1].append(k)
        else:
            groups.append([k])
    zs = [(min(g), max(g), sum(side[k][1] for k in g)) for g in groups]
    zs.sort(key=lambda z: min(abs(z[0] - atm), abs(z[1] - atm)))
    return zs, round(thr)


def _pick(side, atm, up):
    """主要＝最窄窗口內離價平最近的大量區；次要＝逐步放寬窗口，找比主要更外側的下一個大量區。"""
    main = sec = None; meta = {}
    far = (lambda z: z[0] > main[1]) if up else (lambda z: z[1] < main[0])
    for w in WINDOWS:
        zs, thr = _zones(side, atm, up, w)
        tag = "all" if w is None else f"{int(w * 100)}%"
        if main is None and zs:
            main = zs[0]; meta["main_win"] = tag; meta["main_thr"] = thr
        if main is not None:
            outer = [z for z in zs if far(z)]
            if outer:
                sec = outer[0]; meta["sec_win"] = tag; meta["sec_thr"] = thr
                break
    return main, sec, meta


def _build(kind, code, rows, spot, iso):
    calls, puts = {}, {}
    for r in rows:
        if r[2].strip() != code:
            continue
        k = int(_num(r[3]))
        (calls if r[4] == "買權" else puts)[k] = (_num(r[10]), int(_num(r[11]) or 0))
    atm, atm_by = _atm(calls, puts, spot)
    if atm is None:
        return None
    r1, r2, rm = _pick(calls, atm, True)
    s1, s2, sm = _pick(puts, atm, False)
    call_tot = sum(o for _, o in calls.values()); put_tot = sum(o for _, o in puts.values())
    z = lambda t, i: t[i] if t else None
    return {
        "trade_date": iso, "kind": kind, "contract": code, "expiry": str(_expiry(code)),
        "spot": round(spot, 2) if spot else None,
        "atm": atm, "atm_call": calls.get(atm, (None,))[0], "atm_put": puts.get(atm, (None,))[0],
        "res1_lo": z(r1, 0), "res1_hi": z(r1, 1), "res1_oi": z(r1, 2),
        "res2_lo": z(r2, 0), "res2_hi": z(r2, 1), "res2_oi": z(r2, 2),
        "sup1_lo": z(s1, 0), "sup1_hi": z(s1, 1), "sup1_oi": z(s1, 2),
        "sup2_lo": z(s2, 0), "sup2_hi": z(s2, 1), "sup2_oi": z(s2, 2),
        # 舊欄位：主要區靠價平那一端（相容舊前端）
        "resistance": z(r1, 0), "resistance_oi": z(r1, 2), "resistance2": z(r2, 0), "resistance2_oi": z(r2, 2),
        "support": z(s1, 1), "support_oi": z(s1, 2), "support2": z(s2, 1), "support2_oi": z(s2, 2),
        "call_oi_total": call_tot, "put_oi_total": put_tot,
        "pc_ratio": round(put_tot / call_tot, 2) if call_tot else None,
        "meta": {"atm_by": atm_by, "res": rm, "sup": sm, "big_mult": BIG_MULT, "merge_gap": MERGE_GAP},
    }


def main():
    dry = "--dry" in sys.argv
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    req = urllib.request.Request(API, headers={"User-Agent": "Mozilla/5.0"})
    text = urllib.request.urlopen(req, timeout=45, context=_CTX).read().decode("utf-8-sig", "replace")
    rows = list(csv.reader(text.splitlines()))
    if len(rows) < 2:
        print("[error] openapi 無資料"); return
    body = [r for r in rows[1:] if len(r) >= 18 and r[1] == "TXO" and r[17].strip() == "一般"]
    if not body:
        print("[error] openapi 無 TXO 一般盤資料"); return
    dt = datetime.strptime(body[0][0], "%Y%m%d").date()
    iso = dt.isoformat()

    codes = {r[2].strip() for r in body}
    live = [(c, _expiry(c)) for c in codes if _expiry(c) and _expiry(c) > dt]
    weekly = sorted([x for x in live if re.search(r"[WF]\d$", x[0])], key=lambda x: x[1])
    monthly = sorted([x for x in live if re.match(r"^\d{6}$", x[0])], key=lambda x: x[1])
    spot = _taiex_latest(env)

    out = []
    for kind, lst in (("week", weekly), ("month", monthly)):
        if not lst:
            print(f"[warn] 找不到{kind}合約（{iso}）"); continue
        row = _build(kind, lst[0][0], body, spot, iso)
        if row:
            out.append(row)
            f = lambda lo, hi: "—" if lo is None else (str(lo) if lo == hi else f"{lo}~{hi}")
            print(f"[{kind}] {row['contract']}(到期 {row['expiry']}) 價平 {row['atm']}({row['meta']['atm_by']}) | "
                  f"壓力 主 {f(row['res1_lo'], row['res1_hi'])} 次 {f(row['res2_lo'], row['res2_hi'])} | "
                  f"支撐 主 {f(row['sup1_lo'], row['sup1_hi'])} 次 {f(row['sup2_lo'], row['sup2_hi'])} | P/C {row['pc_ratio']} | {row['meta']}")
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
