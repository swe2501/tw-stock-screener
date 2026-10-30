"""
otc_market.py — 上櫃(櫃買)市場彙總,供首頁 §1/§2/§3 上市/上櫃分列(全即時)。
  三大法人金額: TPEx OpenAPI tpex_3insti_summary(外資/投信/自營/合計,元)
  漲跌家數:     TPEx OpenAPI tpex_mainboard_daily_close_quotes(過濾 4 碼上櫃股票,算漲/跌/平+漲跌停)
  融資融券:     玩股網 two/twoA(需登入 .wantgoo_profile;twoA=融資金額仟元、two=融資張+融券張+維持率)
→ Supabase otc_market_daily(trade_date PK)。
用法：python scripts/otc_market.py
"""
import ssl, sys, json, asyncio, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws
import broker_signals as bs
from playwright.async_api import async_playwright

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_OHDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _oapi(dataset):
    url = f"https://www.tpex.org.tw/openapi/v1/{dataset}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=_OHDR), timeout=25, context=_CTX) as r:
        return json.loads(r.read())


def _num(x):
    try:
        return float(str(x).replace(",", "").strip())
    except Exception:
        return None


def _roc_to_iso(roc):
    # "1150915" → 2026-09-15
    s = str(roc)
    return f"{int(s[:3]) + 1911}-{s[3:5]}-{s[5:7]}" if len(s) == 7 else None


def fetch_inst():
    """上櫃三大法人金額(元)。回 {iso, foreign_net, trust_net, dealer_net, total_net}。"""
    d = _oapi("tpex_3insti_summary")
    if not d:
        return None
    iso = _roc_to_iso(d[0].get("Date"))
    out = {"trade_date": iso, "foreign_net": 0, "trust_net": 0, "dealer_net": 0, "total_net": 0}
    for r in d:
        inv = str(r.get("Investor") or ""); net = _num(r.get("Net")) or 0
        if "外資及陸資合計" in inv:
            out["foreign_net"] = int(net)
        elif inv == "投信":
            out["trust_net"] = int(net)
        elif "自營商合計" in inv:
            out["dealer_net"] = int(net)
        elif "三大法人合計" in inv:
            out["total_net"] = int(net)
    return out


def fetch_breadth(iso=None):
    """上櫃漲跌家數(TPEx tpex_mainborad_highlight,全部上櫃,與合夥人同口徑)。
    回 {up,down,flat,up_limit,down_limit}；給 iso 時資料日不同就回 {}(2026-10-30 防止混到別天)。櫃買指數另存於 chip_brief_daily。"""
    h = _oapi("tpex_mainborad_highlight")
    r = h[0] if isinstance(h, list) and h else h
    if iso and _roc_to_iso(r.get("Date")) != iso:
        print(f"[warn] 上櫃漲跌家數資料日 {r.get('Date')} ≠ {iso}，本次不寫")
        return {}
    def gi(k):
        v = _num(r.get(k)); return int(v) if v is not None else 0
    return {
        "up": gi("PriceRiseCompanyNumbers"), "down": gi("PriceDeclineCompanyNumbers"),
        "flat": gi("PriceFlatCompanyNumbers"), "up_limit": gi("LimitUpCompanyNumbers"),
        "down_limit": gi("LimitDownCompanyNumbers"),
    }


async def fetch_margin_otc():
    """玩股網 two/twoA 上櫃融資融券(需登入)。回 {fin_bal_k, fin_prev_k, short_lots, fin_maint}。"""
    out = {}
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
            channel="chrome", args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"])
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://www.wantgoo.com/stock/margin-trading/market-price/otc",
                        wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(1500)
        if not await ws.is_logged_in(page):
            print("[warn] 玩股網未登入,略過上櫃融資"); await ctx.close(); return out

        async def jget(ep):
            return await page.evaluate("(u)=>fetch(u,{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)", ep)
        twoA = await jget("/stock/twoA/margin-trading/lending-balance")   # 融資金額(仟元)+維持率
        two = await jget("/stock/two/margin-trading/borrowing-balance")   # 融券張
        twoL = await jget("/stock/two/margin-trading/lending-balance")    # 融資張(供券資比)
        if isinstance(twoA, dict):
            out["fin_bal_k"] = twoA.get("lendingBalance")
            out["fin_prev_k"] = twoA.get("lastLendingBalance")
            mr = twoA.get("marginRatio")
            out["fin_maint"] = round(mr * 100, 2) if isinstance(mr, (int, float)) else None
        if isinstance(two, dict):
            out["short_lots"] = two.get("borrowingBalance")
        if isinstance(twoL, dict):
            out["fin_bal_lots"] = twoL.get("lendingBalance")
        await ctx.close()
    return out


def _upsert(env, row):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/otc_market_daily?on_conflict=trade_date"
    req = urllib.request.Request(url, data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    inst = fetch_inst()
    if not inst or not inst.get("trade_date"):
        print("[error] 上櫃法人抓取失敗"); return
    row = dict(inst)
    row.update(fetch_breadth(row["trade_date"]))
    # 2026-10-30 --no-margin：盤後 16:00 那一輪用。玩股網融資回應沒有日期、融資資料晚上才公布，
    # 下午抓會把前一日融資寫進當日 → 只寫法人＋家數，融資留給夜間排程
    if "--no-margin" not in sys.argv:
        try:
            row.update(asyncio.run(fetch_margin_otc()))
        except Exception as e:
            print(f"[warn] 上櫃融資失敗: {str(e)[:80]}")
    print(f"{row['trade_date']} 法人:外資{row['foreign_net']/1e8:.1f}/投信{row['trust_net']/1e8:.1f}/自營{row['dealer_net']/1e8:.1f}/合計{row['total_net']/1e8:.1f}億 "
          f"| 家數 漲{row.get('up')}/跌{row.get('down')}/平{row.get('flat')} 漲停{row.get('up_limit')}/跌停{row.get('down_limit')} "
          f"| 融資{(row.get('fin_bal_k') or 0)/1e5:.1f}億 維持率{row.get('fin_maint')}")
    row = {k: v for k, v in row.items() if v is not None}
    print(f"已 upsert otc_market_daily (status {_upsert(env, row)})")


if __name__ == "__main__":
    main()
