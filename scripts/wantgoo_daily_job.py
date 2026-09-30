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

BACKFILL_DAYS    = 440   # 回補目標：往回天數。Wantgoo 只保留約 14 個月，440 天可補到源頭極限(~2025-05)
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


_AS_OF: date | None = None   # --as-of 覆寫「今天」：只抓到此日（補資料時避免誤抓盤中未收盤日）


def _today() -> date:
    return _AS_OF or date.today()


def _plan_daily(code: str) -> tuple[str, str] | None:
    """
    每日模式：只補從「DB 最新日期 +1」到今天（或 --as-of 指定日）。
    若該股票完全沒有資料（尚未回補），回傳 None 跳過。
    """
    today = _today()
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
    today = _today()
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


PER_STOCK_TIMEOUT = 120   # 單支股票整體逾時（秒）
RESTART_EVERY     = 200    # 每處理這麼多支就主動重啟瀏覽器，清掉累積記憶體（根治 ~480 支整個瀏覽器崩潰）
COOLDOWN_SEC      = 180    # 主回合後補跑前先冷卻，避免 wantgoo 限流
MAX_RETRY_ROUNDS  = 2      # 主回合外最多再補幾輪失敗股
PROFILE_RELEASE_S = 3      # 關掉 context 後等 profile 釋放再重開（避免 profile 鎖殘留導致重啟後又崩）
STALE_ALERT_THRESHOLD = 30 # C. 新鮮度警告門檻：跳過（來源未更新）股數 ≥ 此值就打 [warn]（正常應為個位數）


async def _open(p):
    """開一個 persistent context 並確認已登入。回傳 (context, page)；未登入回 (context, None)。"""
    ws.PROFILE_DIR.mkdir(exist_ok=True)
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
        return context, None
    return context, page


async def _restart(context, p):
    """關掉舊 context、等 profile 釋放、重開一個已登入的。回傳 (context, page)。"""
    try:
        await asyncio.wait_for(context.close(), timeout=30)
    except Exception:
        pass
    await asyncio.sleep(PROFILE_RELEASE_S)
    return await _open(p)


async def _scrape_pass(p, codes, plan_fn, throttle_ms):
    """對 codes 掃一輪。定期重啟瀏覽器、context 死掉就整個重啟。
    回傳 (processed, skipped, failed)。失敗股只記入 failed（不打 [warn]，交由呼叫端最終判定）。"""
    context, page = await _open(p)
    if page is None:
        _log("尚未登入 Wantgoo，請先執行 wantgoo_scraper.py 重新登入。中止。")
        try: await context.close()
        except Exception: pass
        return 0, 0, None   # None 表示登入失效（與「跑完但 0 失敗」的 [] 區別）

    processed = skipped = since_restart = 0
    failed = []
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

        # 定期重啟瀏覽器，清掉累積狀態（避免跑到 ~480 支整個 Chrome 崩潰）
        if since_restart >= RESTART_EVERY:
            _log(f"  [restart] 已處理 {since_restart} 支，主動重啟瀏覽器清狀態")
            context, page = await _restart(context, p)
            if page is None:
                _log("  [restart] 重啟後登入失效，中止本輪"); break
            since_restart = 0

        _log(f"[{i}/{len(codes)}] {code} {date_from}~{date_to}（{len(days_slash)} 交易日）")
        try:
            await asyncio.wait_for(
                ws.scrape_code(page, code, days_slash, throttle_ms=throttle_ms),
                timeout=PER_STOCK_TIMEOUT,
            )
            processed += 1
            since_restart += 1
        except Exception as e:
            failed.append(code)
            _log(f"  [miss] {code} 逾時/失敗：{type(e).__name__} {e}")   # 非最終標籤，可能於補跑救回
            # 先試重建分頁；context 已死則整個瀏覽器重啟（根治連鎖失敗）
            rebuilt = False
            try:
                if not page.is_closed():
                    try: await asyncio.wait_for(page.close(), timeout=15)
                    except Exception: pass
                page = await asyncio.wait_for(context.new_page(), timeout=30)
                await asyncio.wait_for(
                    page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=30000),
                    timeout=35,
                )
                rebuilt = True
            except Exception:
                pass
            if not rebuilt:
                _log("  [reopen] 分頁重建失敗（context 可能已死），重啟整個瀏覽器")
                context, page = await _restart(context, p)
                if page is None:
                    _log("  [reopen] 重啟後登入失效，中止本輪"); break
                since_restart = 0
            await asyncio.sleep(2)

    try: await context.close()
    except Exception: pass
    return processed, skipped, failed


