"""
futures_market.py — 首頁 §5 台股期貨未平倉與散戶多空(TAIFEX 官方,非玩股網)。
  外資/投信/自營 臺股期貨未平倉淨額: TAIFEX /cht/3/futContractsDate(三大法人-區分各期貨契約 HTML)
  小台/微台散戶多空比: 散戶 = 主要契約全市場未平倉 − 三大法人;多空比 = (散戶多−空)/全市場未平倉
      全市場未平倉: TAIFEX openapi DailyMarketReportFut(Contract=MTX/TMF 各月加總,一般盤)
      三大法人未平倉多/空: futContractsDate 內「小型臺指期貨 / 微型臺指期貨」外資+投信+自營 OI(Long/Short)
→ Supabase futures_daily(trade_date PK)。用法：python scripts/futures_market.py
"""
import ssl, sys, json, re, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _plain(s):
    return re.sub(r"<[^>]+>", "", s).replace("\xa0", " ").strip()


def _num(v):
    v = str(v).replace(",", "").replace("▲", "").replace("△", "").replace("▼", "-").replace("▽", "-")
    v = re.sub(r"[^0-9.\-]", "", v)
    try:
        return float(v)
    except Exception:
        return None


def _fut_inst_html():
    """TAIFEX 三大法人-各期貨契約 HTML(往回找到有資料的日)。回 (iso, rows[cells])。"""
    tw = datetime.now(timezone(timedelta(hours=8)))
    for off in range(0, 8):
        d = tw - timedelta(days=off)
        y, m, dd = d.strftime("%Y"), d.strftime("%m"), d.strftime("%d")
        url = "https://www.taifex.com.tw/cht/3/futContractsDate" if off == 0 else \
              f"https://www.taifex.com.tw/cht/3/futContractsDate?queryDate={y}%2F{m}%2F{dd}"
        try:
            html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30, context=_CTX).read().decode("utf-8", "replace")
        except Exception:
            continue
        mt = re.search(r"日期\s*[:：]?\s*(\d{4})/(\d{2})/(\d{2})", _plain(html))
        iso = f"{mt.group(1)}-{mt.group(2)}-{mt.group(3)}" if mt else None
        rows = [[_plain(c) for c in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", tr, re.I)]
                for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", html, re.I)]
        rows = [r for r in rows if r]
        if iso and rows:
            return iso, rows
    return None, None


def _parse_inst(rows):
    """回 {product: {item: {net,long,short}}}。product 依 numeric-first 列帶下來。"""
    out = {}; product = ""
    for cells in rows:
        if re.match(r"^\d+$", cells[0] or "") and len(cells) > 1:
            product = cells[1]
        ii = next((i for i, x in enumerate(cells) if x == "自營商" or x == "投信" or "外資" in x), -1)
        if ii < 0 or not product:
            continue
        vals = [_num(x) for x in cells[ii + 1:] if x.strip() != ""]
        vals = [v for v in vals if v is not None]
        if len(vals) < 12:
            continue
        item = "外資" if "外資" in cells[ii] else cells[ii]
        out.setdefault(product, {})[item] = {"long": vals[6], "short": vals[8], "net": vals[10]}
    return out


def _daily_oi():
    """各期貨契約全市場未平倉(一般盤各月加總)。回 (tot dict, date_iso)。"""
    d = json.loads(urllib.request.urlopen(urllib.request.Request("https://openapi.taifex.com.tw/v1/DailyMarketReportFut", headers=_HDR), timeout=30, context=_CTX).read())
    tot = {}; date_iso = None
    for r in d:
        if not isinstance(r, dict):
            continue
        if not date_iso:
            dd = str(r.get("Date") or "")
            if len(dd) == 8 and dd.isdigit():
                date_iso = f"{dd[:4]}-{dd[4:6]}-{dd[6:]}"
        if r.get("TradingSession") and r.get("TradingSession") not in ("一般", "Regular"):
            continue
        c = r.get("Contract"); oi = _num(r.get("OpenInterest"))
        if c and oi:
            tot[c] = tot.get(c, 0) + oi
    return tot, date_iso


def _prod_key(inst, *names):
    for p in inst:
        if any(n in p for n in names):
            return p
    return None


def fetch_all():
    iso, rows = _fut_inst_html()
    if not rows:
        return None
    inst = _parse_inst(rows)
    oi, oi_date = _daily_oi()
    # 交易日以 DailyMarketReportFut 的 Date 為準(HTML 頁面日期可能是表單預設今日、非資料日)
    out = {"trade_date": oi_date or iso}

    # 臺股期貨(大台)三大法人未平倉淨額
    tx = inst.get(_prod_key(inst, "臺股期貨", "台股期貨") or "", {})
    out["foreign_oi"] = int(tx.get("外資", {}).get("net")) if tx.get("外資") else None
    out["trust_oi"] = int(tx.get("投信", {}).get("net")) if tx.get("投信") else None
    out["dealer_oi"] = int(tx.get("自營商", {}).get("net")) if tx.get("自營商") else None

    # 小台/微台散戶多空(散戶 = 全市場OI − 三大法人)
    def retail(prod_names, contract):
        p = _prod_key(inst, *prod_names)
        total = oi.get(contract)
        if not p or not total:
            return None
        rowp = inst[p]
        il = sum((rowp.get(k, {}).get("long") or 0) for k in ("外資", "投信", "自營商"))
        ish = sum((rowp.get(k, {}).get("short") or 0) for k in ("外資", "投信", "自營商"))
        long_r = max(0, total - il); short_r = max(0, total - ish)
        ratio = (long_r - short_r) / total * 100 if total else None
        return int(long_r), int(short_r), (round(ratio, 2) if ratio is not None else None)

    mtx = retail(("小型臺指期貨", "小型臺指", "小臺指"), "MTX")
    if mtx:
        out["mtx_long"], out["mtx_short"], out["mtx_ls"] = mtx
    tmf = retail(("微型臺指期貨", "微型臺指"), "TMF")
    if tmf:
        out["tmf_long"], out["tmf_short"], out["tmf_ls"] = tmf
    return out


def _upsert(env, row):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/futures_daily?on_conflict=trade_date"
    req = urllib.request.Request(url, data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    row = fetch_all()
    if not row or not row.get("trade_date"):
        print("[error] TAIFEX 期貨抓取失敗"); return
    # 新鮮度防呆（同 option_sr）：來源沒比既有最新日新就不寫，等補跑那輪。fail-open。
    _lat = bs.latest_trade_date(env, "futures_daily")
    if _lat and row["trade_date"] <= _lat and "--force" not in sys.argv:
        print(f"[skip] futures_daily 已有 {_lat}，TAIFEX openapi 仍為 {row['trade_date']}（尚未更新）→ 不覆寫，等補跑"); return
    print(json.dumps(row, ensure_ascii=False))
    print(f"已 upsert futures_daily (status {_upsert(env, row)})")


if __name__ == "__main__":
    main()
