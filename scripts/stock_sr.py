"""
stock_sr.py — 個股分價量表「壓力區／支撐區」（N = 5/10/20/60/120/240/480 交易日），寫 Supabase stock_sr。
供前端「選股 → 🧱 壓力支撐逼近」列表（各 N 前 20 名）與 K 線圖壓力/支撐色帶。

算法（2026-09-27 與合夥人定案）：
  分價量表：以最新收盤價為中心、格寬＝收盤價的 1%（格 k 覆蓋 收盤×(1+(k−0.5)%) ～ 收盤×(1+(k+0.5)%)）；
    每天成交量依「最低～最高價」均勻分攤到涵蓋的格子（最高=最低時全放同一格）。
  大量格＝量 ≥ 全部有量格子平均 × 1.3（同選擇權「均量 1.3 倍」原則）。
  壓力區＝收盤格「以上」量最大、且為大量的格；上方無大量格＝無套牢壓力（如創新高），不列。
    距離＝(壓力區下緣 − 收盤) ÷ 收盤。
  支撐區＝收盤格「以下」量最大、且為大量的格；距離＝(收盤 − 支撐區上緣) ÷ 收盤。
  列表條件（前端查詢）：距離 0～3%、近 20 日日均成交值 ≥ 5,000 萬、排除 ETF(00 開頭)，依距離近到遠取前 20。
  歷史不足 N 天的股票略過該 N。
資料：本機 stock_daily（上市＋上櫃；backfill_stock_2y.py 回補、每日 fetch_prices*.py 更新）。
存法：Supabase stock_sr PK(code, n) 每日覆蓋（只留最新快照，約 1.4 萬列，不累積歷史）。
兩個版本（2026-09-28）：
  日K版（預設，→ stock_sr）：每天一根日K，量依當日最低～最高均勻分攤。
  小時K版（--src hour，→ stock_sr_h）：每天用 Yahoo 60 分鐘K（fetch_hourly.py 存本機 stock_hourly）逐根分攤，
    較貼近實際各價位成交；盤中K 不含 13:30 收盤集合競價的量 → 「日成交量 − 當日小時K量加總」補在當日收盤價；
    某天沒有小時K（超過 Yahoo 730 天或缺資料）時該天退回用日K。
用法：python scripts/stock_sr.py [--src day|hour] [--dry] [--code 2330]
"""
import json, math, sqlite3, sys, urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
NS = (5, 10, 20, 60, 120, 240, 480)
BIN_PCT = 0.01
BIG_MULT = 1.3
STALE_DAYS = 7      # 最新資料比全市場最新日落後超過這麼多「交易日」視為下市/停牌，略過


def _profile_snapshots(days, close, w):
    """days: 由新到舊，每天一個 [(high, low, volume), ...]（日K版 1 根、小時K版多根）。
    逐日累加分價量，於第 N 天時快照。回傳 {N: {格: 量}}。格 k 覆蓋 [close + (k-0.5)w, close + (k+0.5)w)，收盤價所在格為 0。"""
    acc = defaultdict(float); out = {}
    kof = lambda p: math.floor((p - close) / w + 0.5)
    for i, bars in enumerate(days, 1):
        for h, l, v in bars:
            if not v:
                continue
            k0, k1 = kof(l), kof(h)
            if k1 <= k0 or h <= l:
                acc[k0] += v
            else:
                for k in range(k0, k1 + 1):
                    ov = min(h, close + (k + 0.5) * w) - max(l, close + (k - 0.5) * w)
                    if ov > 0:
                        acc[k] += v * ov / (h - l)
        if i in NS:
            out[i] = dict(acc)
    return out


def _days(rows, hourly=None):
    """rows 由新到舊 [(date, high, low, close, volume)] → 每天的 bar 清單。
    hourly={date: [(h,l,v),...]} 時用小時K，並把「日量 − 小時K量加總」補在當日收盤價（收盤集合競價）。"""
    out = []
    for d, h, l, c, v in rows:
        hb = hourly.get(d) if hourly else None
        if hb:
            rest = (v or 0) - sum(x[2] for x in hb)
            out.append(hb + ([(c, c, rest)] if rest > 0 and c else []))
        else:
            out.append([(h, l, v)])
    return out


def compute(code, rows, hourly=None):
    """rows 由新到舊 [(date, high, low, close, volume)]。"""
    d0, _, _, close, _ = rows[0]
    if not close:
        return []
    w = close * BIN_PCT
    lo = lambda k: round(close + (k - 0.5) * w, 2)
    hi = lambda k: round(close + (k + 0.5) * w, 2)
    avg_value = sum((r[3] or 0) * (r[4] or 0) for r in rows[:20]) / min(20, len(rows))
    out = []
    for n, prof in _profile_snapshots(_days(rows, hourly), close, w).items():
        vals = [v for v in prof.values() if v > 0]
        thr = sum(vals) / len(vals) * BIG_MULT if vals else 0
        up = {k: v for k, v in prof.items() if k > 0 and v >= thr and v > 0}
        dn = {k: v for k, v in prof.items() if k < 0 and v >= thr and v > 0}
        rk = max(up, key=up.get) if up else None
        sk = max(dn, key=dn.get) if dn else None
        out.append({
            "code": code, "n": n, "trade_date": d0, "close": close,
            "res_lo": lo(rk) if rk is not None else None,
            "res_hi": hi(rk) if rk is not None else None,
            "res_vol": round(up[rk] / 1000) if rk is not None else None,           # 張
            "res_dist": round((lo(rk) - close) / close * 100, 2) if rk is not None else None,
            "sup_lo": lo(sk) if sk is not None else None,
            "sup_hi": hi(sk) if sk is not None else None,
            "sup_vol": round(dn[sk] / 1000) if sk is not None else None,
            "sup_dist": round((close - hi(sk)) / close * 100, 2) if sk is not None else None,
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
        rows = conn.execute("select trade_date, high, low, close, volume from stock_daily where code=? "
                            "and high is not null and low is not null order by trade_date desc limit ?", (c, max(NS))).fetchall()
        if not rows:
            continue
        hourly = None
        if src == "hour":
            hourly = defaultdict(list)
            for d, h, l, v in conn.execute("select trade_date, high, low, volume from stock_hourly where code=? and trade_date >= ?",
                                           (c, rows[-1][0])):
                hourly[d].append((h, l, v))
        out += compute(c, rows, hourly)
    print(f"[{src}] 最新日 {latest}：{len(codes)} 檔 → {len(out):,} 列")
    if dry or only:
        for r in out[:14] if only else []:
            print(r)
        if dry:
            return
    env = bs._load_env(); key = env["SUPABASE_SERVICE_KEY"]
    hdr = {"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(out), 1000):
        req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/{table}?on_conflict=code,n",
                                     data=json.dumps(out[i:i + 1000]).encode(), method="POST", headers=hdr)
        urllib.request.urlopen(req, timeout=60).read()
    # 清掉不在本次名單的舊列（下市/停牌），只留最新快照
    if not only:
        req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/{table}?trade_date=lt.{cutoff}",
                                     method="DELETE", headers=hdr)
        urllib.request.urlopen(req, timeout=60).read()
    print(f"已寫入 {table} {len(out):,} 列")


if __name__ == "__main__":
    main()
