from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.parse
import math
import time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── 篩選結果暫存（非同步任務：伺服器算完存起來，前端切回來再領）──
# 用 anon key：screen_cache 的 RLS 已開放 anon 全操作，且 anon key 必為當前專案（不受
# service key 是否過期影響）
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY     = os.environ.get("SUPABASE_ANON_KEY", "")


def _cache_sb(path, method="GET", body=None, params=None):
    if not (SUPABASE_URL and SUPABASE_KEY):
        return 0, None
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json", "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}", "Prefer": "return=minimal",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except Exception:
        return 0, None


def _cache_save(job_id, result):
    """存篩選結果並順手清除 15 分鐘前的舊暫存。"""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    _cache_sb("/screen_cache", "DELETE", params=[("created_at", f"lt.{cutoff}")])
    _cache_sb("/screen_cache", "DELETE", params=[("job_id", f"eq.{job_id}")])
    _cache_sb("/screen_cache", "POST", body={"job_id": job_id, "result": result})


def _cache_get(job_id):
    st, rows = _cache_sb("/screen_cache", "GET",
                         params=[("job_id", f"eq.{job_id}"), ("select", "result")])
    if st == 200 and rows:
        return rows[0]["result"]
    return None

TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}
YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

# ── 產業別快取（TTL 24h，幾乎不變） ──────────────────────────────────────────
_INDUSTRY_CODE_MAP = {
    "01":"水泥工業","02":"食品工業","03":"塑膠工業","04":"紡織纖維",
    "05":"電機機械","06":"電器電纜","07":"化學生技醫療","08":"玻璃陶瓷",
    "09":"造紙工業","10":"鋼鐵工業","11":"橡膠工業","12":"汽車工業",
    "13":"電子工業","14":"建材營造","15":"航運業","16":"觀光餐旅",
    "17":"金融保險","18":"貿易百貨","19":"綜合","20":"其他",
    "21":"化學工業","22":"生技醫療業","23":"油電燃氣業","24":"半導體業",
    "25":"電腦及週邊設備業","26":"光電業","27":"通信網路業","28":"電子零組件業",
    "29":"電子通路業","30":"資訊服務業","31":"其他電子業","32":"文化創意業",
    "33":"農業科技業","34":"電子商務業","35":"綠能環保","36":"數位雲端",
    "37":"運動休閒","38":"居家生活","39":"金融業",
}

_industry_cache: dict = {}
_industry_cache_ts: float = 0.0

def _get_industry_map() -> dict:
    global _industry_cache, _industry_cache_ts
    if _industry_cache and time.time() - _industry_cache_ts < 86400:
        return _industry_cache
    try:
        url = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as r:
            data = json.loads(r.read())
        m = {}
        for row in data:
            code = str(row.get("公司代號", "")).strip()
            ind  = str(row.get("產業別", "")).strip()
            if code:
                # 若是數字代碼就轉成中文，否則直接用
                m[code] = _INDUSTRY_CODE_MAP.get(ind, ind)
        if m:
            _industry_cache = m
            _industry_cache_ts = time.time()
    except Exception:
        pass
    return _industry_cache


def _get_json(url, headers=TWSE_HEADERS, timeout=20):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except Exception:
        return None
    if not raw or not raw.strip():
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None


def _parse_roc_date(roc_str):
    """'115/06/02' -> '20260602'"""
    parts = str(roc_str).replace("-", "/").split("/")
    if len(parts) == 3:
        try:
            return f"{int(parts[0]) + 1911}{parts[1].zfill(2)}{parts[2].zfill(2)}"
        except ValueError:
            pass
    return ""


def _pf(s):
    s = str(s).replace(",", "").strip()
    return None if s in ("--", "N/A", "", "除權息", "除息", "除權") else float(s)


# ─────────────────────────────────────────────────────────────────────────────
# TWSE latest day (fast path)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_stocks_legacy(data):
    """Parse old TWSE STOCK_DAY_ALL format → (stocks_dict, date_str)."""
    roc_date = data.get("date", "")
    actual_date = _parse_roc_date(roc_date) if "/" in roc_date else roc_date
    stocks = {}
    for row in data.get("data", []):
        try:
            code = row[0].strip()
            if not code or not code[0].isdigit():
                continue
            close_p = _pf(row[7])
            change_raw = str(row[8]).replace(",", "").strip() if len(row) > 8 else "0"
            for ch in change_raw:
                if ch not in "0123456789.+-":
                    change_raw = change_raw.replace(ch, "")
            try:
                change_val = float(change_raw)
            except (ValueError, TypeError):
                change_val = None
            stocks[code] = {
                "code": code, "name": row[1].strip(),
                "volume": _pf(row[2]) or 0,
                "open": _pf(row[4]), "high": _pf(row[5]),
                "low": _pf(row[6]), "close": close_p,
                "prev_close": round(close_p - change_val, 4) if (close_p and change_val is not None) else None,
            }
        except Exception:
            continue
    return stocks, actual_date


def _parse_stocks_openapi(rows):
    """Parse TWSE OpenAPI STOCK_DAY_ALL format → (stocks_dict, date_str)."""
    # 從第一筆資料取真實交易日期（避免硬用 today 造成資料日期錯誤）
    actual_date = ""
    if rows:
        raw_d = str(rows[0].get("Date", rows[0].get("日期", ""))).strip().replace("/", "")
        if len(raw_d) == 7 and raw_d.isdigit():          # ROC 民國 YYYMMDD
            actual_date = str(int(raw_d[:3]) + 1911) + raw_d[3:]
        elif len(raw_d) == 8 and raw_d.isdigit():        # 西元 YYYYMMDD
            actual_date = raw_d
    if not actual_date:
        actual_date = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d")

    stocks = {}
    for row in rows:
        try:
            code = str(row.get("Code", row.get("證券代號", ""))).strip()
            if not code or not code[0].isdigit():
                continue
            close_p  = _pf(row.get("ClosingPrice",  row.get("收盤價", "")))
            open_p   = _pf(row.get("OpeningPrice",  row.get("開盤價", "")))
            high_p   = _pf(row.get("HighestPrice",  row.get("最高價", "")))
            low_p    = _pf(row.get("LowestPrice",   row.get("最低價", "")))
            vol      = _pf(row.get("TradeVolume",   row.get("成交股數", ""))) or 0
            chg      = _pf(row.get("Change",        row.get("漲跌價差", "")))
            prev_c   = round(close_p - chg, 4) if (close_p and chg is not None) else None
            name     = str(row.get("Name", row.get("證券名稱", ""))).strip()
            stocks[code] = {
                "code": code, "name": name,
                "volume": vol, "open": open_p, "high": high_p,
                "low": low_p, "close": close_p, "prev_close": prev_c,
            }
        except Exception:
            continue
    return stocks, actual_date


