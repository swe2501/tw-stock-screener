"""
market_indicators.py — 首頁 hero 資金軌市場指標。
  VIX          期交所「臺指選擇權波動率指數(台指VIX)」— 官方「前3個月每日收盤」月檔(vix/log2data/YYYYMMnew.txt,
               盤後日更、慢一個交易日;以 CBOE VIX 公式編製、標的為台指選擇權,非美股 ^VIX)。期交所有 WAF,
               urllib 會 403,故用既有 Playwright 正版 Chrome 先導到 taifex 同源頁再 fetch 靜態檔。
               (舊版讀 MIS 即時頁,盤後為「--」→ 每晚抓不到、凍結在舊值,已改此官方月檔。)
               全失敗才沿用資料庫最後一筆(不覆蓋)。
  美元兌台幣    TAIFEX 官方 DailyForeignExchangeRates(USD/NTD)
  富台指(SGX FTSE Taiwan, code stwn&)  玩股網 /global/all-quote-info
      ↑ SGX 富台指無免費官方源,仍沿用玩股網(.wantgoo_profile 登入);其餘已改官方
→ Supabase market_indicators(date PK, 累積)。
用法：python scripts/market_indicators.py
"""
import asyncio, ssl, sys, json, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws
import broker_signals as bs
from playwright.async_api import async_playwright

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _get(url):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=_HDR), timeout=20, context=_CTX).read())


# 期交所官方「前3個月每日收盤之臺指選擇權波動率指數」月檔(盤後日更;WAF 擋 urllib,故走瀏覽器 same-origin fetch)
VIX_PAGE = "https://www.taifex.com.tw/cht/7/vixDaily3MNew"
VIX_FILE = "https://www.taifex.com.tw/file/taifex/Dailydownload/vix/log2data/{ym}new.txt"


def _parse_vix_txt(txt):
    """解析月檔;每資料列: 日期(YYYYMMDD)\\t時間\\t收盤VIX\\t收盤前1分均值。回 [(YYYYMMDD, close)]。
    檔頭為 Big5(fetch 以 UTF-8 解會亂碼),但資料列數字皆 ASCII,不受影響。"""
    rows = []
    if not txt:
        return rows
    for ln in txt.splitlines():
        p = ln.split()
        if len(p) >= 3 and len(p[0]) == 8 and p[0].isdigit():
            try:
                rows.append((p[0], round(float(p[2]), 2)))
            except Exception:
                pass
    return rows


async def _taifex_vix(page):
    """台指VIX:讀期交所官方每日收盤月檔(本月+上月,取最後兩個交易日)。
    回 (cur, prev);cur=最新交易日收盤 VIX。全失敗回 (None, None) 由呼叫端沿用上一筆。"""
    try:
        # 需先導到 taifex 同源頁,才能 fetch 該站靜態檔(避免跨域 CORS)
        await page.goto(VIX_PAGE, wait_until="domcontentloaded", timeout=45000)
        tw = datetime.now(timezone(timedelta(hours=8)))
        cur_ym = tw.strftime("%Y%m")
        prev_ym = (tw.replace(day=1) - timedelta(days=1)).strftime("%Y%m")
        merged = {}
        for ym in (prev_ym, cur_ym):
            txt = await page.evaluate(
                "(u)=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.text():null).catch(()=>null)",
                VIX_FILE.format(ym=ym))
            for d, c in _parse_vix_txt(txt):
                merged[d] = c
        if not merged:
            print("[warn] 台指VIX 月檔無資料,沿用上一筆")
            return None, None, None
        days = sorted(merged)
        cur = merged[days[-1]]
        prev = merged[days[-2]] if len(days) >= 2 else None
        d = days[-1]
        iso = f"{d[:4]}-{d[4:6]}-{d[6:]}"
        print(f"[台指VIX] 官方月檔最新收盤 {iso} {cur}(前一日 {prev})")
        return cur, prev, iso
    except Exception as e:
        print(f"[warn] 台指VIX 讀取失敗: {str(e)[:80]}"); return None, None, None


