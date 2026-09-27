"""
option_nday.py — 台指選擇權(TXO)「N 日大量區」壓力／支撐前 5 名，週選／月選各自一組。
讀本機 txo_daily（txo_history.py 產生），結果一天一列寫 Supabase option_nday（data 為 jsonb）。
前端（首頁 §6「選擇權支撐壓力區」合併卡）：週選分頁用 5 日、月選分頁用 20 日，壓力/支撐第 1~5 名一對一對顯示。

算法（2026-09-27 與合夥人定案；2026-09-28 合夥人修正：只找價平上下 10%）：
  合約／價平：週選＝當天最近到期週選(W/F)、月選＝最近月月選；價平＝最新交易日該合約 T 字報價
    （買權、賣權結算價最接近的履約價；無則最接近加權指數）。
  兩種量都算：
    vol＝過去 N 個交易日、各履約價「所有 TXO 合約(週選+月選)」一般盤成交量加總（Call/Put 分開）。
    oi ＝過去 N 個交易日，每天取「當天的該類合約」（週選＝最近週選、月選＝最近月月選）各履約價未平倉，對 N 天取平均。
  壓力＝價平以上 Call、支撐＝價平以下 Put，範圍＝價平 ±10%（不再放寬）；
    大量＝範圍內 量 ≥ 範圍平均 × 1.3；以峰值為中心：取量最大的大量履約價為峰，峰 ±100 點內的大量檔
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
WINDOWS = (0.10,)             # 2026-09-28 合夥人：只找價平上下 10%
TOP = 5


def _is_month(code):
    return len(code) == 6 and code.isdigit()


def _is_week(code):
    return len(code) == 8 and code[:6].isdigit() and code[6] in "WF"


def _near_map(conn, since, kind):
    """每個交易日 → 當天最近到期的合約代碼（kind=week：週選 W/F；month：月選）。"""
    ok = _is_week if kind == "week" else _is_month
    m, exp_of = {}, {}
    for d, c in conn.execute("select distinct trade_date, contract from txo_daily where trade_date >= ?", (since,)):
        if not ok(c):
            continue
        exp = exp_of.setdefault(c, osr._expiry(c))
        if exp and exp > date.fromisoformat(d) and (d not in m or exp < exp_of[m[d]]):
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
        zs.sort(key=lambda z: -z[2])          # 依區間總量排名（與前端顯示的量一致）
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
    spot = osr._taiex_latest(env) if env.get("SUPABASE_SERVICE_KEY") else None
    print(f"最新交易日 {T}，可用 {len(dates)} 個交易日，現價 {spot}")
    f = lambda zs: " ".join(str(z[0]) if z[0] == z[1] else f"{z[0]}~{z[1]}" for z in zs)
    data = {}
    for kind in ("week", "month"):
        cmap = _near_map(conn, dates[-1], kind)
        contract = cmap.get(T)
        calls, puts = {}, {}
        for k, cp, st, oi in conn.execute("select strike, cp, settle, oi from txo_daily where trade_date=? and contract=?", (T, contract)):
            (calls if cp == "C" else puts)[k] = (st, oi)
        atm, atm_by = osr._atm(calls, puts, spot)
        print(f"[{kind}] {contract} 價平 {atm}（{atm_by}）")
        conn.execute("drop table if exists cm"); conn.execute("create temp table cm (trade_date text, contract text)")
        conn.executemany("insert into cm values (?,?)", cmap.items())
        d = {"contract": contract, "atm": atm, "atm_by": atm_by, "vol": {}, "oi": {}}
        for n in NS:
            if len(dates) < n:
                continue
            since = dates[n - 1]
            vol = {"C": {}, "P": {}}
            for k, cp, v in conn.execute("select strike, cp, sum(volume) from txo_daily where trade_date >= ? group by strike, cp", (since,)):
                vol[cp][k] = v or 0
            oi = {"C": {}, "P": {}}
            for k, cp, v in conn.execute("""select t.strike, t.cp, sum(t.oi) from txo_daily t
                    join cm on cm.trade_date = t.trade_date and cm.contract = t.contract
                    where t.trade_date >= ? group by t.strike, t.cp""", (since,)):
                oi[cp][k] = (v or 0) / n
            for key, src in (("vol", vol), ("oi", oi)):
                res, _ = _top_zones(src["C"], atm, True)
                sup, _ = _top_zones(src["P"], atm, False)
                d[key][str(n)] = {"res": res, "sup": sup}
            if n in (5, 20):
                print(f"   {n:>3} 日 vol 壓力[{f(d['vol'][str(n)]['res'])}] 支撐[{f(d['vol'][str(n)]['sup'])}]")
                print(f"          oi  壓力[{f(d['oi'][str(n)]['res'])}] 支撐[{f(d['oi'][str(n)]['sup'])}]")
        data[kind] = d

    row = {"trade_date": T, "contract": data["month"]["contract"], "atm": data["month"]["atm"],
           "spot": round(spot, 2) if spot else None, "days": len(dates), "data": data}
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