def fetch_all_stocks_latest():
    """Returns (stocks_dict, YYYYMMDD_str) for the most recent trading day."""
    # Primary: legacy TWSE endpoint
    data = _get_json("https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json")
    if data and data.get("data"):
        return _parse_stocks_legacy(data)

    # Fallback: TWSE OpenAPI (more stable, no anti-bot)
    rows = _get_json(
        "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        timeout=20,
    )
    if rows and isinstance(rows, list):
        return _parse_stocks_openapi(rows)

    return {}, ""


_monthly_cache: dict = {}   # key: "{code}_{yyyymm}" -> (timestamp, rows)
_CACHE_TTL = 300            # 5 分鐘 TTL，盤中月資料不會變

def fetch_stock_month(code, yyyymm):
    """Monthly OHLCV rows (sorted asc) for a single stock from TWSE.
    結果 cache 5 分鐘；403/empty 時最多 retry 2 次（處理 rate limit）。
    """
    key = f"{code}_{yyyymm}"
    now = time.time()
    if key in _monthly_cache:
        ts, rows = _monthly_cache[key]
        if now - ts < _CACHE_TTL:
            return rows

    url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={yyyymm}01&stockNo={code}"
    rows = []
    for attempt in range(3):
        try:
            data = _get_json(url)
            if not data or data.get("stat") != "OK" or not data.get("data"):
                if attempt < 2:
                    time.sleep(0.3 * (attempt + 1))
                    continue
                break
            for row in data["data"]:
                try:
                    rows.append({
                        "date": _parse_roc_date(row[0]),
                        "volume": _pf(row[1]) or 0,
                        "open": _pf(row[3]),
                        "high": _pf(row[4]),
                        "low": _pf(row[5]),
                        "close": _pf(row[6]),
                    })
                except Exception:
                    continue
            rows = sorted(rows, key=lambda x: x["date"])
            break
        except Exception:
            if attempt < 2:
                time.sleep(0.3 * (attempt + 1))

    _monthly_cache[key] = (time.time(), rows)
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Yahoo Finance historical batch (slow path for historical dates)
# ─────────────────────────────────────────────────────────────────────────────

def _yyyymmdd_to_ts(date_str):
    """'20260605' -> unix timestamp (midnight UTC+8)"""
    dt = datetime.strptime(date_str, "%Y%m%d").replace(
        hour=0, minute=0, second=0,
        tzinfo=timezone(timedelta(hours=8))
    )
    return int(dt.timestamp())


def fetch_yf_chart(code, date_str):
    """
    Fetch full OHLCV for a single stock via Yahoo Finance v8 chart API.
    Returns dict with open/high/low/close/volume/prev_close/prev_high/prev_vols, or None.
    Also returns adj_prev_high/adj_prev_low/adj_high/adj_low using adjclose ratio
    so callers can detect genuine gap-downs excluding ex-dividend price drops.
    """
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW"
           f"?interval=1d&range=3mo")
    try:
        data = _get_json(url, headers=YF_HEADERS, timeout=8)
        result = data.get("chart", {}).get("result") or []
        if not result:
            return None
        r0 = result[0]
        timestamps = r0.get("timestamp") or []
        quotes = (r0.get("indicators", {}).get("quote") or [{}])[0]
        opens   = quotes.get("open")   or []
        highs   = quotes.get("high")   or []
        lows    = quotes.get("low")    or []
        closes  = quotes.get("close")  or []
        volumes = quotes.get("volume") or []
        adjcloses = ((r0.get("indicators", {}).get("adjclose") or [{}])[0]
                     .get("adjclose") or [])
    except Exception:
        return None

    target_idx = None
    for i, ts in enumerate(timestamps):
        dt = datetime.fromtimestamp(ts, tz=timezone(timedelta(hours=8)))
        if dt.strftime("%Y%m%d") == date_str:
            target_idx = i
            break

    def safe(lst, idx):
        try:
            v = lst[idx]
            return float(v) if v is not None else None
        except (IndexError, TypeError, ValueError):
            return None

    def adj_ratio(idx):
        try:
            ac = adjcloses[idx]
            rc = closes[idx]
            if ac and rc:
                return float(ac) / float(rc)
        except (IndexError, TypeError, ValueError):
            pass
        return 1.0

    # 確認 target_idx 是否有有效 OHLC
    target_has_ohlc = (target_idx is not None
                       and safe(opens, target_idx) and safe(closes, target_idx))

    if not target_has_ohlc:
        # 目標日 YF 尚未更新（OHLC 為 None）或不存在
        # 往 target_idx 前（若有 target_idx）或整個列表中找最後一筆 date < target 的有效資料
        search_end = (target_idx - 1) if target_idx is not None else len(timestamps) - 1
        prev_valid_idx = None
        for i in range(search_end, -1, -1):
            if safe(opens, i) and safe(closes, i):
                prev_valid_idx = i
                break
        if prev_valid_idx is None:
            return None
        prev_dt = datetime.fromtimestamp(timestamps[prev_valid_idx], tz=timezone(timedelta(hours=8)))
        target_dt = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=timezone(timedelta(hours=8)))
        days_gap = (target_dt - prev_dt).days
        if 0 < days_gap <= 7:
            prev_vols = [
                safe(volumes, i)
                for i in range(prev_valid_idx + 1)
                if safe(volumes, i) and safe(volumes, i) > 0
            ]
            ph = safe(highs, prev_valid_idx)
            pl = safe(lows,  prev_valid_idx)
            r  = adj_ratio(prev_valid_idx)
            return {
                "open": None, "high": None, "low": None, "close": None, "volume": 0,
                "prev_close":    safe(closes, prev_valid_idx),
                "prev_high":     ph,
                "prev_low":      pl,
                "adj_prev_high": ph * r if ph else None,
                "adj_prev_low":  pl * r if pl else None,
                "adj_high": None, "adj_low": None,
                "prev_vols":  prev_vols,
                "all_closes": [],
            }
        return None

    o = safe(opens,   target_idx)
    h = safe(highs,   target_idx)
    l = safe(lows,    target_idx)
    c = safe(closes,  target_idx)
    v = safe(volumes, target_idx)

    prev_vols = [
        safe(volumes, i)
        for i in range(target_idx)
        if safe(volumes, i) and safe(volumes, i) > 0
    ]
    all_closes = [
        safe(closes, i) for i in range(target_idx + 1)
        if safe(closes, i) is not None
    ]

    ph = safe(highs, target_idx - 1) if target_idx > 0 else None
    pl = safe(lows,  target_idx - 1) if target_idx > 0 else None
    r_prev = adj_ratio(target_idx - 1) if target_idx > 0 else 1.0
    r_cur  = adj_ratio(target_idx)

    # D_prev_prev (two days back) — needed for earn_gap_down feature
    pp_l = safe(lows,  target_idx - 2) if target_idx > 1 else None
    r_pp = adj_ratio(target_idx - 2)   if target_idx > 1 else 1.0

    return {
        "open": o, "high": h, "low": l, "close": c,
        "volume": int(v) if v else 0,
        "prev_open":        safe(opens,  target_idx - 1) if target_idx > 0 else None,
        "prev_close":       safe(closes, target_idx - 1) if target_idx > 0 else None,
        "prev_high":        ph,
        "prev_low":         pl,
        "adj_prev_high":    ph * r_prev if ph else None,
        "adj_prev_low":     pl * r_prev if pl else None,
        "adj_high":         h  * r_cur  if h  else None,
        "adj_low":          l  * r_cur  if l  else None,
        "prev_prev_low":    pp_l,
        "prev_prev_adj_low": pp_l * r_pp if pp_l else None,
        "prev_vols":  prev_vols,
        "all_closes": all_closes,
    }