def _last_vix(env):
    """資料庫最後一筆非空 台指VIX(供非交易時段沿用)。回 (vix, vix_prev)。"""
    try:
        url = (f"{env['SUPABASE_URL']}/rest/v1/market_indicators"
               "?select=vix,vix_prev&vix=not.is.null&order=date.desc&limit=1")
        key = env["SUPABASE_SERVICE_KEY"]
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        d = json.loads(urllib.request.urlopen(req, timeout=20).read())
        if d:
            return d[0].get("vix"), d[0].get("vix_prev")
    except Exception as e:
        print(f"[warn] 讀取上一筆 VIX 失敗: {str(e)[:60]}")
    return None, None


def _taifex_usdtwd_by_date():
    """USD/NTD(TAIFEX 官方 DailyForeignExchangeRates，約晚 2 個交易日)。回 {iso: 匯率}。"""
    out = {}
    try:
        d = _get("https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates")
        for r in d if isinstance(d, list) else []:
            ds, v = str(r.get("Date") or ""), r.get("USD/NTD")
            if len(ds) == 8 and v:
                out[f"{ds[:4]}-{ds[4:6]}-{ds[6:]}"] = float(str(v).replace(",", ""))
    except Exception as e:
        print(f"[warn] TAIFEX 匯率 失敗: {str(e)[:80]}")
    return out


def _usdtwd_for(iso):
    """2026-10-30 首頁匯率改用當日台北匯市時段最後一筆(盤中排程記錄)；本機沒有記錄才用期交所同一天的官方值，
    兩者都沒有就不寫(不再把晚 2 天的官方值標成當日)。"""
    import chip_brief
    fx = chip_brief.fx_close_local(iso)
    if fx:
        print(f"[匯率] {iso} 盤中記錄最後一筆 {fx}")
        return fx
    fx = _taifex_usdtwd_by_date().get(iso)
    print(f"[匯率] {iso} 本機無盤中記錄，期交所官方 {fx}")
    return fx


def _iso(ms):
    if not ms:
        return ""
    return datetime.fromtimestamp(ms / 1000, timezone(timedelta(hours=8))).strftime("%Y-%m-%d")


async def _open(p):
    ctx = await p.chromium.launch_persistent_context(
        str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
        channel="chrome", args=["--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation", "--no-sandbox"])
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto("https://www.wantgoo.com/global", wait_until="domcontentloaded", timeout=45000)
    return ctx, page


async def _fetch(page, ep):
    return await page.evaluate(
        "(u)=>fetch(u,{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)", ep)


def _upsert(env, row):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/market_indicators?on_conflict=date"
    req = urllib.request.Request(url, data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


async def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    async with async_playwright() as p:
        ctx, page = await _open(p)
        if not await ws.is_logged_in(page):
            print("[error] 玩股網未登入"); await ctx.close(); return

        # 富台指(SGX)：無免費官方源,仍取玩股網
        gq = await _fetch(page, "/global/all-quote-info") or []
        by = {str(x.get("id", "")).lower(): x for x in gq if isinstance(x, dict)}
        fut = by.get("stwn&") or by.get("stwn")

        def cp(x):  # close, prev
            if not x:
                return None, None
            return x.get("close"), x.get("previousClose")

        fc, fp = cp(fut)

        # 台指VIX：同一個 Playwright 頁面轉去期交所 MIS 讀取(WAF 只認真實瀏覽器)
        vc, vp, vdate = await _taifex_vix(page)
        await ctx.close()

    # 非交易時段台指VIX 為 --,沿用資料庫最後一筆,避免 KPI 空白
    if vc is None:
        vc, vp = _last_vix(env)

    # 2026-10-30 資料日改用期交所月檔裡的真實交易日：原本用「執行當下日曆日」，夜間排程過午夜才跑，
    # 每筆 VIX 都被標成隔天（10/29 收盤 28.25 顯示成 10/30）。讀不到月檔時才退回今天。
    today = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    row = {
        "date": vdate or today,
        "vix": vc, "vix_prev": vp,
        "futai_close": fc, "futai_prev": fp,
    }
    usdtwd = _usdtwd_for(row["date"])
    if usdtwd:
        row["usdtwd"] = usdtwd
    print("row:", json.dumps(row, ensure_ascii=False))

    st = _upsert(env, row)
    print(f"已 upsert market_indicators (status {st})")


if __name__ == "__main__":
    asyncio.run(main())
