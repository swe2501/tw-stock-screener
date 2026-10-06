# -*- coding: utf-8 -*-
"""ust_yields_push.py — 美國公債殖利率曲線 → Supabase ust_yields（美債對標模組用）（2026-10-06）
來源：U.S. Department of the Treasury — Daily Treasury Par Yield Curve Rates（官方 XML，免金鑰）。
抓當年度（1 月初另補前一年）全部交易日的全曲線，idempotent 覆寫。前端讀最新 10Y/2Y 預填。
用法：python scripts/ust_yields_push.py
"""
import re, ssl, sys, urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_BASE = ("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
         "pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=")
_MAP = [("BC_1MONTH", "m1"), ("BC_3MONTH", "m3"), ("BC_6MONTH", "m6"),
        ("BC_1YEAR", "y1"), ("BC_2YEAR", "y2"), ("BC_3YEAR", "y3"),
        ("BC_5YEAR", "y5"), ("BC_7YEAR", "y7"), ("BC_10YEAR", "y10"),
        ("BC_20YEAR", "y20"), ("BC_30YEAR", "y30")]


def _fnum(block, tag):
    m = re.search(r"<d:" + tag + r"[^>]*>([^<]*)</d:" + tag + ">", block)
    if not m or m.group(1).strip() == "":
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _fetch_year(year):
    req = urllib.request.Request(_BASE + str(year), headers={"User-Agent": "Mozilla/5.0"})
    xml = urllib.request.urlopen(req, timeout=30, context=_CTX).read().decode("utf-8", "replace")
    rows = []
    for blk in re.findall(r"<m:properties>(.*?)</m:properties>", xml, re.S):
        dm = re.search(r"<d:NEW_DATE[^>]*>([^<]*)</d:NEW_DATE>", blk)
        if not dm:
            continue
        rec = {"trade_date": dm.group(1)[:10]}
        for tag, col in _MAP:
            rec[col] = _fnum(blk, tag)
        if rec.get("y10") is not None:
            rows.append(rec)
    return rows


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    now = datetime.utcnow()
    years = [now.year]
    if now.month == 1 and now.day <= 10:
        years.append(now.year - 1)
    rows = []
    for y in years:
        try:
            got = _fetch_year(y)
            rows += got
            print(f"抓 {y}：{len(got)} 交易日")
        except Exception as e:
            print(f"[warn] 抓 {y} 失敗：{e}")
    if not rows:
        print("無資料，結束。"); return
    rows.sort(key=lambda r: r["trade_date"])
    cutoff = rows[0]["trade_date"]
    # idempotent：刪本次涵蓋範圍後重寫
    bs._sb(env, "/ust_yields", method="DELETE", params=[("trade_date", f"gte.{cutoff}")])
    ok = 0
    for i in range(0, len(rows), 500):
        s, r = bs._sb(env, "/ust_yields", method="POST", body=rows[i:i + 500])
        if s in (200, 201):
            ok += len(rows[i:i + 500])
        else:
            print(f"[error] 批 {i} 失敗 ({s}): {r}"); return
    latest = rows[-1]
    print(f"已寫入 ust_yields {ok} 列；最新 {latest['trade_date']} · 2Y {latest.get('y2')} · 10Y {latest.get('y10')} · 30Y {latest.get('y30')}")


if __name__ == "__main__":
    main()
