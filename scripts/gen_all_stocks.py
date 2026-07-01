"""
從 TWSE 抓所有上市普通股代碼，存入 scripts/all_stocks.txt。
建議每月跑一次更新清單（新上市、下市個股）。

用法：
  python scripts/gen_all_stocks.py
"""
import json
import ssl
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "all_stocks.txt"

# TWSE 部分端點在 Windows Python 有憑證問題，跳過驗證
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _get(url: str) -> list | dict | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  [warn] {url} 失敗：{e}")
        return None


def _is_ordinary_stock(code: str) -> bool:
    """4 碼純數字、≥ 1000 → 普通股（排除 ETF 如 0050/0056）"""
    return code.isdigit() and len(code) == 4 and int(code) >= 1000


def fetch_twse_codes() -> list[str]:
    seen: set[str] = set()

    # 來源 1：TWSE 公司基本資料（含停牌股，最完整）
    data = _get("https://openapi.twse.com.tw/v1/opendata/t187ap03_L")
    if isinstance(data, list):
        for row in data:
            code = str(row.get("公司代號", "")).strip()
            if _is_ordinary_stock(code):
                seen.add(code)
        print(f"  t187ap03_L：{len(seen)} 支")

    # 來源 2：TWSE STOCK_DAY_ALL（補充當日有成交但不在清單的）
    data2 = _get("https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json")
    prev = len(seen)
    if isinstance(data2, dict) and data2.get("data"):
        for row in data2.get("data", []):
            code = str(row[0]).strip()
            if _is_ordinary_stock(code):
                seen.add(code)
        print(f"  STOCK_DAY_ALL 補充：+{len(seen)-prev} 支")
    else:
        print("  STOCK_DAY_ALL 無資料（非交易日或 API 暫無回應，略過）")

    return sorted(seen)


if __name__ == "__main__":
    print("正在抓取 TWSE 上市普通股清單…")
    codes = fetch_twse_codes()
    print(f"合計 {len(codes)} 支上市普通股")
    OUT.write_text("\n".join(codes) + "\n", encoding="utf-8")
    print(f"已存入 {OUT}")
