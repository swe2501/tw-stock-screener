"""
gen_listed_codes.py — 產出「上市合法代號清單」給 codex 接地用（防它亂編 ticker）。

抓 TWSE 公司基本資料 t187ap03_L → 寫 scripts/tw_listed_codes.json：
  {"3017":{"name":"奇鋐","industry":"電子零組件業"}, ...}
產業別代碼→名稱沿用 screen.py 的對照表。變動慢，偶爾跑一次即可。
用法：python scripts/gen_listed_codes.py
"""
import json
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
from screen import _INDUSTRY_CODE_MAP  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

URL = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
OUT = Path(__file__).resolve().parent / "tw_listed_codes.json"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    rows = json.loads(urllib.request.urlopen(req, timeout=30, context=_CTX).read())
    out = {}
    for r in rows:
        code = str(r.get("公司代號") or "").strip()
        name = str(r.get("公司簡稱") or "").strip()
        ind = _INDUSTRY_CODE_MAP.get(str(r.get("產業別") or "").strip(), "")
        if code and name:
            out[code] = {"name": name, "industry": ind}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"已寫入 {len(out)} 檔上市代號 → {OUT}")


if __name__ == "__main__":
    main()
