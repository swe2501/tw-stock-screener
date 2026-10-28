"""
sgx_intraday.py - 首頁富台指卡片「今日走勢」小圖（2026-10-28）

富台指（SGX FTSE Taiwan，玩股網代號 stwn&）沒有免費官方分時源。
玩股網有一分鐘線端點，但只保留「目前這個交易日」（14:00 起換成下一個交易日的夜盤），
前一天的資料事後抓不回來，所以必須在當天日盤收盤（13:45）後、14:00 換日前抓。

  端點：/global/stwn&/historical-realtimeprice-pricemin1-tradedate?tradeDate=<當日 00:00 台北時間毫秒>
  回傳：{"tradeDate": ms, "data": [{"time": ms, "close": 數值}, ...]}（含前一晚 14:00 起的夜盤）
  只取當日日盤 08:45–13:45，5 分鐘最後一筆 → page_cache mini_SGX（格式同 mini_TXF）

由盤中排程 intraday_push.py 在 13:48、13:56 各呼叫一次（第二次覆寫第一次，補齊最後幾分鐘）。
用法：python scripts/sgx_intraday.py [--dry]
"""
import asyncio
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402
import home_intraday as hi  # noqa: E402
import wantgoo_scraper as ws  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

ENDPOINT = "/global/stwn&/historical-realtimeprice-pricemin1-tradedate?tradeDate={ms}"
SOURCE = "玩股網富台指一分鐘線（日盤 08:45–13:45）"


async def _minute_points(d):
    """回 [(epoch秒, price)]，只含 d 當日日盤 08:45–13:45。"""
    start, end = hi._epoch(d, "084500"), hi._epoch(d, "134500")
    midnight = int(dt.datetime(d.year, d.month, d.day, tzinfo=hi.TZ).timestamp()) * 1000
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            str(ws.PROFILE_DIR), headless=False, viewport={"width": 1280, "height": 900},
            channel="chrome", args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"])
        try:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.goto("https://www.wantgoo.com/global/stwn&", wait_until="domcontentloaded", timeout=60000)
            # 前一交易日收盤＝小圖紅綠分界；all-quote-info 在 14:00 前的 tradeDate＝當日，previousClose 即昨收
            prev = None
            q = await page.evaluate(
                "()=>fetch('/global/all-quote-info',{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)")
            for x in q or []:
                if isinstance(x, dict) and str(x.get("id", "")).lower() == "stwn&" and x.get("tradeDate") == midnight:
                    prev = x.get("previousClose")
            pts = {}
            # 14:00 前「目前交易日」＝當日；保險起見也試下一日（萬一已換日，日盤資料也可能還在）
            for ms in (midnight, midnight + 86400000):
                d_json = await page.evaluate(
                    "(u)=>fetch(u,{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.ok?r.json():null).catch(()=>null)",
                    ENDPOINT.format(ms=ms))
                for row in (d_json or {}).get("data") or []:
                    try:
                        t, c = int(row["time"]) // 1000, float(row["close"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    if start <= t <= end and c > 0:
                        pts[t] = c
            return sorted(pts.items()), prev
        finally:
            await ctx.close()


def main():
    dry = "--dry" in sys.argv
    d = dt.datetime.now(hi.TZ).date()
    pts, prev = asyncio.run(_minute_points(d))
    data = hi._bucket5(pts)
    if len(data) < 2:
        print(f"[sgx_intraday] {d} 日盤分時不足（{len(pts)} 筆一分鐘線），不寫入")
        return 1
    print(f"[sgx_intraday] {d} {len(pts)} 筆一分鐘線 → {len(data)} 點 昨收 {prev} "
          f"{data[0]['close']}→{data[-1]['close']}（最後 {dt.datetime.fromtimestamp(data[-1]['time'], hi.TZ):%H:%M}）")
    if dry:
        return 0
    # 同 home_intraday.push，多存 prev（卡片上的 futai_prev 是晚上抓的夜盤前收＝當日日盤收盤，不能當日盤小圖的分界）
    env = bs._load_env()
    row = {"kind": "mini_SGX", "trade_date": d.isoformat(),
           "payload": {"date": d.isoformat(), "source": SOURCE, "prev": prev, "data": data},
           "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    bs._sb(env, "/page_cache", method="DELETE", params=[("kind", "eq.mini_SGX")])
    st, _ = bs._sb(env, "/page_cache", method="POST", body=[row])
    print(f"[sgx_intraday] mini_SGX 寫入 status={st}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
