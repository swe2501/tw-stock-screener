"""
sector_turnover.py — 盤面結構「上市成交比重」(電子/金融/其他傳產)。

資料源：TWSE MI_INDEX?type=ALL 的「每日收盤行情(全部)」表 → 各股成交金額。
依 api/screen.py 的 _STOCK_INDUSTRY(上市個股→產業)歸三大類，算各類成交值佔比。
  電子 = 半導體/電子零組件/電腦及週邊/光電/通信網路/電子通路/其他電子/資訊服務/數位雲端
  金融 = 金融保險
  其他傳產 = 其餘有產業別的個股(不含 ETF/權證/受益證券，那些不在對照表)
分母 = 三類加總(＝有產業別的上市個股成交值)。門檻(合夥人定)：電子>60% 防線、金融>10% 警戒。
→ Supabase sector_turnover(date PK, 累積歷史)。
用法：python scripts/sector_turnover.py [--days N]   # 預設只抓最近交易日；--days 回補
"""
import ssl, sys, json, argparse, urllib.request
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "api"))
import broker_signals as bs           # _load_env / _sb
import screen as scr                  # 借用 _STOCK_INDUSTRY

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl._create_unverified_context()
IND = scr._STOCK_INDUSTRY
ELEC = {"半導體業","電子零組件業","電腦及週邊設備業","光電業","通信網路業",
        "電子通路業","其他電子業","資訊服務業","數位雲端"}
FIN = {"金融保險"}


def _twse(date_str):
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={date_str}&type=ALL"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0",
                                               "Referer": "https://www.twse.com.tw/"})
    with urllib.request.urlopen(req, timeout=30, context=_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def _num(s):
    try:
        return float(str(s).replace(",", "").strip())
    except Exception:
        return 0.0


def _compute(date_str):
    """回傳 (row dict) 或 None(非交易日)。"""
    j = _twse(date_str)
    if j.get("stat") != "OK":
        return None
    # 找「每日收盤行情(全部)」表：欄位同時含證券代號與成交金額
    tbl = None
    for t in (j.get("tables") or []):
        f = t.get("fields") or []
        if any("證券代號" in x for x in f) and any("成交金額" in x for x in f):
            tbl = t
            break
    if not tbl:
        return None
    fields = tbl["fields"]
    ci = next(i for i, x in enumerate(fields) if "證券代號" in x)
    ai = next(i for i, x in enumerate(fields) if "成交金額" in x)
    elec = fin = trad = 0.0
    trad_by_ind = {}                      # 各傳產產業別成交值,取最大者
    for row in tbl.get("data") or []:
        code = str(row[ci]).strip()
        ind = IND.get(code)
        if not ind:
            continue                      # 非個股(ETF/權證/DR未列)或未知→不計
        amt = _num(row[ai])
        if ind in ELEC:
            elec += amt
        elif ind in FIN:
            fin += amt
        else:
            trad += amt
            trad_by_ind[ind] = trad_by_ind.get(ind, 0.0) + amt
    total = elec + fin + trad
    if total <= 0:
        return None
    r = lambda v: round(v / total * 100, 2)
    top_name, top_amt = ("", 0.0)
    if trad_by_ind:
        top_name, top_amt = max(trad_by_ind.items(), key=lambda kv: kv[1])
        top_name = top_name.replace("工業", "").replace("業", "")  # 「塑膠工業」→「塑膠」精簡
    return {"date": f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}",
            "elec_amt": int(elec), "fin_amt": int(fin), "trad_amt": int(trad),
            "total_amt": int(total), "elec_pct": r(elec), "fin_pct": r(fin), "trad_pct": r(trad),
            "top_trad_name": top_name, "top_trad_pct": r(top_amt)}


def _upsert(env, rows):
    import urllib.request as u
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/sector_turnover?on_conflict=date"
    body = json.dumps(rows).encode()
    req = u.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with u.urlopen(req, timeout=30) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1, help="從今天往回嘗試的天數(回補用)")
    args = ap.parse_args()
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)

    rows, tried = [], 0
    d = datetime.now()
    # 只抓最近交易日：往回找到第一個 OK 就停(days=1)；回補模式收集多天
    while tried < max(args.days, 1) + 6 and len(rows) < args.days:
        ds = d.strftime("%Y%m%d")
        try:
            row = _compute(ds)
            if row:
                rows.append(row)
                print(f"  {row['date']}: 電子 {row['elec_pct']}% 金融 {row['fin_pct']}% 傳產 {row['trad_pct']}%  (總 {row['total_amt']/1e8:.0f}億)")
        except Exception as e:
            print(f"  {ds} err: {str(e)[:80]}")
        d -= timedelta(days=1)
        tried += 1

    if not rows:
        print("[warn] 無交易日資料"); return
    st = _upsert(env, rows)
    print(f"已 upsert {len(rows)} 天到 sector_turnover (status {st})")


if __name__ == "__main__":
    main()
