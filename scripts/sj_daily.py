"""
sj_daily.py — 用永豐 Shioaji「每日行情」(daily_quotes，指定日期、一次全市場) 替本機日K 品管＋補洞（2026-10-31）。

為什麼：證交所／櫃買的抓取偶爾整批或部分漏（10/29 上櫃只抓到一部分、少了 178 檔），網站就會「少一天」。
做法：
  1. 對最近 N 個交易日（預設 5），向永豐要該日全市場開高低收量（量＝股數，與本機 stock_daily 同單位）。
  2. 本機 D:/stock_data/wantgoo_full.db stock_daily 缺的個股（四碼、非 00 開頭 ETF，與本機收錄範圍一致）→ 補進去，market 依永豐合約（TSE→twse、OTC→otc）。
  3. 已有的不覆蓋；收盤價不同只列出（不自動改），交給人判斷。
登入只用行情權限的 API Key（.env.local：SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY）。
用法：python scripts/sj_daily.py [--days 5] [--dry]
"""
import datetime as dt
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)  # api.Contracts 已標 deprecated，但新介面尚無 Stocks.TSE/OTC 分類
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
DB = Path(r"D:\stock_data\wantgoo_full.db")


def login():
    import shioaji as sj
    env = bs._load_env()
    key, sec = (env.get("SHIOAJI_API_KEY") or "").strip(), (env.get("SHIOAJI_SECRET_KEY") or "").strip()
    if not key or not sec:
        raise SystemExit("[error] .env.local 缺 SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY")
    api = sj.Shioaji()
    api.login(api_key=key, secret_key=sec, subscribe_trade=False)
    for _ in range(90):                      # 登入後合約會自動下載，等它好（不要再呼叫 fetch_contracts，會衝突）
        try:
            if len(list(api.Contracts.Stocks.TSE)) > 500 and len(list(api.Contracts.Stocks.OTC)) > 500:
                break
        except Exception:
            pass
        time.sleep(1)
    return api


def main():
    days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 5
    dry = "--dry" in sys.argv
    api = login()
    exch = {c.code: "otc" for c in api.Contracts.Stocks.OTC}
    exch.update({c.code: "twse" for c in api.Contracts.Stocks.TSE})
    conn = sqlite3.connect(str(DB), timeout=60)
    conn.execute("pragma busy_timeout=60000")
    # 只補「本機本來就在追蹤」的股票（近 60 天出現過）：補那天剛好漏抓的，不擴大收錄範圍
    # （新上市／不在清單的股票直接加進來會改變大盤廣度家數等母體，且只有零星幾天歷史）
    tracked = {r[0] for r in conn.execute(
        "select distinct code from stock_daily where trade_date >= date('now','-60 day')")}

    # 交易日：從今天往回試，永豐有資料的日子才算（休市日回空）
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    got, d, tries = [], today, 0
    total_add = 0
    while len(got) < days and tries < days * 3 + 7:
        tries += 1
        q = dict(api.daily_quotes(date=d))
        codes = q.get("Code") or []
        if codes:
            iso = d.isoformat()
            got.append(iso)
            loc = {r[0]: r[1] for r in conn.execute("select code, close from stock_daily where trade_date=?", (iso,))}
            add, diff = [], []
            for i, code in enumerate(codes):
                if not (len(code) == 4 and code.isdigit()) or code.startswith("00"):
                    continue                    # 本機只收四碼個股，不收 ETF／權證
                o, h, lo, c, v = (q["Open"][i], q["High"][i], q["Low"][i], q["Close"][i], q["Volume"][i])
                if not c:
                    continue                    # 當日無成交
                if code in loc:
                    if loc[code] is not None and abs(loc[code] - c) > 0.001:
                        diff.append((code, loc[code], c))
                    continue
                if code not in tracked:
                    continue
                add.append((code, iso, o or c, h or c, lo or c, c, int(v or 0), exch.get(code, "twse")))
            mk = {}
            for r in add:
                mk[r[7]] = mk.get(r[7], 0) + 1
            print(f"{iso} 永豐 {len(codes)} 檔｜本機缺 {len(add)} 檔 {mk} {[r[0] for r in add[:10]]}｜收盤不同 {len(diff)} {diff[:5]}")
            if add and not dry:
                conn.executemany("insert or ignore into stock_daily (code, trade_date, open, high, low, close, volume, market) "
                                 "values (?,?,?,?,?,?,?,?)", add)
                conn.commit()
                total_add += len(add)
        d -= dt.timedelta(days=1)
    print(f"{'[試跑] ' if dry else ''}完成：檢查 {len(got)} 個交易日，補 {total_add} 列；永豐用量 {api.usage()}")
    api.logout()


if __name__ == "__main__":
    main()
