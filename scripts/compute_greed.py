"""
compute_greed.py — 每日算全市場個股「基礎情緒/貪婪分」(0~100) → Supabase greed_base(快照)。

依 Stock_Greed_Index_Framework.xlsx 的四維加權(取平均合成維度、分段線性內插給分):
  價格延伸度 30%  = avg(BIAS20分, 布林%b分)
  動能與強弱 25%  = avg(RSI5分, RS分[vs 大盤])
  量能與投機 25%  = avg(量比分, 當沖率分[TWSE有、OTC缺則只用量比])
  籌碼擁擠度 20%  = avg(主力集中度分, 融資單週增幅分)
  基礎分 = 0.30×價格延伸 + 0.25×動能 + 0.25×量能 + 0.20×籌碼

利多出盡 ⚠️(Q8):基礎分≥80 且 當日「爆量(量>max(5,10)均量×1.3)且(長黑≤-5% 或 高檔)」。
  高檔 = 收盤 > 前低點(近30交易日最低 或波段低)最低價×1.3;此處用近60交易日最低×1.3(簡化)。

前端讀 greed_base 再加催化(話題/法說/展覽)bonus。
用法：python scripts/compute_greed.py [--dry-run]
"""
import sqlite3
import sys
import urllib.request
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

WANTGOO_DB = r"D:\stock_data\wantgoo_full.db"

# ── 分段線性內插:anchors = [(x, score)...](x 遞增) ──
def interp(x, anchors):
    if x is None:
        return None
    if x <= anchors[0][0]:
        return anchors[0][1]
    if x >= anchors[-1][0]:
        return anchors[-1][1]
    for (x0, s0), (x1, s1) in zip(anchors, anchors[1:]):
        if x0 <= x <= x1:
            return s0 + (x - x0) / (x1 - x0) * (s1 - s0)
    return anchors[-1][1]

A_BIAS  = [(-10, 0), (-5, 30), (-3, 40), (8, 60), (15, 80), (25, 100)]     # BIAS20 %
A_PB    = [(0, 0), (0.2, 30), (0.3, 40), (0.8, 60), (1.0, 80), (1.2, 100)] # 布林 %b
A_RSI5  = [(10, 0), (30, 39), (45, 40), (70, 60), (85, 80), (95, 100)]     # RSI(5)
A_RS    = [(-10, 0), (-5, 30), (0, 50), (5, 70), (10, 85), (20, 100)]      # 超額報酬(個股-大盤)近20日 %
A_VR    = [(0.3, 0), (0.5, 30), (0.8, 40), (1.7, 59), (1.8, 60), (3.0, 80), (5.0, 100)]  # 量比
A_DTR   = [(0, 40), (35, 55), (60, 80), (80, 100)]                        # 當沖率 %(只加貪婪)
A_CONC  = [(-30, 0), (0, 40), (30, 60), (50, 80), (70, 100)]              # 主力集中度 %(前15大淨買超/總量)
A_MARGN = [(-10, 30), (0, 45), (10, 60), (20, 80), (40, 100)]             # 融資單週增幅 %

W = {"price": 0.30, "momentum": 0.25, "volume": 0.25, "chip": 0.20}


def _avg(vals):
    v = [x for x in vals if x is not None]
    return sum(v) / len(v) if v else None


def _sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def _rsi(closes, period=5):
    if len(closes) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(-period, 0):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0); losses += max(-d, 0)
    ag, al = gains / period, losses / period
    if al == 0:
        return 100.0
    return 100 - 100 / (1 + ag / al)


def _bband_pctb(closes, n=20, k=2):
    if len(closes) < n:
        return None
    seg = closes[-n:]
    ma = sum(seg) / n
    var = sum((c - ma) ** 2 for c in seg) / n
    sd = var ** 0.5
    if sd == 0:
        return None
    up, lo = ma + k * sd, ma - k * sd
    return (closes[-1] - lo) / (up - lo)


def _fetch_taiex():
    env = bs._load_env()
    url = f"{env['SUPABASE_URL']}/rest/v1/taiex_daily?select=trade_date,close&order=trade_date.asc&limit=1250"
    key = env.get("SUPABASE_ANON_KEY") or env.get("SUPABASE_SERVICE_KEY")
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return {r["trade_date"]: float(r["close"]) for r in rows}


