"""
chip_brief.py — 首頁「每日台股籌碼報告」頂部區塊(照合夥人 100%,全官方即時)。
  加權指數 : TWSE FMTQIK(收盤指數 + 漲跌點數)
  櫃買指數 : TPEx OpenAPI tpex_mainborad_highlight(CloseIndex/IndexChange)
  台指期日盤: TAIFEX OpenAPI DailyMarketReportFut(Contract=TX 近月最大量,Last/Change/%)
  台積電權值影響: 依前一日上市市值權重估算
     權重prev = 2330(股數×前收) / Σ上市(股數×前收)
     貢獻點數 = 加權前收 × 權重prev × 台積電漲跌% / 100
     股數 = TWSE openapi t187ap03_L(已發行普通股數或TDR原股發行股數);上市收盤 = STOCK_DAY_ALL
→ Supabase chip_brief_daily(trade_date PK)。
用法：python scripts/chip_brief.py
"""
import ssl, sys, json, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
SHARE_KEY = "已發行普通股數或TDR原股發行股數"


def _get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=_HDR), timeout=30, context=_CTX).read()


def _num(x):
    try:
        return float(str(x).replace(",", "").replace("%", "").strip())
    except Exception:
        return None


def _fmtqik_rows():
    """回 FMTQIK 近兩個月的 [(iso, close, chg), ...](由舊到新)。"""
    tw = datetime.now(timezone(timedelta(hours=8)))
    out = []
    for d in (tw.replace(day=1) - timedelta(days=1), tw):  # 上月 + 本月
        try:
            j = json.loads(_get(f"https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date={d.strftime('%Y%m01')}&response=json"))
        except Exception:
            continue
        for r in (j.get("data") or []):
            # 欄: 0日期 1成交股數 2成交金額 3成交筆數 4發行量加權股價指數 5漲跌點數
            dd = str(r[0]).split("/")
            iso = f"{int(dd[0])+1911}-{dd[1]}-{dd[2]}" if len(dd) == 3 else None
            close = _num(r[4]); chg = _num(r[5])
            if iso and close is not None:
                out.append((iso, close, chg))
    # 去重(可能上月尾與本月頭重疊)並排序
    seen = {};
    for iso, cl, ch in out:
        seen[iso] = (iso, cl, ch)
    return [seen[k] for k in sorted(seen)]


def fetch_taiex():
    """加權指數最新(供 KPI)。回 (close, chg, pct, iso)。"""
    rows = _fmtqik_rows()
    if not rows:
        return None, None, None, None
    iso, close, chg = rows[-1]
    prev = (close - chg) if (close is not None and chg is not None) else None
    pct = (chg / prev * 100) if prev else None
    return close, chg, pct, iso


def fetch_otc():
    """TPEx 櫃買指數,回 (close, chg, pct)。"""
    try:
        d = json.loads(_get("https://www.tpex.org.tw/openapi/v1/tpex_mainborad_highlight"))
    except Exception:
        return None, None, None
    r = d[0] if isinstance(d, list) and d else d
    close = _num(r.get("CloseIndex")); chg = _num(r.get("IndexChange"))
    prev = (close - chg) if (close is not None and chg is not None) else None
    pct = (chg / prev * 100) if prev else None
    return close, chg, pct


def fetch_txf():
    """TAIFEX 台指期(日盤)近月,回 (last, chg, pct)。"""
    try:
        d = json.loads(_get("https://openapi.taifex.com.tw/v1/DailyMarketReportFut"))
    except Exception:
        return None, None, None
    tx = [r for r in d if isinstance(r, dict) and r.get("Contract") == "TX"
          and r.get("ContractMonth(Week)", "").isdigit()]
    if not tx:
        return None, None, None
    # 近月(ContractMonth 最小) + 同月取最大量(日盤主力)
    months = sorted({r["ContractMonth(Week)"] for r in tx})
    near = [r for r in tx if r["ContractMonth(Week)"] == months[0]]
    row = max(near, key=lambda r: _num(r.get("Volume")) or 0)
    return _num(row.get("Last")), _num(row.get("Change")), _num(row.get("%"))


