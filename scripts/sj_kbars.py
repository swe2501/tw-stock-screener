"""
sj_kbars.py — 收盤後用永豐 Shioaji 抓「全市場 1 分 K」存本機（2026-10-31）。

存放：D:/stock_data/kbars_1m.db（獨立檔，不放進 wantgoo_full.db，避免主庫變肥、夜間互鎖）
  表 kbar_1m(code, d, t, open, high, low, close, volume, amount)
    d＝交易日 YYYY-MM-DD；t＝分 K 結束時間 HHMM（永豐慣例，09:01～13:30，第一根含開盤集合競價）
    volume＝張（永豐 kbars 單位，注意：日K stock_daily 是「股」）；amount＝成交金額（元）
母體：當天永豐 daily_quotes 有成交的全部純數字代號（上市＋上櫃個股、ETF），約 2,000 檔。
已存在的 (code, d) 不重抓；永豐限制 10 秒 50 次 → 每次間隔 0.21 秒；一次 kbars 最多 30 天。
用法：
  python scripts/sj_kbars.py                 # 最近 1 個交易日（夜間排程用）
  python scripts/sj_kbars.py --days 20       # 回補最近 20 個交易日
  python scripts/sj_kbars.py --codes 2330,2317 --days 5
"""
import datetime as dt
import sqlite3
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=DeprecationWarning)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sj_daily  # noqa: E402  共用登入

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
DB = Path(r"D:\stock_data\kbars_1m.db")
GAP = 0.21          # 10 秒 50 次 → 每次至少 0.2 秒


def open_db():
    conn = sqlite3.connect(str(DB), timeout=60)
    conn.execute("pragma journal_mode=wal")
    conn.execute("pragma busy_timeout=60000")
    conn.execute("""create table if not exists kbar_1m (
        code text not null, d text not null, t integer not null,
        open real, high real, low real, close real, volume integer, amount real,
        primary key (code, d, t)) without rowid""")
    conn.execute("create table if not exists kbar_day (d text not null, code text not null, bars integer, "
                 "primary key (d, code)) without rowid")   # 每檔每日抓過的紀錄（0 根也記，避免重抓）
    return conn


def _arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    days = int(_arg("--days", "1"))
    only = [c.strip() for c in (_arg("--codes", "") or "").split(",") if c.strip()]
    api = sj_daily.login()                      # login() 會在系統層靜音（永豐連線訊息含身分證字號）
    conn = open_db()

    # 1) 找最近 N 個交易日與當天有成交的代號
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    day_codes, d, tries = {}, today, 0
    while len(day_codes) < days and tries < days * 2 + 10:
        tries += 1
        q = dict(api.daily_quotes(date=d))
        codes = [c for i, c in enumerate(q.get("Code") or []) if c.isdigit() and (q["Volume"][i] or 0) > 0]
        if codes:
            day_codes[d.isoformat()] = set(only) & set(codes) if only else set(codes)
        d -= dt.timedelta(days=1)
        time.sleep(GAP)
    if not day_codes:
        print("[skip] 找不到交易日"); api.logout(); return
    done = {(r[0], r[1]) for r in conn.execute(
        "select d, code from kbar_day where d between ? and ?", (min(day_codes), max(day_codes)))}

    # 2) 每檔需要的日期 → 合成 ≤30 天的區段一次抓
    need = {}
    for iso, codes in day_codes.items():
        for c in codes:
            if (iso, c) not in done:
                need.setdefault(c, []).append(iso)
    print(f"交易日 {sorted(day_codes)[0]}～{sorted(day_codes)[-1]}（{len(day_codes)} 天）｜要抓 {len(need)} 檔、"
          f"{sum(len(v) for v in need.values())} 檔日")
    t0, n_call, n_bar, n_err = time.time(), 0, 0, 0
    for i, (code, isos) in enumerate(sorted(need.items())):
        try:
            contract = api.Contracts.Stocks[code]
        except Exception:
            contract = None
        if contract is None:
            continue
        isos = sorted(isos)
        chunks, s = [], 0
        while s < len(isos):                  # 依 30 個日曆日切段
            e = s
            while e + 1 < len(isos) and (dt.date.fromisoformat(isos[e + 1]) - dt.date.fromisoformat(isos[s])).days < 30:
                e += 1
            chunks.append((isos[s], isos[e])); s = e + 1
        for a, b in chunks:
            kb = None
            for attempt in range(3):
                try:
                    kb = dict(api.kbars(contract, start=a, end=b)); break
                except Exception as ex:
                    if attempt == 2:
                        print(f"[warn] {code} {a}~{b} 失敗：{ex}"); n_err += 1
                    time.sleep(2)
            n_call += 1
            time.sleep(GAP)
            if kb is None:
                continue
            rows, per = [], {}
            want = set(x for x in isos if a <= x <= b)
            for j, ts in enumerate(kb.get("ts") or []):
                t = dt.datetime.fromtimestamp(ts / 1e9, dt.timezone.utc)   # 永豐 ts 是台灣時間標成 UTC
                iso = t.date().isoformat()
                if iso not in want:
                    continue
                rows.append((code, iso, t.hour * 100 + t.minute, kb["Open"][j], kb["High"][j], kb["Low"][j],
                             kb["Close"][j], int(kb["Volume"][j] or 0), kb["Amount"][j]))
                per[iso] = per.get(iso, 0) + 1
            conn.executemany("insert or replace into kbar_1m values (?,?,?,?,?,?,?,?,?)", rows)
            conn.executemany("insert or replace into kbar_day values (?,?,?)",
                             [(iso, code, per.get(iso, 0)) for iso in want])
            n_bar += len(rows)
        if (i + 1) % 200 == 0:
            conn.commit()
            print(f"  進度 {i + 1}/{len(need)}｜{n_bar:,} 根｜{time.time() - t0:.0f}s")
    conn.commit()
    u = api.usage()
    print(f"完成：{n_call} 次查詢、{n_bar:,} 根、失敗 {n_err}｜{time.time() - t0:.0f}s｜"
          f"永豐今日已用 {u.bytes / 1e6:.1f}MB／{u.limit_bytes / 1e6:.0f}MB")
    api.logout()
    conn.close()


if __name__ == "__main__":
    main()
