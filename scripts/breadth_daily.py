"""
breadth_daily.py — 「大盤多空廣度」每日市場廣度指標（上市 / 上櫃分開），供市場觀察分頁與首頁§3。

依據合夥人《大盤多空與市場廣度實戰判讀手冊》：
  每日、每市場(上市 tse / 上櫃 otc)計算：
    up/down/flat            漲/跌/平家數（收盤 vs 前一交易日收盤）
    up_limit/down_limit     漲停/跌停家數（漲跌幅 ≥ +9.5% / ≤ −9.5%，官方 10% 制）
    universe                當日有效普通股母體（排除 ETF 00 開頭、非純四位數）
    maN_pct                 站上 N 日均線家數比率（N=5/10/20/60）＝(收>MAN) ÷ (有 N 日歷史者)
    new_high/new_low        52 週(252 交易日)新高/新低家數
    amt_ratio               漲跌量比＝Σ上漲股成交額 ÷ Σ下跌股成交額（成交額≈收盤×量）
  分級(情緒/滲透率門檻)由前端以歷史百分位校準（手冊：門檻須用 2~3 年歷史滾動百分位重定）。

資料源：Supabase price_window（全市場 code/trade_date/open/high/low/close/volume，約 1 年）。
  市場別：code 在 otc_names → 上櫃，否則上市。
→ Supabase breadth_daily((trade_date,market) 複合主鍵)。
用法：python scripts/breadth_daily.py            # 全量重算(冪等,每日排程亦可直接跑)
"""
import sys, json, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

LIMIT = 9.5   # 漲跌停判定門檻(%)


