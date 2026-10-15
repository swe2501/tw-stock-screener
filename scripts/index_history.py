"""
index_history.py — 首頁指標卡「2 年走勢線圖」資料源。
用既有玩股網 Playwright profile（過 Cloudflare）抓以下指標各約 2 年每日 OHLC，存 Supabase index_history：
  code   名稱            頁面
  two    櫃買指數(OTC)    /index/two
  wtx&   台指期(日盤)     /index/wtx&
  vixtwn 台指VIX          /index/vixtwn
  stwn&  富台指(SGX)      /global/stwn&
做法：導到各商品自己的頁面（確保 before 參數有效、code 大小寫正確），讀頁面自己打出的
      historical-daily-candlesticks?...top=490（≈2 年）請求 URL，原樣重打拿 JSON，
      轉成 (code,trade_date,open,high,low,close) upsert（on_conflict 合併，冪等）。
每晚重跑即自動補當日一筆；加權(0000)與匯率仍走 /api/chart，不在此。
用法：python scripts/index_history.py            # 全部四檔
      python scripts/index_history.py --code two  # 單檔測試
"""
import asyncio
import sys
import json
import re
import argparse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws
import broker_signals as bs
from playwright.async_api import async_playwright

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

TZ = timezone(timedelta(hours=8))
# (code 存表用, 頁面網址)
INSTR = [
    ("vixtwn", "https://www.wantgoo.com/index/vixtwn"),
    ("two",    "https://www.wantgoo.com/index/two"),
    ("wtx&",   "https://www.wantgoo.com/index/wtx&"),
    ("stwn&",  "https://www.wantgoo.com/global/stwn&"),
]


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/index_history?on_conflict=code,trade_date"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


async def _hist_url(page):
    """等頁面自己打出 historical-daily-candlesticks（最多 7 秒），回傳 top 最大的那個 URL。"""
    for _ in range(14):
        urls = await page.evaluate(
            "()=>performance.getEntriesByType('resource').map(e=>e.name)"
            ".filter(n=>/historical-daily-candlesticks/.test(n))")
        if urls:
            def top(u):
                m = re.search(r"top=(\d+)", u)
                return int(m.group(1)) if m else 0
            best = max(urls, key=top)
            # 若頁面只打了 top=60，就把它改成 490（before 參數照用，仍有效）
            return re.sub(r"top=\d+", "top=490", best)
        await asyncio.sleep(0.5)
    return None


async def _fetch_rows(page, url):
    return await page.evaluate(
        "(u)=>fetch(u,{headers:{'X-Requested-With':'XMLHttpRequest'}})"
        ".then(r=>r.ok?r.json():null).catch(()=>null)", url)


def _to_rows(code, raw):
    out = []
    for r in raw or []:
        t = r.get("time") or r.get("tradeDate")
        c = r.get("close")
        if t is None or c is None:
            continue
        d = datetime.fromtimestamp(t / 1000, TZ).strftime("%Y-%m-%d")
        out.append({"code": code, "trade_date": d,
                    "open": r.get("open"), "high": r.get("high"),
                    "low": r.get("low"), "close": c})
    # 去重（同日取後者）
    dedup = {}
    for x in out:
        dedup[x["trade_date"]] = x
    return list(dedup.values())


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", help="只抓某一 code（two/wtx&/vixtwn/stwn&）")
    args = ap.parse_args()
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    targets = [x for x in INSTR if (not args.code or x[0] == args.code)]
    if not targets:
        print(f"[error] 未知 code：{args.code}"); sys.exit(1)

    ws.PROFILE_DIR.mkdir(exist_ok=True)

    async def _launch(p):
        # profile 被前一支腳本(market_indicators)或殘留 Chrome 佔住時會啟動失敗；
        # 清掉 Playwright 殘留的 Singleton 鎖檔後重試一次（不動使用者正常 Chrome）。
        for attempt in range(2):
            try:
                return await p.chromium.launch_persistent_context(
                    str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
                    channel="chrome", args=["--disable-blink-features=AutomationControlled"],
                    ignore_default_args=["--enable-automation", "--no-sandbox"])
            except Exception as e:                        # noqa: BLE001
                if attempt == 1:
                    raise
                print(f"[launch] 失敗，清鎖後重試：{str(e)[:60]}")
                for lk in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
                    try:
                        (ws.PROFILE_DIR / lk).unlink()
                    except OSError:
                        pass
                await asyncio.sleep(3)

    async with async_playwright() as p:
        ctx = await _launch(p)
        await ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        ok = 0
        for code, url in targets:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                hu = await _hist_url(page)
                if not hu:
                    print(f"[{code}] 找不到 historical 請求，略過"); continue
                raw = await _fetch_rows(page, hu)
                rows = _to_rows(code, raw)
                if len(rows) < 100:
                    print(f"[{code}] 只拿到 {len(rows)} 筆(<100)，疑似異常，略過不寫"); continue
                st = _upsert(env, rows)
                lo = min(r["trade_date"] for r in rows); hi = max(r["trade_date"] for r in rows)
                print(f"[{code}] {len(rows)} 筆 {lo}～{hi} upsert status={st}")
                ok += 1
            except Exception as e:                        # noqa: BLE001
                print(f"[{code}] 失敗：{str(e)[:120]}")
        await ctx.close()
    print(f"完成 {ok}/{len(targets)}")
    return 0 if ok == len(targets) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