async def _run(mode: str):
    codes = _load_codes()
    if not codes:
        _log("找不到股票清單，結束")
        return

    plan_fn     = _plan_daily if mode == "daily" else _plan_backfill
    throttle_ms = 500 if mode == "daily" else 600
    _log(f"開始執行，模式：{mode}")

    async with async_playwright() as p:
        total_proc = 0
        last_skip = 0
        pending = codes
        for rnd in range(MAX_RETRY_ROUNDS + 1):
            proc, skip, failed = await _scrape_pass(p, pending, plan_fn, throttle_ms)
            if failed is None:   # 登入失效 → 不印「本次完成」，讓 job_health 判定未完成
                _log("因未登入而中止，本次未完成。")
                return
            total_proc += proc
            last_skip = skip
            _log(f"第 {rnd + 1} 回合：處理 {proc} 支，略過 {skip} 支，失敗 {len(failed)} 支")
            if not failed or rnd >= MAX_RETRY_ROUNDS:
                break
            _log(f"還有 {len(failed)} 支失敗，冷卻 {COOLDOWN_SEC}s 後補跑（第 {rnd + 2} 回合）")
            await asyncio.sleep(COOLDOWN_SEC)
            pending = failed

    # 只有「補跑後仍失敗」的股票才打 [warn]，讓 job_health 的失敗數反映真實殘留
    for code in failed:
        _log(f"  [warn] {code} 多次補跑後仍失敗")

    # C. 資料新鮮度監控：統計本次被判定「來源未更新（整檔與前一交易日相同）」而跳過的股數。
    #    正常應為個位數（如當日跌停/停牌未更新的個股）；若異常偏高代表玩股網大面積尚未更新，
    #    可能是排程跑太早，應延後重跑。
    stale = getattr(ws, "STALE_SKIPPED", [])
    if stale:
        by_date = {}
        for _c, d, _p in stale:
            by_date[d] = by_date.get(d, 0) + 1
        summary = "、".join(f"{d} {n} 支" for d, n in sorted(by_date.items()))
        sample = "、".join(c for c, _d, _p in stale[:10])
        _log(f"[新鮮度] 來源未更新而跳過 {len(stale)} 支（{summary}）；範例：{sample}")
        if len(stale) >= STALE_ALERT_THRESHOLD:
            _log(f"  [warn][新鮮度] 跳過數達 {len(stale)}（門檻 {STALE_ALERT_THRESHOLD}），"
                 f"疑似玩股網大面積尚未更新／排程跑太早，建議稍後重跑補齊")
    else:
        _log("[新鮮度] 無來源未更新的個股（全部為當日新資料）")

    _log(f"本次完成。處理 {total_proc} 支，略過 {last_skip} 支。\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=["daily", "backfill"],
        default="daily",
        help="daily=只抓今天（排程用）  backfill=補歷史（手動執行）",
    )
    parser.add_argument(
        "--as-of",
        help="覆寫『今天』為此日期（YYYY-MM-DD）：只抓到此日，補資料時避免誤抓盤中未收盤日",
    )
    args = parser.parse_args()
    if args.as_of:
        global _AS_OF
        _AS_OF = date.fromisoformat(args.as_of)
        _log(f"[--as-of] 以 {_AS_OF} 為『今天』，只抓到此日")
    asyncio.run(_run(args.mode))


if __name__ == "__main__":
    main()
