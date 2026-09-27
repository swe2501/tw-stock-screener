"""
option_nday.py — 台指選擇權(TXO)「N 日大量區」壓力／支撐前 5 名（N = 5/10/20/60/120/240/480 交易日）。
讀本機 txo_daily（txo_history.py 產生），結果一天一列寫 Supabase option_nday（data 為 jsonb）。

算法（2026-09-27 與合夥人定案）：
  價平：最新交易日最近月月選 T 字報價（買權、賣權結算價最接近的履約價；無則最接近加權指數）。
  兩種量都算：
    vol＝過去 N 個交易日、各履約價「所有 TXO 合約(週選+月選)」一般盤成交量加總（Call/Put 分開）。
    oi ＝過去 N 個交易日，每天取「當天最近月月選」各履約價未平倉，再對 N 天取平均。
  壓力＝價平以上 Call、支撐＝價平以下 Put：
    窗口先取價平 ±10%，不足 5 區再放寬到 ±20%（到此為止；更遠是舊價位、無參考性）；
    大量＝窗口內 量 ≥ 窗口平均 × 1.3；以峰值為中心：取量最大的大量履約價為峰，峰 ±100 點內的大量檔
    併成一區（最寬 200 點），排除後再找下一個峰，共 5 區，依量排序。
用法：python scripts/option_nday.py [--dry]
"""
import json, sqlite3, sys, urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
import option_sr as osr

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
NS = (5, 10, 20, 60, 120, 240, 480)
WINDOWS = (0.10, 0.20)
TOP = 5


def _is_month(code):
    return len(code) == 6 and code.isdigit()


def _near_month_map(conn, since):
    """每個交易日 → 當天最近月月選代碼（到期日 > 當天的最早月選）。"""
    m = {}
    for d, c in conn.execute("select distinct trade_date, contract from txo_daily where trade_date >= ?", (since,)):
        if not _is_month(c):
            continue
        exp = osr._expiry(c)
        if exp and exp > date.fromisoformat(d) and (d not in m or exp < osr._expiry(m[d])):
            m[d] = c
    return m


def _top_zones(side, atm, up):
    """side {履約價: 量} → (前 5 區間 [[lo, hi, 量], ...], 用到的窗口)。
    以峰值為中心：大量履約價中取量最大者為峰，峰 ±100 點內的大量檔併成同一區(最寬 200 點)，
    排除後再找下一個峰，直到 5 區。（N 日量價平附近幾乎檔檔大量，單純相鄰合併會黏成上千點一大片）"""
    best, tag = [], None
    for w in WINDOWS:
        cand = {k: v for k, v in side.items() if (k > atm if up else k < atm) and v > 0 and abs(k - atm) <= atm * w}
        if not cand:
            continue
        thr = sum(cand.values()) / len(cand) * osr.BIG_MULT
        big = {k: v for k, v in cand.items() if v >= thr}
        zs = []
        while big and len(zs) < TOP:
            peak = max(big, key=big.get)
            grp = [k for k in big if abs(k - peak) <= osr.MERGE_GAP]
            zs.append([min(grp), max(grp), round(sum(big[k] for k in grp))])
            for k in grp:
                del big[k]
        best, tag = zs, f"{int(w * 100)}%"
        if len(zs) >= TOP:
            break
    return best, tag


def main():
    dry = "--dry" in sys.argv
    env = bs._load_env()
    conn = sqlite3.connect(str(DB_PATH))
    dates = [r[0] for r in conn.execute("select distinct trade_date from txo_daily order by trade_date desc limit ?", (max(NS),))]
    if not dates:
        print("[error] txo_daily 無資料，先跑 txo_history.py"); return
    T = dates[0]
    nm = _near_month_map(conn, dates[-1])
    contract = nm.get(T)
    calls, puts = {}, {}
    for k, cp, st, oi in conn.execute("select strike, cp, settle, oi from txo_daily where trade_date=? and contract=?", (T, contract)):
        (calls if cp == "C" else puts)[k] = (st, oi)
    spot = osr._taiex_latest(env) if env.get("SUPABASE_SERVICE_KEY") else None
    atm, atm_by = osr._atm(calls, puts, spot)
    print(f"最新交易日 {T}，近月 {contract}，價平 {atm}（{atm_by}），可用 {len(dates)} 個交易日")

    conn.execute("create temp table nm (trade_date text, contract text)")
    conn.executemany("insert into nm values (?,?)", nm.items())
    data = {"vol": {}, "oi": {}}
    for n in NS:
        if len(dates) < n:
            print(f"  {n} 日：資料不足（{len(dates)} 天），略過"); continue
        since = dates[n - 1]
        vol = {"C": {}, "P": {}}
        for k, cp, v in conn.execute("select strike, cp, sum(volume) from txo_daily where trade_date >= ? group by strike, cp", (since,)):
            vol[cp][k] = v or 0
        oi = {"C": {}, "P": {}}
        for k, cp, v in conn.execute("""select t.strike, t.cp, sum(t.oi) from txo_daily t
                join nm on nm.trade_date = t.trade_date and nm.contract = t.contract
                where t.trade_date >= ? group by t.strike, t.cp""", (since,)):
            oi[cp][k] = (v or 0) / n
        for key, src in (("vol", vol), ("oi", oi)):
            res, rw = _top_zones(src["C"], atm, True)
            sup, sw = _top_zones(src["P"], atm, False)
            data[key][str(n)] = {"res": res, "sup": sup, "win": {"res": rw, "sup": sw}}
        f = lambda zs: " ".join(str(z[0]) if z[0] == z[1] else f"{z[0]}~{z[1]}" for z in zs)
        print(f"  {n:>3} 日 vol 壓力[{f(data['vol'][str(n)]['res'])}] 支撐[{f(data['vol'][str(n)]['sup'])}]")
        print(f"  {'':>3}    oi  壓力[{f(data['oi'][str(n)]['res'])}] 支撐[{f(data['oi'][str(n)]['sup'])}]")

    row = {"trade_date": T, "contract": contract, "atm": atm, "spot": round(spot, 2) if spot else None,
           "days": len(dates), "data": data}
    if dry:
        return
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/option_nday?on_conflict=trade_date",
                                 data=json.dumps([row]).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
                                          "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"已寫入 option_nday {T}（status {r.status}）")


if __name__ == "__main__":
    main()
