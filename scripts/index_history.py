"""
index_history.py — 首頁指標卡「2 年走勢線圖」資料源。
用既有玩股網 Playwright profile（過 Cloudflare）抓以下指標各約 2 年每日 OHLC，存 Supabase index_history：
  code   名稱            頁面
  two    櫃買指數(OTC)    /index/two
  wtx&   台指期(日盤)     /index/wtx&
  vixtwn 台指VIX          /index/vixtwn
  stwn&  富台指(SGX)      /global/stwn&
做法：
  • two / vixtwn / stwn&：導到各商品頁面，讀頁面自己打出的 historical-daily-candlesticks
    ?...top=490（≈2 年）backfill；玩股網 historical 端點會落後約 6 天，所以再加抓
    daily-candlesticks?after=<近 30 天> 補最新幾天，兩者合併（同日後者勝）。
  • wtx&（台指期日盤）：玩股網 wtx& 頁面每次都因導頁 race 失敗，且日盤要對齊期交所官方價；
    改走期交所 futDataDown（同日可得、Vercel 外也可重跑），取近月 TX「一般（日盤）」OHLC。
    歷史 2 年已在表內，每晚只補最新約 15 天（與既有玩股網歷史同尺度，已實測對齊）。
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
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
import wantgoo_scraper as ws
import broker_signals as bs
import chart as _chart  # 重用已驗證的期交所 cookie 邏輯（_taifex_cookie_str）
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


def _taifex_tx_ohlc(days=15):
    """期交所 futDataDown：近月 TX「一般（日盤）」最近 days 天 OHLC，回傳 index_history 列。
    近月＝每日成交量最大的單月份合約（與 api/chart fetch_tx_sessions 同口徑，已實測對齊玩股網 wtx&）。"""
    cookie = _chart._taifex_cookie_str()
    end = datetime.now(TZ)
    start = end - timedelta(days=days)
    post_data = urllib.parse.urlencode({
        "down_type": "1", "commodity_id": "TX", "commodity_id2": "",
        "queryStartDate": start.strftime("%Y/%m/%d"), "queryEndDate": end.strftime("%Y/%m/%d"),
    }).encode()
    req = urllib.request.Request(
        "https://www.taifex.com.tw/cht/3/futDataDown", data=post_data,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                 "Referer": "https://www.taifex.com.tw/cht/3/dlFutDailyMarketView",
                 "Origin": "https://www.taifex.com.tw",
                 "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookie})
    with urllib.request.urlopen(req, timeout=12) as r:
        raw = r.read()
    content = None
    for enc in ("utf-8-sig", "utf-8", "ms950", "big5"):
        try:
            content = raw.decode(enc); break
        except Exception:
            pass
    if not content:
        return []
    # (date)->(vol, open, high, low, close)；挑成交量最大＝近月
    best = {}
    for line in content.split("\n"):
        if not line or not line[0].isdigit():
            continue
        c = line.split(",")
        if len(c) < 18 or c[1].strip() != "TX" or c[17].strip() != "一般":
            continue
        month = c[2].strip()
        if not re.fullmatch(r"\d{6}", month):  # 排除價差（含"/"）
            continue
        date = c[0].strip().replace("/", "-")
        try:
            o = float(c[3].replace(",", "")); h = float(c[4].replace(",", ""))
            lo = float(c[5].replace(",", "")); cl = float(c[6].replace(",", ""))
            vol = int(c[9].replace(",", "").strip() or "0")
        except Exception:
            continue
        if cl <= 0 or month < date[:4] + date[5:7]:  # 排除已到期月
            continue
        if date not in best or vol > best[date][0]:
            best[date] = (vol, o, h, lo, cl)
    return [{"code": "wtx&", "trade_date": d, "open": o, "high": h, "low": lo, "close": cl}
            for d, (v, o, h, lo, cl) in best.items()]


async def _recent_url(page):
    """讀頁面自己打出的 daily-candlesticks?after=<近幾天>（非 historical-）補最新資料。
    該端點只接受靠近最新交易日的 after 值（自行回推 30 天會被拒回 None），故原樣沿用頁面的值。"""
    for _ in range(14):
        urls = await page.evaluate(
            "()=>performance.getEntriesByType('resource').map(e=>e.name)"
            ".filter(n=>/[^-]daily-candlesticks\\?after=/.test(n))")
        if urls:
            def after(u):
                m = re.search(r"after=(\d+)", u)
                return int(m.group(1)) if m else 0
            return max(urls, key=after)  # after 最大＝最靠近今天
        await asyncio.sleep(0.5)
    return None


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

    # wtx&（台指期日盤）走期交所、不需瀏覽器；先處理，再視需要開 Playwright 給其餘三檔。
    ok = 0
    wantgoo_targets = []
    for code, url in targets:
        if code == "wtx&":
            try:
                rows = _taifex_tx_ohlc(days=15)
                if len(rows) < 3:
                    print(f"[wtx&] 期交所只拿到 {len(rows)} 筆(<3)，略過不寫"); continue
                st = _upsert(env, rows)
                lo = min(r["trade_date"] for r in rows); hi = max(r["trade_date"] for r in rows)
                print(f"[wtx&] 期交所 {len(rows)} 筆 {lo}～{hi} upsert status={st}")
                ok += 1
            except Exception as e:                        # noqa: BLE001
                print(f"[wtx&] 期交所失敗：{str(e)[:120]}")
        else:
            wantgoo_targets.append((code, url))

    if not wantgoo_targets:
        print(f"完成 {ok}/{len(targets)}")
        return 0 if ok == len(targets) else 1

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
        for code, url in wantgoo_targets:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                hu = await _hist_url(page)
                if not hu:
                    print(f"[{code}] 找不到 historical 請求，略過"); continue
                raw = await _fetch_rows(page, hu) or []
                # 補最新幾天：historical 端點落後約 6 天，daily-candlesticks?after= 有當日
                ru = await _recent_url(page)
                recent = (await _fetch_rows(page, ru)) if ru else None
                rows = _to_rows(code, raw + (recent or []))  # recent 在後 → 同日勝出
                if len(rows) < 100:
                    print(f"[{code}] 只拿到 {len(rows)} 筆(<100)，疑似異常，略過不寫"); continue
                st = _upsert(env, rows)
                lo = min(r["trade_date"] for r in rows); hi = max(r["trade_date"] for r in rows)
                rn = len(recent or [])
                print(f"[{code}] {len(rows)} 筆(含最新補 {rn}) {lo}～{hi} upsert status={st}")
                ok += 1
            except Exception as e:                        # noqa: BLE001
                print(f"[{code}] 失敗：{str(e)[:120]}")
        await ctx.close()
    print(f"完成 {ok}/{len(targets)}")
    return 0 if ok == len(targets) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
