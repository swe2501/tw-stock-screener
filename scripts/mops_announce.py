"""
mops_announce.py — 上市＋上櫃公司「每日重大訊息」（公開資訊觀測站，官方）→ Supabase stock_announce。
供 K 線右側「相關新聞」分頁的「📢 重大訊息」區（依公司代號直接對應，最精準）。

資料源（openapi，只有最新一天，故每日排程累積）：
  上市 https://openapi.twse.com.tw/v1/opendata/t187ap04_L
  上櫃 https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O
  欄位：發言日期/發言時間(民國/HHMMSS)、公司代號、公司名稱、主旨、符合條款、事實發生日、說明。
存法：只存主旨＋說明前 300 字；保留 90 天（容量估算：每天約 200~600 則 × 90 天 ≈ 3.6 萬列 × 0.7KB ≈ 25MB）。
用法：python scripts/mops_announce.py
"""
import hashlib, json, ssl, sys, urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
SRC = [("twse", "https://openapi.twse.com.tw/v1/opendata/t187ap04_L"),
       ("otc", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O")]
KEEP_DAYS = 90


def _g(r, *keys):
    for k in keys:
        for kk in r:
            if kk.strip() == k:
                return str(r[kk] or "").strip()
    return ""


def _roc(s):
    s = s.strip()
    if len(s) == 7 and s.isdigit():
        return f"{int(s[:3]) + 1911}-{s[3:5]}-{s[5:]}"
    return None


def fetch():
    out = []
    for mkt, url in SRC:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        rows = json.loads(urllib.request.urlopen(req, timeout=40, context=_CTX).read().decode("utf-8-sig"))
        for r in rows:
            code = _g(r, "公司代號", "SecuritiesCompanyCode")
            d = _roc(_g(r, "發言日期"))
            subj = _g(r, "主旨").replace("\r\n", " ").replace("\n", " ")
            if not code or not d or not subj:
                continue
            t = _g(r, "發言時間").zfill(6)
            detail = _g(r, "說明").replace("\r\n", "\n")[:300]
            key = f"{code}|{d}|{t}|" + hashlib.md5(subj.encode()).hexdigest()[:8]
            out.append({"key": key, "code": code, "name": _g(r, "公司名稱", "CompanyName"), "market": mkt,
                        "ann_date": d, "ann_time": f"{t[:2]}:{t[2:4]}", "subject": subj[:300],
                        "clause": _g(r, "符合條款") or None, "detail": detail or None})
        print(f"{mkt}：{len([x for x in out if x['market'] == mkt])} 則")
    return out


def main():
    env = bs._load_env(); key = env["SUPABASE_SERVICE_KEY"]
    hdr = {"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    rows = fetch()
    uniq = list({r["key"]: r for r in rows}.values())
    for i in range(0, len(uniq), 500):
        req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/stock_announce?on_conflict=key",
                                     data=json.dumps(uniq[i:i + 500]).encode(), method="POST", headers=hdr)
        urllib.request.urlopen(req, timeout=60).read()
    cutoff = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
    req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/stock_announce?ann_date=lt.{cutoff}", method="DELETE", headers=hdr)
    urllib.request.urlopen(req, timeout=60).read()
    print(f"已寫入 stock_announce {len(uniq)} 則（刪除 {cutoff} 以前）")


if __name__ == "__main__":
    main()
