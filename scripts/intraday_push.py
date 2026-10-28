"""
intraday_push.py — 盤中(09:00–13:35)掃 mis.twse.com.tw 全市場即時報價，注入
api/screen.py 的 _INTRADAY，現算「題材詳情／產業地圖／今日焦點」盤中版，推進
Supabase page_cache（kind=themeall / sectorall / overview）。

前端 window._swrJson 本來就讀 page_cache → 盤中這三張頁面/卡片即時更新；收盤後本腳本
停止，夜間排程(page_cache_push.py)再用官方盤後值回填。prod 的 api/screen.py 永不設定
_INTRADAY，盤後行為與現狀 100% 相同。

用法：
  python scripts/intraday_push.py            # 單次：盤中才動作，非盤中直接結束
  python scripts/intraday_push.py --loop      # 常駐：盤中每 35 秒一輪；13:35 收盤後只記匯率（每 5 分鐘、到 16:00），16:00 後結束
  python scripts/intraday_push.py --force      # 不檢查時段，強制跑一次（測試）
"""
import sys
import time
import json
import ssl
import datetime
import urllib.request
import urllib.parse
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import broker_signals as bs                      # noqa: E402

# screen.py 在模組載入時就讀 os.environ 的 SUPABASE_*，故先把 .env.local 灌進環境，
# 讓 fetch_all_stocks_latest 的 price_window 備援在 TWSE 被擋時仍能取得代號清單。
_ENV = bs._load_env()
for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"):
    if _ENV.get(_k):
        os.environ.setdefault(_k, _ENV[_k])
sys.path.insert(0, str(ROOT / "api"))
import screen                                     # noqa: E402  （只用來取全市場代號清單）
sys.path.insert(0, str(ROOT / "scripts"))
import env_screen as es                           # noqa: E402  2026-10-21 prod／uat 各用各的程式算盤中快照

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

INTERVAL = 35                                      # 每輪間隔（秒）；全市場一輪盤中 ~28-30 秒，故 ~35 秒為實際極限
FX_AFTER_CLOSE_INTERVAL = 300                      # 股市收盤後（13:35–16:00）只記匯率，每 5 分鐘一筆
TZ = datetime.timezone(datetime.timedelta(hours=8))
MIS = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
MIS_HEADERS = {"User-Agent": "Mozilla/5.0",
               "Referer": "https://mis.twse.com.tw/stock/fibest.jsp",
               "Accept": "application/json"}
BATCH = 150                                        # mis 每次查詢檔數（實測上限 ~150，200 會 rtcode 9999）
CONC = 12                                           # mis 批次並行數（實測 12 最快 ~28 秒；16 反而被節流變慢）
MIN_LISTED = 950                                   # 上市掃到檔數低於此(正常~1040；少一批~890) → 視為缺漏，不覆寫
# mis.twse.com.tw 憑證缺 Subject Key Identifier，Python 3.14 的 RFC5280 嚴格副檔檢查會擋。
# 只清掉 VERIFY_X509_STRICT 旗標，憑證鏈與主機名驗證「仍然開著」（比盲關 CERT_NONE 安全）。
_CTX = ssl.create_default_context()
_CTX.verify_flags &= ~ssl.VERIFY_X509_STRICT
DRY = False                                         # --dry：只現算不寫 page_cache（測試用）


def _now():
    return datetime.datetime.now(TZ)


def _in_session(dt=None):
    """台股盤中：週一~五 09:00–13:35（含尾盤試撮緩衝）。"""
    dt = dt or _now()
    if dt.weekday() >= 5:
        return False
    hm = dt.hour * 60 + dt.minute
    return 9 * 60 <= hm <= 13 * 60 + 35


def _pf(x):
    try:
        if x in (None, "", "-", "- "):
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def _mis_batch(ex_chs):
    q = "|".join(ex_chs)
    url = (f"{MIS}?ex_ch={urllib.parse.quote(q)}&json=1&delay=0"
           f"&_={int(time.time() * 1000)}")
    req = urllib.request.Request(url, headers=MIS_HEADERS)
    with urllib.request.urlopen(req, timeout=20, context=_CTX) as r:
        d = json.loads(r.read().decode("utf-8", "replace"))
    return d.get("msgArray") or []


