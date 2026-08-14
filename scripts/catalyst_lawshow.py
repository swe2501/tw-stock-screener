"""
catalyst_lawshow.py — 抓 MOPS 法人說明會（法說會）行事曆 → Supabase catalyst_events。

法說會是最實在的「前瞻催化」：常與財報同步，且日期事前公告。資料源用能通的新網域
mopsov.twse.com.tw 的 ajax_t100sb02_1（上市 TYPEK=sii），逐月抓「上月～未來2月」滾動窗，
整批換掉該窗內 event_type='法說會' 的列（避免重複、且日期異動會更新）。

每日排程跑（行事曆變動慢，一天一次即可）。
用法：python scripts/catalyst_lawshow.py
"""
import re
import ssl
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

URL = "https://mopsov.twse.com.tw/mops/web/ajax_t100sb02_1"
SRC = "https://mopsov.twse.com.tw/mops/web/t100sb02_1"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _roc_to_iso(s):
    m = re.match(r"\s*(\d{2,3})/(\d{1,2})/(\d{1,2})", s or "")
    if not m:
        return None
    return f"{int(m.group(1)) + 1911}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def _clean(html):
    return re.sub(r"<[^>]+>", "", html or "").replace("&nbsp;", " ").strip()


def _fetch_month(roc_year, month):
    body = (f"encodeURIComponent=1&step=1&firstin=1&off=1&TYPEK=sii"
            f"&year={roc_year}&month={month:02d}")
    req = urllib.request.Request(URL, data=body.encode(), method="POST", headers={
        "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"})
    html = urllib.request.urlopen(req, timeout=30, context=_CTX).read().decode("utf-8", "replace")
    recs = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        tds = [_clean(t) for t in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) < 6 or not re.fullmatch(r"\d{4,6}", tds[0] or ""):
            continue
        iso = _roc_to_iso(tds[2])
        if not iso:
            continue
        recs.append({
            "event_type": "法說會", "code": tds[0], "name": tds[1], "sector": None,
            "start_date": iso, "end_date": iso,
            "title": (tds[5] or "法人說明會")[:200], "source_url": SRC,
            "note": f"{tds[3]} {tds[4]}".strip()[:120],
        })
    return recs


def _months_window():
    """回傳 [(roc_year, month), ...]：上一月 ~ 未來 2 月，共 4 個月。"""
    y, m = date.today().year, date.today().month
    out = []
    for delta in (-1, 0, 1, 2):
        mm = m + delta
        yy = y + (mm - 1) // 12
        mm = (mm - 1) % 12 + 1
        out.append((yy - 1911, mm))
    return out


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    all_recs, iso_dates = [], []
    for ry, mm in _months_window():
        try:
            recs = _fetch_month(ry, mm)
        except Exception as e:
            print(f"  {ry+1911}-{mm:02d} 抓取失敗：{type(e).__name__} {e}"); continue
        all_recs += recs
        iso_dates += [r["start_date"] for r in recs]
        print(f"  {ry+1911}-{mm:02d}：法說會 {len(recs)} 檔")
        time.sleep(0.8)

    if not all_recs:
        print("本次無法說會資料，未更動資料庫"); return
    # 去重（同代號同日只留一筆）
    seen, uniq = set(), []
    for r in all_recs:
        k = (r["code"], r["start_date"])
        if k not in seen:
            seen.add(k); uniq.append(r)

    lo, hi = min(iso_dates), max(iso_dates)
    # 滾動換窗：整批刪掉窗內舊法說會再上傳
    bs._sb(env, "/catalyst_events", method="DELETE",
           params=[("event_type", "eq.法說會"), ("start_date", f"gte.{lo}"), ("start_date", f"lte.{hi}")])
    st, resp = bs._sb(env, "/catalyst_events", method="POST", body=uniq)
    if st in (200, 201):
        print(f"已上傳 {len(uniq)} 檔法說會（{lo}~{hi}）到 catalyst_events")
    else:
        print(f"[error] 上傳失敗 ({st}): {resp}")


if __name__ == "__main__":
    main()
