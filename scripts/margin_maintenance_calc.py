"""
margin_maintenance_calc.py — 自算「上市／上櫃／全市場」融資維持率（含 ETF / 扣除 ETF 兩組），
逐股 join「融資餘額(股) × 當日收盤 = 融資持股現值(分子)」，分母用官方/玩股網「融資餘額金額(借款)」。

維持率 = 融資持股現值 ÷ 融資借款金額 × 100%。全市場 = (上市現值+上櫃現值)/(上市借款+上櫃借款)（非平均）。

分子（逐股，官方）：
  上市：TWSE openapi MI_MARGN「融資今日餘額(張)」× STOCK_DAY_ALL 收盤。
  上櫃：TPEx margin/balance「資餘額(張)」× tpex_mainboard_daily_close_quotes 收盤。
  融資單位為「張」→ ×1000 成股再 ×收盤。停牌無當日收盤 → 用本機 stock_daily 最近收盤替代，仍無則記入 join 缺漏清單（不當 0）。
分母（融資借款金額，仟元→元）：
  上市含ETF：TWSE 信用交易統計(MS)「融資金額今日餘額」(＝玩股網 0000A，官方精確)。
  上市扣ETF：玩股網 -ETFA。
  上櫃含ETF：玩股網 twoA。
  上櫃扣ETF：玩股網無獨立代號 → 用「上櫃扣ETF融資張 / 上櫃含ETF融資張」比例 × twoA 估算（otc_loan_est=true 標記）。
ETF 判定：代號以「00」開頭視為 ETF（扣ETF模式排除）。

→ Supabase margin_maint_split（(trade_date, exclude_etf) 主鍵；存三組 現值/借款/維持率 + 估算旗標 + join 缺漏數）。
用法：python scripts/margin_maintenance_calc.py
"""
import ssl, sys, json, csv, io, asyncio, sqlite3, time, urllib.request, http.client
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
ssl._create_default_https_context = ssl._create_unverified_context   # 本機連 TWSE 主站
import broker_signals as bs
import screen as _screen        # 重用已驗證的全市場收盤解析（STOCK_DAY_ALL，含 ETF）
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
H = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _pf(s):
    s = str(s).replace(",", "").strip()
    if not s or set(s) <= {"-"} or s in ("---", "N/A"):
        return None
    try: return float(s)
    except ValueError: return None


def _gj(u):
    last = None
    for _ in range(3):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=45, context=_CTX).read()
            return json.loads(raw)
        except Exception as e:
            last = e; time.sleep(1.2)
    raise last


def _gt(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=45, context=_CTX).read().decode("utf-8", "replace")


def _roc_iso(d):
    d = str(d).strip()
    return f"{int(d[:3])+1911}-{d[3:5]}-{d[5:7]}" if len(d) >= 7 else None


def is_etf(code):
    return code.startswith("00")


# ── 分子資料：融資餘額(張) 與 收盤 ──────────────────────────────
def listed_fin_and_close():
    """回 (fin{code:張}, close{code:收盤}, date)。融資=TWSE openapi MI_MARGN；收盤=screen 全市場(含ETF)。"""
    fin = {}
    for r in _gj("https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN"):
        c = str(r.get("股票代號", "")).strip(); v = _pf(r.get("融資今日餘額"))
        if c and c[:1].isdigit() and v is not None:   # 含 ETF(0050/00878/00XXXA)/DR，不限4碼
            fin[c] = v
    stocks, mdate = _screen.fetch_all_stocks_latest()
    close = {c: s["close"] for c, s in stocks.items() if s.get("close") is not None}
    return fin, close, mdate


