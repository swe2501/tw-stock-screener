from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import math
import time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}
YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


def _get_json(url, headers=TWSE_HEADERS):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
        return data


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

def fetch_all_stocks_latest():
    """Returns (stocks_dict, YYYYMMDD_str) for the most recent trading day."""
    data = _get_json("https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json")
    if not data or not data.get("data"):
        return {}, ""

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
                "code": code,
                "name": row[1].strip(),
                "volume": _pf(row[2]) or 0,
                "open": _pf(row[4]),
                "high": _pf(row[5]),
                "low": _pf(row[6]),
                "close": close_p,
                "prev_close": round(close_p - change_val, 4) if (close_p and change_val is not None) else None,
            }
        except Exception:
            continue
    return stocks, actual_date


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
    v7 spark only returns close; v8 chart returns full OHLCV.
    """
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW"
           f"?interval=1d&range=3mo")
    try:
        data = _get_json(url, headers=YF_HEADERS)
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
            return {
                "open": None, "high": None, "low": None, "close": None, "volume": 0,
                "prev_close": safe(closes, prev_valid_idx),
                "prev_high":  safe(highs,  prev_valid_idx),
                "prev_low":   safe(lows,   prev_valid_idx),
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

    return {
        "open": o, "high": h, "low": l, "close": c,
        "volume": int(v) if v else 0,
        "prev_close": safe(closes, target_idx - 1) if target_idx > 0 else None,
        "prev_high":  safe(highs,  target_idx - 1) if target_idx > 0 else None,
        "prev_low":   safe(lows,   target_idx - 1) if target_idx > 0 else None,
        "prev_vols":  prev_vols,
        "all_closes": all_closes,
    }


def fetch_all_stocks_mi_index(code_name_map, date_str):
    """Fetch all stocks' OHLCV for a specific date via TWSE MI_INDEX.
    單次 API call，比 YF 逐支抓快很多；只要 TWSE 有資料就優先走這裡。
    Returns same-format dict as fetch_all_stocks_historical, or {} on failure.
    """
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={date_str}&type=ALLBUT0999"
    try:
        data = _get_json(url)
        if not data or data.get("stat") != "OK":
            return {}
        stocks = {}
        # data9 = 一般股票, data8 = ETF / 其他掛牌
        for key in ("data9", "data8"):
            for row in data.get(key, []):
                try:
                    code = str(row[0]).strip()
                    if not code or not code[0].isdigit():
                        continue
                    o = _pf(row[4]);  h = _pf(row[5])
                    l = _pf(row[6]);  c = _pf(row[7])
                    v = _pf(row[2])
                    if not all([o, c, h, l, v]) or c <= 0:
                        continue
                    # row[8]=漲跌符號(▲/▼), row[9]=漲跌價差 → 算前日收盤
                    prev_close = None
                    try:
                        sign = str(row[8]).strip()
                        diff = _pf(row[9])
                        if diff is not None:
                            prev_close = round(c + diff if ("▼" in sign or sign == "-") else c - diff, 4)
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
    check_gap_up     = bool(params.get("gap_up", False))
    check_gap_down   = bool(params.get("gap_down", False))
    gap_down_min     = float(params.get("gap_down_min") or 0)
    gap_up_min       = float(params.get("gap_up_min") or 0)
    check_macd_gold  = bool(params.get("macd_golden", False))
    check_zhenming1  = bool(params.get("zhenming1", False))
    check_zhenming2  = bool(params.get("zhenming2", False))

    # ── Step 1: Always fetch latest TWSE data (for stock list + latest date) ──
    latest_stocks, latest_date = fetch_all_stocks_latest()
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

        candidates[code] = s

    if not candidates:
        return {"date": display_date, "total": len(all_stocks), "count": 0, "results": []}

    # ── Step 3a: 跳空篩選 → 一次抓前一日 MI_INDEX，取代逐支 STOCK_DAY ────────
    prev_mi_gap: dict = {}
    if (check_gap_up or check_gap_down) and not is_historical:
        for delta in range(1, 6):   # 往前找最近一個交易日（跳過假日）
            prev_dt = (datetime.strptime(actual_date, "%Y%m%d") - timedelta(days=delta)).strftime("%Y%m%d")
            tmp = fetch_all_stocks_mi_index({}, prev_dt)
            if tmp:
                prev_mi_gap = tmp
                break

    # ── Step 3b: 量能/MACD/真名/跳空 → 用 YF 逐支抓（30 workers，~11s for 1300 stocks）
    need_gap_monthly = (check_gap_up or check_gap_down) and not prev_mi_gap
    need_monthly = (vol_mult > 0 or shrink_mult > 0 or check_macd_gold
                    or check_zhenming1 or check_zhenming2
                    or need_gap_monthly) and not is_historical

    monthly_yf = {}
    if need_monthly:
        def fetch_yf_only(code):
            return code, fetch_yf_chart(code, actual_date)

        with ThreadPoolExecutor(max_workers=30) as ex:
            futures = [ex.submit(fetch_yf_only, c) for c in candidates]
            for f in as_completed(futures):
                code, yf = f.result()
                if yf:
                    monthly_yf[code] = yf

    # ── Step 4: Apply gap_up and volume MA filters ────────────────────────────
    results = []
    for code, s in candidates.items():
        o, c, h, l, v = s["open"], s["close"], s["high"], s["low"], s["volume"]

        # prev_high/prev_low/prev_vols: historical path from YF in all_stocks,
        # non-historical path from monthly_yf (also YF, fetched above with 30 workers)
        if is_historical:
            prev_high  = s.get("prev_high")
            prev_low   = s.get("prev_low")
            prev_vols  = s.get("prev_vols", [])
        else:
            yf_data = monthly_yf.get(code) or {}
            if code in prev_mi_gap:
                prev_high = prev_mi_gap[code].get("high")
                prev_low  = prev_mi_gap[code].get("low")
            else:
                prev_high = yf_data.get("prev_high")
                prev_low  = yf_data.get("prev_low")
            prev_vols = yf_data.get("prev_vols", [])

        # 跳空向上：今日最低 > 前日最高（兩根K棒之間有可見缺口）
        # prev_high 找不到時放行，讓使用者自行肉眼確認
        if check_gap_up:
            if prev_high is not None and round(l, 4) <= round(prev_high, 4):
                continue
            if gap_up_min > 0 and prev_high is not None:
                if round(l - prev_high, 4) < round(gap_up_min, 4):
                    continue

        # 跳空向下：今日最高 < 前日最低（兩根K棒之間有可見缺口）
        # prev_low 找不到時放行，讓使用者自行肉眼確認
        if check_gap_down:
            if prev_low is not None and round(h, 4) >= round(prev_low, 4):
                continue
            if gap_down_min > 0 and prev_low is not None:
                if round(prev_low - h, 4) < round(gap_down_min, 4):
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
            if o <= 0 or (o - c) / o * 100 < black_pct:
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
            "open": round(o, 2), "high": round(h, 2),
            "low": round(l, 2),  "close": round(c, 2),
            "volume_lots": round(v / 1000, 1),
            "candle_pct": round((c - o) / o * 100, 2),
            "change_pct": change_pct,
        }
        if ma5  is not None: item["ma5_vol"]  = round(ma5  / 1000, 0)
        if ma10 is not None: item["ma10_vol"] = round(ma10 / 1000, 0)
        if vol_ratio is not None: item["vol_ratio"] = round(vol_ratio, 2)

        results.append(item)

    results.sort(key=lambda x: x.get("candle_pct", 0), reverse=True)

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
        self._send_json(200, {"status": "ok"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            self._send_json(200, screen(body))
        except Exception as e:
            self._send_json(500, {"error": str(e), "results": []})
