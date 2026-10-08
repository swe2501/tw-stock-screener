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

    lfin, lclose, _ = listed_fin_and_close()
    ofin, oclose = otc_fin_and_close()
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
    ms_k = twse_ms_loan_k()                        # 上市含ETF借款(仟元)
    wg = asyncio.run(wantgoo_loans_k())            # 上市扣ETF、上櫃含ETF 借款(仟元)
    listed_loan_inc = (ms_k or 0) * 1000
    listed_loan_exc = (wg.get("listed_ex") or 0) * 1000
    otc_loan_inc = (wg.get("otc_inc") or 0) * 1000
    o_lots_inc, o_lots_exc = fin_lots_sum(ofin, False), fin_lots_sum(ofin, True)
    otc_loan_exc = otc_loan_inc * (o_lots_exc / o_lots_inc) if o_lots_inc else 0
    print(f"借款(億)：上市含 {listed_loan_inc/1e8:.1f} / 上市扣 {listed_loan_exc/1e8:.1f} / 上櫃含 {otc_loan_inc/1e8:.1f} / 上櫃扣~ {otc_loan_exc/1e8:.1f}")

    date = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    rows = []
    for ex in (False, True):
        l_mv, l_miss = market_value(lfin, lclose, conn, ex)
        o_mv, o_miss = market_value(ofin, oclose, conn, ex)
        l_loan = listed_loan_exc if ex else listed_loan_inc
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
