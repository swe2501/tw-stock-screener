"""
liquidity_top.py — 流動性排行：現貨(上市)成交值前50、個股期貨成交量前50（2026-09-28 起兩者皆前 50）（2026-09-28 起不含指數類期貨）。
旨在規避流動性風險/避免滑價：優先挑成交熱絡的標的。供「選股 → 流動性排行」分頁。

資料源（皆免費官方、urllib 可讀）：
  現貨：TWSE openapi STOCK_DAY_ALL（TradeValue 成交金額、TradeVolume 成交股數），上市普通股取成交值前50。
  個股期貨：TAIFEX openapi DailyMarketReportFut（一般盤各契約 Volume，排除價差委託列「202610/202611」避免重複計量），
        只留 SSFLists 中「普通股」標的的股票期貨（排除指數期貨、ETF 期貨），合併同契約各月份後取成交量前 50；
        同一檔的小型(每口100股)併入標準型(每口2,000股)：小型口數 ÷ 20 換算成標準型等值口數後加總（2026-09-28），
        每口股數依期交所「股票期貨交易標的」頁 www.taifex.com.tw/cht/2/stockLists 判斷。
→ Supabase liquidity_top((trade_date,market,rank) PK；market: spot / fut)。
用法：python scripts/liquidity_top.py
"""
import ssl, sys, json, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_H = {"User-Agent": "Mozilla/5.0"}

def _num(x):
    try:
        return float(str(x).replace(",", "").strip())
    except Exception:
        return 0.0


def _iso(d):
    d = str(d).strip()
    if len(d) == 7 and d.isdigit():      # 民國 1150924
        return f"{int(d[:3])+1911:04d}-{d[3:5]}-{d[5:7]}"
    if len(d) == 8 and d.isdigit():      # 西元 20260924
        return f"{d[:4]}-{d[4:6]}-{d[6:8]}"
    return None


def _get_json(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=_H), timeout=45, context=_CTX).read())


def spot_top():
    d = _get_json("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")
    iso = _iso(d[0].get("Date"))
    rows = [r for r in d if str(r.get("Code", "")).strip().isdigit() and len(str(r.get("Code")).strip()) == 4
            and not str(r.get("Code")).startswith("00")]      # 上市普通股(排除ETF)
    rows.sort(key=lambda r: -_num(r.get("TradeValue")))
    out = []
    for i, r in enumerate(rows[:50], 1):
        out.append({"trade_date": iso, "market": "spot", "rank": i,
                    "code": str(r["Code"]).strip(), "name": r.get("Name", ""),
                    "turnover": round(_num(r.get("TradeValue"))), "volume": round(_num(r.get("TradeVolume")) / 1000)})
    return out, iso


def _ssf_map():
    """Contract → (股名, 股票代號, 類型)。"""
    m = {}
    try:
        for r in _get_json("https://openapi.taifex.com.tw/v1/SSFLists"):
            m[str(r.get("Contract", "")).strip()] = (r.get("StockName", ""), str(r.get("StockCode", "")).strip(), r.get("Type", ""))
    except Exception as e:
        print(f"[warn] SSFLists {str(e)[:50]}")
    return m


def _contract_shares():
    """期貨契約代號 → 每口股數（2000=標準型、100=小型）。頁面代碼為 2 碼(CD/QF)，期貨契約＝代碼+F。"""
    import re
    out = {}
    try:
        h = urllib.request.urlopen(urllib.request.Request("https://www.taifex.com.tw/cht/2/stockLists", headers=_H),
                                   timeout=45, context=_CTX).read().decode("utf-8", "replace")
        for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
            tds = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", tr)]
            if len(tds) >= 12 and re.fullmatch(r"[A-Z0-9]{2,3}", tds[0]):
                sh = _num(tds[11])
                if sh:
                    out[tds[0] + "F"] = int(sh)
    except Exception as e:
        print(f"[warn] stockLists {str(e)[:50]}")
    return out


def fut_top(n=50):
    d = _get_json("https://openapi.taifex.com.tw/v1/DailyMarketReportFut")
    iso = _iso(d[0].get("Date"))
    ssf = _ssf_map()
    agg = {}
    for r in d:
        if r.get("TradingSession") != "一般" or "/" in str(r.get("ContractMonth(Week)", "")):
            continue                                            # 只算一般盤、排除價差委託列
        c = str(r.get("Contract", "")).strip()
        if c not in ssf or "普通股" not in (ssf[c][2] or ""):
            continue                                            # 只留個股期貨（排除指數/ETF 期貨）
        agg[c] = agg.get(c, 0) + _num(r.get("Volume"))
    size = _contract_shares()
    # 2026-09-28：同一檔的小型併入標準型——口數依每口股數換算成標準型等值（小型 100 股 ÷ 標準 2,000 股 = 1/20 口）後加總
    by = {}
    for c, vol in agg.items():
        sn, sc, _ = ssf[c]
        b = by.setdefault(sc, {"name": sn.rstrip("*＊ "), "eq": 0.0, "mini": False})
        sh = size.get(c, 2000)
        b["eq"] += vol * sh / 2000
        b["mini"] = b["mini"] or sh == 100
    ranked = sorted(by.items(), key=lambda x: -x[1]["eq"])[:n]
    out = []
    for i, (sc, b) in enumerate(ranked, 1):
        out.append({"trade_date": iso, "market": "fut", "rank": i, "code": sc,
                    "name": b["name"] + "期貨" + ("（含小型）" if b["mini"] else ""),
                    "turnover": None, "volume": round(b["eq"])})
    print(f"個股期貨：{len(agg)} 個契約 → {len(by)} 檔標的，股數對照 {len(size)} 筆")
    return out, iso


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/liquidity_top?on_conflict=trade_date,market,rank"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "apikey": key,
                                          "Authorization": f"Bearer {key}", "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    srows, siso = spot_top()
    frows, fiso = fut_top()
    st = _upsert(env, srows + frows)
    print(f"已寫入 liquidity_top（現貨 {siso} {len(srows)} 筆、期貨 {fiso} {len(frows)} 筆，status {st}）")
    print("現貨前3:", [(r["rank"], r["code"], r["name"], round(r["turnover"]/1e8, 1)) for r in srows[:3]])
    print("期貨前3:", [(r["rank"], r["code"], r["name"], r["volume"]) for r in frows[:3]])


if __name__ == "__main__":
    main()
