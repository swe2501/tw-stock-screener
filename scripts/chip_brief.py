"""
chip_brief.py — 首頁「每日台股籌碼報告」頂部區塊(照合夥人 100%,全官方即時)。
  加權指數 : TWSE FMTQIK(收盤指數 + 漲跌點數)
  櫃買指數 : TPEx OpenAPI tpex_mainborad_highlight(CloseIndex/IndexChange)
  台指期日盤: TAIFEX 每日行情下載 futDataDown(TX、交易時段＝一般、近月)；備援 OpenAPI DailyMarketReportFut
  2026-10-30 修正：OpenAPI(台積電 STOCK_DAY_ALL、台指期)常慢一個交易日，夜間跑時把前一日數字標成當日；
     台指期又沒分一般／盤後。現改主站當日來源＋每個欄位都核對資料日＝報告日，對不上就留空不寫錯日。
     另由 run_intraday.bat 在 16:00 盤後再跑一次(--wait)，首頁 KPI 當天下午就換成當日。
  台積電權值影響: 依前一日上市市值權重估算
     權重prev = 2330(股數×前收) / Σ上市(股數×前收)
     貢獻點數 = 加權前收 × 權重prev × 台積電漲跌% / 100
     股數 = TWSE openapi t187ap03_L(已發行普通股數或TDR原股發行股數);上市收盤 = STOCK_DAY_ALL
→ Supabase chip_brief_daily(trade_date PK)。
用法：python scripts/chip_brief.py
"""
import csv, http.cookiejar, ssl, sys, json, time, urllib.parse, urllib.request
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


def fetch_otc(iso=None):
    """TPEx 櫃買指數,回 (close, chg, pct)；給 iso 時資料日不符就留空。"""
    try:
        d = json.loads(_get("https://www.tpex.org.tw/openapi/v1/tpex_mainborad_highlight"))
    except Exception:
        return None, None, None
    r = d[0] if isinstance(d, list) and d else d
    dd = str(r.get("Date") or "")
    if iso and len(dd) == 7 and f"{int(dd[:3]) + 1911}-{dd[3:5]}-{dd[5:7]}" != iso:
        print(f"[warn] 櫃買指數資料日 {dd} ≠ {iso}，留空")
        return None, None, None
    close = _num(r.get("CloseIndex")); chg = _num(r.get("IndexChange"))
    prev = (close - chg) if (close is not None and chg is not None) else None
    pct = (chg / prev * 100) if prev else None
    return close, chg, pct


def _txf_download(iso):
    """期交所每日行情下載(當日收盤後即有)。回 [(month, last, chg, pct, vol)]，只取 TX 一般盤。"""
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")]
    op.open("https://www.taifex.com.tw/cht/3/dlFutDailyMarketView", timeout=20)
    d = iso.replace("-", "/")
    body = urllib.parse.urlencode({"down_type": "1", "commodity_id": "TX", "commodity_id2": "",
                                   "queryStartDate": d, "queryEndDate": d}).encode()
    raw = op.open(urllib.request.Request(
        "https://www.taifex.com.tw/cht/3/futDataDown", data=body,
        headers={"Referer": "https://www.taifex.com.tw/cht/3/dlFutDailyMarketView",
                 "Content-Type": "application/x-www-form-urlencoded"}), timeout=30).read()
    out = []
    for r in csv.reader(raw.decode("ms950", "replace").splitlines()):
        # 0日期 1契約 2月份 3開 4高 5低 6收 7漲跌 8漲跌% 9量 … 17交易時段
        if len(r) < 18 or r[0].strip() != d or r[1].strip() != "TX" or r[17].strip() != "一般":
            continue
        m = r[2].strip()
        if m.isdigit():
            out.append((m, _num(r[6]), _num(r[7]), _num(r[8]), _num(r[9]) or 0))
    return out


def fetch_txf(iso):
    """台指期(日盤)近月，限 iso 當日資料。回 (last, chg, pct)；拿不到當日就回 None。"""
    rows = []
    try:
        rows = _txf_download(iso)
    except Exception as e:
        print(f"[warn] 期交所下載失敗 {type(e).__name__}，改用 OpenAPI")
    if not rows:
        try:
            d = json.loads(_get("https://openapi.taifex.com.tw/v1/DailyMarketReportFut"))
            ymd = iso.replace("-", "")
            rows = [(r["ContractMonth(Week)"], _num(r.get("Last")), _num(r.get("Change")), _num(r.get("%")),
                     _num(r.get("Volume")) or 0)
                    for r in d if isinstance(r, dict) and r.get("Contract") == "TX"
                    and r.get("TradingSession") == "一般" and str(r.get("Date")) == ymd
                    and str(r.get("ContractMonth(Week)", "")).isdigit()]
        except Exception:
            rows = []
    if not rows:
        print(f"[warn] 台指期 {iso} 日盤資料尚未出來，留空")
        return None, None, None
    near = min(r[0] for r in rows)                 # 近月
    m, last, chg, pct, _ = max((r for r in rows if r[0] == near), key=lambda r: r[4])
    return last, chg, pct


