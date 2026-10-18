"""
fundamentals.py — 個股基本面：本益比/淨值比/殖利率、月營收 YoY、季度財報(毛利率/營益率/淨利率/EPS)。
供 K 線圖右側「基本面」分頁。上市 + 上櫃。

資料源（皆免費官方）：
  上市：TWSE openapi BWIBBU_ALL(PE/殖利率/PB)、t187ap03_L(產業/董事長)、
        t187ap05_L(月營收)、t187ap06_L_ci(綜合損益表·一般業，含 EPS)。
  上櫃：TPEx openapi tpex_mainboard_peratio_analysis(PE/PB/殖利率)、
        mopsfin_t187ap05_O(月營收)、mopsfin_t187ap06_O_ci(綜合損益表)。
  註：金融/金控/證券期貨業損益表格式不同(_basi/_bd/_mim)，本版先收一般業(_ci)，金融股財報從缺。
→ Supabase：stock_fundamentals(code PK，每日覆蓋) + stock_financials((code,year,season)，逐季累積)。
用法：python scripts/fundamentals.py
"""
import ssl, sys, json, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_H = {"User-Agent": "Mozilla/5.0"}


def _get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=_H), timeout=60, context=_CTX).read())


def _n(x):
    if x is None:
        return None
    s = str(x).replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except Exception:
        return None


def _pct(a, b):
    a = _n(a); b = _n(b)
    return round(a / b * 100, 2) if (a is not None and b) else None


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    fund = {}   # code -> stock_fundamentals row
    fins = []   # stock_financials rows

    def ensure(code, mkt):
        return fund.setdefault(code, {"code": code, "market": mkt})

    # ── 上市 ──────────────────────────────────────────────
    try:
        for r in _get("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"):
            c = str(r.get("Code", "")).strip()
            if not c:
                continue
            row = ensure(c, "tse")
            row["name"] = r.get("Name"); row["pe"] = _n(r.get("PEratio"))
            row["dividend_yield"] = _n(r.get("DividendYield")); row["pb"] = _n(r.get("PBratio"))
    except Exception as e:
        print(f"[warn] BWIBBU {str(e)[:60]}")
    try:
        for r in _get("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"):
            c = str(r.get("公司代號", "")).strip()
            if c in fund:
                fund[c]["chairman"] = r.get("董事長")
    except Exception as e:
        print(f"[warn] t187ap03 {str(e)[:60]}")
    _rev_twse(fund)
    for n in ("t187ap06_L_ci", "t187ap06_L_ins", "t187ap06_L_basi", "t187ap06_L_bd", "t187ap06_L_mim", "t187ap06_L_fh"):
        _fin(fins, "https://openapi.twse.com.tw/v1/opendata/" + n, "tse")

    # ── 上櫃 ──────────────────────────────────────────────
    try:
        for r in _get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"):
            c = str(r.get("SecuritiesCompanyCode", "")).strip()
            if not c:
                continue
            row = ensure(c, "otc")
            row["name"] = r.get("CompanyName"); row["pe"] = _n(r.get("PriceEarningRatio"))
            row["dividend_yield"] = _n(r.get("YieldRatio")); row["pb"] = _n(r.get("PriceBookRatio"))
    except Exception as e:
        print(f"[warn] TPEx peratio {str(e)[:60]}")
    _rev_tpex(fund)
    for n in ("mopsfin_t187ap06_O_ci", "mopsfin_t187ap06_O_ins", "mopsfin_t187ap06_O_basi", "mopsfin_t187ap06_O_bd", "mopsfin_t187ap06_O_mim"):
        _fin(fins, "https://www.tpex.org.tw/openapi/v1/" + n, "otc")

    # 去重（一家公司只落在一種損益表；保險起見以 (code,year,season) 去重，避免 upsert 同鍵衝突）
    _seen = set(); _uniq = []
    for r in fins:
        kk = (r["code"], r["year"], r["season"])
        if kk in _seen:
            continue
        _seen.add(kk); _uniq.append(r)
    fins = _uniq

    FCOLS = ["code", "market", "name", "industry", "pe", "pb", "dividend_yield",
             "rev_ym", "rev_month", "rev_yoy", "rev_cum_yoy", "chairman"]
    rows = [{k: r.get(k) for k in FCOLS} for r in fund.values()]
    print(f"基本面 {len(rows)} 檔（上市 {sum(1 for r in rows if r['market']=='tse')}、上櫃 {sum(1 for r in rows if r['market']=='otc')}）；財報 {len(fins)} 列")

    _upsert(env, "stock_fundamentals?on_conflict=code", rows)
    _upsert(env, "stock_financials?on_conflict=code,year,season", fins)
    # 抽樣
    for c in ("2330", "6643"):
        f = fund.get(c)
        if f:
            print(f"  {c} {f.get('name')} PE={f.get('pe')} PB={f.get('pb')} 殖利率={f.get('dividend_yield')} 月營收YoY={f.get('rev_yoy')}")


