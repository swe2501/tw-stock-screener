"""
wantgoo_etf.py — 用已登入的玩股網 profile 抓 ETF 成分股(PCF)+ 官方 AUM/NAV → Supabase。

資料源(需登入,沿用 .wantgoo_profile,同分點爬蟲):
  /stock/etf/{code}/all-constituent-combine-data
    → nav{navPerUnit, outstandingUnits, totalNetAssets}(官方淨值/流通單位/資產規模)
    → stockHoldings[]{seq, stockCode, stockName, shares, weight}
    → previousStockHoldings[](用來算股數增減 delta)
寫入:
  etf_holdings(每檔成分股 code/stock_code/stock_name/shares/weight/delta_shares/seq/data_date)
  etf_products.aum(億)、nav、holdings_date(PATCH 更新;取代先前的推估 est_scale)
用法：python scripts/wantgoo_etf.py
"""
import asyncio
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws          # noqa: E402  PROFILE_DIR / is_logged_in
import broker_signals as bs           # noqa: E402  _sb / _load_env
from playwright.async_api import async_playwright  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

RESTART_EVERY = 150
FETCH_JS = ("(code)=>fetch('/stock/etf/'+code+'/all-constituent-combine-data',"
            "{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)")


async def _fetch_combine(page, code):
    """進該檔成分股頁,攔截頁面自身發出的 combine-data 回應(最可靠);失敗再退回自行 fetch。"""
    url_key = f"/stock/etf/{code}/all-constituent-combine-data"
    try:
        async with page.expect_response(lambda r: url_key in r.url, timeout=15000) as ri:
            await page.goto(f"https://www.wantgoo.com/stock/etf/{code}/constituent",
                            wait_until="commit", timeout=30000)
        resp = await ri.value
        return await resp.json()
    except Exception:
        try:
            await page.wait_for_timeout(1200)
            return await page.evaluate(FETCH_JS, code)
        except Exception:
            return None


def _iso(ms):
    if not ms:
        return ""
    return datetime.fromtimestamp(ms / 1000, timezone(timedelta(hours=8))).strftime("%Y-%m-%d")


async def _open(p):
    ctx = await p.chromium.launch_persistent_context(
        str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
        channel="chrome", args=["--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation", "--no-sandbox"])
    await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto("https://www.wantgoo.com/stock/etf/0050/constituent",
                    wait_until="domcontentloaded", timeout=40000)
    return ctx, page


async def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    st, prods = bs._sb(env, "/etf_products", params=[("select", "code"), ("limit", "1000")])
    codes = [r["code"] for r in (prods or []) if r.get("code")]
    if not codes:
        print("[error] etf_products 無資料，請先跑 upload_etf.py"); return
    print(f"開始抓 {len(codes)} 檔 ETF 成分股…")

    holdings, prod_updates, ok_codes = [], [], []
    async with async_playwright() as p:
        ctx, page = await _open(p)
        if not await ws.is_logged_in(page):
            print("[error] 玩股網未登入(profile 失效),中止"); await ctx.close(); return
        done = warn = 0
        for i, code in enumerate(codes, 1):
            if i % RESTART_EVERY == 0:
                await ctx.close(); await asyncio.sleep(3); ctx, page = await _open(p)
            d = await _fetch_combine(page, code)
            if not d or not (d.get("nav") or d.get("stockHoldings")):
                warn += 1
                await asyncio.sleep(0.5)
                continue
            ok_codes.append(code)
            nav = d.get("nav") or {}
            hd = _iso(d.get("date"))
            prod_updates.append({
                "code": code,
                "aum": round(nav["totalNetAssets"] / 1e8, 2) if nav.get("totalNetAssets") else None,  # 億
                "nav": nav.get("navPerUnit"),
                "holdings_date": hd,
            })
            prev = {h.get("stockCode"): h.get("shares") for h in (d.get("previousStockHoldings") or [])}
            for h in (d.get("stockHoldings") or []):
                sc = str(h.get("stockCode", "")).strip()
                if not sc:
                    continue
                sh = h.get("shares")
                holdings.append({
                    "code": code, "stock_code": sc, "stock_name": h.get("stockName"),
                    "shares": sh, "weight": h.get("weight"),
                    "delta_shares": (sh - prev[sc]) if (sc in prev and sh is not None and prev[sc] is not None) else None,
                    "seq": h.get("seq"), "data_date": hd,
                })
            done += 1
            if i % 30 == 0:
                print(f"  …{i}/{len(codes)}（成功{done} 空{warn} 持股累計{len(holdings)}）", flush=True)
            await asyncio.sleep(0.4)
        await ctx.close()

    print(f"抓完：成功 {done} 檔、空 {warn} 檔、成分股 {len(holdings)} 列")

    # 只替換本次成功抓到的 ETF 的成分股(其餘保留 → 分次累積不倒退)
    for k in range(0, len(ok_codes), 100):
        part = ok_codes[k:k + 100]
        bs._sb(env, "/etf_holdings", method="DELETE",
               params=[("code", "in.(" + ",".join(part) + ")")])
    ok = 0
    for j in range(0, len(holdings), 1000):
        s, r = bs._sb(env, "/etf_holdings", method="POST", body=holdings[j:j + 1000])
        if s in (200, 201):
            ok += len(holdings[j:j + 1000])
        else:
            print(f"[error] 成分股第 {j} 批失敗 ({s}): {r}"); break
    print(f"已上傳 {ok} 列成分股")

    # 更新 etf_products 官方 AUM/NAV
    pok = 0
    for u in prod_updates:
        c = u.pop("code")
        s, r = bs._sb(env, "/etf_products", method="PATCH",
                      params=[("code", f"eq.{c}")], body=u)
        if s in (200, 204):
            pok += 1
    print(f"已更新 {pok} 檔 etf_products 官方 AUM/NAV")


if __name__ == "__main__":
    asyncio.run(main())
