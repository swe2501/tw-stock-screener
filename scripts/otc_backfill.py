"""
otc_backfill.py - 上櫃股券商分點歷史回補（2026-10-23）

背景：上市分點自 2025-05-13 起有完整歷史；上櫃分點原本只由 otc_broker_daily.py 抓「當日」
（2026-09-21 起），主力分點前 20 名排行等於只用上市資料。此腳本把上櫃 868 檔回補到與上市同起點。

做法：
  - 股票清單：D:\\stock_data\\otc_names.json（上櫃代號）
  - 每檔要補的日期＝起點～該檔已有最早資料日前一天的交易日（排除證交所休市日），扣掉已抓過的
  - 進度檔 D:\\stock_data\\otc_backfill_done.txt（code,date 一行），中斷後重跑會接著補；
    玩股網沒資料的日子（未上市、停牌）也記為已抓，不會重抓
  - 用「複製出來的」登入設定檔（.wantgoo_profile_bf<N>），不與夜間排程搶同一個設定檔
  - 可分多個 worker 平行：--worker 0 --workers 2 / --worker 1 --workers 2
  - 寫入沿用 wantgoo_scraper._save_wantgoo_rows（含休市日與鄰日整檔複製防呆），資料庫鎖住時重試

用法：
  python scripts/otc_backfill.py --worker 0 --workers 2
  python scripts/otc_backfill.py --status          # 只看進度
"""
import argparse
import asyncio
import json
import shutil
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

START = "2025-08-01"                       # 玩股網上櫃分點實測最早可抓日（2026-10-23 探測；上市因較早回補而從 2025-05-13 起）
END = "2026-10-22"                         # 補到最近（9/21 之後已有的日子會自動跳過，順便補漏抓的日子）
OTC_NAMES = Path(r"D:\stock_data\otc_names.json")
DONE_FILE = Path(r"D:\stock_data\otc_backfill_done.txt")
LOG_DIR = Path(__file__).resolve().parent
THROTTLE_MS = 600
BATCH_DAYS = 40                            # 每批天數（配合單批逾時）
BATCH_TIMEOUT = BATCH_DAYS * 4 + 60
RESTART_EVERY_REQ = 2500                   # 每這麼多次請求重啟瀏覽器清記憶體
PAUSE_FROM, PAUSE_TO = (18, 50), (23, 30)  # 每日暫停時段（夜間排程抓玩股網）
PAUSE_TO_EARLY = (0, 0)                    # 保留：跨午夜暫停用（目前不跨午夜）