def fetch_tsmc_contrib():
    """台積電權值影響。回 (close, chg, pct, contrib_points, iso)。"""
    day = json.loads(_get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"))
    shares_raw = json.loads(_get("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"))
    shares = {}
    for r in shares_raw:
        s = _num(r.get(SHARE_KEY))
        if s:
            shares[str(r.get("公司代號"))] = s
    prev_total = 0.0; tsmc_prev_cap = 0.0
    tsmc_close = tsmc_chg = None
    iso = None
    for r in day:
        code = str(r.get("Code")); sh = shares.get(code)
        if not sh:
            continue
        close = _num(r.get("ClosingPrice")); chg = _num(r.get("Change"))
        if close is None or chg is None:
            continue
        prev = close - chg
        prev_total += sh * prev
        if code == "2330":
            tsmc_close, tsmc_chg = close, chg
            tsmc_prev_cap = sh * prev
            dd = str(r.get("Date"))  # 民國 1150915
            iso = f"{int(dd[:3])+1911}-{dd[3:5]}-{dd[5:7]}" if len(dd) == 7 else None
    if tsmc_close is None or not prev_total:
        return tsmc_close, tsmc_chg, None, None, iso
    tsmc_prev = tsmc_close - tsmc_chg
    tsmc_pct = (tsmc_chg / tsmc_prev * 100) if tsmc_prev else 0
    weight_prev = tsmc_prev_cap / prev_total
    # taiexPrevious = 台積電資料日的「前一交易日」加權收盤(與 weightPrev/前收 同一天,口徑同合夥人)
    rows = _fmtqik_rows()
    taiex_prev = None
    if iso:
        idx = next((i for i, r in enumerate(rows) if r[0] == iso), None)
        if idx is not None and idx > 0:
            taiex_prev = rows[idx - 1][1]
    if taiex_prev is None and rows:  # 個股日不在 FMTQIK(如個股檔較新)→ 用倒數第二日
        taiex_prev = rows[-2][1] if len(rows) >= 2 else rows[-1][1]
    contrib = (taiex_prev * weight_prev * tsmc_pct / 100) if taiex_prev else None
    return tsmc_close, tsmc_chg, tsmc_pct, contrib, iso


def _upsert(env, row):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/chip_brief_daily?on_conflict=trade_date"
    req = urllib.request.Request(url, data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    tx_close, tx_chg, tx_pct, tx_iso = fetch_taiex()
    otc_close, otc_chg, otc_pct = fetch_otc()
    txf_close, txf_chg, txf_pct = fetch_txf()
    ts_close, ts_chg, ts_pct, ts_contrib, ts_iso = fetch_tsmc_contrib()
    # 報告日 = 加權指數(FMTQIK)最新交易日;個股檔(STOCK_DAY_ALL)在本環境可能晚一天,台積電卡為其自身日資料
    iso = tx_iso or ts_iso or datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    row = {"trade_date": iso,
           "taiex_close": tx_close, "taiex_chg": tx_chg, "taiex_pct": round(tx_pct, 2) if tx_pct is not None else None,
           "otc_close": otc_close, "otc_chg": otc_chg, "otc_pct": round(otc_pct, 2) if otc_pct is not None else None,
           "txf_close": txf_close, "txf_chg": txf_chg, "txf_pct": txf_pct,
           "tsmc_close": ts_close, "tsmc_chg": ts_chg, "tsmc_pct": round(ts_pct, 2) if ts_pct is not None else None,
           "tsmc_contrib": round(ts_contrib, 2) if ts_contrib is not None else None}
    print(json.dumps(row, ensure_ascii=False))
    print(f"已 upsert chip_brief_daily (status {_upsert(env, row)})")


if __name__ == "__main__":
    main()