def _day_all(iso):
    """上市全部收盤，限 iso 當日。主站 CSV(當日下午即有)→ OpenAPI 備援(常慢一日)。
    回 [{"Code","ClosingPrice","Change","Date"}]（格式比照 OpenAPI）。"""
    roc = f"{int(iso[:4]) - 1911}{iso[5:7]}{iso[8:10]}"
    try:
        text = _get("https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=csv").decode("utf-8", "replace")
        rows = []
        for r in csv.reader(text.splitlines()):
            # 0日期 1代號 2名稱 3股數 4金額 5開 6高 7低 8收 9漲跌價差 10筆數
            if len(r) >= 10 and r[0].strip() == roc:
                rows.append({"Code": r[1].strip(), "ClosingPrice": r[8], "Change": r[9], "Date": roc})
        if rows:
            return rows
    except Exception as e:
        print(f"[warn] 證交所 CSV 失敗 {type(e).__name__}，改用 OpenAPI")
    try:
        d = json.loads(_get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"))
        return [r for r in d if str(r.get("Date")) == roc]
    except Exception:
        return []


def fetch_tsmc_contrib(iso):
    """台積電權值影響，限 iso 當日。回 (close, chg, pct, contrib_points, iso)。"""
    day = _day_all(iso)
    if not day:
        print(f"[warn] 上市收盤 {iso} 尚未出來，台積電留空")
        return None, None, None, None, None
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


def fx_close_local(iso):
    """盤中排程記錄的當日 USD/TWD（D:/stock_data/home_intraday/fx_YYYYMMDD.json）最後一筆；沒有回 None。"""
    f = Path(r"D:\stock_data\home_intraday") / f"fx_{iso.replace('-', '')}.json"
    try:
        pts = json.loads(f.read_text(encoding="utf-8"))
        return round(float(pts[-1][1]), 3) if pts else None
    except Exception:
        return None


def _upsert_table(env, table, pk, row):
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(f"{env['SUPABASE_URL']}/rest/v1/{table}?on_conflict={pk}",
                                 data=json.dumps([row]).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


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
    # --wait：盤後用(16:00 起)。等到 FMTQIK 出現今天且櫃買／台指期／台積電都拿得到，最多等 90 分鐘
    wait = "--wait" in sys.argv
    today = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    deadline = time.time() + 90 * 60
    while True:
        tx_close, tx_chg, tx_pct, tx_iso = fetch_taiex()
        if not wait or tx_iso == today or time.time() > deadline:
            break
        print(f"[wait] 加權指數最新 {tx_iso}，等今天 {today} 出來…", flush=True)
        time.sleep(300)
    if wait and tx_iso != today:
        print(f"[skip] 今天 {today} 加權指數沒有資料（休市或尚未公布），不寫")
        return
    # 報告日 = 加權指數(FMTQIK)最新交易日；其他欄位都要同一天，否則留空(不再把前一日標成當日)
    iso = tx_iso or today
    while True:
        otc_close, otc_chg, otc_pct = fetch_otc(iso)
        txf_close, txf_chg, txf_pct = fetch_txf(iso)
        ts_close, ts_chg, ts_pct, ts_contrib, ts_iso = fetch_tsmc_contrib(iso)
        if None not in (otc_close, txf_close, ts_close) or not wait or time.time() > deadline:
            break
        print("[wait] 櫃買／台指期／台積電尚有未出來的，5 分鐘後再試", flush=True)
        time.sleep(300)
    row = {"trade_date": iso,
           "taiex_close": tx_close, "taiex_chg": tx_chg, "taiex_pct": round(tx_pct, 2) if tx_pct is not None else None,
           "otc_close": otc_close, "otc_chg": otc_chg, "otc_pct": round(otc_pct, 2) if otc_pct is not None else None,
           "txf_close": txf_close, "txf_chg": txf_chg, "txf_pct": txf_pct,
           "tsmc_close": ts_close, "tsmc_chg": ts_chg, "tsmc_pct": round(ts_pct, 2) if ts_pct is not None else None,
           "tsmc_contrib": round(ts_contrib, 2) if ts_contrib is not None else None}
    # 留空的欄位不送，避免把資料庫裡已有的正確值蓋成空白
    row = {k: v for k, v in row.items() if v is not None}
    print(json.dumps(row, ensure_ascii=False))
    print(f"已 upsert chip_brief_daily (status {_upsert(env, row)})")
    if wait:
        # 盤後模式：首頁卡片換成當日後，同日的分時小圖(櫃買/台指期/VIX/匯率)也一起推，否則卡片會顯示「分時暫無資料」
        import subprocess
        r = subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "home_intraday.py"), "--date", iso],
                           timeout=600)
        print(f"home_intraday --date {iso} exit {r.returncode}")
        # 2026-10-30 首頁台幣匯率卡改用「當日台北匯市時段最後一筆」(盤中排程每 5 分鐘記的 Yahoo USD/TWD，到 16:00)；
        # 期交所官方匯率晚 2 天才公布，原本把 10/28 的值標成 10/30
        fx = fx_close_local(iso)
        if fx:
            print(f"台幣匯率 {iso} {fx}（盤中記錄最後一筆）→ market_indicators "
                  f"status {_upsert_table(env, 'market_indicators', 'date', {'date': iso, 'usdtwd': fx})}")


if __name__ == "__main__":
    main()
