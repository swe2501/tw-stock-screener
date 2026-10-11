"""
upload_active_etf_holdings.py — 把「主動式 ETF」的完整持股（成分股）灌進 Supabase etf_holdings，
補足前端「ETF 成分股(etfcons)」頁——主動 ETF 玩股網不收，故成分股一直空白。

資料源：https://nctuwanglin.github.io/active-etf/active.json 的 etfs.{code}.holdings
  每檔主動 ETF 依法每日揭露完整 PCF：holdings=[{code,name,shares,weight%}]（與被動 ETF 同格式）。
  （consensus 集中加碼另由 active_etf_flow.py 處理，兩者互不影響。）

只刪「本檔主動 ETF 代號」的舊列再寫，不動被動 ETF 的 etf_holdings。
用法：python scripts/upload_active_etf_holdings.py
"""
import sys, json, ssl, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

SRC = "https://nctuwanglin.github.io/active-etf/active.json"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def main():
    env = bs._load_env()
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    req = urllib.request.Request(SRC, headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())
    etfs = d.get("etfs") or {}
    upd = d.get("updated")

    rows, codes = [], []
    for etf_code, obj in etfs.items():
        etf_code = str(etf_code).strip()
        hs = (obj or {}).get("holdings") or []
        if not hs:
            continue
        codes.append(etf_code)
        dd = (obj or {}).get("data_date") or upd
        for i, hobj in enumerate(hs, 1):
            sc = str(hobj.get("code") or "").strip()
            if not sc:
                continue
            sh = hobj.get("shares")
            rows.append({
                "code": etf_code, "stock_code": sc,
                "stock_name": hobj.get("name") or "",
                "shares": int(sh) if isinstance(sh, (int, float)) else None,
                "weight": _num(hobj.get("weight")),
                "seq": i, "data_date": dd,
            })
    if not rows:
        print("[warn] active.json 無主動 ETF 持股，未更動"); return

    base = f"{env['SUPABASE_URL']}/rest/v1/etf_holdings"
    hdr = {"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
           "Prefer": "return=minimal"}
    # 先讀既有(前一日)持股 → 算 delta_shares（今日股數 − 前一日股數；比照被動 ETF wantgoo_etf.py，
    # 否則主動 ETF 的「今日加減碼」前端永遠空白）。etf_holdings 對主動 ETF 是覆蓋式，既有列即前一日快照。
    ghdr = {"apikey": key, "Authorization": f"Bearer {key}"}
    prev = {}
    for c in codes:
        try:
            greq = urllib.request.Request(f"{base}?select=stock_code,shares&code=eq.{c}", headers=ghdr)
            for o in (json.loads(urllib.request.urlopen(greq, timeout=30, context=_CTX).read()) or []):
                prev[(c, str(o.get("stock_code") or ""))] = o.get("shares")
        except Exception as e:
            print(f"  [warn] 讀 {c} 舊持股失敗：{str(e)[:50]}")
    for r in rows:
        pv = prev.get((r["code"], r["stock_code"]))
        r["delta_shares"] = (r["shares"] - pv) if (r["shares"] is not None and pv is not None) else None
    # 只刪這些主動 ETF 代號的舊持股（保留被動 ETF）
    for c in codes:
        dreq = urllib.request.Request(f"{base}?code=eq.{c}", method="DELETE", headers=hdr)
        try:
            urllib.request.urlopen(dreq, timeout=30)
        except Exception as e:
            print(f"  [warn] 刪 {c} 舊持股失敗：{str(e)[:50]}")
    ok = 0
    for i in range(0, len(rows), 1000):
        preq = urllib.request.Request(base, data=json.dumps(rows[i:i+1000]).encode(), method="POST", headers=hdr)
        with urllib.request.urlopen(preq, timeout=60) as r:
            if r.status in (200, 201):
                ok += len(rows[i:i+1000])
    print(f"已上傳 {ok} 列主動 ETF 成分股（{len(codes)} 檔主動 ETF，updated {upd}）→ etf_holdings")


if __name__ == "__main__":
    main()
