"""
fetch_hourly.py — 上市＋上櫃個股 60 分鐘 K（Yahoo Finance），存本機 SQLite stock_hourly，供 stock_sr.py 算「小時K版」分價量表。
Yahoo 60m 最多約 730 天（台股每天 5 根：9、10、11、12、13 點）；盤中 K 不含 13:30 收盤集合競價的量（stock_sr.py 另外補在收盤價）。
明細只存本機（約 700 萬列），不上 Supabase。

用法：
  python scripts/fetch_hourly.py              # 每日：各股抓最近 5 天補齊（insert or replace）
  python scripts/fetch_hourly.py --backfill   # 一次性：各股抓 730 天
  python scripts/fetch_hourly.py --code 2330  # 指定股票
"""
import argparse, json, sqlite3, sys, time, urllib.request
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB_PATH = Path(r"D:\stock_data\wantgoo_full.db")
ALL_STOCKS_FILE = Path(__file__).resolve().parent / "all_stocks.txt"
OTC_NAMES = Path(r"D:\stock_data\otc_names.json")
H = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _db():
    conn = sqlite3.connect(str(DB_PATH)); conn.execute("pragma busy_timeout = 60000")
    conn.execute("""create table if not exists stock_hourly (
        code text not null, ts integer not null, trade_date text not null,
        high real, low real, close real, volume integer, primary key (code, ts))""")
    return conn


def fetch(code, sfx, rng):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.{sfx}?interval=60m&range={rng}"
    for t in range(3):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30).read())
            r = d["chart"]["result"][0]
            ts = r.get("timestamp") or []
            q = (r["indicators"]["quote"] or [{}])[0]
            rows = []
            for i, t0 in enumerate(ts):
                hi, lo, cl, v = q["high"][i], q["low"][i], q["close"][i], q["volume"][i]
                if hi is None or lo is None or not v:
                    continue
                day = time.strftime("%Y-%m-%d", time.gmtime(t0 + 8 * 3600))
                rows.append((code, int(t0), day, hi, lo, cl, int(v)))
            return rows
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            time.sleep(3 * (t + 1))
        except Exception:
            time.sleep(3 * (t + 1))
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--code")
    a = ap.parse_args()
    twse = [l.strip() for l in ALL_STOCKS_FILE.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    otc = list(json.loads(OTC_NAMES.read_text(encoding="utf-8")).keys()) if OTC_NAMES.exists() else []
    todo = [(c, "TW") for c in twse] + [(c, "TWO") for c in otc]
    todo = [x for x in todo if x[0].isdigit() and len(x[0]) == 4 and not x[0].startswith("00")]
    if a.code:
        want = set(a.code.split(",")); todo = [x for x in todo if x[0] in want]
    rng = "730d" if a.backfill else "5d"
    conn = _db(); total = 0
    for i, (c, sfx) in enumerate(todo, 1):
        rows = fetch(c, sfx, rng)
        if rows:
            conn.executemany("insert or replace into stock_hourly values (?,?,?,?,?,?,?)", rows)
            conn.commit(); total += len(rows)
        if i % 100 == 0:
            print(f"[{i}/{len(todo)}] 累計 {total:,} 根", flush=True)
        time.sleep(0.25)
    print(f"完成：{len(todo)} 檔、{total:,} 根小時K（range={rng}）")


if __name__ == "__main__":
    main()