def _log(worker, msg):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} [w{worker}] {msg}"
    print(line, flush=True)
    with open(LOG_DIR / f"otc_backfill_w{worker}.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _done_set():
    s = set()
    if DONE_FILE.exists():
        for line in DONE_FILE.read_text(encoding="utf-8").splitlines():
            if "," in line:
                s.add(tuple(line.strip().split(",", 1)))
    return s


def _mark_done(code, day_dash):
    with open(DONE_FILE, "a", encoding="utf-8") as f:
        f.write(f"{code},{day_dash}\n")


def _open_db():
    """資料庫連線：等鎖最多 5 分鐘（夜間排程與另一個 worker 同時寫）。"""
    conn = sqlite3.connect(str(ws.LOCAL_DB_PATH), timeout=300)
    conn.execute("pragma busy_timeout = 300000")
    ws._local_conn = conn          # 讓 ws._save_wantgoo_rows / _save_local_rows 共用這條連線
    return conn


def _save_local_rows_retry(records):
    for attempt in range(6):
        try:
            conn = ws._local_db()
            conn.executemany(
                """insert or replace into wantgoo_daily
                   (code, trade_date, broker_id, broker_name,
                    buy_vol, sell_vol, buy_avg_price, sell_avg_price)
                   values (:code, :trade_date, :broker_id, :broker_name,
                           :buy_vol, :sell_vol, :buy_avg_price, :sell_avg_price)""",
                records,
            )
            conn.commit()
            return
        except sqlite3.OperationalError as e:
            print(f"  [db] 寫入重試 {attempt + 1}：{e}", flush=True)
            time.sleep(30)
    raise RuntimeError("資料庫寫入失敗（重試 6 次）")


ws._save_local_rows = _save_local_rows_retry


def _plan(conn, codes, done):
    """回傳 [(code, [day_slash...])]，只含還沒抓過的日子。"""
    # 固定區間；不能用「該檔最早資料日」當終點（回補途中會變動而漏日）。
    # 只抓上市確實有開盤的日子（以 2330 分點有資料的日子當交易日曆），颱風假等臨時休市也不會寫入鄰日假資料。
    cal = {r[0] for r in conn.execute("select distinct trade_date from wantgoo_daily where code='2330'")}
    all_days = [d for d in ws._weekdays(START, END) if d.replace("/", "-") in cal]
    plans = []
    for code in codes:
        have = {r[0] for r in conn.execute(
            "select distinct trade_date from wantgoo_daily where code=? and trade_date between ? and ?",
            (code, START, END))}
        days = [d for d in all_days
                if d.replace("/", "-") not in have and (code, d.replace("/", "-")) not in done]
        if days:
            plans.append((code, days))
    return plans


def _profile_for(worker):
    """複製一份已登入的設定檔給回補用（第一次才複製；之後沿用）。"""
    dst = ws.PROFILE_DIR.parent / f".wantgoo_profile_bf{worker}"
    if not dst.exists():
        shutil.copytree(ws.PROFILE_DIR, dst, ignore=shutil.ignore_patterns(
            "Singleton*", "lockfile", "*.lock", "Crashpad", "GPUCache", "Code Cache", "Cache", "ShaderCache"))
    return dst


async def _open(p, worker):
    """開瀏覽器並確認已登入；判斷為未登入時等一下重試（2026-10-25：玩股網一時回應慢被誤判未登入，兩個 worker 整個中止）。"""
    for attempt in range(4):
        try:
            ctx, page = await _open_once(p, worker)
        except Exception as e:                       # noqa: BLE001
            _log(worker, f"開瀏覽器失敗（第 {attempt + 1} 次）：{type(e).__name__}")
            ctx, page = None, None
        if page is not None:
            return ctx, page
        if ctx is not None:
            try:
                await asyncio.wait_for(ctx.close(), timeout=30)
            except Exception:
                pass
        if attempt < 3:
            _log(worker, f"判斷為未登入或開啟失敗，{60 * (attempt + 1)} 秒後重試")
            await asyncio.sleep(60 * (attempt + 1))
    return await _open_once(p, worker)


async def _open_once(p, worker):
    ctx = await p.chromium.launch_persistent_context(
        str(_profile_for(worker)), headless=False, channel="chrome",
        viewport={"width": 1100, "height": 800},
        args=["--disable-blink-features=AutomationControlled", f"--window-position={-2000 - worker * 50},0"],
        ignore_default_args=["--enable-automation", "--no-sandbox"],
    )
    await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=30000)
    if not await ws.is_logged_in(page):
        return ctx, None
    return ctx, page


async def _scrape_batch(page, code, days):
    """抓一批日期；每天抓到（含 0 筆）就記進度。回傳實際有回應的天數。"""
    url = f"https://www.wantgoo.com/stock/{code}/major-investors/branch-buysell"
    await page.goto(url, wait_until="load", timeout=30000)
    try:
        await page.wait_for_function(
            "() => typeof window.querySetting !== 'undefined' && typeof window.getData === 'function'", timeout=10000)
    except Exception:
        await page.wait_for_timeout(1500)
    got = 0
    for d in days:
        data = await ws.fetch_day(page, d)
        if data is not None:
            ws._save_wantgoo_rows(code, d.replace("/", "-"), data.get("data") or [])
            _mark_done(code, d.replace("/", "-"))
            got += 1
        await page.wait_for_timeout(THROTTLE_MS)
    return got


