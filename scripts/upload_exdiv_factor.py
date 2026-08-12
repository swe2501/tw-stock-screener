"""
upload_exdiv_factor.py — 每日累積「除權息還原因子」到 Supabase exdiv_factor。

TWSE 的歷史除權息端點(TWS1B/TWT38U)目前失效,能用的 TWT49U(除權除息計算結果)只回
「當日/即將」那批。策略:每天排程存下當天那批,日積月累 → 約 2 個月後涵蓋篩選器 60 天窗,
屆時跳空即可用這些因子精算還原、脫離 YF。

factor = 除權息參考價 / 除權息前收盤（≤1；調整除權息前的舊價使可比）。
upsert 用 resolution=ignore-duplicates → 既有的不覆蓋,只累積新事件。
用法：python scripts/upload_exdiv_factor.py
"""
import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

URL = "https://www.twse.com.tw/rwd/zh/exRight/TWT49U?response=json"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _roc_date(s):
    m = re.match(r"(\d+)年(\d+)月(\d+)日", (s or "").strip())
    if not m:
        return None
    return f"{int(m.group(1)) + 1911}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def _num(x):
    try:
        return float(str(x).replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def _post(env, recs):
    key = env.get("SUPABASE_SERVICE_KEY") or env["SUPABASE_ANON_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/exdiv_factor?on_conflict=code,ex_date"
    req = urllib.request.Request(url, data=json.dumps(recs).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "return=minimal,resolution=ignore-duplicates"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY,中止"); sys.exit(1)
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())
    if j.get("stat") != "OK":
        print(f"TWT49U 無資料（{j.get('stat')}）"); return
    recs = []
    for r in j.get("data", []):
        exd = _roc_date(r[0]); code = str(r[1]).strip()
        prev, ref = _num(r[3]), _num(r[4])
        if not (exd and code and prev and ref and prev > 0):
            continue
        recs.append({"code": code, "ex_date": exd, "prev_close": prev,
                     "ref_price": ref, "factor": round(ref / prev, 6)})
    if not recs:
        print("本批無有效除權息事件"); return
    status = _post(env, recs)
    exds = sorted(set(x["ex_date"] for x in recs))
    print(f"累積除權息因子：{len(recs)} 檔（除權息日 {exds}）status={status}"
          if status in (200, 201) else f"[error] 上傳失敗 {status}")


if __name__ == "__main__":
    main()