def _cur_price(m):
    """mis 盤中當前價：盤中 top-level z/pz/tv 常為 '-'，真正最近成交價在巢狀 trade.z。
    順序：z → trade.z → 最佳買賣中價(b/a) → 今開 o → 昨收 y。"""
    z = _pf(m.get("z"))
    if z is not None:
        return z
    tr = m.get("trade")
    if isinstance(tr, dict):
        tz = _pf(tr.get("z"))
        if tz is not None:
            return tz
    bp = _pf((m.get("b") or "").split("_")[0])
    ap = _pf((m.get("a") or "").split("_")[0])
    if bp is not None and ap is not None:
        return (bp + ap) / 2
    if ap is not None:
        return ap
    if bp is not None:
        return bp
    o = _pf(m.get("o"))
    if o is not None:
        return o
    return _pf(m.get("y"))


def _scan(codes, ex):
    """批次查 mis（並行），回 {code:{price,prev,vol(股),name}}。ex: 'tse'(上市) / 'otc'(上櫃)。"""
    out = {}
    chs = [f"{ex}_{c}.tw" for c in codes]
    batches = [chs[i:i + BATCH] for i in range(0, len(chs), BATCH)]

    def _one(batch):
        # 批次失敗若整批丟掉會漏 ~150 檔（含大權值股），市值加權會劇烈失真 → 重試 4 次
        for attempt in range(4):
            try:
                arr = _mis_batch(batch)
                if arr:
                    return arr
            except Exception:                        # noqa: BLE001
                pass
            time.sleep(0.5 * (attempt + 1))
        print(f"[mis] {ex} 一批 {len(batch)} 檔重試 4 次仍失敗")
        return []

    with ThreadPoolExecutor(max_workers=CONC) as pool:
        for arr in pool.map(_one, batches):
            for m in arr:
                c = str(m.get("c") or "").strip()
                if not c:
                    continue
                y = _pf(m.get("y"))                   # 昨收
                price = _cur_price(m)
                if price is None or y is None:
                    continue
                v = _pf(m.get("v")) or 0              # 累積成交量(張)
                out[c] = {"price": price, "prev": y, "vol": int(v * 1000),
                          "name": (m.get("n") or c).strip()}
    return out


def _otc_codes(env):
    """上櫃代號清單：讀 Supabase otc_names（每日排程維護，868 檔），比 TPEx openapi 穩定。"""
    try:
        st, rows = bs._sb(env, "/otc_names", method="GET", params=[("select", "code")])
        codes = [str(r.get("code") or "").strip() for r in (rows or [])]
        return [c for c in codes if c]
    except Exception as e:                            # noqa: BLE001
        print(f"[intraday] otc_names 讀取失敗：{e}")
        return []


def _universe(env):
    """全市場代號清單（上市 / 上櫃）。上市取自 TWSE 全市場代號，上櫃取自 otc_names 表。"""
    screen._INTRADAY = {"listed": {}, "otc": {}, "date": None}
    listed, _ = screen.fetch_all_stocks_latest()
    return list(listed.keys()), _otc_codes(env)


# 盤中專用 kind（與夜間盤後 overview/themeall/sectorall 分開存）：只有部署了盤中前端的
# 站台(先 uat)會在盤中讀 *_rt；舊的 prod 前端照舊讀盤後 kind，不受影響。推 prod 後 prod 才吃盤中。
_VALID = {
    "overview": lambda d: bool(d.get("date")) and isinstance(d.get("turnover"), list) and d["turnover"],
    "themes": lambda d: isinstance(d.get("listed"), list) and len(d["listed"]) >= 5,
    "sectors": lambda d: isinstance(d.get("sectors"), list) and len(d["sectors"]) >= 10,
    "themeall": lambda d: isinstance(d.get("themes"), dict) and len(d["themes"]) >= 10,
    "sectorall": lambda d: isinstance(d.get("sectors"), dict) and len(d["sectors"]) >= 10,
}
_RT_KIND = {k: k + "_rt" for k in _VALID}


