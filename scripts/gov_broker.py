"""
gov_broker.py — 官股券商買賣超(用戶定案 2026-09-16：八大公股券商合計,不只兆豐)。
資料源：本機 D:\\stock_data\\wantgoo_full.db  wantgoo_daily(分點每日買賣全量)。
  金額 = Σ(buy_vol×buy_avg_price − sell_vol×sell_avg_price) × 1000  (vol 單位=張)
  八大公股券商 = 兆豐/第一金/合作金庫/華南永昌/臺銀/土地銀行/彰銀/臺灣中小企銀(台企銀)。
  用 broker_name 前綴比對(GOV_PREFIXES);單次全表掃描後於 Python 過濾(避免每前綴各掃一次,DB 無索引很慢)。
→ Supabase：
   gov_broker_daily(date PK)      八大官股合計 買進/賣出/淨額(元),broker 欄記「官股八大」
   gov_broker_stock(date,code)    八大官股合計 個股淨買賣超(只存 top±20,供買超/賣超榜)
用法：python scripts/gov_broker.py
"""
import sqlite3, sys, json, urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB = Path(r"D:\stock_data\wantgoo_full.db")
TOPN = 20
# 八大公股券商 broker_name 前綴(含常見異體);比對用 startswith
GOV_PREFIXES = ("兆豐", "第一金", "合作金庫", "合庫", "華南永昌",
                "臺銀", "台銀", "土地銀行", "土銀", "彰銀",
                "臺灣中小企", "臺企銀", "台企銀")


def _post(env, table, rows, conflict):
    if not rows:
        return 0
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/{table}?on_conflict={conflict}"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    c = sqlite3.connect(str(DB))
    (day,) = c.execute("select max(trade_date) from wantgoo_daily").fetchone()
    # 單次掃描當日全部分點,Python 端過濾八大官股(DB 無 broker_name 索引,逐前綴 LIKE 會各掃一次很慢)
    all_rows = c.execute(
        "select broker_name,code,buy_vol,sell_vol,buy_avg_price,sell_avg_price from wantgoo_daily "
        "where trade_date=?", (day,)).fetchall()

    buy = sell = 0.0
    net = defaultdict(float)
    matched = defaultdict(float)  # 各官股券商淨額(億),供核對
    nrows = 0
    for bn, code, bv, sv, bp, sp in all_rows:
        if not bn:
            continue
        firm = next((p for p in GOV_PREFIXES if bn.startswith(p)), None)
        if not firm:
            continue
        nrows += 1
        b = (bv or 0) * (bp or 0) * 1000
        s = (sv or 0) * (sp or 0) * 1000
        buy += b; sell += s
        net[code] += b - s
        matched[firm] += (b - s) / 1e8
    print(f"官股八大 {day}: {nrows} 列 (全表 {len(all_rows)} 列)")
    for f_, v in sorted(matched.items(), key=lambda x: -abs(x[1])):
        print(f"    {f_}: 淨 {v:+.1f}億")
    # 2026-10-14：每日總額(gov_broker_daily)改由 gov_broker_moneylink.py 以 money-link 實際成交金額寫入
    #   （張×均價估算口徑偏低約三成、對不上合夥人）。本腳本只保留個股買賣超榜 gov_broker_stock。
    print(f"  (參考估算) 合計 買進 {buy/1e8:.1f}億 賣出 {sell/1e8:.1f}億 淨 {(buy-sell)/1e8:.1f}億；每日總額改由 money-link 寫入")

    ordered = sorted(net.items(), key=lambda x: -x[1])
    keep = ordered[:TOPN] + ordered[-TOPN:]
    stock_rows = [{"date": day, "code": k, "net_amt": int(v)} for k, v in keep]

    st = _post(env, "gov_broker_stock", stock_rows, "date,code")
    print(f"已上傳 gov_broker_stock({len(stock_rows)} 列, status {st})；每日總額見 gov_broker_moneylink.py")


if __name__ == "__main__":
    main()
