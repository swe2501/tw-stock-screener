"""
大盤融資維持率（含ETF／扣除ETF）歷史序列 — 抓 Wantgoo 匿名 JSON API，上傳 Supabase margin_maintenance。
供網頁 header 徽章（最新·含ETF）與彈窗歷史線圖（含／扣ETF）使用。純 HTTP，不需瀏覽器。

資料源（marginRatio=維持率、lendingBalance÷100000=融資餘額億、borrowingBalance=融券餘額張）：
  含ETF：0000A/…historical-lending-balance-long-term（維持率＋融資餘額，~5年）
         0000/…historical-borrowing-balance-long-term（融券餘額）
  扣ETF：-ETFA/…historical-lending-balance（維持率＋融資餘額，~2年）
         -ETF/…historical-borrowing-balance（融券餘額）

用法：python scripts/margin_ratio.py
"""
import asyncio
import json
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_B = "https://www.wantgoo.com/stock"
SRC = {
    False: {"fin": f"{_B}/0000A/margin-trading/historical-lending-balance-long-term",
            "short": f"{_B}/0000/margin-trading/historical-borrowing-balance-long-term"},
    True:  {"fin": f"{_B}/-ETFA/margin-trading/historical-lending-balance",
            "short": f"{_B}/-ETF/margin-trading/historical-borrowing-balance"},
}


def _get(url):
    time.sleep(1.5)  # wantgoo 連續呼叫易被限流 → 每次呼叫間隔
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0", "Accept": "application/json",
        "Referer": "https://www.wantgoo.com/stock/margin-trading/market-price/taiex"})
    return json.loads(urllib.request.urlopen(req, timeout=45, context=_CTX).read())


def _taiex(latest_date):
    """大盤 TAIEX 日 K（OHLC）：Yahoo ^TWII（玩股網 investrue/0000 端點會落後一天、抓不到最新交易日）。
    Yahoo 收盤與玩股網一致（同為 TAIEX）。濾掉週六/日（避免非交易日的假 K），回 [(date,o,h,l,c,v),...] 舊→新。"""
    tw = timezone(timedelta(hours=8))
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?range=5y&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=45, context=_CTX).read())
    r = d["chart"]["result"][0]
    ts = r.get("timestamp") or []
    q = (r["indicators"]["quote"] or [{}])[0]
    out = []
    for i, t in enumerate(ts):
        c = q["close"][i]
        if c is None:
            continue
        dobj = datetime.fromtimestamp(t, tw)
        if dobj.weekday() >= 5:          # 5=六 6=日 → 非交易日假 K，剔除
            continue
        dd = dobj.strftime("%Y-%m-%d")
        o, h, l, v = q["open"][i], q["high"][i], q["low"][i], q["volume"][i]
        out.append((dd, o if o is not None else c, h if h is not None else c,
                    l if l is not None else c, c, int(v or 0)))
    # Yahoo ^TWII 偶有缺日（例：2026-09-22 整天沒有）→ 用證交所官方 MI_5MINS_HIST 補近 3 個月（官方優先覆蓋 OHLC）2026-09-28
    try:
        by = {x[0]: x for x in out}
        now = datetime.now(tw)
        for k in range(3):
            y, m = now.year, now.month - k
            while m < 1:
                m += 12; y -= 1
            u = f"https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date={y}{m:02d}01&response=json"
            j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}),
                                                  timeout=30, context=_CTX).read())
            for row in (j.get("data") or []):
                ry, rm, rd = row[0].split("/")
                dd = f"{int(ry) + 1911}-{rm}-{rd}"
                o, h, l, c = (float(str(x).replace(",", "")) for x in row[1:5])
                by[dd] = (dd, o, h, l, c, by.get(dd, (0, 0, 0, 0, 0, 0))[5])
            time.sleep(1)
        out = sorted(by.values(), key=lambda x: x[0])
    except Exception as e:
        print(f"[warn] 證交所加權指數補缺失敗：{str(e)[:60]}")
    return out


_TW = timezone(timedelta(hours=8))          # wantgoo 時間戳為「台北午夜」(UTC+8)，用 UTC 取 date 會早一天


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, _TW).date().isoformat()


def _variant(exclude_etf):
    src = SRC[exclude_etf]
    fin = _get(src["fin"])
    short = {_iso(r["date"]): r.get("borrowingBalance") for r in _get(src["short"])}
    rows = []
    for r in fin:
        d = _iso(r["date"])
        mr, lb = r.get("marginRatio"), r.get("lendingBalance")
        rows.append({
            "trade_date": d, "exclude_etf": exclude_etf,
            "maintenance_ratio": round(mr * 100, 2) if mr else None,
            "margin_balance": round(lb / 100000, 2) if lb else None,
            "short_balance": short.get(d),
        })
    return rows