async def run(worker, workers):
    conn = _open_db()
    codes = sorted(json.load(open(OTC_NAMES, encoding="utf-8")).keys())
    codes = [c for i, c in enumerate(codes) if i % workers == worker]
    plans = _plan(conn, codes, _done_set())
    total_days = sum(len(d) for _, d in plans)
    _log(worker, f"待補 {len(plans)} 檔、{total_days} 個(檔×日)；預估 {total_days * 1.3 / 3600:.1f} 小時")
    if not plans:
        return
    async with async_playwright() as p:
        ctx, page = await _open(p, worker)
        if page is None:
            _log(worker, "回補用設定檔未登入玩股網，中止（請刪除 .wantgoo_profile_bf* 後重跑以重新複製登入狀態）")
            await ctx.close()
            return
        reqs = 0
        t0 = time.time()
        done_days = 0
        # 依「日期區塊」為外層：全部股票先補最舊的 BATCH_DAYS 天，再往後一塊。
        # 玩股網只保留約 14 個月且起點每天往後移，先補最舊的才不會補到一半就消失。
        nblocks = max((len(d) + BATCH_DAYS - 1) // BATCH_DAYS for _, d in plans)
        jobs = [(blk, code, days[blk * BATCH_DAYS:(blk + 1) * BATCH_DAYS])
                for blk in range(nblocks) for code, days in plans if days[blk * BATCH_DAYS:(blk + 1) * BATCH_DAYS]]
        for idx, (blk, code, batch) in enumerate(jobs, 1):
            # 夜間排程（19:00 起抓玩股網上市＋上櫃當日分點）期間暫停，避免同帳號多開被限流連帶害夜間排程失敗
            now = datetime.now()
            if (now.hour, now.minute) >= PAUSE_FROM or (now.hour, now.minute) < PAUSE_TO_EARLY:
                if (now.hour, now.minute) >= PAUSE_FROM:
                    resume = now.replace(hour=PAUSE_TO[0], minute=PAUSE_TO[1], second=0)
                    if resume <= now:
                        resume = now
                else:
                    resume = now
                wait = (resume - now).total_seconds()
                if wait > 0:
                    _log(worker, f"夜間排程時段，暫停到 {resume:%H:%M}")
                    try:
                        await asyncio.wait_for(ctx.close(), timeout=30)
                    except Exception:
                        pass
                    await asyncio.sleep(wait)
                    ctx, page = await _open(p, worker)
                    if page is None:
                        _log(worker, "暫停後登入失效，中止"); return
                    reqs = 0
            if True:
                if reqs >= RESTART_EVERY_REQ:
                    try:
                        await asyncio.wait_for(ctx.close(), timeout=30)
                    except Exception:
                        pass
                    await asyncio.sleep(3)
                    ctx, page = await _open(p, worker)
                    if page is None:
                        _log(worker, "重啟後登入失效，中止"); return
                    reqs = 0
                for attempt in range(3):
                    try:
                        got = await asyncio.wait_for(_scrape_batch(page, code, batch), timeout=BATCH_TIMEOUT)
                        done_days += got
                        break
                    except Exception as e:
                        _log(worker, f"  {code} 批次失敗（第 {attempt + 1} 次）：{type(e).__name__} {e}")
                        try:
                            await asyncio.wait_for(ctx.close(), timeout=30)
                        except Exception:
                            pass
                        await asyncio.sleep(20 * (attempt + 1))
                        ctx, page = await _open(p, worker)
                        if page is None:
                            _log(worker, "重開後登入失效，中止"); return
                        # 重試時只抓這批還沒記進度的日子
                        dn = _done_set()
                        batch = [d for d in batch if (code, d.replace("/", "-")) not in dn]
                        if not batch:
                            break
                reqs += len(batch)
            el = time.time() - t0
            rate = done_days / el if el else 0
            left = total_days - done_days
            _log(worker, (f"[{idx}/{len(jobs)}] 區塊{blk + 1} {code} 完成；累計 {done_days}/{total_days}，"
                          f"剩約 {left / rate / 3600:.1f} 小時") if rate else f"[{idx}/{len(jobs)}] {code} 完成")
        await ctx.close()
    stale = getattr(ws, "STALE_SKIPPED", [])
    _log(worker, f"全部完成。鄰日整檔相同而跳過 {len(stale)} 筆（檔×日）")


def status():
    conn = sqlite3.connect(f"file:{ws.LOCAL_DB_PATH}?mode=ro", uri=True, timeout=60)
    codes = sorted(json.load(open(OTC_NAMES, encoding="utf-8")).keys())
    plans = _plan(conn, codes, _done_set())
    print(f"上櫃 {len(codes)} 檔；尚待回補 {len(plans)} 檔、{sum(len(d) for _, d in plans)} 個(檔×日)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", type=int, default=0)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    if a.status:
        status()
    else:
        asyncio.run(run(a.worker, a.workers))