def _fetch_exdiv_codes(date_str):
    """Return set of stock codes going ex-dividend/ex-right on date_str (YYYYMMDD).
    Prevents gap-down false positives caused by ex-dividend price adjustment."""
    codes = set()
    # TWSE 除權除息資料
    url = f"https://www.twse.com.tw/rwd/zh/exRight/TWS1B?startDate={date_str}&endDate={date_str}&response=json"
    try:
        data = _get_json(url)
        if data and data.get("stat") == "OK":
            for row in (data.get("data") or []):
                c = str(row[0]).strip()
                if c and c[0].isdigit():
                    codes.add(c)
    except Exception:
        pass
    return codes


def _parse_mi_index_rows(rows, code_name_map, col_o, col_h, col_l, col_c, col_v, col_sign, col_diff):
    """Parse stock rows from MI_INDEX into a dict. Supports old and new column layouts."""
    stocks = {}
    for row in rows:
        try:
            code = str(row[0]).strip()
            if not code or not code[0].isdigit():
                continue
            o = _pf(row[col_o]); h = _pf(row[col_h])
            l = _pf(row[col_l]); c = _pf(row[col_c])
            v = _pf(row[col_v])
            if not all([o, c, h, l, v]) or c <= 0:
                continue
            prev_close = None
            try:
                sign = str(row[col_sign]).strip()
                diff = _pf(row[col_diff])
                if diff is not None:
                    # 新格式：color:green = 下跌；舊格式：▼ or "-" = 下跌
                    is_down = ("color:green" in sign.lower() or "▼" in sign or sign == "-")
                    prev_close = round(c + diff if is_down else c - diff, 4)
            except Exception:
                pass
            stocks[code] = {
                "code": code,
                "name": code_name_map.get(code, str(row[1]).strip()),
                "open": o, "high": h, "low": l, "close": c,
                "volume": int(v),
                "prev_close": prev_close,
                "prev_high": None, "prev_low": None,
                "prev_vols": [], "all_closes": [],
            }
        except Exception:
            continue
    return stocks


def fetch_all_stocks_mi_index(code_name_map, date_str):
    """Fetch all stocks' OHLCV for a specific date via TWSE MI_INDEX.
    支援舊格式(data9/data8)和新格式(tables陣列)。
    Returns same-format dict as fetch_all_stocks_historical, or {} on failure.
    """
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={date_str}&type=ALLBUT0999"
    try:
        data = _get_json(url)
        if not data:
            return {}
        # 舊格式有 stat 欄位，明確失敗時才 return {}
        # 新格式（2025+ tables 陣列）沒有 stat 欄位，不能用 stat != "OK" 擋掉
        if data.get("stat") and data.get("stat") != "OK":
            return {}
        # TWSE MI_INDEX 有時對特定日期回傳錯誤日期的資料（e.g. 查 06/16 卻給 06/12）
        # 若回傳日期與請求日期不符，放棄此路徑改走 YF historical
        resp_date = str(data.get("date") or "")
        if resp_date and resp_date != date_str:
            return {}

        # ── 新格式：tables 陣列（stat 欄位不存在）──────────────────────────────
        # tables[N] 中找個股交易表（data 筆數最多、含股票代號的那張）
        # 新欄位順序：[0]code [1]name [2]volume [3]txn [4]turnover
        #             [5]open [6]high [7]low [8]close [9]sign_html [10]diff
        if data.get("tables"):
            stock_rows = []
            for t in data.get("tables", []):
                if not isinstance(t, dict):
                    continue
                rows = t.get("data", [])
                # 個股交易表有 1000+ 筆，且第一欄是股票代號（純數字或含字母）
                if len(rows) > 100 and rows and isinstance(rows[0], list) and str(rows[0][0]).strip()[:1].isalnum():
                    stock_rows = rows
                    break
            if stock_rows:
                return _parse_mi_index_rows(
                    stock_rows, code_name_map,
                    col_o=5, col_h=6, col_l=7, col_c=8,
                    col_v=2, col_sign=9, col_diff=10
                )

        # ── 舊格式：data9 / data8 ────────────────────────────────────────────────
        # 舊欄位順序：[0]code [1]name [2]volume [4]open [5]high [6]low [7]close [8]sign [9]diff
        stocks = {}
        for key in ("data9", "data8"):
            rows = data.get(key, [])
            if rows:
                stocks.update(_parse_mi_index_rows(
                    rows, code_name_map,
                    col_o=4, col_h=5, col_l=6, col_c=7,
                    col_v=2, col_sign=8, col_diff=9
                ))
        return stocks
    except Exception:
        return {}


