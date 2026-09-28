"""
foreign_hedge.py — 「外資空單溫度計」資料源：外資期貨淨空名目 ÷ 外資持股市值 = 避險比率，
                    及其 2 年歷史序列（供前端算歷史百分位分級）。市場觀察大類分頁用。

指標定義（與合夥人討論定案，[[project_foreign_hedge]]）：
  V 外資持股市值(上市) = Σ(mi-qfiis「全體外資及陸資持有股數」 × 當日收盤)；含/扣 ETF 兩模式(扣＝排除 00 開頭)。
    · 每日：TWSE STOCK_DAY_ALL 一次取全上市收盤（最準、涵蓋全部）。
    · 回補：Yahoo {code}.TW 逐檔 2 年日收盤（取外資持股市值前 N 大，覆蓋>99%）。
  H 外資期貨淨空名目 = MAX(-淨名目, 0)；淨名目 = Σ(外資 net口 × 指數 × 每點價值)
    每點價值：大台 TX=200、小台 MTX=50、微台 TMF=10。net<0 為淨空。
    大台等值淨口 = net_tx + net_mtx×0.25 + net_tmf×0.05。
    來源：TAIFEX futContractsDate（三大法人-區分各契約，urllib 可讀；?queryDate= 回補）。
  避險比率 R = H / V × 100（%）。分級用「2 年歷史百分位」P50/P80/P95（前端算），
    另加固定紅線 >1.2% 觸發極端警示（輔助）。
  現貨買賣超 = TWSE BFI82U 外資及陸資(不含外資自營商) 買賣差；匯率 = USD/TWD。
→ Supabase foreign_hedge_daily(trade_date PK)。
用法：
  python scripts/foreign_hedge.py --daily         # 每日增量(排程用)
  python scripts/foreign_hedge.py --backfill 730  # 回補近 N 天(一次性)
"""
import ssl, sys, json, re, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
import futures_market as fm

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
_HDR = {"User-Agent": "Mozilla/5.0"}

TX_PV, MTX_PV, TMF_PV = 200, 50, 10          # 每點價值
EQ_MTX, EQ_TMF = 0.25, 0.05                  # 大台等值係數
TOPN = 550                                    # 回補取外資持股市值前 N 大上市股(覆蓋>99%)


def _get(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=_HDR), timeout=timeout, context=_CTX).read()


def _num(x):
    try:
        return float(str(x).replace(",", "").strip())
    except Exception:
        return None


# ── 外資持股股數 (mi-qfiis, 上市) ────────────────────────────────
def miqfiis_shares(date_tw, tries=5):
    """回 {code: 全體外資持有股數}(上市普通股+ETF)。非交易日回 {}。
    TWSE 對密集請求會回 307/308(重導同網址=軟性限流)→ 退避重試。"""
    u = f"https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date={date_tw}&response=json&selectType=ALLBUT0999"
    for t in range(tries):
        try:
            d = json.loads(_get(u, 60))
        except urllib.error.HTTPError as e:
            if e.code in (307, 308, 429, 503):      # 限流 → 退避
                time.sleep(4 * (t + 1) + 2); continue
            print(f"  [warn] mi-qfiis {date_tw} 失敗 {e.code}"); return {}
        except Exception:
            time.sleep(3); continue
        if d.get("stat") != "OK" or not d.get("data"):
            return {}                                # 真非交易日
        out = {}
        for r in d["data"]:
            code = str(r[0]).strip()
            if not re.match(r"^\d{4}[A-Z]?$", code):
                continue
            sh = _num(r[5])
            if sh:
                out[code] = sh
        return out
    print(f"  [warn] mi-qfiis {date_tw} 限流重試 {tries} 次仍失敗"); return {}


# ── 全上市當日收盤 (STOCK_DAY_ALL, 每日用) ───────────────────────
def stock_day_all():
    """回 {code: close}(當日全上市)。TWSE OpenAPI(JSON,穩定;舊 www 端點已改回傳 CSV)。"""
    try:
        d = json.loads(_get("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", 60))
        out = {}
        for r in d:
            code = str(r.get("Code", "")).strip()
            close = _num(r.get("ClosingPrice"))
            if close and re.match(r"^\d{4}[A-Z]?$", code):
                out[code] = close
        return out
    except Exception as e:
        print(f"  [warn] STOCK_DAY_ALL 失敗 {str(e)[:50]}")
        return {}


