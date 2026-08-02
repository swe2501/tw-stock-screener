"""
大盤融資維持率（含ETF／扣除ETF）歷史序列 — 抓 Wantgoo 匿名 JSON API，上傳 Supabase margin_maintenance。
供網頁 header 徽章（最新·含ETF）與彈窗歷史線圖（含／扣ETF）使用。純 HTTP，不需瀏覽器。

資料源（marginRatio=維持率、lendingBalance÷100000=融資餘額億、borrowingBalance=融券餘額張）：
  含ETF：0000A/…historical-lending-balance-long-term（維持率＋融資餘額，~5年）
         0000/…historical-borrowing-balance-long-term（融券餘額）
  扣ETF：-ETFA/…historical-lending-balance（維持率＋融資餘額，~2年）
         -ETF/…historical-borrowing-balance（融券餘額）

用法：python scripts/margin_ratio.py
"""
import json
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_B = "https://www.wantgoo.com/stock"
SRC = {
    False: {"fin": f"{_B}/0000A/margin-trading/historical-lending-balance-long-term",
            "short": f"{_B}/0000/margin-trading/historical-borrowing-balance-long-term"},
    True:  {"fin": f"{_B}/-ETFA/margin-trading/historical-lending-balance",
            "short": f"{_B}/-ETF/margin-trading/historical-borrowing-balance"},
}


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45, context=_CTX).read())


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat()


def _variant(exclude_etf):
    src = SRC[exclude_etf]
    fin = _get(src["fin"])
    short = {_iso(r["date"]): r.get("borrowingBalance") for r in _get(src["short"])}
    rows = []
    for r in fin:
        d = _iso(r["date"])
        mr, lb = r.get("marginRatio"), r.get("lendingBalance")
        rows.append({
            "trade_date": d, "exclude_etf": exclude_etf,
            "maintenance_ratio": round(mr * 100, 2) if mr else None,
            "margin_balance": round(lb / 100000, 2) if lb else None,
            "short_balance": short.get(d),
        })
    return rows


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    allrows = []
    for ex in (False, True):
        rows = _variant(ex)
        latest = max(rows, key=lambda r: r["trade_date"])
        print(f"{'扣除ETF' if ex else '含ETF'}：{len(rows)} 天，最新 {latest['trade_date']} "
              f"維持率 {latest['maintenance_ratio']}%、融資餘額 {latest['margin_balance']} 億")
        allrows += rows

    # 全表重寫（含/扣ETF 兩變體的完整歷史）
    bs._sb(env, "/margin_maintenance", method="DELETE", params=[("trade_date", "neq.1900-01-01")])
    st = None
    for i in range(0, len(allrows), 500):
        st, _ = bs._sb(env, "/margin_maintenance", method="POST", body=allrows[i:i + 500])
    print(f"上傳 margin_maintenance={st}（共 {len(allrows)} 列）")


if __name__ == "__main__":
    main()