def listed_fin_on(iso):
    """2026-10-31 上市逐股融資今日餘額(張)，指定交易日（TWSE rwd MI_MARGN selectType=ALL）。
    原用 openapi MI_MARGN（不帶日期、常慢一日）。當日尚未公布回 {}。"""
    d = _gj(f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={iso.replace('-', '')}&selectType=ALL&response=json")
    if d.get("stat") != "OK" or str(d.get("date")) != iso.replace("-", ""):
        return {}
    fin = {}
    for t in d.get("tables") or []:
        rows = t.get("data") or []
        if len(rows) < 100:          # 第一張是信用交易統計(3 列)，逐股表上千列
            continue
        for r in rows:
            c = str(r[0]).strip(); v = _pf(r[6])     # 0代號 1名稱 2買進 3賣出 4現金償還 5前日餘額 6今日餘額
            if c and c[:1].isdigit() and v is not None:
                fin[c] = v
    return fin


def close_on(conn, iso, market):
    """指定交易日全部收盤（含 ETF，維持率分子要算 ETF 融資）。
    上市：證交所 STOCK_DAY_ALL 當日 CSV（chip_brief._day_all，核對日期）；上櫃：TPEx 收盤行情（核對日期）。
    官方取不到時退回本機 stock_daily（只有個股、沒有 ETF → 會記入 join 缺漏）。"""
    out = {}
    try:
        if market == "otc":
            rows = _gj("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes")
            for r in rows:
                if _roc_iso(r.get("Date")) == iso:
                    c, cl = str(r.get("SecuritiesCompanyCode") or "").strip(), _pf(r.get("Close"))
                    if c and cl is not None:
                        out[c] = cl
        else:
            import chip_brief
            for r in chip_brief._day_all(iso):
                cl = _pf(r.get("ClosingPrice"))
                if cl is not None:
                    out[str(r.get("Code")).strip()] = cl
    except Exception as e:
        print(f"[warn] {market} 官方收盤失敗 {type(e).__name__}")
    if len(out) < 300:
        print(f"[warn] {market} 官方 {iso} 收盤不足（{len(out)}），退回本機 stock_daily（不含 ETF）")
        q = ("select code, close from stock_daily where trade_date=? and market='otc' and close is not null" if market == "otc"
             else "select code, close from stock_daily where trade_date=? and (market='twse' or market is null) and close is not null")
        out.update({c: v for c, v in conn.execute(q, (iso,))})
    return out


def twse_ms_loan_k_on(iso):
    """上市含ETF融資金額今日餘額(仟元)，指定交易日（TWSE 信用交易統計 MS）。"""
    d = _gj(f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={iso.replace('-', '')}&selectType=MS&response=json")
    if d.get("stat") != "OK" or str(d.get("date")) != iso.replace("-", ""):
        return None
    for r in d["tables"][0]["data"]:
        if "融資金額" in str(r[0]):
            return _pf(r[5])
    return None


def wantgoo_ex_ratio(env, iso):
    """玩股網公布的「上市扣ETF」融資維持率(%)，margin_ratio.py 每晚寫入 margin_maintenance(exclude_etf=true)。沒有回 None。"""
    url = (f"{env['SUPABASE_URL']}/rest/v1/margin_maintenance?select=maintenance_ratio"
           f"&trade_date=eq.{iso}&exclude_etf=eq.true")
    req = urllib.request.Request(url, headers={"apikey": env["SUPABASE_SERVICE_KEY"],
                                               "Authorization": f"Bearer {env['SUPABASE_SERVICE_KEY']}"})
    try:
        rows = json.loads(urllib.request.urlopen(req, timeout=30).read())
        v = rows[0]["maintenance_ratio"] if rows else None
        return float(v) if v else None
    except Exception:
        return None


def _done_dates(env, iso):
    url = f"{env['SUPABASE_URL']}/rest/v1/margin_maint_split?select=exclude_etf&trade_date=eq.{iso}"
    req = urllib.request.Request(url, headers={"apikey": env["SUPABASE_SERVICE_KEY"],
                                               "Authorization": f"Bearer {env['SUPABASE_SERVICE_KEY']}"})
    try:
        return len(json.loads(urllib.request.urlopen(req, timeout=30).read()))
    except Exception:
        return 0


def otc_fin_on(iso):
    """上櫃逐股融資餘額(張)，指定交易日（TPEx margin/balance）。"""
    d = _gj("https://www.tpex.org.tw/www/zh-tw/margin/balance?date=" + iso.replace("-", "/"))
    tb = (d.get("tables") or [{}])[0]
    fld = tb.get("fields") or []
    try: i_code, i_bal = fld.index("代號"), fld.index("資餘額")
    except ValueError: i_code, i_bal = 0, 6
    fin = {}
    for row in tb.get("data") or []:
        c = str(row[i_code]).strip(); v = _pf(row[i_bal])
        if c and c[:1].isdigit() and v is not None:
            fin[c] = v
    return fin


def otc_fin_and_close():
    """上櫃融資(張)＋收盤，皆用『收盤行情的實際交易日』對齊（避免假日帶今天回空）。"""
    close, otc_date_roc = {}, None
    url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
    try:
        raw = urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30, context=_CTX).read()
    except http.client.IncompleteRead as e:
        raw = e.partial
    try: rows = json.loads(raw)
    except Exception:
        s = raw.decode("utf-8", "replace"); i = s.rfind("},"); rows = json.loads(s[:i+1] + "]")
    for r in rows:
        c = str(r.get("SecuritiesCompanyCode") or "").strip(); cl = _pf(r.get("Close"))
        if c and c[:1].isdigit() and cl is not None:
            close[c] = cl
            if otc_date_roc is None:
                otc_date_roc = str(r.get("Date") or "").strip()
    # 融資餘額：balance 帶收盤同一交易日（roc→西元/斜線）
    fin = {}
    date_slash = None
    if otc_date_roc and len(otc_date_roc) >= 7:
        date_slash = f"{int(otc_date_roc[:3])+1911}/{otc_date_roc[3:5]}/{otc_date_roc[5:7]}"
    burl = "https://www.tpex.org.tw/www/zh-tw/margin/balance"
    d = _gj(burl + ("?date=" + date_slash if date_slash else ""))
    tb = (d.get("tables") or [{}])[0]
    fld = tb.get("fields") or []
    try: i_code, i_bal = fld.index("代號"), fld.index("資餘額")
    except ValueError: i_code, i_bal = 0, 6
    for row in tb.get("data") or []:
        c = str(row[i_code]).strip(); v = _pf(row[i_bal])
        if c and c[:1].isdigit() and v is not None:
            fin[c] = v
    return fin, close


def _fallback_close(conn, code):
    row = conn.execute("select close from stock_daily where code=? and close is not null order by trade_date desc limit 1", (code,)).fetchone()
    return row[0] if row else None


def market_value(fin, close, conn, exclude_etf):
    """Σ 融資餘額(張)×1000×收盤 = 融資持股現值(元)。缺當日收盤→用 stock_daily 最近收盤，仍無記 miss。"""
    mv = 0.0; miss = []
    for c, lots in fin.items():
        if exclude_etf and is_etf(c):
            continue
        px = close.get(c)
        if px is None:
            px = _fallback_close(conn, c)
            if px is None:
                miss.append(c); continue
        mv += lots * 1000 * px
    return mv, miss


def fin_lots_sum(fin, exclude_etf):
    return sum(v for c, v in fin.items() if not (exclude_etf and is_etf(c)))


# ── 分母資料：融資借款金額（仟元）──────────────────────────────
def twse_ms_loan_k():
    """TWSE 信用交易統計(MS)『融資金額』今日餘額(仟元) = 上市含ETF融資借款。"""
    d = _gj("https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=&selectType=MS&response=json")
    for r in d["tables"][0]["data"]:
        if "融資金額" in str(r[0]):
            return _pf(r[5])
    return None


async def wantgoo_loans_k():
    """玩股網當日融資金額(仟元)：上市扣ETF(-ETFA)、上櫃含ETF(twoA)。回 {'listed_ex':k,'otc_inc':k}。
    上市扣ETF與上櫃含ETF官方無金額，此為來源。"""
    from playwright.async_api import async_playwright
    import wantgoo_scraper as ws
    js = ("u=>fetch(u,{headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'}})"
          ".then(r=>r.ok?r.json():null).catch(()=>null)")
    out = {}
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR), headless=False, channel="chrome", viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"], ignore_default_args=["--enable-automation", "--no-sandbox"])
        try:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=30000)

            async def ev(u):
                for _ in range(3):
                    try:
                        r = await page.evaluate(js, u)
                        if isinstance(r, dict) and r.get("lendingBalance") is not None:
                            return r.get("lendingBalance")
                    except Exception: pass
                    await page.wait_for_timeout(1500)
                return None
            await page.goto("https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1800)
            out["listed_ex"] = await ev("/stock/-ETFA/margin-trading/lending-balance")
            await page.goto("https://www.wantgoo.com/stock/margin-trading/market-price/otc", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1800)
            out["otc_inc"] = await ev("/stock/twoA/margin-trading/lending-balance")
        finally:
            await ctx.close()
    return out


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/margin_maint_split?on_conflict=trade_date,exclude_etf"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    conn = sqlite3.connect(str(DB_PATH)); conn.execute("pragma busy_timeout=60000")

    # 2026-10-31 改：目標日＝本機股價最新交易日；已算過(含/扣兩列)就跳過(--force 可重算)。
    #   原本用「今天是否週末/休市」判斷：週六 09:00 補跑把週五資料也一起跳過，週五維持率一直沒算。
    #   各來源都取目標日（原 openapi 不帶日期、常慢一日；休市日因目標日是上一交易日且已算過，不會寫假資料）。
    date = conn.execute("select max(trade_date) from stock_daily where market='twse' or market is null").fetchone()[0]
    if not date:
        print("[abort] 本機無股價"); return
    if _done_dates(env, date) >= 2 and "--force" not in sys.argv:
        print(f"[skip] {date} 融資維持率三組已算過"); return
    lfin = listed_fin_on(date)
    lclose = close_on(conn, date, "twse")
    ofin = otc_fin_on(date)
    oclose = close_on(conn, date, "otc")
    print(f"上市融資 {len(lfin)} 檔 / 收盤 {len(lclose)}；上櫃融資 {len(ofin)} 檔 / 收盤 {len(oclose)}")

    # 防呆：任一市場的「融資張」或「收盤」整批抓空(來源暫時失敗)→ 不覆寫，保留既有，待補跑重算。
    #       2026-10-08：曾因 TPEx 上櫃端點瞬間回空 → 寫入 otc_mv=0，使上櫃/全市場維持率=0。
    if not lfin or not lclose or not ofin or not oclose:
        print(f"[abort] 來源資料不足 → 不覆寫(上市融資{len(lfin)}/收盤{len(lclose)}、上櫃融資{len(ofin)}/收盤{len(oclose)})，保留既有、待補跑")
        sys.exit(0)

    # 借款(融資金額)：含ETF＝官方（上市 TWSE MS、上櫃 玩股網 twoA）；
    # 扣ETF＝含ETF總額 × (扣ETF融資張/全部融資張)（官方無扣ETF金額，以張占比估，同源一致，標 otc_loan_est）。
    # 借款(融資金額,元)：含ETF＝官方(上市 TWSE MS)/玩股網(上櫃 twoA)；上市扣ETF＝玩股網 -ETFA(金額)；
    # 上櫃扣ETF＝上櫃含ETF × 扣ETF融資張占比(上櫃 ETF 極少，估算影響小；官方/玩股網皆無上櫃扣ETF金額)。
    ms_k = twse_ms_loan_k_on(date)                 # 上市含ETF借款(仟元)，指定交易日
    wg = asyncio.run(wantgoo_loans_k())            # 上市扣ETF、上櫃含ETF 借款(仟元)
    listed_loan_inc = (ms_k or 0) * 1000
    listed_loan_exc = (wg.get("listed_ex") or 0) * 1000
    # 2026-10-31 上櫃含ETF借款改櫃買官方合計（指定交易日、有日期核對）；官方取不到才退回玩股網 twoA
    import otc_market as _om
    _tp = _om.tpex_margin_summary(date)
    if _tp.get("fin_bal_k"):
        otc_loan_inc = _tp["fin_bal_k"] * 1000
    else:
        print(f"[warn] 櫃買 {date} 融資金額官方尚無，退回玩股網 twoA")
        otc_loan_inc = (wg.get("otc_inc") or 0) * 1000
    o_lots_inc, o_lots_exc = fin_lots_sum(ofin, False), fin_lots_sum(ofin, True)
    otc_loan_exc = otc_loan_inc * (o_lots_exc / o_lots_inc) if o_lots_inc else 0
    print(f"借款(億)：上市含 {listed_loan_inc/1e8:.1f} / 上市扣 {listed_loan_exc/1e8:.1f} / 上櫃含 {otc_loan_inc/1e8:.1f} / 上櫃扣~ {otc_loan_exc/1e8:.1f}")

    if not ms_k or not otc_loan_inc:
        print(f"[abort] {date} 融資金額缺（證交所 {ms_k}／玩股網上櫃 {otc_loan_inc}）→ 不寫，待補跑"); sys.exit(0)
    rows = []
    for ex in (False, True):
        # 2026-10-31 扣ETF 借款抓不到(玩股網失敗)時不寫扣ETF列：10/29 曾寫出上市 None%、全市場 719% 的錯值
        if ex and (not listed_loan_exc or not otc_loan_inc):
            print("[warn] 玩股網扣ETF／上櫃借款缺 → 本次不寫扣ETF列"); continue
        l_mv, l_miss = market_value(lfin, lclose, conn, ex)
        o_mv, o_miss = market_value(ofin, oclose, conn, ex)
        l_loan = listed_loan_exc if ex else listed_loan_inc
        if ex:
            # 2026-10-31 用戶定案：上市扣ETF 與玩股網對齊 → 直接採玩股網公布的上市扣ETF維持率，分子＝維持率×借款反推。
            #   自算(只扣 00 開頭 ETF 的融資市值)約與含ETF相同，玩股網一向比含ETF低約 20 點，口徑不明、無法自行重現。
            #   取不到玩股網當日值就不寫扣ETF列（不混用口徑）。上櫃扣ETF 仍自算（網站不開放），全市場扣ETF 用新的上市分子。
            wr = wantgoo_ex_ratio(env, date)
            if not wr:
                print(f"[warn] 玩股網 {date} 上市扣ETF維持率尚無 → 本次不寫扣ETF列"); continue
            l_mv = wr / 100 * l_loan
        o_loan = otc_loan_exc if ex else otc_loan_inc
        a_mv, a_loan = l_mv + o_mv, l_loan + o_loan
        def rr(mv, loan): return round(mv / loan * 100, 2) if loan else None
        rows.append({
            "trade_date": date, "exclude_etf": ex,
            "listed_mv": round(l_mv/1e8, 2), "listed_loan": round(l_loan/1e8, 2), "listed_ratio": rr(l_mv, l_loan),
            "otc_mv": round(o_mv/1e8, 2), "otc_loan": round(o_loan/1e8, 2), "otc_ratio": rr(o_mv, o_loan),
            "all_mv": round(a_mv/1e8, 2), "all_loan": round(a_loan/1e8, 2), "all_ratio": rr(a_mv, a_loan),
            "otc_loan_est": bool(ex), "join_miss": len(l_miss) + len(o_miss),
        })
        tag = "扣ETF" if ex else "含ETF"
        print(f"[{tag}] 上市 {rr(l_mv,l_loan)}% ｜ 上櫃 {rr(o_mv,o_loan)}% ｜ 全市場 {rr(a_mv,a_loan)}%  (join缺 上市{len(l_miss)}/上櫃{len(o_miss)})")
        if l_miss[:5] or o_miss[:5]:
            print(f"    缺價樣本：上市{l_miss[:5]} 上櫃{o_miss[:5]}")

    try:
        st = _upsert(env, rows)
        print(f"已上傳 margin_maint_split（{date}，含/扣ETF 兩列）status {st}")
    except Exception as e:
        print(f"[warn] 上傳失敗（表可能尚未建立）：{e}")


if __name__ == "__main__":
    main()
