"""
options_market.py — 首頁 §6 臺指選擇權三大法人留倉(照合夥人,TAIFEX 官方)。
  來源 www.taifex.com.tw /cht/3/callsAndPutsDate(三大法人-選擇權買賣權分計 HTML)。
  取 臺指選擇權 外資 / 自營商 × 買權(CALL)/賣權(PUT):
    留倉淨口 = OpenInterest(Net)   欄index 10
    留倉淨額 = ContractValueofOpenInterest(Net)(仟元) 欄index 11
    當日淨交易 = TradingVolume(Net) 欄index 4
→ Supabase options_daily(trade_date PK):外資/自營 × call/put 的 oi/val/vol。
用法：python scripts/options_market.py
"""
import ssl, sys, json, re, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_HDR = {"User-Agent": "Mozilla/5.0 (compatible; SWS/1.0)"}


def _plain(s):
    return re.sub(r"<[^>]+>", "", s).replace("\xa0", " ").strip()


def _num(v):
    v = v.replace(",", "").replace("▲", "").replace("△", "").replace("▼", "-").replace("▽", "-")
    v = re.sub(r"[^0-9.\-]", "", v)
    try:
        return float(v)
    except Exception:
        return None


def _rows(html):
    out = []
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", html, re.I):
        cells = [_plain(c) for c in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", tr, re.I)]
        if cells:
            out.append(cells)
    return out


def fetch_options():
    tw = datetime.now(timezone(timedelta(hours=8)))
    for off in range(0, 8):
        d = tw - timedelta(days=off)
        y, m, dd = d.strftime("%Y"), d.strftime("%m"), d.strftime("%d")
        url = "https://www.taifex.com.tw/cht/3/callsAndPutsDate" if off == 0 else \
              f"https://www.taifex.com.tw/cht/3/callsAndPutsDate?queryDate={y}%2F{m}%2F{dd}"
        try:
            html = urllib.request.urlopen(urllib.request.Request(url, headers=_HDR), timeout=30, context=_CTX).read().decode("utf-8", "replace")
        except Exception:
            continue
        mt = re.search(r"日期\s*[:：]?\s*(\d{4})/(\d{2})/(\d{2})", _plain(html))
        iso = f"{mt.group(1)}-{mt.group(2)}-{mt.group(3)}" if mt else None
        product = ""; cp = None; res = {}
        for cells in _rows(html):
            j = " ".join(cells)
            if re.match(r"^\d+$", cells[0] or "") and len(cells) > 1:
                product = cells[1]
            if "買權" in j:
                cp = "call"
            if "賣權" in j:
                cp = "put"
            ii = next((i for i, x in enumerate(cells) if x == "自營商" or x == "投信" or "外資" in x), -1)
            if ii < 0 or not product or not cp:
                continue
            if "臺指選擇權" not in product and "台指選擇權" not in product:
                continue
            who = "foreign" if "外資" in cells[ii] else ("dealer" if cells[ii] == "自營商" else None)
            if not who:
                continue
            vals = [_num(x) for x in cells[ii + 1:] if x.strip() != ""]
            vals = [v for v in vals if v is not None]
            if len(vals) < 12:
                continue
            res[f"{who}_{cp}_vol"] = int(vals[4])
            res[f"{who}_{cp}_oi"] = int(vals[10])
            res[f"{who}_{cp}_val"] = int(vals[11])  # 仟元
        if res and iso:
            res["trade_date"] = iso
            return res
    return None


def _upsert(env, row):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/options_daily?on_conflict=trade_date"
    req = urllib.request.Request(url, data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    row = fetch_options()
    if not row:
        print("[error] 選擇權三大法人抓取失敗"); return
    print(json.dumps(row, ensure_ascii=False))
    print(f"已 upsert options_daily (status {_upsert(env, row)})")


if __name__ == "__main__":
    main()
