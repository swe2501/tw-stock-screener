"""
active_etf_flow.py — 主動式 ETF「集中買賣超」每日快照（歷史累積，供 ETF 探索頁 今日/5日/10日 前10）。

資料源：https://nctuwanglin.github.io/active-etf/active.json
  該站每日彙整「各投信官網公告的 PCF（申購買回清單）」——主動式 ETF 依法每日揭露完整持股，
  玩股網不收主動 ETF（實測 combine-data/pcf 全空），TWSE 亦無單一彙整端點，故採此一手 PCF 彙整源。
  取其 consensus：當日有「≥2 檔主動 ETF 同步加碼/減碼」的個股（＝集中度），欄位 code/name/shares_delta/etfs。

寫入 Supabase active_etf_flow（(data_date, stock_code) 主鍵，每日 append 累積歷史）：
  data_date, stock_code, stock_name, shares_delta(股，加碼+/減碼−), etf_count, etf_codes(jsonb)
前端：今日＝最新日 shares_delta>0 前10；5/10日＝近 5/10 交易日 shares_delta 加總前10（累積夠天數才有）。

用法：python scripts/active_etf_flow.py
"""
import sys, json, ssl, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # 重用 _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

SRC = "https://nctuwanglin.github.io/active-etf/active.json"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _fetch():
    req = urllib.request.Request(SRC, headers={"User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    d = _fetch()
    date = d.get("updated")
    con = d.get("consensus") or {}
    if not date:
        print("[error] active.json 無 updated 日期，中止"); sys.exit(1)

    rows, seen = [], set()
    for side, sign in (("increase", 1), ("decrease", -1)):
        for x in con.get(side, []):
            code = str(x.get("code", "")).strip()
            if not code or code in seen:
                continue
            seen.add(code)
            etfs = x.get("etfs") or []
            rows.append({
                "data_date": date,
                "stock_code": code,
                "stock_name": x.get("name", ""),
                "shares_delta": sign * abs(int(x.get("shares_delta") or 0)),
                "etf_count": len(etfs),
                "etf_codes": etfs,
            })

    print(f"active.json updated={date}｜集中加碼 {len(con.get('increase',[]))} 檔、減碼 {len(con.get('decrease',[]))} 檔 → 寫入 {len(rows)} 列")
    if not rows:
        print("今日無 consensus（無 ≥2 檔主動 ETF 同步動作），不寫入"); return

    # 同日重跑安全：先刪當日再寫（保留其他日期歷史）
    bs._sb(env, "/active_etf_flow", method="DELETE", params=[("data_date", f"eq.{date}")])
    st, resp = bs._sb(env, "/active_etf_flow", method="POST", body=rows)
    if st in (200, 201):
        top = sorted([r for r in rows if r["shares_delta"] > 0], key=lambda r: -r["shares_delta"])[:5]
        print(f"已上傳 {len(rows)} 列 active_etf_flow（{date}）。今日集中加碼前5：")
        for r in top:
            print(f"  {r['stock_code']} {r['stock_name']} +{r['shares_delta']//1000} 張（{r['etf_count']} 檔主動ETF）")
    else:
        print(f"[error] 上傳失敗 ({st}): {resp}")


if __name__ == "__main__":
    main()