def _record_otc_index(env):
    """2026-10-24 首頁櫃買指數「今日走勢」：官方沒有歷史分鐘資料，盤中每輪記一筆 MIS 櫃買指數（otc_o00），
    存本機 D:\\stock_data\\home_intraday\\otc_YYYYMMDD.json，並寫成 page_cache mini_OTC（5 分鐘最後一筆）。失敗不影響主流程。"""
    try:
        arr = _mis_batch(["otc_o00.tw"])
        if not arr:
            return
        m = arr[0]
        price = _pf(m.get("z")) or _pf((m.get("trade") or {}).get("z") if isinstance(m.get("trade"), dict) else None)
        tlong = int(m.get("tlong") or 0) // 1000                    # 該筆報價時間（epoch 毫秒）
        if price is None or not tlong:
            return
        import home_intraday as hi
        d = datetime.datetime.fromtimestamp(tlong, TZ).date()
        if d != _now().date():
            return                                                  # 舊資料（休市日 MIS 停在前一日）不記
        hi.OTC_LOG_DIR.mkdir(parents=True, exist_ok=True)
        f = hi.OTC_LOG_DIR / f"otc_{d:%Y%m%d}.json"
        pts = json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
        if not pts or pts[-1][0] != tlong:
            pts.append([tlong, price])
            f.write_text(json.dumps(pts), encoding="utf-8")
        # 僅記本機檔；mini_OTC 由盤後 home_intraday.py 定版推送（與首頁卡片同一交易日）。
        # 盤中不再即時覆蓋 page_cache：否則 mini_OTC 會被覆蓋成「今天(部分)」，與卡片(上一完成交易日)對不上 → 櫃買分時永遠空白。
    except Exception as e:                                          # noqa: BLE001
        print(f"[intraday] 櫃買指數走勢記錄失敗（不影響主流程）：{type(e).__name__}")


def _record_fx_index(env):
    """2026-10-25 首頁台幣匯率「今日走勢」：Yahoo TWD=X 歷史分時在台北匯市時段很稀疏（主要在歐美盤有量），
    故改由盤中排程每輪記一筆 Yahoo 即時報價（regularMarketPrice），存本機
    D:\\stock_data\\home_intraday\\fx_YYYYMMDD.json，並寫成 page_cache mini_FX（5 分鐘最後一筆）。
    只在台北匯市時段(09:00-16:00)記錄。失敗不影響主流程。"""
    try:
        import ssl as _ssl, urllib.request as _ur
        now = _now()
        if not (9 * 60 <= now.hour * 60 + now.minute <= 16 * 60):  # 僅台北匯市盤時段（含 16:00 收盤那筆）
            return
        ctx = _ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = _ssl.CERT_NONE
        raw = _ur.urlopen(_ur.Request(
            "https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?range=1d&interval=5m",
            headers={"User-Agent": "Mozilla/5.0"}), timeout=20, context=ctx).read()
        meta = ((json.loads(raw).get("chart") or {}).get("result") or [{}])[0].get("meta") or {}
        price = meta.get("regularMarketPrice")
        if price is None:
            return
        import home_intraday as hi
        d = now.date()
        t = int(now.timestamp())
        hi.OTC_LOG_DIR.mkdir(parents=True, exist_ok=True)
        f = hi.OTC_LOG_DIR / f"fx_{d:%Y%m%d}.json"
        pts = json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
        pts.append([t, float(price)])
        f.write_text(json.dumps(pts), encoding="utf-8")
        # 同 mini_OTC：僅記本機檔，mini_FX 由盤後 home_intraday.py 定版推送，盤中不覆蓋 page_cache。
    except Exception as e:                                          # noqa: BLE001
        print(f"[intraday] 匯率走勢記錄失敗（不影響主流程）：{type(e).__name__}")