# 「歷史」JSON 端點慢一個交易日；「即時」端點(無 historical 前綴)有當日值但需登入 session。
# 沿用 wantgoo_scraper 的持久 profile（已登入）用 Playwright 開頁，於頁面 context 內 fetch 即可過。
# 關鍵：即時端點要先導到「對應的專頁」prime——含ETF 用 market-price、扣ETF 用 exclude-etf，
#       否則跨頁抓另一變體會被 wantgoo 擋（HTTP 400）。
_CUR_EPS = {
    False: {"page": "https://www.wantgoo.com/stock/margin-trading/market-price/taiex",
            "fin": "/stock/0000A/margin-trading/lending-balance",
            "short": "/stock/0000/margin-trading/borrowing-balance"},
    True:  {"page": "https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex",
            "fin": "/stock/-ETFA/margin-trading/lending-balance",
            "short": "/stock/-ETF/margin-trading/borrowing-balance"},
}


async def _fetch_current_via_browser():
    from playwright.async_api import async_playwright
    import wantgoo_scraper as ws          # 沿用已登入的持久 profile
    js = ("u => fetch(u, {headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'}})"
          ".then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))")
    result = {}
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR), headless=False, channel="chrome",
            viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"],
        )
        try:
            await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.goto("https://www.wantgoo.com/", wait_until="domcontentloaded", timeout=30000)

            async def _ev(u):
                for _ in range(3):
                    try:
                        return await page.evaluate(js, u)
                    except Exception:
                        await page.wait_for_timeout(1500)
                return None

            for ex, eps in _CUR_EPS.items():
                try:
                    await page.goto(eps["page"], wait_until="networkidle", timeout=45000)
                    await page.wait_for_timeout(2000)   # 等頁面建立 session（過早打即時端點會 HTTP 400）
                    result[ex] = {"fin": await _ev(eps["fin"]), "short": await _ev(eps["short"])}
                except Exception:
                    result[ex] = {"fin": None, "short": None}   # 該變體失敗略過，不拖垮另一個
        finally:
            await ctx.close()
    return result


def _merge_current(allrows):
    """把即時端點的『當日』併入 allrows（若比歷史最新日更新）。失敗則保留歷史（慢一天），不中斷。"""
    try:
        cur = asyncio.run(_fetch_current_via_browser())
    except Exception as e:
        print(f"  [warn] 當日即時補抓失敗，保留歷史（慢一天）：{type(e).__name__} {e}")
        return
    for ex in (False, True):
        c = cur.get(ex) or {}
        fin, short = c.get("fin") or {}, c.get("short") or {}
        ms = fin.get("date")
        if ms is None:
            continue
        d = _iso(ms)
        hist_max = max((r["trade_date"] for r in allrows if r["exclude_etf"] == ex), default="")
        if d <= hist_max:
            continue                       # 歷史已追上，不重複
        mr, lb = fin.get("marginRatio"), fin.get("lendingBalance")
        allrows.append({
            "trade_date": d, "exclude_etf": ex,
            "maintenance_ratio": round(mr * 100, 2) if mr else None,
            "margin_balance": round(lb / 100000, 2) if lb else None,
            "short_balance": short.get("borrowingBalance"),
        })
        print(f"  補當日 {'扣ETF' if ex else '含ETF'} {d} 維持率 {round(mr * 100, 2) if mr else '–'}%")


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    # ── 先抓 TAIEX（排最前，避免被前面 margin 呼叫累積觸發限流）──
    # before 邊界用 Supabase 既有最新日推算（免額外打 wantgoo）；首次無資料則用今天
    latest_hint = None
    try:
        _, prev = bs._sb(env, "/margin_maintenance",
                         params=[("select", "trade_date"), ("order", "trade_date.desc"), ("limit", "1")])
        if isinstance(prev, list) and prev:
            latest_hint = prev[0]["trade_date"]
    except Exception:
        pass
    candles = _taiex(latest_hint)
    if candles:
        trows = [{"trade_date": d, "open": o, "high": h, "low": lo, "close": c, "volume": v}
                 for d, o, h, lo, c, v in candles]
        print(f"TAIEX K：{len(trows)} 天，最新 {max(t['trade_date'] for t in trows)}")
        bs._sb(env, "/taiex_daily", method="DELETE", params=[("trade_date", "neq.1900-01-01")])
        stk = None
        for i in range(0, len(trows), 500):
            stk, _ = bs._sb(env, "/taiex_daily", method="POST", body=trows[i:i + 500])
        print(f"上傳 taiex_daily={stk}（共 {len(trows)} 列）")
    else:
        print("[warn] TAIEX K 抓取失敗，略過（保留既有資料）")

    # ── 再抓融資維持率兩變體 ──
    allrows = []
    for ex in (False, True):
        rows = _variant(ex)
        latest = max(rows, key=lambda r: r["trade_date"])
        print(f"{'扣除ETF' if ex else '含ETF'}：{len(rows)} 天，最新 {latest['trade_date']} "
              f"維持率 {latest['maintenance_ratio']}%、融資餘額 {latest['margin_balance']} 億")
        allrows += rows

    _merge_current(allrows)   # 補當日（歷史端點慢一個交易日）

    bs._sb(env, "/margin_maintenance", method="DELETE", params=[("trade_date", "neq.1900-01-01")])
    st = None
    for i in range(0, len(allrows), 500):
        st, _ = bs._sb(env, "/margin_maintenance", method="POST", body=allrows[i:i + 500])
    print(f"上傳 margin_maintenance={st}（共 {len(allrows)} 列）")


if __name__ == "__main__":
    main()
