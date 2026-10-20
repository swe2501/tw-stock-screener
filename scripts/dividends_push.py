"""
dividends_push.py — 逐檔抓玩股網「歷年股利」→ Supabase stock_dividends（企業價值投資法 357 用）。

資料源：wantgoo /stock/{code}/dividend-policy/ex-dividend-data（JSON，含逐年 cashDividend 現金股利、
stockDividend 股票股利、year 除息年、dividendYear 股利所屬年）。沿用既有玩股網登入 profile
（wantgoo_scraper.PROFILE_DIR，過 Cloudflare）；玩股網封鎖雲端 IP，故此腳本須在本機排程跑。

做法：開一次持久化瀏覽器 → 導到任一玩股網頁建立登入 context → 迴圈對每檔 fetch -data（同網域、帶 cookie）
→ 依 (code, ex_year) 彙整現金/股票股利 upsert（on_conflict 合併，冪等）。同一除息年多次配息相加。

表結構（先在 Supabase SQL editor 建好）：
  create table stock_dividends(
    code text, ex_year int, dividend_year int,
    cash_dividend numeric, stock_dividend numeric,
    primary key (code, ex_year));
  alter table stock_dividends enable row level security;
  create policy anon_read_stock_dividends on stock_dividends for select using (true);

用法：python scripts/dividends_push.py            # 全市場
      python scripts/dividends_push.py --code 6274  # 單檔測試
      python scripts/dividends_push.py --limit 50   # 前 50 檔（冒煙測試）
"""
import asyncio
import sys
import json
import argparse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws
import broker_signals as bs
from playwright.async_api import async_playwright

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DATA_URL = "https://www.wantgoo.com/stock/{code}/dividend-policy/ex-dividend-data"


def _load_codes():
    """上市＋上櫃 4 碼普通股代號清單（優先 tw_listed_codes.json，退 all_stocks.txt）。"""
    here = Path(__file__).resolve().parent
    p = here / "tw_listed_codes.json"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        codes = list(d.keys()) if isinstance(d, dict) else [str(x) for x in d]
    else:
        codes = []
        t = here / "all_stocks.txt"
        if t.exists():
            codes = [ln.strip().split()[0] for ln in t.read_text(encoding="utf-8").splitlines() if ln.strip()]
    # 只留 4 碼純數字（普通股；排除 ETF 00xx、權證等）
    return [c for c in codes if c.isdigit() and len(c) == 4 and not c.startswith("00")]


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/stock_dividends?on_conflict=code,ex_year"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def _to_rows(code, raw):
    """ex-dividend-data JSON → 依除息年彙整現金/股票股利列。"""
    agg = {}   # ex_year -> {dividend_year, cash, stock}
    for d in raw or []:
        y = d.get("year")
        if y is None:
            continue
        a = agg.setdefault(int(y), {"dividend_year": d.get("dividendYear"), "cash": 0.0, "stock": 0.0})
        a["cash"] += float(d.get("cashDividend") or 0)
        a["stock"] += float(d.get("stockDividend") or 0)
        if d.get("dividendYear") is not None:
            a["dividend_year"] = d.get("dividendYear")
    return [{"code": code, "ex_year": y, "dividend_year": v["dividend_year"],
             "cash_dividend": round(v["cash"], 4), "stock_dividend": round(v["stock"], 4)}
            for y, v in agg.items()]


async def _fetch(page, code):
    """逐檔先導該股股利頁(建立 referer/節流較穩)再 fetch -data；回 list 或 None。重試含導頁 2 輪。"""
    for attempt in range(2):
        try:
            await page.goto(f"https://www.wantgoo.com/stock/{code}/dividend-policy/ex-dividend",
                            wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(1.2)
            res = await page.evaluate(
                "(c)=>fetch('https://www.wantgoo.com/stock/'+c+'/dividend-policy/ex-dividend-data',"
                "{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)", code)
            if isinstance(res, list):
                return res
        except Exception:
            pass
        await asyncio.sleep(1.5)
    return None


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", help="單檔測試")
    ap.add_argument("--limit", type=int, help="只跑前 N 檔")
    args = ap.parse_args()
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    codes = [args.code] if args.code else _load_codes()
    if args.limit:
        codes = codes[:args.limit]
    if not codes:
        print("[error] 無代號清單"); sys.exit(1)
    print(f"共 {len(codes)} 檔")

    ws.PROFILE_DIR.mkdir(exist_ok=True)
    ok, miss, buf = 0, 0, []
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
            channel="chrome", args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"])
        await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        # 導到任一玩股網頁建立登入 context
        await page.goto("https://www.wantgoo.com/stock/2330/dividend-policy/ex-dividend",
                        wait_until="domcontentloaded", timeout=45000)
        await asyncio.sleep(2)
        for i, code in enumerate(codes, 1):
            raw = await _fetch(page, code)
            rows = _to_rows(code, raw)
            if rows:
                buf.extend(rows); ok += 1
            else:
                miss += 1
            if len(buf) >= 400:
                st = _upsert(env, buf); print(f"  [{i}/{len(codes)}] upsert {len(buf)} 列 status={st}"); buf = []
            await asyncio.sleep(0.25)   # 友善節流
        if buf:
            st = _upsert(env, buf); print(f"  尾批 upsert {len(buf)} 列 status={st}")
        await ctx.close()
    print(f"完成：有股利 {ok} 檔、無資料 {miss} 檔")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
