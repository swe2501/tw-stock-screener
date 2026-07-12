"""
Wantgoo 券商分點排程腳本。

兩種模式（--mode 參數）：

  daily   （預設，每日 15:00 排程）
          只抓「今天」的資料。
          股票必須已有歷史資料才會處理（尚未回補的跳過）。
          ~1080 支上市股 × ~2.5 秒 ≈ 45 分鐘。

  backfill（手動執行，補充歷史）
          對已回補不足 1 年的股票，每次補最多 MAX_DAYS_PER_RUN（90）天。
          可重複執行，每次接著上次最新/最舊日期繼續，直到補滿 1 年為止。

股票清單：優先讀 scripts/all_stocks.txt（由 gen_all_stocks.py 產生），
          若不存在則 fallback 到 scripts/watchlist.txt。
"""
import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws  # noqa: E402

ROOT            = Path(__file__).resolve().parent.parent
ALL_STOCKS_FILE = Path(__file__).resolve().parent / "all_stocks.txt"
WATCHLIST_FILE  = Path(__file__).resolve().parent / "watchlist.txt"
LOG_FILE        = Path(__file__).resolve().parent / "daily_job.log"

BACKFILL_DAYS    = 365   # 回補目標：最近幾天的歷史（本機 SQLite 空間充足，存滿一年）
MAX_DAYS_PER_RUN = 90    # 回補每批次最多抓幾天


def _log(msg: str):
    line = f"[{date.today().isoformat()}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _load_codes() -> list[str]:
    src = ALL_STOCKS_FILE if ALL_STOCKS_FILE.exists() else WATCHLIST_FILE
    if not src.exists():
        return []
    codes = []
    for line in src.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            codes.append(line)
    _log(f"股票清單來源：{src.name}，共 {len(codes)} 支")
    return codes


def _latest_date(code: str) -> str | None:
    row = ws._local_db().execute(
        "select max(trade_date) from wantgoo_daily where code = ?", (code,)
    ).fetchone()
    return row[0] if row and row[0] else None


def _earliest_date(code: str) -> str | None:
    row = ws._local_db().execute(
        "select min(trade_date) from wantgoo_daily where code = ?", (code,)
    ).fetchone()
    return row[0] if row and row[0] else None


def _plan_daily(code: str) -> tuple[str, str] | None:
    """
    每日模式：只補從「DB 最新日期 +1」到今天。
    若該股票完全沒有資料（尚未回補），回傳 None 跳過。
    """
    today = date.today()
    last = _latest_date(code)
    if last is None:
        return None  # 尚未回補，daily 不處理
    start = date.fromisoformat(last) + timedelta(days=1)
    if start > today:
        return None  # 已是最新
    return start.isoformat(), today.isoformat()


def _plan_backfill(code: str) -> tuple[str, str] | None:
    """
    回補模式：填補「1 年前 → DB 最舊日期 -1」的歷史缺口，每次最多 MAX_DAYS_PER_RUN 天。
    若最舊日期已在 1 年前（含 5 天容差），視為完成，回傳 None。
    """
    today = date.today()
    target_start = today - timedelta(days=BACKFILL_DAYS)

    earliest = _earliest_date(code)
    if earliest is None:
        # 完全沒資料：從 1 年前開始抓
        start = target_start
        end = min(today, start + timedelta(days=MAX_DAYS_PER_RUN - 1))
    else:
        earliest_d = date.fromisoformat(earliest)
        if earliest_d <= target_start + timedelta(days=5):
            return None  # 已有完整 1 年資料
        # 需要往更早的方向補：target_start ~ earliest-1，每次抓最後 90 天（倒序填）
        end = earliest_d - timedelta(days=1)
        start = max(target_start, end - timedelta(days=MAX_DAYS_PER_RUN - 1))
        if start > end:
            return None

    return start.isoformat(), end.isoformat()


async def _run(mode: str):
    codes = _load_codes()
    if not codes:
        _log("找不到股票清單，結束")
        return

    plan_fn      = _plan_daily if mode == "daily" else _plan_backfill
    throttle_ms  = 500 if mode == "daily" else 600

    _log(f"開始執行，模式：{mode}")
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
            _log("尚未登入 Wantgoo，請先執行 wantgoo_scraper.py 重新登入。中止。")
            await context.close()
            return

        skipped = processed = 0
        for i, code in enumerate(codes, 1):
            rng = plan_fn(code)
            if rng is None:
                skipped += 1
                continue
            date_from, date_to = rng
            days_slash = ws._weekdays(date_from, date_to)
            if not days_slash:
                skipped += 1
                continue
            _log(f"[{i}/{len(codes)}] {code} {date_from}~{date_to}（{len(days_slash)} 交易日）")
            await ws.scrape_code(page, code, days_slash, throttle_ms=throttle_ms)
            processed += 1

        await context.close()

    _log(f"本次完成。處理 {processed} 支，略過 {skipped} 支。\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=["daily", "backfill"],
        default="daily",
        help="daily=只抓今天（排程用）  backfill=補歷史（手動執行）",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.mode))


if __name__ == "__main__":
    main()
