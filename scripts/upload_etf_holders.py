"""
upload_etf_holders.py — 本機抓集保 TDCC 股權分散 → 上傳 Supabase etf_holders_dist(ETF 持有人結構)。

資料源：openapi.tdcc.com.tw/v1/opendata/1-5（全市場股權分散，每週更新）。
只留 ETF(取自 etf_products 代號)；保留各級距(持股分級 1~15)+ 合計(17)。
用法：python scripts/upload_etf_holders.py
"""
import json
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl._create_unverified_context()


def _num(v):
    try:
        return float(str(v).replace(",", ""))
    except Exception:
        return None


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止")
        sys.exit(1)

    st, prods = bs._sb(env, "/etf_products", params=[("select", "code"), ("limit", "1000")])
    codes = {r["code"] for r in (prods or []) if r.get("code")}
    if not codes:
        print("[error] etf_products 無資料，請先跑 upload_etf.py")
        return

    print("抓 TDCC 股權分散…")
    req = urllib.request.Request("https://openapi.tdcc.com.tw/v1/opendata/1-5",
                                 headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    rows = json.loads(urllib.request.urlopen(req, timeout=60, context=_CTX).read())

    def tf(row, name):
        k = next((k for k in row if name in k), None)
        return row[k] if k else ""

    recs = []
    for r in rows:
        code = str(tf(r, "證券代號")).strip()
        if code not in codes:
            continue
        recs.append({
            "code": code,
            "tier": str(tf(r, "持股分級")).strip(),
            "holders": int(_num(tf(r, "人數")) or 0),
            "shares": int(_num(tf(r, "股數")) or 0),
            "pct": _num(tf(r, "占集保庫存數比例")),
            "data_date": str(tf(r, "資料日期")).strip(),
        })
    dd = recs[0]["data_date"] if recs else ""
    print(f"整理 {len(recs)} 列（{len({r['code'] for r in recs})} 檔 ETF），資料日 {dd}")

    bs._sb(env, "/etf_holders_dist", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(recs), 1000):
        s, r = bs._sb(env, "/etf_holders_dist", method="POST", body=recs[i:i + 1000])
        if s in (200, 201):
            ok += len(recs[i:i + 1000])
        else:
            print(f"[error] 第 {i} 批失敗 ({s}): {r}")
            return
    print(f"已上傳 {ok} 列到 etf_holders_dist")


if __name__ == "__main__":
    main()