# ── Yahoo 2 年日收盤 (回補用) ────────────────────────────────────
def yahoo_hist(code, rng="2y"):
    """回 {YYYY-MM-DD: close}。失敗回 {}。"""
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW?range={rng}&interval=1d"
    try:
        d = json.loads(_get(u, 40)); res = d["chart"]["result"][0]
        ts = res["timestamp"]; cl = res["indicators"]["quote"][0]["close"]
        out = {}
        for t, c in zip(ts, cl):
            if c is None:
                continue
            dd = datetime.fromtimestamp(t, timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
            out[dd] = c
        return out
    except Exception:
        return {}


# ── 外資期貨各契約 net (futContractsDate) ────────────────────────
def foreign_futures(date_tw=None):
    """回 (net_tx, net_mtx, net_tmf, iso)。date_tw=YYYYMMDD 或 None(今日)。"""
    if date_tw:
        y, m, dd = date_tw[:4], date_tw[4:6], date_tw[6:]
        url = f"https://www.taifex.com.tw/cht/3/futContractsDate?queryDate={y}%2F{m}%2F{dd}"
    else:
        url = "https://www.taifex.com.tw/cht/3/futContractsDate"
    try:
        html = urllib.request.urlopen(urllib.request.Request(url, headers=_HDR), timeout=40, context=_CTX).read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  [warn] futContracts {date_tw} 失敗 {str(e)[:50]}"); return None, None, None, None
    mt = re.search(r"日期\s*[:：]?\s*(\d{4})/(\d{2})/(\d{2})", fm._plain(html))
    iso = f"{mt.group(1)}-{mt.group(2)}-{mt.group(3)}" if mt else None
    rows = [[fm._plain(c) for c in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", tr, re.I)]
            for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", html, re.I)]
    rows = [r for r in rows if r]
    inst = fm._parse_inst(rows)
    def net(p):
        pk = fm._prod_key(inst, *p)
        f = inst.get(pk, {}).get("外資") if pk else None
        return f.get("net") if f else None
    return (net(("臺股期貨", "台股期貨")), net(("小型臺指期貨", "小型臺指")),
            net(("微型臺指期貨", "微型臺指")), iso)


# ── 外資現貨買賣差 (BFI82U) ──────────────────────────────────────
def spot_net(date_tw):
    u = f"https://www.twse.com.tw/rwd/zh/fund/BFI82U?dayDate={date_tw}&type=day&response=json"
    try:
        d = json.loads(_get(u, 40))
        if d.get("stat") != "OK":
            return None
        for r in d.get("data", []):
            # 「外資及陸資(不含外資自營商)」為主列；排除「外資自營商」列(其開頭為外資自)
            if r[0].strip().startswith("外資及陸資"):
                return _num(r[3])
    except Exception:
        pass
    return None


# ── 計算單日 row ─────────────────────────────────────────────────
def compute_row(iso, shares, close_of, idx, ntx, nmtx, ntmf, sp, usdtwd=None):
    if idx is None or not shares:
        return None
    v_incl = v_excl = 0.0; matched = 0; total = 0
    for code, sh in shares.items():
        total += 1
        px = close_of(code)
        if not px:
            continue
        matched += 1; mv = sh * px
        v_incl += mv
        if not code.startswith("00"):
            v_excl += mv
    if v_excl <= 0:
        return None
    ntx = ntx or 0; nmtx = nmtx or 0; ntmf = ntmf or 0
    net_notional = ntx * idx * TX_PV + nmtx * idx * MTX_PV + ntmf * idx * TMF_PV
    H = max(-net_notional, 0.0)
    eq = ntx + nmtx * EQ_MTX + ntmf * EQ_TMF
    return {
        "trade_date": iso, "taiex_close": round(idx, 2),
        "fx_tx_net": int(ntx), "fx_mtx_net": int(nmtx), "fx_tmf_net": int(ntmf),
        "eq_net_lots": round(eq, 1),
        "net_notional": round(net_notional), "short_notional": round(H),
        "v_incl_etf": round(v_incl), "v_excl_etf": round(v_excl),
        "ratio_incl": round(H / v_incl * 100, 4) if v_incl else None,
        "ratio_excl": round(H / v_excl * 100, 4),
        "spot_net": round(sp) if sp is not None else None,
        "usdtwd": usdtwd,
        "coverage": round(matched / total * 100, 1) if total else None,
    }


def _upsert(env, rows):
    if not rows:
        return
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/foreign_hedge_daily?on_conflict=trade_date"
    for i in range(0, len(rows), 200):
        chunk = rows[i:i+200]
        req = urllib.request.Request(url, data=json.dumps(chunk).encode(), method="POST", headers={
            "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"  upsert {i}~{i+len(chunk)} status {r.status}")


def _taiex_map(env):
    """{iso: close} from taiex_daily。"""
    key = env["SUPABASE_SERVICE_KEY"]
    out = {}; off = 0
    while True:
        url = f"{env['SUPABASE_URL']}/rest/v1/taiex_daily?select=trade_date,close&order=trade_date.desc"
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}",
                                                   "Range-Unit": "items", "Range": f"{off}-{off+999}"})
        part = json.loads(urllib.request.urlopen(req, timeout=40).read())
        if not part:
            break
        for x in part:
            out[x["trade_date"]] = x["close"]
        if len(part) < 1000:
            break
        off += 1000
    return out


def _tw(iso):
    return iso.replace("-", "")


def run_daily(env):
    tw = datetime.now(timezone(timedelta(hours=8)))
    ntx, nmtx, ntmf, iso = foreign_futures(None)
    if not iso:
        print("[error] 期貨資料抓取失敗"); return
    date_tw = _tw(iso)
    shares = miqfiis_shares(date_tw)
    if not shares:
        print(f"[warn] {iso} mi-qfiis 無資料(非交易日?)，略過"); return
    closes = stock_day_all()
    tx = _taiex_map(env); idx = tx.get(iso)
    sp = spot_net(date_tw)
    # usdtwd 從 market_indicators 當日
    usd = None
    try:
        r = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/market_indicators?select=usdtwd&date=eq.{iso}",
                                   headers={"apikey": env["SUPABASE_SERVICE_KEY"], "Authorization": f"Bearer {env['SUPABASE_SERVICE_KEY']}"})
        j = json.loads(urllib.request.urlopen(r, timeout=20).read())
        usd = j[0]["usdtwd"] if j else None
    except Exception:
        pass
    row = compute_row(iso, shares, lambda c: closes.get(c), idx, ntx, nmtx, ntmf, sp, usd)
    if not row:
        print("[error] 計算失敗"); return
    print(json.dumps(row, ensure_ascii=False))
    _upsert(env, [row])
    print(f"已寫入 foreign_hedge_daily {iso}：R(扣ETF)={row['ratio_excl']}% 覆蓋{row['coverage']}%")
    fill_spot(env)


def fill_spot(env, days=60):
    """回補近 N 天 spot_net 為空的列（BFI82U 偶爾被限流 → 當天存成空值）；每日流程最後自動跑。2026-09-28"""
    key = env["SUPABASE_SERVICE_KEY"]
    since = (datetime.now(timezone(timedelta(hours=8))) - timedelta(days=days)).strftime("%Y-%m-%d")
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    try:
        req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/foreign_hedge_daily?select=trade_date&spot_net=is.null&trade_date=gte.{since}&order=trade_date.asc", headers=h)
        miss = [r["trade_date"] for r in json.loads(urllib.request.urlopen(req, timeout=30).read())]
    except Exception as e:
        print(f"[warn] 查缺值失敗：{e}"); return
    if not miss:
        print("現貨買賣超無缺值"); return
    print(f"現貨買賣超缺值 {len(miss)} 天，回補：{miss}")
    for iso in miss:
        sp = None
        for k in range(3):
            time.sleep(3 + k * 3)             # 節流＋遞增退避
            sp = spot_net(_tw(iso))
            if sp is not None:
                break
        if sp is None:
            print(f"  {iso} 仍抓不到，下次再補"); continue
        req = urllib.request.Request(env["SUPABASE_URL"] + f"/rest/v1/foreign_hedge_daily?trade_date=eq.{iso}", method="PATCH",
                                     data=json.dumps({"spot_net": round(sp)}).encode(),
                                     headers=dict(h, **{"Content-Type": "application/json", "Prefer": "return=minimal"}))
        urllib.request.urlopen(req, timeout=30)
        print(f"  {iso} 補上 {round(sp / 1e8, 1)} 億")


def run_backfill(env, days):
    tw = _taiex_map(env)
    isos = sorted([d for d in tw if d >= (datetime.now(timezone(timedelta(hours=8))) - timedelta(days=days)).strftime("%Y-%m-%d")])
    print(f"回補區間 {isos[0]} ~ {isos[-1]}（{len(isos)} 交易日）")

    # 已有的跳過(可續跑)
    have = set()
    try:
        key = env["SUPABASE_SERVICE_KEY"]; off = 0
        while True:
            req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/foreign_hedge_daily?select=trade_date",
                                         headers={"apikey": key, "Authorization": f"Bearer {key}", "Range": f"{off}-{off+999}"})
            part = json.loads(urllib.request.urlopen(req, timeout=40).read())
            if not part:
                break
            for x in part:
                have.add(x["trade_date"])
            if len(part) < 1000:
                break
            off += 1000
    except Exception:
        pass
    todo = [d for d in isos if d not in have]
    print(f"待補 {len(todo)} 天(已有 {len(have)})")
    if not todo:
        return

    # 1) 取前 N 大上市外資持股 code(用最近交易日 mi-qfiis × 最近 close)
    latest = todo[-1]
    latest_sh = None
    for d in reversed(isos):
        s = miqfiis_shares(_tw(d))
        if s:
            latest_sh = s; break
    latest_close = stock_day_all()
    ranked = sorted(latest_sh.items(), key=lambda kv: -(kv[1] * (latest_close.get(kv[0]) or 0)))
    top_codes = [c for c, _ in ranked[:TOPN]]
    top_set = set(top_codes)
    print(f"取前 {len(top_codes)} 大外資持股 code，抓 Yahoo 2 年收盤…")

    # 2) Yahoo 逐檔 2 年收盤 → priceHist[code][iso]
    price = {}
    for i, code in enumerate(top_codes):
        h = yahoo_hist(code, "2y")
        if h:
            price[code] = h
        if (i + 1) % 50 == 0:
            print(f"  Yahoo {i+1}/{len(top_codes)}…"); time.sleep(0.3)
    print(f"Yahoo 完成，取得 {len(price)} 檔價格序列")

    # 3) 逐日計算
    rows = []
    for n, iso in enumerate(todo):
        time.sleep(1.2)                     # 節流：避免觸發 TWSE 限流(307/308)
        date_tw = _tw(iso)
        shares = miqfiis_shares(date_tw)
        if not shares:
            continue
        shares = {c: s for c, s in shares.items() if c in top_set}   # 只算前 N 大
        ntx, nmtx, ntmf, fiso = foreign_futures(date_tw)
        sp = spot_net(date_tw)
        idx = tw.get(iso)
        def close_of(c, _iso=iso):
            ph = price.get(c)
            return ph.get(_iso) if ph else None
        row = compute_row(iso, shares, close_of, idx, ntx, nmtx, ntmf, sp)
        if row:
            rows.append(row)
        if (n + 1) % 20 == 0:
            print(f"  計算 {n+1}/{len(todo)}（最新 {iso} R扣ETF={row['ratio_excl'] if row else '—'}%）")
            _upsert(env, rows); rows = []
    _upsert(env, rows)
    print("回補完成。")


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    args = sys.argv[1:]
    if "--backfill" in args:
        i = args.index("--backfill")
        days = int(args[i + 1]) if i + 1 < len(args) else 730
        run_backfill(env, days)
    elif "--fill-spot" in args:
        fill_spot(env)
    else:
        run_daily(env)


if __name__ == "__main__":
    main()
