"""
upload_etf.py — 本機抓 TWSE openapi ETF 資料 → 上傳 Supabase etf_products。

為什麼本機抓：ETF 名錄權威來源 wwwc.twse.com.tw(ETFortune)整個環境(含 Vercel)連不到；
www.twse.com.tw 會回反爬阻擋。唯一可用的是 openapi.twse.com.tw(本機 unverified SSL 可達)。
故沿用 price_window/產業表同套路：本機抓 openapi → 上傳 Supabase → 網站只讀 Supabase(0 個 TWSE 請求)。
上線後若要 Vercel 直抓，再走 Cloudflare Worker 代理(Cloudflare egress 連得到 TWSE)。

資料源：
  openapi.twse.com.tw /v1/opendata/t187ap47_L        ETF 基本資料(代號/簡稱/類型/追蹤指數/上市日/經理人/發行單位數/含外股)
  openapi.twse.com.tw /v1/exchangeReport/STOCK_DAY_ALL  當日全市場行情(開高低收/量/值/漲跌)
  openapi.tdcc.com.tw /v1/opendata/1-5               集保股權分散(合計列=流通在外單位數 + 受益人數)

口徑註記：
  受益人數(holders) = 集保 TDCC 合計列人數，官方確切值。
  流通在外單位(outstanding_units) = 集保 TDCC 合計列股數。
  規模(est_scale, 億) = 流通在外單位 × 收盤價 ÷ 1e8 ≈ 官方 AUM(僅差折溢價 <1%)；
    100% 官方 NAV-based 規模在 SITCA 月報(月更、較舊)，列為後續階段。
用法：python scripts/upload_etf.py
"""
import json
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402  # _sb / _load_env

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl._create_unverified_context()  # TWSE openapi 憑證在 Windows 驗不過，公開資料用免驗證取用


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30, context=_CTX) as r:
        return json.loads(r.read())


def _roc_to_iso(value):
    """民國 YYYMMDD → 西元 YYYY-MM-DD。"""
    s = str(value or "").strip()
    if len(s) < 7 or not s.isdigit():
        return ""
    y = int(s[:-4]) + 1911
    return f"{y}-{s[-4:-2]}-{s[-2:]}"


def _roc_to_iso_or_ad(value):
    """TDCC 資料日期為 8 碼西元 YYYYMMDD；相容 7 碼民國。"""
    s = str(value or "").strip()
    if not s.isdigit():
        return ""
    if len(s) == 8:
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return _roc_to_iso(s)


def _num(value):
    try:
        return float(str(value).replace(",", ""))
    except Exception:
        return None