def fetch_all_stocks_historical(code_name_map, date_str):
    """
    Fetch all stocks' OHLCV for a specific historical date via Yahoo Finance v8 chart.
    1365 stocks × 1 request each, 30 workers → ~46 rounds × 0.1s = ~5s total.
    """
    codes = list(code_name_map.keys())

    all_data = {}
    with ThreadPoolExecutor(max_workers=30) as ex:
        futures = {ex.submit(fetch_yf_chart, code, date_str): code for code in codes}
        for f in as_completed(futures):
            code = futures[f]
            result = f.result()
            if result:
                name = code_name_map.get(code, code)
                all_data[code] = {**result, "code": code, "name": name}

    return all_data


# ─────────────────────────────────────────────────────────────────────────────
# MACD helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ema(values, period):
    if len(values) < period:
        return []
    result = [sum(values[:period]) / period]
    k = 2 / (period + 1)
    for v in values[period:]:
        result.append(result[-1] * (1 - k) + v * k)
    return result

def is_macd_golden_cross(closes):
    """True if MACD(12,26,9) crossed above Signal on the last bar."""
    if len(closes) < 35:
        return False
    e12 = _ema(closes, 12)
    e26 = _ema(closes, 26)
    # align: e26 is shorter by 14 positions
    macd = [a - b for a, b in zip(e12[len(e12) - len(e26):], e26)]
    sig = _ema(macd, 9)
    if len(sig) < 2:
        return False
    offset = len(macd) - len(sig)
    return (macd[offset + len(sig) - 2] <= sig[-2] and
            macd[offset + len(sig) - 1] >  sig[-1])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_tick_size(price):
    if price < 10:   return 0.01
    if price < 50:   return 0.05
    if price < 100:  return 0.1
    if price < 500:  return 0.5
    if price < 1000: return 1.0
    return 5.0

def calc_limit_up(prev_close):
    raw = prev_close * 1.1
    tick = get_tick_size(raw)
    return round(math.floor(raw / tick) * tick, 10)

def _ma(closes, n):
    return sum(closes[-n:]) / n if len(closes) >= n else None


def _prev_month(yyyymm):
    y, m = int(yyyymm[:4]), int(yyyymm[4:])
    m -= 1
    if m == 0: m, y = 12, y - 1
    return f"{y}{m:02d}"


_yf_hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
_yf_host_idx = 0

def _fetch_yf_history(code, months):
    """用 Yahoo Finance 抓個股 N 個月每日 OHLCV（與 K 線圖同資料源，含上市前 OTC 期間）。
    輪流使用 query1/query2 分散請求，降低 rate-limit 風險。
    回傳 sorted list of {open, close, volume}，失敗回傳 []。"""
    global _yf_host_idx
    # YF 支援的 range：1mo/3mo/6mo/1y/2y/5y/10y
    if months <= 1:    range_str = "1mo"
    elif months <= 3:  range_str = "3mo"
    elif months <= 6:  range_str = "6mo"
    elif months <= 12: range_str = "1y"
    elif months <= 24: range_str = "2y"
    elif months <= 60: range_str = "5y"
    else:              range_str = "10y"
    host = _yf_hosts[_yf_host_idx % 2]
    _yf_host_idx += 1
    url = (f"https://{host}/v8/finance/chart/{code}.TW"
           f"?interval=1d&range={range_str}")
    try:
        data = _get_json(url, headers=YF_HEADERS, timeout=8)
        r0 = (data.get("chart", {}).get("result") or [None])[0]
        if not r0:
            return []
        timestamps = r0.get("timestamp") or []
        q = (r0.get("indicators", {}).get("quote") or [{}])[0]
        opens   = q.get("open")   or []
        closes  = q.get("close")  or []
        volumes = q.get("volume") or []
        rows = []
        for i, ts in enumerate(timestamps):
            try:
                o = opens[i];  c = closes[i];  v = volumes[i]
                if o and c and v and float(o) > 0 and float(c) > 0 and int(v) > 0:
                    rows.append({"open": float(o), "close": float(c), "volume": int(v)})
            except (IndexError, TypeError, ValueError):
                continue
        # 裁切到精確月數（約 21 個交易日 / 月），保留最後 N 個月
        target_days = int(months * 21)
        if len(rows) > target_days:
            rows = rows[-target_days:]
        return rows  # 已按時間升序（YF 預設）
    except Exception:
        return []


def _batch_check_no_black(result_items, months, mult, tolerance=0):
    """
    YF 逐支策略：query1/query2 輪流，100 workers 並發。
    Vercel（美國）→ YF CDN（美國）延遲遠低於 Vercel → TWSE（台灣）。
    """
    codes = [item["code"] for item in result_items]
    target_days = int(months * 21)
    min_days = int(target_days * 0.25)
    workers = min(len(codes), 100)

    def _check_one(code):
        rows = _fetch_yf_history(code, months)
        if not rows:
            return code, True, True   # clean（放行）, no_data
        insufficient = len(rows) < min_days
        count = count_vol_black_events(rows, mult)
        return code, count <= tolerance, insufficient

    clean = set()
    no_data = set()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_check_one, c) for c in codes]
        for f in as_completed(futs):
            code, is_clean, is_insufficient = f.result()
            if is_clean:
                clean.add(code)
            if is_insufficient:
                no_data.add(code)

    return clean, no_data


