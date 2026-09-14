"""
upload_institutional.py — 本機抓 TWSE 三大法人買賣超(T86)→ 上傳 Supabase institutional_flow。

資料源：www.twse.com.tw/rwd/zh/fund/T86?selectType=ALLBUT0999（當日全市場個股法人買賣超；
本機 Python 可達，Vercel/瀏覽器被反爬擋，故本機抓→Supabase→網站讀）。
欄位索引：[0]代號 [1]名稱 [4]外資買賣超股數 [10]投信買賣超股數 [11]自營商買賣超股數 [18]三大法人買賣超股數。
數值單位為「股」；前端顯示轉「張」(÷1000)。
用法：python scripts/upload_institutional.py
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
        return int(float(str(v).replace(",", "")))
    except Exception:
        return 0


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止")
        sys.exit(1)

    print("抓 TWSE T86 三大法人…")
    url = "https://www.twse.com.tw/rwd/zh/fund/T86?selectType=ALLBUT0999&response=json"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0",
                                               "Referer": "https://www.twse.com.tw/"})
    payload = json.loads(urllib.request.urlopen(req, timeout=25, context=_CTX).read())
    if payload.get("stat") != "OK" and payload.get("status") != "OK":
        print(f"[error] T86 回傳非 OK：{payload.get('stat')}")
        return
    date = str(payload.get("date") or "")
    trade_date = f"{date[:4]}-{date[4:6]}-{date[6:]}" if len(date) == 8 else date

    recs = []
    for row in payload.get("data") or []:
        code = str(row[0]).strip()
        if not code:
            continue
        recs.append({
            "code": code,
            "name": str(row[1]).strip(),
            "foreign_net": _num(row[4]),
            "trust_net": _num(row[10]),
            "dealer_net": _num(row[11]),
            "total_net": _num(row[18]),
            "trade_date": trade_date,
        })
    print(f"整理 {len(recs)} 檔，交易日 {trade_date}")

    bs._sb(env, "/institutional_flow", method="DELETE", params=[("code", "neq.__none__")])
    ok = 0
    for i in range(0, len(recs), 1000):
        s, r = bs._sb(env, "/institutional_flow", method="POST", body=recs[i:i + 1000])
        if s in (200, 201):
            ok += len(recs[i:i + 1000])
        else:
            print(f"[error] 第 {i} 批失敗 ({s}): {r}")
            return
    print(f"已上傳 {ok} 檔到 institutional_flow")


if __name__ == "__main__":
    main()
