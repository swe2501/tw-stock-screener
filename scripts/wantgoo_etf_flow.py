"""
wantgoo_etf_flow.py — 玩股網 ETF 資金流(申購贖回)+ 每日淨值 → Supabase etf_fund_flow。

資料源(需登入,沿用 .wantgoo_profile):
  /stock/etf/{code}/discount-premium-data
    → [{date, bookValue(每日NAV), netChange(當日受益權單位淨變化=申購贖回)}]  近 30 日
用 upsert(on_conflict code,date, merge)累積 → 未來每日跑會把歷史越存越長,可算任意天期資金流。
資金流金額 ≈ netChange(單位) × NAV。
用法：python scripts/wantgoo_etf_flow.py
"""
import asyncio
import json
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws
import broker_signals as bs
from playwright.async_api import async_playwright

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

RESTART_EVERY = 150


def _iso(ms):
    if not ms:
        return ""
    return datetime.fromtimestamp(ms / 1000, timezone(timedelta(hours=8))).strftime("%Y-%m-%d")


def _upsert(env, rows):
    """PostgREST upsert(merge-duplicates)累積,不刪舊。"""
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/etf_fund_flow?on_conflict=code,date"
    ok = 0
    for i in range(0, len(rows), 1000):
        body = json.dumps(rows[i:i + 1000]).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "resolution=merge-duplicates,return=minimal"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status in (200, 201, 204):
                    ok += len(rows[i:i + 1000])
        except Exception as e:
            print(f"[error] upsert 第 {i} 批: {e}")
    return ok


async def _open(p):
    ctx = await p.chromium.launch_persistent_context(
        str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
        channel="chrome", args=["--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation", "--no-sandbox"])
    await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto("https://www.wantgoo.com/stock/etf/0050/discount-premium",
                    wait_until="domcontentloaded", timeout=40000)
    return ctx, page


async def _fetch_flow(page, code):
    key = f"/stock/etf/{code}/discount-premium-data"
    try:
        async with page.expect_response(lambda r: key in r.url, timeout=15000) as ri:
            await page.goto(f"https://www.wantgoo.com/stock/etf/{code}/discount-premium",
                            wait_until="commit", timeout=30000)
        return await (await ri.value).json()
    except Exception:
        try:
            await page.wait_for_timeout(1000)
            return await page.evaluate(
                "(c)=>fetch('/stock/etf/'+c+'/discount-premium-data',{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)", code)
        except Exception:
            return None


async def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    st, prods = bs._sb(env, "/etf_products", params=[("select", "code"), ("limit", "1000")])
    codes = [r["code"] for r in (prods or []) if r.get("code")]
    if not codes:
        print("[error] etf_products 無資料"); return
    print(f"抓 {len(codes)} 檔 ETF 資金流…")

    rows = []
    async with async_playwright() as p:
        ctx, page = await _open(p)
        if not await ws.is_logged_in(page):
            print("[error] 玩股網未登入,中止"); await ctx.close(); return
        done = warn = 0
        for i, code in enumerate(codes, 1):
            if i % RESTART_EVERY == 0:
                await ctx.close(); await asyncio.sleep(3); ctx, page = await _open(p)
            d = await _fetch_flow(page, code)
            if not isinstance(d, list) or not d:
                warn += 1; await asyncio.sleep(0.4); continue
            for r in d:
                dt = _iso(r.get("date"))
                if not dt:
                    continue
                rows.append({"code": code, "date": dt,
                             "nav": r.get("bookValue"), "net_units": r.get("netChange")})
            done += 1
            if i % 40 == 0:
                print(f"  …{i}/{len(codes)}（成功{done} 空{warn} 累計{len(rows)}列）", flush=True)
            await asyncio.sleep(0.4)
        await ctx.close()

    print(f"抓完：成功 {done} 檔、空 {warn} 檔、{len(rows)} 列")
    ok = _upsert(env, rows)
    print(f"已 upsert {ok} 列到 etf_fund_flow")


if __name__ == "__main__":
    asyncio.run(main())
