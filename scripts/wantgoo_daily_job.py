"""
Wantgoo 券商分點「每日增量」排程腳本（給 Windows 工作排程器呼叫，非互動執行）。

讀取 scripts/watchlist.txt 裡的股票代碼，對每一支：
  - 查 Supabase wantgoo_daily 目前抓到的最新日期
  - 沒抓過的新股票：回補最近 365 天（每次最多抓 90 天，分幾天排程跑完，
    避免單次執行時間過長或觸發風控）
  - 已有資料的股票：只抓「最新日期之後 ~ 今天」的新增交易日（過去的買賣量
    不會變，不需要重抓）

每次執行也會清掉超過 1 年（RETENTION_DAYS）的舊資料，讓資料庫只保留最近一年。

需要瀏覽器有畫面才能正確產生防爬簽章，所以工作排程器的工作必須設定成
「只在使用者登入時執行」（互動工作階段），不能用「不論使用者是否登入都執行」。

執行紀錄會同時印到 stdout 與 scripts/daily_job.log。
"""
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WATCHLIST_FILE = Path(__file__).resolve().parent / "watchlist.txt"
LOG_FILE = Path(__file__).resolve().parent / "daily_job.log"

BACKFILL_DAYS = 365      # 新股票總共要回補的天數（分幾次排程跑完）
MAX_DAYS_PER_RUN = 90    # 單一股票單次最多抓幾天，避免排程跑太久
RETENTION_DAYS = 365     # 資料庫只保留最近幾天，超過的自動清除


def _log(msg: str):
    line = f"[{date.today().isoformat()}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _load_watchlist() -> list[str]:
    if not WATCHLIST_FILE.exists():
        return []
    codes = []
    for line in WATCHLIST_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            codes.append(line)
    return codes


def _latest_date(code: str) -> str | None:
    """查這支股票在 wantgoo_daily 裡最新的 trade_date（YYYY-MM-DD），沒有則回傳 None。"""
    status, rows = ws._sb("/wantgoo_daily", params=[
        ("select", "trade_date"),
        ("code", f"eq.{code}"),
        ("order", "trade_date.desc"),
        ("limit", "1"),
    ])
    if status == 200 and rows:
        return rows[0]["trade_date"]
    return None


def _cleanup_old_data():
    """刪除超過 RETENTION_DAYS 的舊資料，讓資料庫只保留最近一年。"""
    cutoff = (date.today() - timedelta(days=RETENTION_DAYS)).isoformat()
    status, resp = ws._sb("/wantgoo_daily", method="DELETE", params=[
        ("trade_date", f"lt.{cutoff}"),
    ])
    if status in (200, 204):
        _log(f"已清除 {cutoff} 之前的舊資料")
    else:
        _log(f"清除舊資料失敗 ({status}): {resp}")


def _plan_range(code: str) -> tuple[str, str] | None:
    today = date.today()
    last = _latest_date(code)
    if last is None:
        start = today - timedelta(days=BACKFILL_DAYS)
    else:
        last_d = date.fromisoformat(last)
        start = last_d + timedelta(days=1)
    if start > today:
        return None  # 已是最新
    end = min(today, start + timedelta(days=MAX_DAYS_PER_RUN))
    return start.isoformat(), end.isoformat()


async def main():
    if not ws.SUPABASE_URL or not ws.SUPABASE_ANON_KEY:
        _log("錯誤：未設定 SUPABASE_URL / SUPABASE_ANON_KEY，中止")
        sys.exit(1)

    _cleanup_old_data()

    codes = _load_watchlist()
    if not codes:
        _log("watchlist.txt 是空的，沒有股票要抓，結束")
        return

    _log(f"開始每日增量抓取，股票清單：{codes}")
    ws.PROFILE_DIR.mkdir(exist_ok=True)

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 900},
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"],
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = context.pages[0] if context.pages else await context.new_page()

        await page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=30000)
        if not await ws.is_logged_in(page):
            _log("尚未登入 Wantgoo 會員帳號（session 可能過期），請手動執行 wantgoo_scraper.py 重新登入一次。中止本次排程。")
            await context.close()
            return

        for code in codes:
            rng = _plan_range(code)
            if rng is None:
                _log(f"[{code}] 已是最新，略過")
                continue
            date_from, date_to = rng
            days_slash = ws._weekdays(date_from, date_to)
            _log(f"[{code}] 補抓 {date_from} ~ {date_to}（{len(days_slash)} 個交易日）")
            await ws.scrape_code(page, code, days_slash)

        await context.close()

    _log("本次排程完成。\n")


if __name__ == "__main__":
    asyncio.run(main())