def etf_category(code, name, index_name, fund_type):
    label = f"{name}{index_name}{fund_type}"
    if any(k in label for k in ("債", "公債", "公司債", "金融債")):
        return "債券收益"
    if any(k in label for k in ("正2", "反1", "槓桿", "反向")) or code[-1:] in ("L", "R"):
        return "槓桿反向"
    if any(k in label for k in ("高股息", "高息", "收益", "優息", "存股")):
        return "股息策略"
    if any(k in label for k in ("美國", "日本", "中國", "印度", "越南", "全球", "NASDAQ", "納斯達克", "道瓊", "標普", "S&P", "歐洲", "韓國")):
        return "海外市場"
    if any(k in label for k in ("科技", "半導體", "AI", "電動車", "生技", "金融", "ESG", "永續")):
        return "主題產業"
    if any(k in label for k in ("50", "市值", "加權", "大型", "中型", "小型")):
        return "市值型"
    return "多元策略"


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止")
        sys.exit(1)

    print("抓 openapi ETF 基本資料 + 行情…")
    basic = _get_json("https://openapi.twse.com.tw/v1/opendata/t187ap47_L")
    day = _get_json("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")
    quote = {str(d.get("Code", "")).strip(): d for d in day}
    data_date = _roc_to_iso(day[0].get("Date")) if day else ""

    print("抓 TDCC 集保股權分散(流通單位+受益人數)…")
    tdcc = {}  # code -> {units, holders, date}
    try:
        rows = _get_json("https://openapi.tdcc.com.tw/v1/opendata/1-5")
        def _tf(row, name):  # TDCC 欄位含 BOM，用 contains 比對
            k = next((k for k in row if name in k), None)
            return row[k] if k else ""
        for r in rows:
            if str(_tf(r, "持股分級")).strip() != "17":  # 17 = 合計(grand total)
                continue
            code = str(_tf(r, "證券代號")).strip()
            if not code:
                continue
            tdcc[code] = {
                "units": int(_num(_tf(r, "股數")) or 0),
                "holders": int(_num(_tf(r, "人數")) or 0),
                "date": _roc_to_iso_or_ad(_tf(r, "資料日期")),
            }
        print(f"  TDCC 合計列 {len(tdcc)} 檔")
    except Exception as e:
        print(f"  [warn] TDCC 抓取失敗，規模/受益人數留空：{e!r}")

    recs = []
    for b in basic:
        code = str(b.get("基金代號", "")).strip()
        if not code:
            continue
        name = str(b.get("基金簡稱", "")).strip()
        fund_type = str(b.get("基金類型", "")).strip()
        full_name = str(b.get("基金中文名稱", "")).strip()
        index_name = str(b.get("標的指數/追蹤指數名稱", "")).strip()
        active = ("主動" in fund_type) or ("主動" in name) or code.endswith("A")
        units = _num(b.get("發行單位數/轉換數"))
        q = quote.get(code)
        close = _num(q.get("ClosingPrice")) if q else None
        chg = _num(q.get("Change")) if q else None
        prev = (close - chg) if (close is not None and chg is not None) else None
        change_pct = round(chg / prev * 100, 2) if (prev and chg is not None) else None
        t = tdcc.get(code) or {}
        out_units = t.get("units") or None
        holders = t.get("holders") or None
        scale_units = out_units or units  # 優先用集保流通單位；缺就退回 openapi 發行單位
        est_scale = round(scale_units * close / 1e8, 2) if (scale_units and close) else None  # 億元 ≈ AUM
        recs.append({
            "code": code,
            "name": name,
            "full_name": full_name,
            "fund_type": fund_type,
            "active": active,
            "category": etf_category(code, name, index_name, fund_type),
            "index_name": index_name if index_name not in ("", "不適用") else ("主動式選股策略" if active else index_name),
            "foreign_holdings": str(b.get("是否包含國外成分股", "")).strip() == "是",
            "listing_date": _roc_to_iso(b.get("上市日期")),
            "manager": str(b.get("基金經理人", "")).strip(),
            "issued_units": int(units) if units else None,
            "outstanding_units": int(out_units) if out_units else None,
            "holders": int(holders) if holders else None,
            "holder_date": t.get("date") or "",
            "close": close,
            "change_pct": change_pct,
            "volume": int(_num(q.get("TradeVolume")) or 0) if q else None,
            "trade_value": int(_num(q.get("TradeValue")) or 0) if q else None,
            "transactions": int(_num(q.get("Transaction")) or 0) if q else None,
            "est_scale": est_scale,
            "data_date": data_date,
        })

    print(f"整理 {len(recs)} 檔 ETF（含行情 {sum(1 for r in recs if r['close'] is not None)} 檔），資料日 {data_date}")

    # 整張換掉(名錄滾動更新)
    s, r = bs._sb(env, "/etf_products", method="DELETE", params=[("code", "neq.__none__")])
    if s not in (200, 204):
        print(f"[error] 清空失敗 ({s}): {r}")
        return
    ok = 0
    CHUNK = 500
    for i in range(0, len(recs), CHUNK):
        s, r = bs._sb(env, "/etf_products", method="POST", body=recs[i:i + CHUNK])
        if s in (200, 201):
            ok += len(recs[i:i + CHUNK])
        else:
            print(f"[error] 第 {i} 批上傳失敗 ({s}): {r}")
            return
    print(f"已上傳 {ok} 檔 ETF 到 etf_products")


if __name__ == "__main__":
    main()
