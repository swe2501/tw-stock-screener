"""
breadth_ext.py — 市場廣度延伸指標（比照玩股網 騰落線／多空頭排列／市場寬度／新高-新低 ＋ 合夥人「站上 20/60 日家數」）

母體：本機 SQLite stock_daily（上市 twse／上櫃 otc 普通股，2024-07 起）＋ etf_daily（上市／上櫃 ETF）。
每個交易日 × market(all/tse/otc) × etf(incl 含 ETF／excl 扣 ETF) 一列：
  up/down/flat         收盤 vs 前一交易日收盤（該股自身前一筆）
  up_limit/down_limit  漲跌幅 ≥ +9.5% / ≤ −9.5%
  red_k/black_k        收 > 開 / 收 < 開
  maN_cnt/maN_base     收盤 > N 日均線（含當日）家數 / 有 N 日歷史可計算家數，N=20/60/240
  both_cnt/both_base   同時站上 20 與 60 日線
  bull_s/bear_s/base_s 短均線多頭 MA5>MA10>MA20 / 空頭 MA5<MA10<MA20
  bull_l/bear_l/base_l 長均線多頭 MA10>MA20>MA60 / 空頭 MA10<MA20<MA60（2026-09-28 改，與玩股網數值對得上）
  new_high/new_low     收盤 > / < 前 251 個交易日（含當日共 252 日＝52 週）最高 / 最低收盤
  taiex / taiex_ex2330 加權收盤 / 扣除台積電估算指數：r_ex＝(r_加權 − w×r_2330) ÷ (1 − w)，
                       w＝前一日台積電市值 ÷ 上市普通股總市值（股數用證交所 t187ap03_L 現行已發行股數；除權息日略有誤差）
→ Supabase breadth_ext（主鍵 trade_date, market, etf；建表 sql/breadth_ext.sql）。全量重算、冪等，每日盤後跑。
用法：python scripts/breadth_ext.py
"""
import json
import sqlite3
import ssl
import sys
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_analysis as ba          # noqa: E402
import broker_signals as bs           # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

LIMIT = 9.5
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
FIELDS = ["universe", "up", "down", "flat", "up_limit", "down_limit", "red_k", "black_k",
          "ma20_cnt", "ma60_cnt", "ma240_cnt", "both_cnt", "ma20_base", "ma60_base", "ma240_base", "both_base",
          "bull_s", "bear_s", "base_s", "bull_l", "bear_l", "base_l", "new_high", "new_low", "base_hl"]


def load():
    c = sqlite3.connect(str(ba.DB_PATH)); c.execute("pragma busy_timeout=60000")
    otc = {r[0] for r in c.execute("select distinct code from stock_daily where market='otc'")}
    series = defaultdict(list)     # code -> [(date,o,h,l,c)]
    kind = {}                      # code -> (market, is_etf)
    for code, d, o, h, l, cl in c.execute("select code,trade_date,open,high,low,close from stock_daily where close is not null order by code,trade_date"):
        series[code].append((d, o, h, l, cl)); kind[code] = ("otc" if code in otc else "tse", False)
    try:
        for code, d, o, h, l, cl, mk in c.execute("select code,trade_date,open,high,low,close,market from etf_daily where close is not null order by code,trade_date"):
            series[code].append((d, o, h, l, cl)); kind[code] = (mk, True)
    except sqlite3.OperationalError:
        print("[warn] 尚無 etf_daily，含 ETF 版本將等同扣 ETF")
    return series, kind


def compute(series, kind):
    agg = defaultdict(lambda: defaultdict(int))     # (date, market, etf) -> field -> n
    close_of = defaultdict(dict)                    # 供扣台積電用：date -> code -> close（上市普通股）
    for code, rows in series.items():
        mk, is_etf = kind[code]
        keys = [(mk, "incl"), ("all", "incl")] + ([] if is_etf else [(mk, "excl"), ("all", "excl")])
        cl = [r[4] for r in rows]
        cs = [0.0]
        for x in cl:
            cs.append(cs[-1] + x)
        ma = lambda n, i: (cs[i + 1] - cs[i + 1 - n]) / n if i + 1 >= n else None
        dq_max, dq_min = deque(), deque()          # 前 251 日（不含當日）的收盤最高/最低（單調佇列）
        for i, (d, o, h, l, c) in enumerate(rows):
            if mk == "tse" and not is_etf:
                close_of[d][code] = c
            j = i - 1                               # 把 i-1 放進窗口，並移出 i-252 之前
            if j >= 0:
                while dq_max and cl[dq_max[-1]] <= cl[j]: dq_max.pop()
                dq_max.append(j)
                while dq_min and cl[dq_min[-1]] >= cl[j]: dq_min.pop()
                dq_min.append(j)
            while dq_max and dq_max[0] < i - 251: dq_max.popleft()
            while dq_min and dq_min[0] < i - 251: dq_min.popleft()
            if i == 0:
                continue
            pc = cl[i - 1]
            if not pc:
                continue
            f = {"universe": 1}
            chg = (c / pc - 1) * 100
            f["up" if c > pc else ("down" if c < pc else "flat")] = 1
            if chg >= LIMIT: f["up_limit"] = 1
            if chg <= -LIMIT: f["down_limit"] = 1
            if o:
                if c > o: f["red_k"] = 1
                elif c < o: f["black_k"] = 1
            m5, m10, m20, m60, m240 = ma(5, i), ma(10, i), ma(20, i), ma(60, i), ma(240, i)
            for n, m in ((20, m20), (60, m60), (240, m240)):
                if m is not None:
                    f[f"ma{n}_base"] = 1
                    if c > m: f[f"ma{n}_cnt"] = 1
            if m20 is not None and m60 is not None:
                f["both_base"] = 1
                if c > m20 and c > m60: f["both_cnt"] = 1
            if m20 is not None:
                f["base_s"] = 1
                if m5 > m10 > m20: f["bull_s"] = 1
                elif m5 < m10 < m20: f["bear_s"] = 1
            if m60 is not None:
                f["base_l"] = 1
                if m10 > m20 > m60: f["bull_l"] = 1
                elif m10 < m20 < m60: f["bear_l"] = 1
            if i >= 251:
                f["base_hl"] = 1
                if c > cl[dq_max[0]]: f["new_high"] = 1
                elif c < cl[dq_min[0]]: f["new_low"] = 1
            for k in keys:
                a = agg[(d,) + k]
                for fk, fv in f.items():
                    a[fk] += fv
    return agg, close_of


