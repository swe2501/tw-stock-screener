"""
stock_sr.py — 個股「多週期大量區 K 棒水平線」支撐／壓力（規格 SPEC-TA-SR-001，2026-09-28 合夥人定案），寫 Supabase stock_sr / stock_sr_h。
供：K 線右側「🧱 支撐壓力」分頁、K 線圖支撐壓力線、選股「🧱 壓力支撐逼近」列表。

算法：
  週期 P ∈ {5, 10, 20, 60, 120, 240, 480}（以「根 K 棒」計；日K版＝日K 根數、小時K版＝60 分鐘K 根數）。
  1) 大量 K 棒：在最新 K 棒 t 的回溯窗口 [t−P+1, t] 內取成交量最大的那根 idx_P；同量取時間最近者。
  2) 三條水平線：H_P＝該根最高、M_P＝(最高+最低)/2、L_P＝該根最低。
  3) 以最新收盤 C_t 判定（兩版都用當日實際收盤；小時K 最後一根不含收盤集合競價，不用它）：
       狀態 A  C_t > H_P          → H、M、L 全為支撐（第1~3支撐），無壓力
       狀態 B  M_P < C_t ≤ H_P    → H＝壓力1；M＝支撐1、L＝支撐2
       狀態 C  L_P ≤ C_t ≤ M_P    → M＝壓力1、H＝壓力2；L＝支撐1
       狀態 D  C_t < L_P          → L、M、H 全為壓力（第1~3壓力），無支撐
  4) 聚合：21 條線依上述屬性分成支撐集合、壓力集合；最近支撐＝支撐中最高者、最近壓力＝壓力中最低者；
     另存支撐線數、壓力線數（「多空線數比率」公式待合夥人確認後再加）。
  儲存：每檔每版 8 列——n=5~480 各一列（該週期 H/M/L、大量K日期與量、狀態、該週期最近支撐/壓力），
        n=0 為 21 條線聚合（最近支撐/壓力、來源、線數）。距離＝|線 − 收盤| ÷ 收盤。
  列表（前端）：距離 0～3%、近 20 日日均成交值 ≥ 5,000 萬、排除 ETF，依距離近到遠取前 20。
  歷史不足 P 根的週期略過。
資料：本機 stock_daily（日K）、stock_hourly（60 分鐘K，Yahoo；歷史小時K 常缺 9:00 那根的量，該根量=0 不會被選為大量K）。
存法：Supabase PK(code, n) 每日覆蓋（只留最新快照）。
用法：python scripts/stock_sr.py [--src day|hour] [--dry] [--code 2330]
"""
import json, sqlite3, sys, time, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
NS = (5, 10, 20, 60, 120, 240, 480)
STALE_DAYS = 7      # 最新資料比全市場最新日落後超過這麼多「交易日」視為下市/停牌，略過
PART = {"H": "高", "M": "中", "L": "低"}


def classify(c, h, m, l):
    """回傳 (狀態, {線名: 'S'|'R'})，依規格 2.1~2.4。"""
    if c > h:
        return "A", {"H": "S", "M": "S", "L": "S"}
    if m < c <= h:
        return "B", {"H": "R", "M": "S", "L": "S"}
    if l <= c <= m:
        return "C", {"H": "R", "M": "R", "L": "S"}
    return "D", {"H": "R", "M": "R", "L": "R"}