def main():
    dry = "--dry-run" in sys.argv
    env = bs._load_env()
    if not dry and not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    conn = sqlite3.connect(str(ba.DB_PATH))
    latest = conn.execute("select max(trade_date) from stock_daily").fetchone()[0]
    taiex = _fetch_taiex()
    tdates = sorted(taiex)
    tx_last = tdates[-1]
    tx_ret20 = (taiex[tx_last] / taiex[tdates[-21]] - 1) * 100 if len(tdates) >= 21 else 0.0

    # 每檔 stock_daily 最近 70 根(RS 用20、利多出盡高檔用近60日最低)
    rows = conn.execute(
        "select code, trade_date, open, high, low, close, volume from stock_daily "
        "where trade_date >= (select min(trade_date) from (select trade_date from stock_daily "
        "  group by trade_date order by trade_date desc limit 70))",
        ).fetchall()
    by_code = {}
    for c, d, o, h, l, cl, v in rows:
        by_code.setdefault(c, []).append((d, o, h, l, cl, v or 0))

    # 當沖(最新日)
    dt_map = {r[0]: r[1] for r in conn.execute(
        "select stock_id, daytrade_shares from day_trade where trade_date=(select max(trade_date) from day_trade)")}

    # 主力集中度(最新日,前15大淨買超/總量)——用 wantgoo_daily
    conc = {}
    try:
        wg = sqlite3.connect(WANTGOO_DB)
        wd = wg.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]
        cur = {}
        for code, net in wg.execute(
                "select code, (buy_vol - sell_vol) as net from wantgoo_daily where trade_date=?", (wd,)):
            cur.setdefault(code, []).append(net or 0)
        for code, nets in cur.items():
            top15 = sum(sorted((n for n in nets if n > 0), reverse=True)[:15])
            total = sum(abs(n) for n in nets)      # 分點淨量絕對值總和 ≈ 週轉規模(暫代總量)
            conc[code] = (top15 / total * 100) if total else None
        wg.close()
    except Exception as e:
        print(f"  (主力集中度略過:{type(e).__name__} {e})")

    # 融資單週增幅(margin_short:今餘 vs 5交易日前)
    margn = {}
    mrows = conn.execute(
        "select stock_id, trade_date, margin_balance from margin_short "
        "where trade_date >= (select min(trade_date) from (select trade_date from margin_short "
        "  group by trade_date order by trade_date desc limit 6)) order by stock_id, trade_date").fetchall()
    mser = {}
    for sid, d, bal in mrows:
        mser.setdefault(sid, []).append(bal or 0)
    for sid, bals in mser.items():
        if len(bals) >= 2 and bals[0]:
            margn[sid] = (bals[-1] / bals[0] - 1) * 100   # 近~5交易日增幅%

    recs = []
    for code, series in by_code.items():
        series.sort()
        opens = [x[1] for x in series]
        highs = [x[2] for x in series]
        lows = [x[3] for x in series]
        closes = [x[4] for x in series]
        vols = [x[5] for x in series]
        if len(closes) < 21:
            continue
        c0 = closes[-1]
        ma20 = _sma(closes, 20)
        bias = (c0 / ma20 - 1) * 100 if ma20 else None
        pb = _bband_pctb(closes, 20)
        rsi5 = _rsi(closes, 5)
        ret20 = (c0 / closes[-21] - 1) * 100 if closes[-21] else 0.0
        rs_excess = ret20 - tx_ret20
        mv20 = _sma(vols, 20)
        vr = (vols[-1] / mv20) if mv20 else None
        dtr = (dt_map.get(code) / vols[-1] * 100) if (code in dt_map and vols[-1]) else None
        conc_v = conc.get(code)

        price_s = _avg([interp(bias, A_BIAS), interp(pb, A_PB)])
        mom_s = _avg([interp(rsi5, A_RSI5), interp(rs_excess, A_RS)])
        vol_s = _avg([interp(vr, A_VR), interp(dtr, A_DTR)])
        chip_s = _avg([interp(conc_v, A_CONC), interp(margn.get(code), A_MARGN)])
        dims = {"price": price_s, "momentum": mom_s, "volume": vol_s, "chip": chip_s}
        # 基礎分:對「有值的維度」重新歸一化權重
        num = sum(W[k] * dims[k] for k in dims if dims[k] is not None)
        den = sum(W[k] for k in dims if dims[k] is not None)
        if den == 0:
            continue
        base = round(num / den)
        # 利多出盡⚠️(Q8):基礎分≥80 且 爆量 且(長黑 或 高檔)
        exhaust = False
        if base >= 80:
            sma5v, sma10v = _sma(vols, 5), _sma(vols, 10)
            vol_spike = sma5v and sma10v and vols[-1] > max(sma5v, sma10v) * 1.3
            long_black = opens[-1] and (c0 / opens[-1] - 1) <= -0.05
            low60 = min(lows[-60:]) if len(lows) >= 60 else min(lows)
            high_zone = low60 and c0 > low60 * 1.3
            exhaust = bool(vol_spike and (long_black or high_zone))
        recs.append({"code": code, "base": base, "exhaust": exhaust,
                     "price_score": round(price_s) if price_s is not None else None,
                     "momentum_score": round(mom_s) if mom_s is not None else None,
                     "volume_score": round(vol_s) if vol_s is not None else None,
                     "chip_score": round(chip_s) if chip_s is not None else None,
                     "data_date": latest})

    recs.sort(key=lambda r: -r["base"])
    exn = [r["code"] for r in recs if r["exhaust"]]
    print(f"算出 {len(recs)} 檔(資料日 {latest}){'（dry-run）' if dry else ''}")
    print(f"  利多出盡⚠️ {len(exn)} 檔: {exn[:12]}")
    print("  貪婪前8:", [(r["code"], r["base"]) for r in recs[:8]])
    print("  恐懼後8:", [(r["code"], r["base"]) for r in recs[-8:]])
    for r in recs[:3]:
        print(f"    {r['code']} base={r['base']} 價{r['price_score']} 動{r['momentum_score']} 量{r['volume_score']} 籌{r['chip_score']}")
    if dry:
        return
    # 上傳(建表後啟用)
    bs._sb(env, "/greed_base", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(recs), 5000):
        s, resp = bs._sb(env, "/greed_base", method="POST", body=recs[i:i + 5000])
        if s in (200, 201):
            ok += len(recs[i:i + 5000])
        else:
            print(f"[error] 上傳失敗 ({s}): {resp}"); return
    print(f"已上傳 {ok} 檔到 greed_base")


if __name__ == "__main__":
    main()