def _one_pass(lcodes, ocodes, env):
    _record_otc_index(env)
    _record_fx_index(env)
    listed = _scan(lcodes, "tse")
    otc = _scan(ocodes, "otc")
    if len(listed) < MIN_LISTED:
        print(f"[intraday] 上市僅 {len(listed)} 檔(<{MIN_LISTED})，疑似來源異常，本輪不覆寫")
        return False
    today = _now().strftime("%Y%m%d")
    results = []
    for env_name in ("prod", "uat"):
        try:
            mod = es.load_screen(env_name, env)
        except Exception as e:                        # noqa: BLE001
            print(f"[intraday] 載入 {env_name} 程式失敗：{type(e).__name__}")
            continue
        mod._INTRADAY = {"listed": listed, "otc": otc, "date": today}
        mod._themes_cache = {"ts": 0, "data": None}   # 清掉 5 分鐘快取，確保本輪現算盤中
        try:
            for base, fn in (("overview", mod._fetch_overview), ("themes", mod._fetch_themes), ("sectors", mod._fetch_sectors),
                             ("themeall", mod._fetch_theme_all), ("sectorall", mod._fetch_sector_all)):
                try:
                    results.append((base, es.kind_for(_RT_KIND[base], env_name), fn()))
                except Exception as e:                # noqa: BLE001
                    print(f"[intraday] {env_name} {base} 計算失敗：{type(e).__name__}")
        finally:
            mod._INTRADAY = {"listed": {}, "otc": {}, "date": None}
            mod._themes_cache = {"ts": 0, "data": None}

    hhmm = _now().strftime("%H:%M")
    td = f"{today[:4]}-{today[4:6]}-{today[6:]}"
    ok = 0
    for base, kind, d in results:
        if not isinstance(d, dict) or d.get("error") or not _VALID[base](d):
            print(f"[intraday] {hhmm} {kind} 內容不完整，略過(保留原資料)")
            continue
        size = len(json.dumps(d, ensure_ascii=False).encode("utf-8")) // 1024
        if DRY:
            print(f"[intraday] {hhmm} {kind} [DRY 不寫] 日={d.get('date')} 大小={size}KB")
            ok += 1
            continue
        row = {"kind": kind, "trade_date": td, "payload": d,
               "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        bs._sb(env, "/page_cache", method="DELETE", params=[("kind", f"eq.{kind}")])
        st, _ = bs._sb(env, "/page_cache", method="POST", body=[row])
        print(f"[intraday] {hhmm} {kind} 寫入 status={st} 大小={size}KB")
        ok += 1
    print(f"[intraday] {hhmm} 上市{len(listed)}/上櫃{len(otc)} → 推送 {ok}/{len(results)}")
    return ok > 0


def main():
    global DRY
    force = "--force" in sys.argv
    loop = "--loop" in sys.argv
    DRY = "--dry" in sys.argv
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] .env.local 缺 SUPABASE_SERVICE_KEY（寫 page_cache 需要），中止")
        return 1

    if not loop:
        if not force and not _in_session():
            print("[intraday] 非盤中時段，結束（加 --force 可強制測試）")
            return 0
        l, o = _universe(env)
        print(f"[intraday] universe 上市{len(l)} 上櫃{len(o)}")
        _one_pass(l, o, env)
        return 0

    print("[intraday] 常駐模式啟動（盤中每 %d 秒一輪）" % INTERVAL)
    l = o = None
    uni_ts = 0.0
    fx_slot = None
    while True:
        if not _in_session():
            now = _now()
            hm = now.hour * 60 + now.minute
            # 2026-10-28 股市收盤後只記匯率（台北匯市到 16:00），對齊每 5 分鐘整點一筆（含 16:00 收盤），首頁匯率分時才看得到收盤
            if now.weekday() < 5 and 13 * 60 + 35 < hm <= 16 * 60:
                slot = hm // (FX_AFTER_CLOSE_INTERVAL // 60)
                if slot != fx_slot:
                    _record_fx_index(env)
                    fx_slot = slot
                time.sleep(30)
                continue
            if now.hour >= 16:
                print("[intraday] 已過 16:00（匯市收盤），結束常駐")
                break
            time.sleep(30)
            continue
        if l is None or time.time() - uni_ts > 3600:   # universe 每小時更新一次
            try:
                l, o = _universe(env)
                uni_ts = time.time()
                print(f"[intraday] universe 上市{len(l)} 上櫃{len(o)}")
            except Exception as e:                       # noqa: BLE001
                print(f"[intraday] universe 取得失敗：{e}")
                time.sleep(30)
                continue
        t0 = time.time()
        try:
            _one_pass(l, o, env)
        except Exception as e:                           # noqa: BLE001
            print(f"[intraday] 本輪失敗：{e}")
        rest = INTERVAL - (time.time() - t0)
        if rest > 0:
            time.sleep(rest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