def taiex_series(env):
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/taiex_daily?select=trade_date,close&order=trade_date.desc&limit=1000",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    return {r["trade_date"]: float(r["close"]) for r in json.loads(urllib.request.urlopen(req, timeout=60).read())}


def shares_map():
    req = urllib.request.Request("https://openapi.twse.com.tw/v1/opendata/t187ap03_L", headers={"User-Agent": "Mozilla/5.0"})
    out = {}
    for r in json.loads(urllib.request.urlopen(req, timeout=40, context=_CTX).read().decode("utf-8-sig")):
        v = str(r.get("已發行普通股數或TDR原股發行股數", "")).replace(",", "")
        if v.isdigit():
            out[str(r.get("公司代號", "")).strip()] = int(v)
    return out


def ex_tsmc(dates, tx, close_of, shares):
    out, prev_d, ex = {}, None, None
    for d in dates:
        if d not in tx:
            continue
        if prev_d is None or ex is None:
            ex = tx[d]
        else:
            pc, cc = close_of.get(prev_d, {}), close_of.get(d, {})
            cap = sum(shares[k] * v for k, v in pc.items() if k in shares)
            w = (shares.get("2330", 0) * pc.get("2330", 0) / cap) if cap else 0
            r_idx = tx[d] / tx[prev_d] - 1
            r_t = (cc["2330"] / pc["2330"] - 1) if ("2330" in cc and "2330" in pc) else 0
            ex = ex * (1 + (r_idx - w * r_t) / (1 - w)) if w < 1 else ex
        out[d] = round(ex, 2); prev_d = d
    return out


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    series, kind = load()
    print(f"母體：{sum(1 for k in kind.values() if not k[1])} 檔普通股＋{sum(1 for k in kind.values() if k[1])} 檔 ETF")
    agg, close_of = compute(series, kind)
    tx = taiex_series(env)
    dates = sorted({k[0] for k in agg})
    try:
        exm = ex_tsmc(dates, tx, close_of, shares_map())
    except Exception as e:
        print(f"[warn] 扣台積電指數計算失敗：{e}"); exm = {}
    rows = []
    for (d, mk, etf), a in sorted(agg.items()):
        if a["universe"] < 50:          # 開頭幾天母體不足（上櫃較晚開始累積）略過
            continue
        r = {"trade_date": d, "market": mk, "etf": etf, "taiex": tx.get(d), "taiex_ex2330": exm.get(d)}
        for f in FIELDS:
            r[f] = a.get(f, 0)
        rows.append(r)
    key = env["SUPABASE_SERVICE_KEY"]
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/breadth_ext?on_conflict=trade_date,market,etf", method="POST",
                                     data=json.dumps(rows[i:i + 500]).encode(),
                                     headers={"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
                                              "Prefer": "resolution=merge-duplicates,return=minimal"})
        urllib.request.urlopen(req, timeout=120)
    last = [r for r in rows if r["trade_date"] == dates[-1]]
    for r in last:
        print(f"{r['trade_date']} {r['market']}/{r['etf']}: 母體{r['universe']} 漲{r['up']} 跌{r['down']} 紅K{r['red_k']} 黑K{r['black_k']} "
              f"20日{r['ma20_cnt']}/{r['ma20_base']} 60日{r['ma60_cnt']}/{r['ma60_base']} 雙站{r['both_cnt']} 240日{r['ma240_cnt']}/{r['ma240_base']} "
              f"短多{r['bull_s']}短空{r['bear_s']}/{r['base_s']} 長多{r['bull_l']}長空{r['bear_l']}/{r['base_l']} 新高{r['new_high']} 新低{r['new_low']}")
    print(f"已上傳 breadth_ext {len(rows)} 列（{dates[0]}～{dates[-1]}）；扣台積電指數 {dates[-1]}＝{exm.get(dates[-1])}")


if __name__ == "__main__":
    main()