def _rev_twse(fund):
    try:
        for r in _get("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"):
            c = str(r.get("公司代號", "")).strip()
            if c in fund:
                fund[c].update({
                    "industry": r.get("產業別"), "rev_ym": r.get("資料年月"),
                    "rev_month": _n(r.get("營業收入-當月營收")),
                    "rev_yoy": _n(r.get("營業收入-去年同月增減(%)")),
                    "rev_cum_yoy": _n(r.get("累計營業收入-前期比較增減(%)")),
                })
    except Exception as e:
        print(f"[warn] t187ap05 {str(e)[:60]}")


def _rev_tpex(fund):
    try:
        for r in _get("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"):
            c = str(r.get("公司代號", "")).strip()
            if c in fund:
                fund[c].update({
                    "industry": r.get("產業別"), "rev_ym": r.get("資料年月"),
                    "rev_month": _n(r.get("營業收入-當月營收")),
                    "rev_yoy": _n(r.get("營業收入-去年同月增減(%)")),
                    "rev_cum_yoy": _n(r.get("累計營業收入-前期比較增減(%)")),
                })
    except Exception as e:
        print(f"[warn] TPEx 月營收 {str(e)[:60]}")


def _fin(fins, url, mkt):
    """通用綜合損益表解析：一般業(_ci)、保險(_ins)、銀行(_basi)、金控(_bd)、證券期貨(_mim)、金融(_fh)。
    金融業無營收/毛利概念→營收取淨收益/收益/收入類、毛利率/營益率留 None。金額仟元→×1000。季別為累計。"""
    try:
        data = _get(url)
    except Exception as e:
        print(f"[warn] 財報 {url.split('/')[-1]} {str(e)[:50]}"); return
    K = 1000
    for r in data:
        c = str(r.get("公司代號") or r.get("SecuritiesCompanyCode") or "").strip()
        y = _n(r.get("年度") or r.get("Year")); s = _n(r.get("季別") or r.get("Season"))
        if not c or y is None or s is None:
            continue

        def g(*names):
            for nm in names:
                v = _n(r.get(nm))
                if v is not None:
                    return v
            return None
        rev = g("營業收入", "淨收益", "收益", "收入", "利息淨收益")
        gp = g("營業毛利（毛損）淨額", "營業毛利（毛損）")
        op = g("營業利益（損失）", "營業利益")
        ni = g("本期淨利（淨損）", "本期稅後淨利（淨損）")
        eps = _n(r.get("基本每股盈餘（元）"))
        rev = rev * K if rev is not None else None
        gp = gp * K if gp is not None else None
        op = op * K if op is not None else None
        ni = ni * K if ni is not None else None

        def _mg(x, base):
            m = _pct(x, base)
            return m if (m is not None and -150 <= m <= 150) else None  # 金控等收益基數失真→比率不合理則不顯示
        fins.append({
            "code": c, "year": int(y), "season": int(s), "market": mkt,
            "revenue": rev, "gross_profit": gp, "gross_margin": _mg(gp, rev),
            "op_income": op, "op_margin": _mg(op, rev),
            "net_income": ni, "net_margin": _mg(ni, rev), "eps": eps,
        })


def _upsert(env, path, rows):
    if not rows:
        return
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/{path}"
    hdr = {"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    import urllib.error
    for i in range(0, len(rows), 500):
        chunk = rows[i:i+500]
        req = urllib.request.Request(url, data=json.dumps(chunk).encode(), method="POST", headers=hdr)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                print(f"  upsert {path.split('?')[0]} {i}~{i+len(chunk)} status {r.status}")
        except urllib.error.HTTPError as e:
            print(f"  [ERR] {path.split('?')[0]} {i}~{i+len(chunk)} {e.code}: {e.read().decode()[:200]}")
            print(f"        sample row: {json.dumps(chunk[0], ensure_ascii=False)[:200]}")


if __name__ == "__main__":
    main()
