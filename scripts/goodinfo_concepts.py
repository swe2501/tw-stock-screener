"""
goodinfo_concepts.py — 爬 Goodinfo「概念股」全部題材的成分股 → scripts/goodinfo_concepts.json。

Goodinfo 是台股最完整的「概念股/題材」資料庫（CoWoS 級的細題材少，但廣度大：蘋果概念、電動車、
低軌衛星、第三方支付、太陽能…共約 95 個細題材 × 32 大類）。Goodinfo 擋雲端 IP 與純 request（403）、
且有「請稍候」JS 挑戰頁，故須在本機用真 Chrome（Playwright）跑；題材一季才變，排每週一次即可。

流程：真 Chrome 開 Goodinfo（過挑戰）→ 抓 StockList_ProtoSync.js 解出全部概念細類 →
逐題材導 StockList.asp?MARKET_CAT=概念股&INDUSTRY_CAT=<細類> 擷取成分股代號 →
輸出 {code: [題材名,…]} 到 goodinfo_concepts.json（給 themes_push.py 併入 stock_themes）。

用法：python scripts/goodinfo_concepts.py            # 全部題材
      python scripts/goodinfo_concepts.py --limit 3  # 只跑前 3 個（冒煙測試）
"""
import asyncio, sys, re, json, argparse, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts" / "goodinfo_concepts.json"
# 本機 Goodinfo 專用 profile（存挑戰 cookie，之後較快）
PROFILE = str(ROOT / "scripts" / ".goodinfo_profile")
BASE = "https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E6%A6%82%E5%BF%B5%E8%82%A1&INDUSTRY_CAT=%E6%A9%9F%E5%99%A8%E4%BA%BA"
PROTO = "https://goodinfo.tw/tw/StockList_ProtoSync.js"

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def _parse_concepts(proto_js: str):
    """從 ProtoSync.js 的 oStockList['概念股'] 解出所有概念細類 (raw '@@大類@@細類', 顯示名=細類)。"""
    m = re.search(r"oStockList\['概念股'\]\s*=\s*'", proto_js)
    if not m:
        return []
    i = m.end(); buf = []
    while i < len(proto_js):
        c = proto_js[i]
        if c == "\\":
            buf.append(proto_js[i:i+2]); i += 2; continue
        if c == "'":
            break
        buf.append(c); i += 1
    block = "".join(buf).replace("\\'", "'").replace("\\/", "/")
    out, seen = [], set()
    for raw in re.findall(r"<option[^>]*value='([^']*)'", block):
        val = urllib.parse.unquote(raw).strip()
        if not val or "ETF成份股" in val:        # ETF 成份股非題材，排除
            continue
        sub = [p for p in val.split("@@") if p][-1] if val.startswith("@@") else val
        if val in seen:
            continue
        seen.add(val)
        out.append({"raw": val, "name": sub.replace("+", " ").strip()})   # Goodinfo 的 '+' 代表空格，顯示名還原
    return out


async def _challenge_goto(pg, url, tries=5):
    for _ in range(tries):
        try:
            await pg.goto(url, wait_until="domcontentloaded", timeout=45000)
        except Exception:
            pass
        await asyncio.sleep(6)
        t = await pg.title()
        if "請稍候" not in t and "稍候" not in t and "Loading" not in t:
            return True
        await asyncio.sleep(5)
    return False


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--names", help="只跑名稱(清理後)含這些字的題材，逗號分隔；冒煙測試用")
    ap.add_argument("--fill", action="store_true", help="只補 raw 含 '+' 的題材並合併進既有 json（修 + 編碼漏抓）")
    args = ap.parse_args()
    from playwright.async_api import async_playwright

    code_themes = {}   # code -> [題材名]
    if args.fill and OUT.exists():        # 補漏模式：從既有 json 起算，只補 + 題材
        try:
            code_themes = {str(k): list(v) for k, v in json.loads(OUT.read_text(encoding="utf-8")).items()}
            print(f"[補漏] 載入既有 {len(code_themes)} 檔")
        except Exception:
            code_themes = {}
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=PROFILE, headless=False, viewport={"width": 1400, "height": 900}, channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation", "--no-sandbox"])
        await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await _challenge_goto(pg, "https://goodinfo.tw/tw/index.asp")   # 首頁暖身過挑戰、建立 cookie
        if not await _challenge_goto(pg, BASE):
            print("[error] 無法通過 Goodinfo 挑戰頁"); await ctx.close(); return 1
        proto = await pg.evaluate("(x)=>fetch(x).then(r=>r.text())", PROTO)
        concepts = _parse_concepts(proto)
        if args.fill:
            concepts = [c for c in concepts if "+" in c["raw"]]      # 只補用 + 當空格的題材
        if args.names:
            want = [s.strip() for s in args.names.split(",") if s.strip()]
            concepts = [c for c in concepts if any(w in c["name"] for w in want)]
        if args.limit:
            concepts = concepts[:args.limit]
        print(f"概念細類 {len(concepts)} 個")

        ok = miss = 0
        for n, c in enumerate(concepts, 1):
            # Goodinfo 的 INDUSTRY_CAT 以 '+' 當空格（如 WiFi+6），quote 須保留 '+' 不可轉 %2B，否則查無
            url = ("https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=" + urllib.parse.quote("概念股")
                   + "&INDUSTRY_CAT=" + urllib.parse.quote(c["raw"], safe="+"))
            got = await _challenge_goto(pg, url, tries=3)
            # 只取成分股主表 #tblStockList 內的代號；頁面側欄/熱門(如 2330)不算成分，避免污染
            ids = await pg.evaluate("""()=>{var t=document.querySelector('#tblStockList');if(!t)return [];var s=new Set();t.querySelectorAll('a[href*="STOCK_ID="]').forEach(function(a){var m=(a.getAttribute('href')||'').match(/STOCK_ID=(\\d{4})/);if(m)s.add(m[1]);});return Array.from(s);}""") if got else []
            ids = sorted(i for i in (ids or []) if not str(i).startswith("00"))   # 排除 ETF
            if ids:
                ok += 1
                for code in ids:
                    code_themes.setdefault(code, [])
                    if c["name"] not in code_themes[code]:
                        code_themes[code].append(c["name"])
            else:
                miss += 1
            print(f"  [{n}/{len(concepts)}] {c['name']}: {len(ids)} 檔")
            await asyncio.sleep(3.5)       # 友善節流，避免被封
        await ctx.close()

    if args.names:          # 冒煙測試模式：不覆寫正式 json
        print(f"[測試] 題材命中 {ok}、空 {miss}；樣本 2454={code_themes.get('2454')}")
        return 0
    OUT.write_text(json.dumps(code_themes, ensure_ascii=False), encoding="utf-8")
    print(f"完成：{len(code_themes)} 檔有題材；題材命中 {ok}、空 {miss}。→ {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
