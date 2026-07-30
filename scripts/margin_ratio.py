"""
大盤融資維持率 — 抓 Wantgoo market-price/taiex 頁面已算好的「融資維持率」與「融資餘額(億)」，
上傳 Supabase market_margin 表供網頁顯示。

維持率＝融資擔保品現值 ÷ 融資餘額。Wantgoo 已用個股層級資料算好整體值，這裡直接讀渲染後
表格最新一列（匿名可取），用全新 playwright context，不需登入 profile、不碰 .wantgoo_profile。

用法：python scripts/margin_ratio.py
"""
import asyncio
import sys
from datetime import date
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

URL = "https://www.wantgoo.com/stock/margin-trading/market-price/taiex"


def _to_iso(md):
    """'07/30' → 'YYYY-07-30'；跨年時（顯示的月份比現在大很多）自動退一年。"""
    m, d = (int(x) for x in md.split("/"))
    today = date.today()
    try_d = date(today.year, m, d)
    if (try_d - today).days > 5:
        try_d = date(today.year - 1, m, d)
    return try_d.isoformat()


async def _scrape():
    """回傳最新一列表格 cells（[日期, 融資餘額億, 融資增減, 維持率%, ...]）或 None。"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False, channel="chrome",
            args=["--disable-blink-features=AutomationControlled"])
        try:
            page = await browser.new_page(viewport={"width": 1280, "height": 900})
            await page.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
            await page.goto(URL, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_function(
                "() => { const t=document.querySelector('table'); if(!t) return false;"
                " return [...t.querySelectorAll('td')].some(c=>/\\d+\\.?\\d*%/.test(c.innerText)); }",
                timeout=45000)
            return await page.evaluate("""() => {
                const t = document.querySelector('table');
                for (const r of [...t.querySelectorAll('tr')]) {
                    const cells = [...r.querySelectorAll('td')].map(c => c.innerText.trim());
                    if (cells.length >= 4 && /^\\d{1,2}\\/\\d{1,2}$/.test(cells[0]) && /%/.test(cells[3]))
                        return cells;
                }
                return null;
            }""")
        finally:
            await browser.close()


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    row = asyncio.run(_scrape())
    if not row:
        print("[error] 抓不到融資維持率資料列，中止"); sys.exit(1)

    trade_date = _to_iso(row[0])
    balance = float(row[1].replace(",", ""))                 # 融資餘額(億)
    ratio = float(row[3].replace("%", "").replace(",", ""))  # 維持率 %
    rec = {"trade_date": trade_date, "maintenance_ratio": ratio, "margin_balance": balance}
    print(f"大盤融資維持率 {trade_date}：維持率 {ratio}%、融資餘額 {balance} 億")

    # 先刪當日再寫入（沿用 broker_signals 慣例，避免 on_conflict 需要 select 權限）
    bs._sb(env, "/market_margin", method="DELETE", params=[("trade_date", f"eq.{trade_date}")])
    st, _ = bs._sb(env, "/market_margin", method="POST", body=[rec])
    print(f"上傳 market_margin={st}")


if __name__ == "__main__":
    main()
