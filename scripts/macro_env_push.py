"""
macro_env_push.py - 「宏觀環境」美國 CPI／失業率／美元廣義指數（2026-10-24）

原本後端 /api/screen?stat=macro_environment 即時向 FRED（fred.stlouisfed.org/graph/fredgraph.csv）抓，
但 FRED 下載端點會逾時（本機與雲端皆然），三條數列全空。改為每晚本機向官方原始來源抓、存 page_cache kind=macro_env：
  - CPIAUCSL（CPI，季調）：美國勞工統計局 BLS API v2，序列 CUSR0000SA0（＝FRED CPIAUCSL 的來源）
  - UNRATE（失業率，季調）：BLS 序列 LNS14000000（＝FRED UNRATE 的來源）
  - DTWEXBGS（美元廣義指數，日）：聯準會 H.10 Nominal Broad Dollar Index（＝FRED DTWEXBGS 的來源）
payload 與後端原格式相同：{"series": {"CPIAUCSL":[{date,value}],...}, "source":..., "scope":...}
BLS 免金鑰每天 25 次查詢，本程式每天 1 次。
用法：python scripts/macro_env_push.py
"""
import csv
import datetime as dt
import io
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0"}
DAYS = 850


def _bls(start_year, end_year):
    body = json.dumps({"seriesid": ["CUSR0000SA0", "LNS14000000"],
                       "startyear": str(start_year), "endyear": str(end_year)}).encode()
    req = urllib.request.Request("https://api.bls.gov/publicAPI/v2/timeseries/data/", data=body,
                                 headers={**UA, "Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    if d.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(f"BLS {d.get('status')} {d.get('message')}")
    out = {}
    for s in d["Results"]["series"]:
        rows = []
        for r in s["data"]:
            p = r.get("period", "")
            if not p.startswith("M") or p == "M13":
                continue
            try:
                rows.append({"date": f"{r['year']}-{p[1:]}-01", "value": float(r["value"])})
            except (TypeError, ValueError):
                continue
        out[s["seriesID"]] = sorted(rows, key=lambda x: x["date"])
    return out


def _fed_broad_dollar(start):
    u = ("https://www.federalreserve.gov/datadownload/Output.aspx?rel=H10&series=122e3bcb627e8e53f1bf72a1a09cfb81"
         "&lastobs=650&from=&to=&filetype=csv&label=include&layout=seriescolumn")
    raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read().decode("utf-8-sig")
    rows = []
    for rec in csv.reader(io.StringIO(raw)):
        if len(rec) < 2 or len(rec[0]) != 10 or rec[0][4] != "-":
            continue
        if rec[0] < start.isoformat():
            continue
        try:
            rows.append({"date": rec[0], "value": float(rec[1])})       # 第 2 欄＝Nominal Broad Dollar Index
        except ValueError:
            continue                                                    # ND（無資料日）略過
    return rows


def main():
    today = dt.date.today()
    start = today - dt.timedelta(days=DAYS)
    env = bs._load_env()
    series = {}
    try:
        b = _bls(start.year, today.year)
        series["CPIAUCSL"] = [r for r in b.get("CUSR0000SA0", []) if r["date"] >= start.isoformat()]
        series["UNRATE"] = [r for r in b.get("LNS14000000", []) if r["date"] >= start.isoformat()]
    except Exception as e:                                              # noqa: BLE001
        print(f"[macro_env] BLS 失敗：{type(e).__name__} {e}")
    try:
        series["DTWEXBGS"] = _fed_broad_dollar(start)
    except Exception as e:                                              # noqa: BLE001
        print(f"[macro_env] 聯準會 H.10 失敗：{type(e).__name__} {e}")
    for k in ("CPIAUCSL", "UNRATE", "DTWEXBGS"):
        v = series.get(k) or []
        print(f"[macro_env] {k}: {len(v)} 筆 {v[-1] if v else ''}")
    if not all(len(series.get(k) or []) >= 6 for k in ("CPIAUCSL", "UNRATE", "DTWEXBGS")):
        print("[macro_env] 有數列不足，保留原資料不覆寫"); return
    payload = {"series": series, "source": "BLS (CPI CUSR0000SA0, 失業率 LNS14000000) / Federal Reserve H.10 (Nominal Broad Dollar Index)",
               "scope": "US macro and broad dollar; not complete global coverage", "updated": today.isoformat()}
    row = {"kind": "macro_env", "trade_date": today.isoformat(), "payload": payload,
           "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    bs._sb(env, "/page_cache", method="DELETE", params=[("kind", "eq.macro_env")])
    st, _ = bs._sb(env, "/page_cache", method="POST", body=[row])
    print(f"[macro_env] 寫入 page_cache status={st}")


if __name__ == "__main__":
    main()
