"""
Wantgoo 券商分點逐日資料爬蟲（本機執行，使用 Playwright 真實瀏覽器）

用法：
  python scripts/wantgoo_scraper.py --code 2330 --from 2026-05-01 --to 2026-06-29
  python scripts/wantgoo_scraper.py --code 2330,2317,7795 --from 2026-06-01 --to 2026-06-29

第一次執行會跳出瀏覽器要求手動登入 Wantgoo 會員帳號；登入後 session 會存在
.wantgoo_profile/ 資料夾，之後執行不需要重複登入。

環境變數（可放在專案根目錄的 .env.local，腳本會自動讀取）：
  SUPABASE_URL
  SUPABASE_ANON_KEY
"""
import argparse
import asyncio
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

# Windows 主控台預設 cp950，遇到印不出的字元以 ? 取代，不讓整個排程崩潰
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

ROOT = Path(__file__).resolve().parent.parent
PROFILE_DIR = ROOT / ".wantgoo_profile"
ENV_FILE = ROOT / ".env.local"


def _load_env_local():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_local()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def _sb(path, method="GET", body=None, params=None, retries=3):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer": "return=minimal,resolution=merge-duplicates" if method == "POST" else "return=minimal",
    }
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, json.loads(raw) if raw else []
        except urllib.error.HTTPError as e:
            raw = e.read()
            return e.code, json.loads(raw) if raw else {}
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            # 網路暫時性錯誤（逾時、斷線）：等一下重試，不讓整批中斷
            if attempt < retries - 1:
                print(f"  [retry {attempt+1}/{retries-1}] Supabase 連線失敗（{e}），5 秒後重試")
                time.sleep(5)
            else:
                print(f"  [error] Supabase 連線失敗，重試 {retries-1} 次後放棄：{e}")
                return 0, {}


TOP_N_BROKERS = 15  # Supabase 每天每股只保留買超前 N + 賣超前 N 名券商（控制雲端容量）

# ── 本機 SQLite：存「全量」分點資料（雲端只存前 15 名） ──────────
LOCAL_DB_PATH = Path(os.environ.get("WANTGOO_LOCAL_DB", r"D:\stock_data\wantgoo_full.db"))
_local_conn = None


def _local_db():
    global _local_conn
    if _local_conn is None:
        LOCAL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _local_conn = sqlite3.connect(str(LOCAL_DB_PATH))
        _local_conn.execute("""
            create table if not exists wantgoo_daily (
                code           text not null,
                trade_date     text not null,
                broker_id      text not null,
                broker_name    text,
                buy_vol        integer not null default 0,
                sell_vol       integer not null default 0,
                buy_avg_price  real,
                sell_avg_price real,
                primary key (code, trade_date, broker_id)
            )
        """)
        _local_conn.execute(
            "create index if not exists idx_wantgoo_broker on wantgoo_daily (broker_id, trade_date)"
        )
        _local_conn.commit()
    return _local_conn


def _save_local_rows(records):
    """全量寫入本機 SQLite（records 為 _save_wantgoo_rows 組好的 dict 清單）。"""
    try:
        conn = _local_db()
        conn.executemany(
            """insert or replace into wantgoo_daily
               (code, trade_date, broker_id, broker_name,
                buy_vol, sell_vol, buy_avg_price, sell_avg_price)
               values (:code, :trade_date, :broker_id, :broker_name,
                       :buy_vol, :sell_vol, :buy_avg_price, :sell_avg_price)""",
            records,
        )
        conn.commit()
    except Exception as e:
        print(f"  [warn] 本機 SQLite 寫入失敗：{e}")


def _save_wantgoo_rows(code, date_str, rows):
    """rows: list of {agentId, agentName, buyQuantities, sellQuantities, buyPriceAvg, sellPriceAvg}"""
    if not rows:
        return
    records = []
    for r in rows:
        buy = r.get("buyQuantities") or 0
        sell = r.get("sellQuantities") or 0
        if not buy and not sell:
            continue
        records.append({
            "code": code,
            "trade_date": date_str,
            "broker_id": r.get("agentId", ""),
            "broker_name": r.get("agentName", ""),
            "buy_vol": int(buy),
            "sell_vol": int(sell),
            "buy_avg_price": r.get("buyPriceAvg") or None,
            "sell_avg_price": r.get("sellPriceAvg") or None,
        })
    if not records:
        return
    # 全量（~200 家分點）只寫本機 D 槽 SQLite（2026-07 起不再上傳 Supabase）
    _save_local_rows(records)


