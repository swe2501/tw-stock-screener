"""
gov_broker_moneylink.py — 官股券商（八大公股）買賣超，改用 money-link（富聯網）實際成交金額，
取代原 gov_broker.py 的「張×均價」估算（口徑偏低約三成、對不上合夥人看盤軟體）。

來源：https://www.money-link.com.tw/stxba/imwcontent0.asp?page=hott3&ID=HOTT3
  同一頁含「上市 / 上櫃 / 全市場」三區，各列 8 家官股券商 今日買進/今日賣出/今日買賣超/近5/近20/近60/今年以來（百萬元，含鉅額）。
  以「全市場」區的「合計」列當卡片 headline（與合夥人看盤軟體 1:1：2026/10/13 全市場 買1331.12億/賣918.51億/淨412.61億）。
資料為實際成交金額（非張×均價），且 money-link 盤後當日即更新（與官網 Put/Call 同步級）。

寫 Supabase gov_broker_daily（date PK，broker 記來源）：buy_amt/sell_amt/net_amt（元）。
前端首頁「全市場官股券商」卡片讀此表，不用改。個股買超/賣超榜（gov_broker_stock）仍由既有來源提供。
用法：python scripts/gov_broker_moneylink.py [--dry]
"""
import sys, re, ssl, json, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

URL = "https://www.money-link.com.tw/stxba/imwcontent0.asp?page=hott3&ID=HOTT3"
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


def _fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=30, context=_CTX).read()
    for enc in ("big5", "cp950", "utf-8"):
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode("utf-8", "replace")


def _strip(s):
    return re.sub(r"<[^>]+>", "", s).replace("&nbsp;", " ").strip()


def parse(html):
    """回 {'上市':{...}, '上櫃':{...}, '全市場':{...}, '_date':...}。
    頁面有三個區塊(上市/上櫃/全市場)，區段標題非獨立 <tr>，但三個「合計」列依序即 上市→上櫃→全市場。"""
    out = {}
    trs = [_strip(tr) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I)]
    # 日期：標題列 strip 後形如「…(1152026/10/13)」，從任何列抓第一個 YYYY/MM/DD
    date_iso = None
    for t in trs:
        m = re.search(r"(20\d{2})/(\d{1,2})/(\d{1,2})", t)
        if m:
            date_iso = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"; break
    out["_date"] = date_iso
    totals = []
    for t in trs:
        if t.startswith("合計"):
            nums = [int(x.replace(",", "")) for x in re.findall(r"-?[\d,]+", t.replace("合計", "", 1)) if x not in ("", "-")]
            if len(nums) >= 3:
                totals.append({"buy_m": nums[0], "sell_m": nums[1], "net_m": nums[2],
                               "d5_m": nums[3] if len(nums) > 3 else None,
                               "d20_m": nums[4] if len(nums) > 4 else None,
                               "d60_m": nums[5] if len(nums) > 5 else None,
                               "ytd_m": nums[6] if len(nums) > 6 else None})
    for name, idx in (("上市", 0), ("上櫃", 1), ("全市場", 2)):
        if len(totals) > idx:
            out[name] = totals[idx]
    return out


def main():
    dry = "--dry" in sys.argv
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    data = parse(_fetch())
    date_iso = data.get("_date")
    whole = data.get("全市場")
    if not date_iso or not whole:
        print(f"[error] 解析失敗 date={date_iso} 全市場={whole}"); sys.exit(1)
    for k in ("上市", "上櫃", "全市場"):
        if data.get(k):
            s = data[k]
            print(f"  {k}: 買 {s['buy_m']/100:.2f}億 賣 {s['sell_m']/100:.2f}億 淨 {s['net_m']/100:+.2f}億")
    _m = lambda v: (v * 1_000_000) if v is not None else None
    row = {"date": date_iso, "broker": "官股八大(money-link全市場)",
           "buy_amt": whole["buy_m"] * 1_000_000, "sell_amt": whole["sell_m"] * 1_000_000,
           "net_amt": whole["net_m"] * 1_000_000,
           "net5": _m(whole["d5_m"]), "net20": _m(whole["d20_m"]), "net60": _m(whole["d60_m"])}
    print(f"全市場 {date_iso}: 買 {row['buy_amt']/1e8:.2f}億 賣 {row['sell_amt']/1e8:.2f}億 淨 {row['net_amt']/1e8:+.2f}億")
    if dry:
        print("[dry] 未寫入"); return
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/gov_broker_daily?on_conflict=date",
                                 data=json.dumps([row]).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "apikey": key,
                                          "Authorization": f"Bearer {key}",
                                          "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"已寫入 gov_broker_daily {date_iso}（status {r.status}）")


if __name__ == "__main__":
    main()