def count_vol_black_events(rows, mult, count_from=0):
    """計算 rows[count_from:] 中放量黑棒的根數。
    count_from 之前的列僅用於 MA 暖身，不計入違規。"""
    if not rows or mult <= 0:
        return 0
    count = 0
    vols = [r["volume"] for r in rows]
    for i, row in enumerate(rows):
        if row["close"] >= row["open"]:
            continue
        prev = [vols[j] for j in range(max(0, i - 10), i) if vols[j] > 0]
        if len(prev) < 5:
            continue
        ma5  = sum(prev[-5:]) / 5
        ma10 = sum(prev) / len(prev) if len(prev) >= 10 else None
        max_ma = max(x for x in [ma5, ma10] if x is not None)
        if row["volume"] >= max_ma * mult and i >= count_from:
            count += 1
    return count


def has_vol_black_event(rows, mult):
    return count_vol_black_events(rows, mult) > 0


# ─────────────────────────────────────────────────────────────────────────────
# Main screener
# ─────────────────────────────────────────────────────────────────────────────

def screen(params):
    requested_date   = params.get("date", "").replace("-", "")  # YYYYMMDD or ""
    min_price        = float(params.get("min_price") or 0)
    red_pct          = float(params.get("red_candle_pct") or 0)
    black_pct        = float(params.get("black_candle_pct") or 0)
    vol_mult         = float(params.get("volume_multiplier") or 0)
    shrink_mult      = float(params.get("shrink_multiplier") or 0)
    check_limit_up   = bool(params.get("limit_up", False))
    check_doji       = bool(params.get("doji", False))
    doji_range_min   = float(params.get("doji_range_min") or 1.0)  # 十字線最小振幅 %
    check_engulf_bull = bool(params.get("engulf_bull", False))  # 陽吞噬
    check_engulf_bear = bool(params.get("engulf_bear", False))  # 陰吞噬
    check_harami_bull = bool(params.get("harami_bull", False))  # 多頭母子孕育線
    check_harami_bear = bool(params.get("harami_bear", False))  # 空頭母子孕育線
    check_gap_up     = bool(params.get("gap_up", False))
    check_gap_down   = bool(params.get("gap_down", False))
    gap_down_min     = float(params.get("gap_down_min") or 0)
    gap_up_min       = float(params.get("gap_up_min") or 0)
    check_macd_gold     = bool(params.get("macd_golden", False))
    check_earn_gap_down = bool(params.get("earn_gap_down", False))
    check_zhenming1  = bool(params.get("zhenming1", False))
    check_zhenming2  = bool(params.get("zhenming2", False))
    no_black_months  = min(int(params.get("no_black_months") or 0), 120)
    no_black_years   = no_black_months / 12  # 轉換為年（可為小數）傳給 YF API
    no_black_mult    = float(params.get("no_black_mult") or 0)
    no_black_tol     = max(0, int(params.get("no_black_tolerance") or 0))

    import sys
    _t0 = time.time()
    # ── Step 1: 先抓產業別（快取後幾乎零延遲），再抓 TWSE 股票清單 ──────────
    try:    _industry_map = _get_industry_map()
    except Exception: _industry_map = {}
    latest_stocks, latest_date = fetch_all_stocks_latest()
    print(f"[TIMING] step1_twse: {time.time()-_t0:.2f}s  stocks={len(latest_stocks)}", file=sys.stderr)
    if not latest_stocks:
        return {"error": "無法取得證交所資料，請稍後再試", "results": []}

    # Determine if we need historical path
    use_historical = (requested_date and len(requested_date) == 8
                      and requested_date != latest_date)

    if use_historical:
        # ── Historical path: 先試 TWSE MI_INDEX（快），失敗再走 YF（慢）────────
        code_name_map = {code: s["name"] for code, s in latest_stocks.items()}
        hist_stocks = fetch_all_stocks_mi_index(code_name_map, requested_date)
        used_mi_index = bool(hist_stocks)
        if not hist_stocks:
            hist_stocks = fetch_all_stocks_historical(code_name_map, requested_date)

        if not hist_stocks:
            return {"error": f"{requested_date[:4]}/{requested_date[4:6]}/{requested_date[6:]} 查無資料（可能為非交易日）", "results": []}

        actual_date   = requested_date
        display_date  = f"{actual_date[:4]}/{actual_date[4:6]}/{actual_date[6:]}"
        all_stocks    = hist_stocks
        # MI_INDEX 成功時視同最新路徑，可再抓月資料做量能/跳空篩選
        is_historical = not used_mi_index
    else:
        # ── Latest path: TWSE ────────────────────────────────────────────────
        actual_date   = latest_date
        display_date  = f"{actual_date[:4]}/{actual_date[4:6]}/{actual_date[6:]}" if len(actual_date) == 8 else actual_date
        all_stocks    = latest_stocks
        is_historical = False

    # ── Step 2: Fast price-based filters ─────────────────────────────────────
    candidates = {}
    for code, s in all_stocks.items():
        if not all([s.get("open"), s.get("close"), s.get("high"), s.get("low")]):
            continue
        o, c = s["open"], s["close"]
        if o <= 0 or c <= 0:
            continue

        # 最低股價
        if min_price > 0 and c < min_price:
            continue

        # 長紅棒
        if red_pct > 0:
            if c <= o: continue
            if (c - o) / c * 100 < red_pct: continue

        # 漲停板
        if check_limit_up:
            pc = s.get("prev_close")
            if not pc or pc <= 0: continue
            if c < calc_limit_up(pc) * 0.999: continue

        # 十字線：開盤 = 收盤（零誤差），且當日振幅 ≥ doji_range_min%（排除一字線/冷門股）
        if check_doji:
            if abs(c - o) > 1e-9: continue
            if (s["high"] - s["low"]) / o * 100 < doji_range_min: continue

        # 吞噬/母子（快篩部分）：多頭形態當日必須紅K；空頭形態當日必須黑K
        # （與前一日的包覆判斷需要前日 OHLC，在 Step 4 進行）
        if (check_engulf_bull or check_harami_bull) and not (check_engulf_bear or check_harami_bear) and c <= o:
            continue
        if (check_engulf_bear or check_harami_bear) and not (check_engulf_bull or check_harami_bull) and c >= o:
            continue

        candidates[code] = s

    if not candidates:
        return {"date": display_date, "total": len(all_stocks), "count": 0, "results": []}

    # ── Step 3a: 跳空篩選 → 只試「前一個非週末日曆日」MI_INDEX（天條：跳空只跟前一交易日比）
    prev_mi_gap: dict = {}
    prev_dt_for_gap: str = ""
    exdiv_codes: set = set()
    if (check_gap_up or check_gap_down):
        exdiv_codes = _fetch_exdiv_codes(actual_date)
    need_engulf = (check_engulf_bull or check_engulf_bear
                   or check_harami_bull or check_harami_bear)  # 需要前一日 OHLC 的形態
    if (check_gap_up or check_gap_down or check_earn_gap_down or need_engulf) and not is_historical:
        # 只找「前一個非週末日曆日」——不因 MI_INDEX 失敗而往前多抓
        # 假日（非週末）由 YF per-stock fallback 處理，不在這裡跳過
        expected_prev_dt = None
        for delta in range(1, 8):
            prev_dt_obj = datetime.strptime(actual_date, "%Y%m%d") - timedelta(days=delta)
            if prev_dt_obj.weekday() < 5:   # 第一個非週六日的日曆日
                expected_prev_dt = prev_dt_obj.strftime("%Y%m%d")
                break
        if expected_prev_dt:
            tmp = fetch_all_stocks_mi_index({}, expected_prev_dt)
            if tmp:
                prev_mi_gap = tmp
                prev_dt_for_gap = expected_prev_dt
            # MI_INDEX 失敗（rate limit / 假日）→ prev_mi_gap 維持 {}
            # 每支股票將 fallback 到 monthly_yf 的 per-stock prev_low（YF 自動定位前一交易日）

    # ── Step 3b: 量能/MACD/真名/跳空 → 用 YF 逐支抓
    # 跳空有啟用時一定要抓 YF（不管 prev_mi_gap 是否成功），確保 per-stock fallback 有資料
    need_gap_monthly = (check_gap_up or check_gap_down or check_earn_gap_down or need_engulf)
    need_monthly = (vol_mult > 0 or shrink_mult > 0 or check_macd_gold
                    or check_earn_gap_down
                    or check_zhenming1 or check_zhenming2
                    or need_gap_monthly) and not is_historical

    monthly_yf = {}
    if need_monthly:
        def fetch_yf_only(code):
            return code, fetch_yf_chart(code, actual_date)

        with ThreadPoolExecutor(max_workers=min(len(candidates), 50)) as ex:
            futures = [ex.submit(fetch_yf_only, c) for c in candidates]
            for f in as_completed(futures):
                code, yf = f.result()
                if yf:
                    monthly_yf[code] = yf

    # ── Step 3c: 補抓 prev_mi_gap 未涵蓋的個股 → TWSE STOCK_DAY（不依賴 YF）──
    if (check_gap_up or check_gap_down or need_engulf) and prev_mi_gap and not is_historical:
        missing = [c for c in candidates if c not in prev_mi_gap and c not in monthly_yf]
        if missing and prev_dt_for_gap:
            yyyymm = prev_dt_for_gap[:6]

            def fetch_twse_prev(code):
                rows = fetch_stock_month(code, yyyymm)
                for row in reversed(rows):
                    if row["date"] == prev_dt_for_gap:
                        return code, {"prev_high": row["high"], "prev_low": row["low"],
                                      "prev_close": row["close"], "prev_open": row["open"]}
                return code, None

            with ThreadPoolExecutor(max_workers=30) as ex:
                futs = [ex.submit(fetch_twse_prev, c) for c in missing]
                for f in as_completed(futs):
                    code, twse_prev = f.result()
                    if twse_prev:
                        monthly_yf[code] = twse_prev

    # ── Step 4: Apply gap_up and volume MA filters ────────────────────────────
    _gap_unverified: set = set()  # 前一日資料缺失、放行但標記需手動排查
    results = []
    for code, s in candidates.items():
        o, c, h, l, v = s["open"], s["close"], s["high"], s["low"], s["volume"]

        # prev_high/prev_low/prev_vols: historical path from YF in all_stocks,
        # non-historical path from monthly_yf (also YF, fetched above with 30 workers)
        if is_historical:
            prev_high  = s.get("prev_high")
            prev_low   = s.get("prev_low")
            prev_close_gap = s.get("prev_close")
            prev_open_gap  = s.get("prev_open")
            prev_vols  = s.get("prev_vols", [])
            # Historical path always uses YF adj prices to exclude ex-div false gaps
            _eff_h         = s.get("adj_high")  or h
            _eff_l         = s.get("adj_low")   or l
            _eff_prev_high = s.get("adj_prev_high") or prev_high
            _eff_prev_low  = s.get("adj_prev_low")  or prev_low
        else:
            yf_data = monthly_yf.get(code) or {}
            if code in prev_mi_gap:
                prev_high = prev_mi_gap[code].get("high")
                prev_low  = prev_mi_gap[code].get("low")
                prev_close_gap = prev_mi_gap[code].get("close") or yf_data.get("prev_close")
                prev_open_gap  = prev_mi_gap[code].get("open")  or yf_data.get("prev_open")
            else:
                prev_high = yf_data.get("prev_high")
                prev_low  = yf_data.get("prev_low")
                prev_close_gap = yf_data.get("prev_close")
                prev_open_gap  = yf_data.get("prev_open")
            prev_vols = yf_data.get("prev_vols", [])
            # For ex-div stocks: fetch YF adjusted prices to verify genuine gap
            if (check_gap_up or check_gap_down) and code in exdiv_codes:
                _yf_adj = fetch_yf_chart(code, actual_date)
                _eff_h         = (_yf_adj or {}).get("adj_high")  or h
                _eff_l         = (_yf_adj or {}).get("adj_low")   or l
                _eff_prev_high = (_yf_adj or {}).get("adj_prev_high") or prev_high
                _eff_prev_low  = (_yf_adj or {}).get("adj_prev_low")  or prev_low
            else:
                _eff_h, _eff_l, _eff_prev_high, _eff_prev_low = h, l, prev_high, prev_low

        # 跳空向上（2026-07 定義）：今日開盤 > 昨日實體上緣
        # 昨紅K（收>開）比昨收、昨黑K（收<開）比昨開 → 即 max(昨開, 昨收)
        if check_gap_up:
            _body_vals = [v for v in (prev_open_gap, prev_close_gap) if v is not None]
            if not _body_vals:
                # 前一日資料缺失，無法確認 → 放行並標記
                _gap_unverified.add(code)
            else:
                _body_top = max(_body_vals)
                if round(o, 4) <= round(_body_top, 4):
                    continue
                if gap_up_min > 0 and round(o - _body_top, 4) < round(gap_up_min, 4):
                    continue

        # 跳空向下：今日最高 < 前日最低（用還原日K價格排除除息假跳空）
        if check_gap_down:
            if _eff_prev_low is None:
                # 前一日資料缺失，無法確認跳空 → 放行並標記
                _gap_unverified.add(code)
            else:
                if round(_eff_h, 4) >= round(_eff_prev_low, 4):
                    continue
                if gap_down_min > 0 and round(_eff_prev_low - _eff_h, 4) < round(gap_down_min, 4):
                    continue

        # 陽吞噬/陰吞噬：當日K棒「實體」完整吃掉前一日整根K棒（含影線）
        # 陽吞：今紅K + 昨黑K + 今收≥昨高 + 今開≤昨低
        # 陰吞：今黑K + 昨紅K + 今開≥昨高 + 今收≤昨低
        if check_engulf_bull or check_engulf_bear:
            if any(v is None for v in (prev_open_gap, prev_close_gap, prev_high, prev_low)):
                _gap_unverified.add(code)  # 前一日資料缺失 → 放行並標記
            else:
                _bull_ok = (check_engulf_bull and c > o
                            and prev_close_gap < prev_open_gap
                            and round(c, 4) >= round(prev_high, 4)
                            and round(o, 4) <= round(prev_low, 4))
                _bear_ok = (check_engulf_bear and c < o
                            and prev_close_gap > prev_open_gap
                            and round(o, 4) >= round(prev_high, 4)
                            and round(c, 4) <= round(prev_low, 4))
                if not (_bull_ok or _bear_ok):
                    continue

        # 母子孕育線：當日K棒「實體」藏在前一日反向K棒「實體」內（當日影線不考慮）
        # 多頭：昨黑K + 今紅K，今開≥昨收 且 今收≤昨開
        # 空頭：昨紅K + 今黑K，今收≥昨開 且 今開≤昨收
        if check_harami_bull or check_harami_bear:
            if prev_open_gap is None or prev_close_gap is None:
                _gap_unverified.add(code)  # 前一日資料缺失 → 放行並標記
            else:
                _hbull_ok = (check_harami_bull and c > o
                             and prev_close_gap < prev_open_gap
                             and round(o, 4) >= round(prev_close_gap, 4)
                             and round(c, 4) <= round(prev_open_gap, 4))
                _hbear_ok = (check_harami_bear and c < o
                             and prev_close_gap > prev_open_gap
                             and round(c, 4) >= round(prev_open_gap, 4)
                             and round(o, 4) <= round(prev_close_gap, 4))
                if not (_hbull_ok or _hbear_ok):
                    continue

        # 賺向下跳空價差（選定日期D，篩選D_prev跳空向下 + D當天突破 + 跳空≥1 + D_prev縮量）
        if check_earn_gap_down:
            yf_ref = s if is_historical else (monthly_yf.get(code) or {})
            prev_o       = yf_ref.get("prev_open")
            prev_c       = yf_ref.get("prev_close")
            eff_prev_h   = yf_ref.get("adj_prev_high") or yf_ref.get("prev_high")
            eff_pp_l     = yf_ref.get("prev_prev_adj_low") or yf_ref.get("prev_prev_low")
            pvols        = yf_ref.get("prev_vols") or []

            if not all([prev_o, prev_c, eff_prev_h, eff_pp_l, h]):
                continue
            # 條件1: D_prev向下跳空（D_prev最高 < D_prev_prev最低）
            if eff_prev_h >= eff_pp_l:
                continue
            # 條件3: 跳空價差 ≥ 1元
            if eff_pp_l - eff_prev_h < 1.0:
                continue
            # 條件2: D最高 > 回補目標（紅K→收盤價，黑K→開盤價）
            recovery = prev_c if prev_c > prev_o else prev_o
            if h <= recovery:
                continue
            # 條件4: D_prev縮量（量 < 1.2 × MAX(MA5, MA10)，含當日，與券商顯示邏輯一致）
            # D_prev 量優先用 MI_INDEX（TWSE 官方張數），其次 YF
            if len(pvols) < 5:
                continue
            mi_prev_vol = prev_mi_gap.get(code, {}).get("volume") if not is_historical else None
            prev_vol  = mi_prev_vol if mi_prev_vol else pvols[-1]
            # MA 窗口替換最後一筆為準確值
            window = list(pvols[-10:]) if len(pvols) >= 10 else list(pvols[-5:])
            if mi_prev_vol:
                window[-1] = mi_prev_vol
            ma5  = sum(window[-5:]) / 5
            ma10 = sum(window) / len(window)
            ref_vol = max(ma5, ma10)
            if prev_vol >= 1.2 * ref_vol:
                continue

        # MACD黃金交叉
        if check_macd_gold:
            if is_historical:
                closes_for_macd = s.get("all_closes", [])
            else:
                closes_for_macd = (monthly_yf.get(code) or {}).get("all_closes", [])
            if not is_macd_golden_cross(closes_for_macd):
                continue

        # 長黑棒幅度
        if black_pct > 0:
            if c <= 0 or (o - c) / c * 100 < black_pct:
                continue

        # 放量 / 縮量（共用 MA 計算）
        ma5 = ma10 = vol_ratio = None
        if vol_mult > 0 or shrink_mult > 0:
            if len(prev_vols) >= 5:
                ma5 = sum(prev_vols[-5:]) / 5
            if len(prev_vols) >= 10:
                ma10 = sum(prev_vols[-10:]) / 10

            if ma5 is None and ma10 is None:
                continue

            max_ma = max(x for x in [ma5, ma10] if x is not None)
            vol_ratio = v / max_ma if max_ma > 0 else 0

            if vol_mult > 0 and v < max_ma * vol_mult:
                continue
            if shrink_mult > 0 and v > max_ma * shrink_mult:
                continue

        # 真名一式 / 真名二式
        if check_zhenming1 or check_zhenming2:
            # 長紅棒 3%（兩者共用）
            if c <= o or (c - o) / c * 100 < 3:
                continue
            # 放量 1.5x（兩者共用）
            zm_ma5v  = sum(prev_vols[-5:])  / 5  if len(prev_vols) >= 5  else None
            zm_ma10v = sum(prev_vols[-10:]) / 10 if len(prev_vols) >= 10 else None
            zm_max_ma = max(x for x in [zm_ma5v, zm_ma10v] if x is not None) if any(x is not None for x in [zm_ma5v, zm_ma10v]) else None
            if not zm_max_ma or v < zm_max_ma * 1.5:
                continue
            # 計算收盤均線：月資料(不含今日) + 今日收盤
            if is_historical:
                all_cls = s.get("all_closes", [])
                prev_cls = all_cls[:-1]
            else:
                all_cls  = (monthly_yf.get(code) or {}).get("all_closes", [])
                prev_cls = all_cls[:-1]

            t_ma5  = _ma(all_cls, 5)
            t_ma10 = _ma(all_cls, 10)
            t_ma20 = _ma(all_cls, 20)

            if check_zhenming1:
                # 收盤站上 MA5 > MA10 > MA20 且三線順序排列
                if not all([t_ma5, t_ma10, t_ma20]):
                    continue
                if not (c > t_ma5 > t_ma10 > t_ma20):
                    continue

            if check_zhenming2:
                # 任一均線黃金交叉：MA5 上穿 MA10、MA5 上穿 MA20、MA10 上穿 MA20（OR）
                y_ma5  = _ma(prev_cls, 5)
                y_ma10 = _ma(prev_cls, 10)
                y_ma20 = _ma(prev_cls, 20)
                if not all([t_ma5, t_ma10, t_ma20, y_ma5, y_ma10, y_ma20]):
                    continue
                cross_5_10  = t_ma5  > t_ma10 and y_ma5  <= y_ma10
                cross_5_20  = t_ma5  > t_ma20 and y_ma5  <= y_ma20
                cross_10_20 = t_ma10 > t_ma20 and y_ma10 <= y_ma20
                if not (cross_5_10 or cross_5_20 or cross_10_20):
                    continue

        pc = s.get("prev_close")
        change_pct = round((c - pc) / pc * 100, 2) if pc and pc > 0 else None

        item = {
            "code": code,
            "name": s["name"],
            "industry": _industry_map.get(code, ""),
            "open": round(o, 2), "high": round(h, 2),
            "low": round(l, 2),  "close": round(c, 2),
            "volume_lots": round(v / 1000, 1),
            "candle_pct": round((c - o) / c * 100, 2),  # 紅棒=(收-開)/收, 黑棒=(開-收)/收取負值
            "change_pct": change_pct,
        }
        if ma5  is not None: item["ma5_vol"]  = round(ma5  / 1000, 0)
        if ma10 is not None: item["ma10_vol"] = round(ma10 / 1000, 0)
        if vol_ratio is not None: item["vol_ratio"] = round(vol_ratio, 2)
        if code in _gap_unverified:
            item.setdefault("data_missing", []).append("gap_unverified")

        results.append(item)

    # ── Step 5: 無放量黑棒篩選（Yahoo Finance 每日 OHLCV，與 K 線同源）─────────
    print(f"[TIMING] before_step5: {time.time()-_t0:.2f}s  candidates_for_noBlack={len(results)}", file=sys.stderr)
    if no_black_months > 0 and no_black_mult > 0 and results:
        _t5 = time.time()
        clean, no_data = _batch_check_no_black(results, no_black_months, no_black_mult, no_black_tol)
        print(f"[TIMING] step5_noBlack: {time.time()-_t5:.2f}s  total={time.time()-_t0:.2f}s", file=sys.stderr)
        results = [item for item in results if item["code"] in clean]
        for item in results:
            if item["code"] in no_data:
                item.setdefault("data_missing", []).append("no_black")

    results.sort(key=lambda x: abs(x.get("candle_pct", 0)), reverse=True)  # 紅棒/黑棒都以幅度大小排序

    return {
        "date": display_date,
        "total": len(all_stocks),
        "count": len(results),
        "results": results,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Vercel handler
# ─────────────────────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _send_json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        # 領取非同步篩選結果：?job_id=xxx → 有結果回結果，沒好回 {pending:true}
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        job_id = (qs.get("job_id") or [""])[0].strip()
        if job_id:
            cached = _cache_get(job_id)
            if cached is not None:
                return self._send_json(200, cached)
            return self._send_json(200, {"pending": True})
        self._send_json(200, {"status": "ok"})

    def do_POST(self):
        import traceback
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            job_id = body.pop("job_id", None)
            result = screen(body)
            # 先存暫存（即使前端因切背景斷線，結果也已保留可供領取），再回傳
            if job_id:
                try: _cache_save(job_id, result)
                except Exception: pass
            self._send_json(200, result)
        except Exception as e:
            self._send_json(500, {"error": str(e), "traceback": traceback.format_exc(), "results": []})