def _weekdays(date_from, date_to):
    d = datetime.strptime(date_from, "%Y-%m-%d").date()
    end = datetime.strptime(date_to, "%Y-%m-%d").date()
    out = []
    while d <= end:
        if d.weekday() < 5:
            out.append(d.strftime("%Y/%m/%d"))
        d += timedelta(days=1)
    return out


async def is_logged_in(page) -> bool:
    member = await page.evaluate(
        "() => fetch('/member/who', {headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r => r.ok ? r.json() : null).catch(() => null)"
    )
    return bool(member and member.get("id"))


async def fetch_day(page, day_slash) -> dict | None:
    """在已開啟的分點頁面上，設定日期並觸發 getData()，攔截真正的 API 回應。"""
    loop = asyncio.get_event_loop()
    fut = loop.create_future()

    def on_response(response):
        if "branch-buysell-data" in response.url and not fut.done():
            fut.set_result(response)

    page.on("response", on_response)
    try:
        try:
            await page.evaluate(
                """([b, e]) => {
                    window.querySetting.beginDate = b;
                    window.querySetting.endDate = e;
                    return getData();
                }""",
                [day_slash, day_slash],
            )
        except Exception:
            # 頁面自己的 calculationTrend() 在當日無分點淨買賣資料時，
            # 對空陣列呼叫 reduce() 沒給初始值會拋錯。實際 API 回應通常
            # 已經被下面的 response listener 攔截到了，忽略這個頁面內部錯誤即可。
            pass
        resp = await asyncio.wait_for(fut, timeout=20)
        data = await resp.json()
        return data
    except asyncio.TimeoutError:
        return None
    finally:
        page.remove_listener("response", on_response)


async def scrape_code(page, code: str, days_slash: list[str], throttle_ms: int = 800):
    url = f"https://www.wantgoo.com/stock/{code}/major-investors/branch-buysell"
    print(f"[{code}] 開啟頁面 {url}")
    await page.goto(url, wait_until="load", timeout=30000)
    # 等待 Wantgoo 頁面的查詢函式初始化（比 networkidle+固定等待 更快）
    try:
        await page.wait_for_function(
            "() => typeof window.querySetting !== 'undefined' && typeof window.getData === 'function'",
            timeout=10000,
        )
    except Exception:
        await page.wait_for_timeout(1500)  # fallback

    if not await is_logged_in(page):
        print(f"  [{code}] 尚未登入會員帳號，略過")
        return

    for day_slash in days_slash:
        day_dash = day_slash.replace("/", "-")
        try:
            data = await fetch_day(page, day_slash)
        except Exception as e:
            print(f"  {day_dash}: 例外 {e}")
            data = None
        if data is None:
            print(f"  {day_dash}: 逾時或無回應")
        else:
            rows = data.get("data") or []
            _save_wantgoo_rows(code, day_dash, rows)
            print(f"  {day_dash}: {len(rows)} 筆分點資料")
        await page.wait_for_timeout(throttle_ms)  # 控速避免觸發風控


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", required=True, help="股票代碼，逗號分隔，例如 2330,2317")
    parser.add_argument("--from", dest="date_from", required=True, help="YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("錯誤：請在 .env.local 設定 SUPABASE_URL 與 SUPABASE_ANON_KEY")
        sys.exit(1)

    codes = [c.strip() for c in args.code.split(",") if c.strip()]
    days_slash = _weekdays(args.date_from, args.date_to)
    print(f"股票：{codes}　平日數：{len(days_slash)}")

    PROFILE_DIR.mkdir(exist_ok=True)

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 900},
            channel="chrome",  # 用本機已安裝的正版 Chrome，而非 Playwright 內建 Chromium
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"],
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = context.pages[0] if context.pages else await context.new_page()

        await page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=30000)
        if not await is_logged_in(page):
            print("\n>>> 尚未登入。請在彈出的瀏覽器視窗中手動登入 Wantgoo 會員帳號。")
            print(">>> 登入完成後，回到這個終端機按 Enter 繼續...")
            await asyncio.get_event_loop().run_in_executor(None, input)
            if not await is_logged_in(page):
                print("仍未偵測到登入狀態，請確認後重新執行腳本。")
                await context.close()
                return
            print("登入成功，session 已保存，之後執行不需要重新登入。\n")

        for code in codes:
            await scrape_code(page, code, days_slash)

        await context.close()

    print("\n完成。")


if __name__ == "__main__":
    asyncio.run(main())