def compute(code, bars, close, trade_date, avg_value):
    """bars 由新到舊 [(label, high, low, volume)]；close＝最新收盤 C_t。"""
    r2 = lambda v: round(v, 2)
    dist = lambda v: round(abs(v - close) / close * 100, 2)
    out, lines = [], []          # lines: (值, 屬性, 來源文字)
    for n in NS:
        if len(bars) < n:
            continue
        win = bars[:n]
        vmax = max(b[3] or 0 for b in win)
        if vmax <= 0:
            continue
        lab, h, l, v = next(b for b in win if (b[3] or 0) == vmax)     # 由新到舊 → 第一個即時間最近者
        m = (h + l) / 2
        st, attr = classify(close, h, m, l)
        vals = {"H": h, "M": m, "L": l}
        sup = [vals[k] for k in vals if attr[k] == "S"]
        res = [vals[k] for k in vals if attr[k] == "R"]
        for k in vals:
            lines.append((vals[k], attr[k], f"{n}{PART[k]}"))
        ns, nr = (max(sup) if sup else None), (min(res) if res else None)
        out.append({
            "code": code, "n": n, "trade_date": trade_date, "close": close,
            "h": r2(h), "m": r2(m), "l": r2(l), "anchor_date": lab, "anchor_vol": round(v / 1000),
            "state": st, "src": None, "sup_cnt": len(sup), "res_cnt": len(res),
            "res_lo": r2(nr) if nr is not None else None, "res_hi": r2(nr) if nr is not None else None,
            "res_dist": dist(nr) if nr is not None else None, "res_vol": round(v / 1000) if nr is not None else None,
            "sup_lo": r2(ns) if ns is not None else None, "sup_hi": r2(ns) if ns is not None else None,
            "sup_dist": dist(ns) if ns is not None else None, "sup_vol": round(v / 1000) if ns is not None else None,
            "avg_value": round(avg_value),
        })
    if not out:
        return []
    S = sorted([x for x in lines if x[1] == "S"], key=lambda x: -x[0])
    R = sorted([x for x in lines if x[1] == "R"], key=lambda x: x[0])
    src = []
    if R:
        src.append("壓:" + "、".join(x[2] for x in R if abs(x[0] - R[0][0]) < 1e-9))
    if S:
        src.append("撐:" + "、".join(x[2] for x in S if abs(x[0] - S[0][0]) < 1e-9))
    out.append({
        "code": code, "n": 0, "trade_date": trade_date, "close": close,
        "h": None, "m": None, "l": None, "anchor_date": None, "anchor_vol": None,
        "state": None, "src": "；".join(src) or None, "sup_cnt": len(S), "res_cnt": len(R),
        "res_lo": r2(R[0][0]) if R else None, "res_hi": r2(R[0][0]) if R else None,
        "res_dist": dist(R[0][0]) if R else None, "res_vol": None,
        "sup_lo": r2(S[0][0]) if S else None, "sup_hi": r2(S[0][0]) if S else None,
        "sup_dist": dist(S[0][0]) if S else None, "sup_vol": None,
        "avg_value": round(avg_value),
    })
    return out


def main():
    dry = "--dry" in sys.argv
    src = sys.argv[sys.argv.index("--src") + 1] if "--src" in sys.argv else "day"
    table = "stock_sr_h" if src == "hour" else "stock_sr"
    only = sys.argv[sys.argv.index("--code") + 1].split(",") if "--code" in sys.argv else None
    conn = sqlite3.connect(str(DB_PATH)); conn.execute("pragma busy_timeout = 60000")
    days = [r[0] for r in conn.execute("select distinct trade_date from stock_daily order by trade_date desc limit ?", (STALE_DAYS,))]
    latest, cutoff = days[0], days[-1]
    codes = [r[0] for r in conn.execute(
        "select code from stock_daily group by code having max(trade_date) >= ?", (cutoff,))]
    codes = [c for c in codes if c.isdigit() and len(c) == 4 and not c.startswith("00")]   # 排除 ETF/權證/特別股
    if only:
        codes = [c for c in codes if c in only]
    out = []
    for c in codes:
        drows = conn.execute("select trade_date, high, low, close, volume from stock_daily where code=? "
                             "and high is not null and low is not null order by trade_date desc limit ?", (c, max(NS))).fetchall()
        if not drows or not drows[0][3]:
            continue
        avg_value = sum((r[3] or 0) * (r[4] or 0) for r in drows[:20]) / min(20, len(drows))
        if src == "hour":
            hrows = conn.execute("select ts, high, low, close, volume from stock_hourly where code=? and high is not null "
                                 "order by ts desc limit ?", (c, max(NS))).fetchall()
            if not hrows:
                continue
            bars = [(time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts + 8 * 3600)), h, l, v) for ts, h, l, _, v in hrows]
        else:
            bars = [(d, h, l, v) for d, h, l, _, v in drows]
        close, tdate = drows[0][3], drows[0][0]   # C_t 兩版都用當日實際收盤（小時K 最後一根不含 13:30 集合競價，會與收盤價不同）
        out += compute(c, bars, close, tdate, avg_value)
    print(f"[{src}] 最新日 {latest}：{len(codes)} 檔 → {len(out):,} 列")
    if dry or only:
        for r in out[:16] if only else []:
            print({k: r[k] for k in ("code", "n", "close", "h", "m", "l", "anchor_date", "anchor_vol", "state", "sup_lo", "sup_dist", "res_lo", "res_dist", "src", "sup_cnt", "res_cnt")})
        if dry:
            return
    env = bs._load_env(); key = env["SUPABASE_SERVICE_KEY"]
    hdr = {"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(out), 1000):
        req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/{table}?on_conflict=code,n",
                                     data=json.dumps(out[i:i + 1000]).encode(), method="POST", headers=hdr)
        urllib.request.urlopen(req, timeout=60).read()
    if not only:
        # 清掉不在本次名單的舊列（下市/停牌）
        req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/{table}?trade_date=lt.{cutoff}", method="DELETE", headers=hdr)
        urllib.request.urlopen(req, timeout=60).read()
    print(f"已寫入 {table} {len(out):,} 列")


if __name__ == "__main__":
    main()