def _sb_get(env, path, rng=None):
    # 2026-10-29 要求 gzip：整張 price_window 分頁讀一次約 40MB，壓縮後約 5MB（Supabase 流量超過免費額度）
    h = {"apikey": env["SUPABASE_SERVICE_KEY"], "Authorization": f"Bearer {env['SUPABASE_SERVICE_KEY']}",
         "Accept-Encoding": "gzip"}
    if rng:
        h["Range-Unit"] = "items"; h["Range"] = rng
    with urllib.request.urlopen(urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/" + path, headers=h), timeout=60) as r:
        raw = r.read()
        if raw and (r.headers.get("Content-Encoding") or "").lower() == "gzip":
            import gzip
            raw = gzip.decompress(raw)
        return raw


def _otc_set(env):
    out = set()
    try:
        d = json.loads(_sb_get(env, "otc_names?select=code"))
        for x in d:
            out.add(str(x["code"]).strip())
    except Exception as e:
        print(f"[warn] 讀 otc_names 失敗 {str(e)[:50]}")
    return out


def _load_prices(env):
    """全 price_window → {code:[(date,close,vol)...排序]}。分頁抓。"""
    px = {}
    off = 0
    while True:
        part = json.loads(_sb_get(env, "price_window?select=code,trade_date,close,volume&order=code.asc,trade_date.asc",
                                  rng=f"{off}-{off+999}"))
        if not part:
            break
        for r in part:
            c = str(r["code"]).strip()
            if r["close"] is None:
                continue
            px.setdefault(c, []).append((r["trade_date"], float(r["close"]), float(r["volume"] or 0)))
        if len(part) < 1000:
            break
        off += 1000
        if off % 50000 == 0:
            print(f"  price_window 已載 {off} 列…")
    return px


def _eligible(code):
    return code.isdigit() and len(code) == 4 and not code.startswith("00")


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    otc = _otc_set(env)
    print(f"上櫃代號 {len(otc)} 檔")
    px = _load_prices(env)
    print(f"price_window 載入 {len(px)} 檔")

    # 每日每市場累加器：agg[(date,market)] = {...}
    agg = {}
    def bucket(d, mkt):
        return agg.setdefault((d, mkt), {"up":0,"down":0,"flat":0,"ul":0,"dl":0,"uni":0,
                                         "m5u":0,"m5b":0,"m10u":0,"m10b":0,"m20u":0,"m20b":0,"m60u":0,"m60b":0,
                                         "nh":0,"nl":0,"uamt":0.0,"damt":0.0})

    for code, ser in px.items():
        if not _eligible(code):
            continue
        mkt = "otc" if code in otc else "tse"
        closes = [c for _, c, _ in ser]
        for i in range(len(ser)):
            d, c, v = ser[i]
            b = bucket(d, mkt)
            b["uni"] += 1
            # 漲跌平（vs 前一交易日）
            if i > 0:
                pc = ser[i-1][1]
                if pc > 0:
                    chg = (c/pc - 1)*100
                    if chg >= LIMIT: b["ul"] += 1
                    elif chg <= -LIMIT: b["dl"] += 1
                    if c > pc: b["up"] += 1
                    elif c < pc: b["down"] += 1
                    else: b["flat"] += 1
                    amt = c*v
                    if c > pc: b["uamt"] += amt
                    elif c < pc: b["damt"] += amt
            # 均線廣度
            for N, ku, kb in ((5,"m5u","m5b"),(10,"m10u","m10b"),(20,"m20u","m20b"),(60,"m60u","m60b")):
                if i+1 >= N:
                    b[kb] += 1
                    ma = sum(closes[i-N+1:i+1])/N
                    if c > ma: b[ku] += 1
            # 52週(252)新高/新低
            if i+1 >= 20:  # 至少 20 日才判(避免太早偽新高)
                lo_i = max(0, i-251)
                window = closes[lo_i:i+1]
                if c >= max(window): b["nh"] += 1
                if c <= min(window): b["nl"] += 1

    # 追加「全市場 all」= 上市+上櫃 原始計數相加(讓前端 含櫃買 模式直接讀)
    dates = sorted(set(d for (d, _m) in agg))
    for d in dates:
        tb = agg.get((d, "tse")); ob = agg.get((d, "otc"))
        merged = {}
        for kk in ("up","down","flat","ul","dl","uni","m5u","m5b","m10u","m10b","m20u","m20b","m60u","m60b","nh","nl","uamt","damt"):
            merged[kk] = (tb.get(kk,0) if tb else 0) + (ob.get(kk,0) if ob else 0)
        agg[(d, "all")] = merged

    # 母體門檻：price_window 上市歷史較新幾日可能未上傳(僅上櫃)→ 資料不全的市場日不輸出,避免誤判
    MINUNI = {"tse": 700, "otc": 500, "all": 1300}

    # 組 rows
    rows = []
    for (d, mkt), b in agg.items():
        if b["uni"] < MINUNI.get(mkt, 0):
            continue
        def pctf(u, base): return round(u/base*100, 1) if base else None
        rows.append({
            "trade_date": d, "market": mkt,
            "up": b["up"], "down": b["down"], "flat": b["flat"],
            "up_limit": b["ul"], "down_limit": b["dl"], "universe": b["uni"],
            "ma5_pct": pctf(b["m5u"], b["m5b"]), "ma10_pct": pctf(b["m10u"], b["m10b"]),
            "ma20_pct": pctf(b["m20u"], b["m20b"]), "ma60_pct": pctf(b["m60u"], b["m60b"]),
            "new_high": b["nh"], "new_low": b["nl"],
            "amt_ratio": round(b["uamt"]/b["damt"], 3) if b["damt"] else None,
        })
    rows.sort(key=lambda r: (r["trade_date"], r["market"]))
    print(f"計算完成 {len(rows)} 列（{len(set(r['trade_date'] for r in rows))} 交易日 × 2 市場）")

    # upsert
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/breadth_daily?on_conflict=trade_date,market"
    hdr = {"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), 500):
        chunk = rows[i:i+500]
        req = urllib.request.Request(url, data=json.dumps(chunk).encode(), method="POST", headers=hdr)
        with urllib.request.urlopen(req, timeout=90) as r:
            print(f"  upsert {i}~{i+len(chunk)} status {r.status}")
    # 最新一日摘要
    last = rows[-1]["trade_date"]
    for r in [x for x in rows if x["trade_date"] == last]:
        print(f"  {last} {r['market']}: 漲{r['up']}/跌{r['down']} 漲停{r['up_limit']} 站上60MA {r['ma60_pct']}%")


if __name__ == "__main__":
    main()
