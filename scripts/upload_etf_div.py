"""
upload_etf_div.py — 本機抓 TWSE ETF 配息(etfDiv)→ 上傳 Supabase etf_distributions。

資料源：www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=<code>（每檔一請求；本機 Python 可達，
Vercel/瀏覽器會被反爬擋，故走本機抓→Supabase→網站讀）。
欄位：證券代號/簡稱/除息交易日/收益分配基準日/收益分配發放日/每受益權單位配息/公告年度。
日期為民國中文（例 115年07月21日）→ 轉西元 YYYY-MM-DD。
ETF 代號清單取自 Supabase etf_products（先跑過 upload_etf.py）。
用法：python scripts/upload_etf_div.py [--years 2]
"""
import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl._create_unverified_context()
_ROC = re.compile(r"^(\d+)年(\d+)月(\d+)日$")


def _roc_cn_to_iso(value):
    m = _ROC.match(str(value or "").strip())
    if not m:
        return ""
    y, mo, d = m.groups()
    return f"{int(y) + 1911}-{mo.zfill(2)}-{d.zfill(2)}"


def _num(value):
    try:
        return float(str(value).replace(",", ""))
    except Exception:
        return None


def _fetch_div(code, start, end, retries=4):
    url = (f"https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo={code}"
           f"&startDate={start}&endDate={end}&response=json")
    payload = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                                                   "Accept": "application/json, text/plain, */*",
                                                   "Referer": "https://www.twse.com.tw/zh/ETF/etfDiv"})
        try:
            with urllib.request.urlopen(req, timeout=20, context=_CTX) as r:
                payload = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code == 403:          # IP 限流 → 退避重試
                time.sleep(2 + attempt * 2)
                continue
            return []
        except Exception:
            time.sleep(1)
            continue
    if not payload or (payload.get("stat") != "ok" and payload.get("status") != "ok"):
        return []
    out = []
    for row in payload.get("data") or []:
        ex = _roc_cn_to_iso(row[2] if len(row) > 2 else "")
        if not ex:
            continue
        out.append({
            "code": str(row[0]).strip(),
            "name": str(row[1]).strip() if len(row) > 1 else "",
            "ex_date": ex,
            "book_close_date": _roc_cn_to_iso(row[3]) if len(row) > 3 else "",
            "pay_date": _roc_cn_to_iso(row[4]) if len(row) > 4 else "",
            "cash_per_unit": _num(row[5]) if len(row) > 5 else None,
            "year": int(_num(row[7])) if len(row) > 7 and _num(row[7]) else None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=2, help="抓近幾年配息(預設 2)")
    args = ap.parse_args()

    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止")
        sys.exit(1)

    st, rows = bs._sb(env, "/etf_products", params=[("select", "code"), ("limit", "1000")])
    codes = [r["code"] for r in (rows or []) if r.get("code")]
    if not codes:
        print("[error] etf_products 無資料，請先跑 upload_etf.py")
        return
    end = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d")
    start = (datetime.now(timezone(timedelta(hours=8))) - timedelta(days=365 * args.years)).strftime("%Y%m%d")
    print(f"抓 {len(codes)} 檔 ETF 近 {args.years} 年配息（{start}~{end}）…")

    recs = []
    for i, c in enumerate(codes, 1):
        recs.extend(_fetch_div(c, start, end))
        time.sleep(0.35)               # 溫和節流，避免 IP 被 403
        if i % 40 == 0:
            print(f"  …{i}/{len(codes)}（累計 {len(recs)} 筆）")
    # 去重(code, ex_date)
    seen, uniq = set(), []
    for r in recs:
        k = (r["code"], r["ex_date"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    print(f"抓到 {len(uniq)} 筆配息（涵蓋 {len({r['code'] for r in uniq})} 檔）")

    bs._sb(env, "/etf_distributions", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(uniq), 500):
        s, r = bs._sb(env, "/etf_distributions", method="POST", body=uniq[i:i + 500])
        if s in (200, 201):
            ok += len(uniq[i:i + 500])
        else:
            print(f"[error] 第 {i} 批上傳失敗 ({s}): {r}")
            return
    print(f"已上傳 {ok} 筆配息到 etf_distributions")


if __name__ == "__main__":
    main()
