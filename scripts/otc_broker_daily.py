"""
otc_broker_daily.py — 抓「上櫃」868 檔『當日』券商分點買賣 → 本機 wantgoo_daily，
供 compute_greed 的上櫃「主力集中度」（最新日 前15大淨買超 / 總量）。重用 wantgoo_scraper 的
Playwright（.wantgoo_profile 登入）＋ scrape_code（開 /stock/{code}/major-investors/branch-buysell、
攔 branch-buysell-data、_save_wantgoo_rows 寫本機）。主力集中度只需最新一日，故僅抓當日、不回補歷史。

前置：需先跑過 wantgoo_scraper 手動登入一次（session 存 .wantgoo_profile）。
用法：
  python scripts/otc_broker_daily.py                 # 抓今天、全部上櫃
  python scripts/otc_broker_daily.py --date 2026-09-18
  python scripts/otc_broker_daily.py --limit 5       # 測試前 5 檔
成本：868 檔 × ~2.5s ≈ 35 分鐘（夜間排程；偶爾漏股會於隔日補上，主力集中度非關鍵可容忍）。
"""
import argparse, asyncio, json, sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws
from playwright.async_api import async_playwright

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

OTC_NAMES = Path(r"D:\stock_data\otc_names.json")


async def _run(day_iso, limit):
    if not OTC_NAMES.exists():
        print(f"[error] 找不到 {OTC_NAMES}（先跑 fetch_prices_otc.py）"); return
    codes = sorted(json.loads(OTC_NAMES.read_text(encoding="utf-8")).keys())
    if limit:
        codes = codes[:limit]
    day_slash = day_iso.replace("-", "/")
    # 2026-10-24 休市日（含颱風等臨時休市）不抓：10/23 臨時休市照抓，玩股網回傳鄰日分點被寫成 10/23
    if ws.is_market_holiday(date.fromisoformat(day_iso)):
        print(f"[skip] {day_iso} 證交所休市，不抓上櫃分點"); return
    ws.PROFILE_DIR.mkdir(exist_ok=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
            channel="chrome", args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"])
        await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        for attempt in range(4):   # 2026-10-23 首頁逾時重試（單次逾時曾讓整支排程當掉）
            try:
                await page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=45000)
                break
            except Exception as e:
                print(f"[open] 玩股網首頁開啟失敗（第 {attempt + 1} 次）：{type(e).__name__}", flush=True)
                if attempt == 3:
                    raise
                await asyncio.sleep(30 * (attempt + 1))
        if not await ws.is_logged_in(page):
            print("[error] wantgoo 未登入（先跑一次 wantgoo_scraper 手動登入）"); await ctx.close(); return
        ok = 0
        for i, code in enumerate(codes, 1):
            try:
                await ws.scrape_code(page, code, [day_slash])
                ok += 1
            except Exception as e:
                print(f"  [{code}] 失敗 {str(e)[:50]}")
            if i % 50 == 0:
                print(f"[{i}/{len(codes)}] 已處理，成功 {ok}")
        await ctx.close()
    print(f"上櫃當日分點抓取完成 {ok}/{len(codes)} 檔（{day_iso}）→ wantgoo_daily")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    asyncio.run(_run(args.date, args.limit))


if __name__ == "__main__":
    main()
