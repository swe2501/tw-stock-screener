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


def fetch_stock_month(code, yyyymm):
    """Monthly OHLCV rows (sorted asc) for a single stock from TWSE."""
    url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={yyyymm}01&stockNo={code}"
    try:
        data = _get_json(url)
        if not data or data.get("stat") != "OK" or not data.get("data"):
            return []
        rows = []
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
        return sorted(rows, key=lambda x: x["date"])
    except Exception:
        return []


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

    if target_idx is None:
        return None

    def safe(lst, idx):
        try:
            v = lst[idx]
            return float(v) if v is not None else None
        except (IndexError, TypeError, ValueError):
            return None

    o = safe(opens,   target_idx)
    h = safe(highs,   target_idx)
    l = safe(lows,    target_idx)
    c = safe(closes,  target_idx)
    v = safe(volumes, target_idx)

    if not all([o, c]):
        return None

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
    check_macd_gold  = bool(params.get("macd_golden", False))

    # ── Step 1: Always fetch latest TWSE data (for stock list + latest date) ──
    latest_stocks, latest_date = fetch_all_stocks_latest()
    if not latest_stocks:
        return {"error": "無法取得證交所資料，請稍後再試", "results": []}

    # Determine if we need historical path
    use_historical = (requested_date and len(requested_date) == 8
                      and requested_date != latest_date)

    if use_historical:
        # ── Historical path: Yahoo Finance ────────────────────────────────────
        code_name_map = {code: s["name"] for code, s in latest_stocks.items()}
        hist_stocks = fetch_all_stocks_historical(code_name_map, requested_date)

        if not hist_stocks:
            return {"error": f"{requested_date[:4]}/{requested_date[4:6]}/{requested_date[6:]} 查無資料（可能為非交易日）", "results": []}

        actual_date   = requested_date
        display_date  = f"{actual_date[:4]}/{actual_date[4:6]}/{actual_date[6:]}"
        all_stocks    = hist_stocks
        is_historical = True
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
            if (c - o) / o * 100 < red_pct: continue

        # 漲停板
        if check_limit_up:
            pc = s.get("prev_close")
            if not pc or pc <= 0: continue
            if c < calc_limit_up(pc) * 0.999: continue

        candidates[code] = s

    if not candidates:
        return {"date": display_date, "total": len(all_stocks), "count": 0, "results": []}

    # ── Step 3: Per-stock monthly data for gap_up & volume MA ────────────────
    need_monthly = (check_gap_up or check_gap_down or vol_mult > 0 or shrink_mult > 0 or check_macd_gold) and not is_historical

    monthly = {}
    if need_monthly:
        yyyymm = actual_date[:6]
        prev_yyyymm = _prev_month(yyyymm)

        def fetch_both(code):
            cur  = fetch_stock_month(code, yyyymm)
            prev = fetch_stock_month(code, prev_yyyymm)
            return code, sorted(prev + cur, key=lambda x: x["date"])

        with ThreadPoolExecutor(max_workers=20) as ex:
            futures = [ex.submit(fetch_both, c) for c in candidates]
            for f in as_completed(futures):
                code, rows = f.result()
                if rows: monthly[code] = rows

    # ── Step 4: Apply gap_up and volume MA filters ────────────────────────────
    results = []
    for code, s in candidates.items():
        o, c, h, l, v = s["open"], s["close"], s["high"], s["low"], s["volume"]

        # For historical path, prev data comes from Yahoo Finance directly
        if is_historical:
            prev_high  = s.get("prev_high")
            prev_low   = s.get("prev_low")
            prev_vols  = s.get("prev_vols", [])
        else:
            rows = monthly.get(code, [])
            # 只看 actual_date 前 7 天內的資料，避免月份資料缺失時誤用上個月的舊數據
            cutoff = (datetime.strptime(actual_date, "%Y%m%d") - timedelta(days=7)).strftime("%Y%m%d")
            prev_rows  = [r for r in rows if cutoff <= r["date"] < actual_date]
            prev_high  = prev_rows[-1].get("high") if prev_rows else None
            prev_low   = prev_rows[-1].get("low")  if prev_rows else None
            prev_vols  = [r["volume"] for r in prev_rows if r["volume"] > 0]

        # 跳空向上：今日最低 > 前日最高（兩根K棒之間有可見缺口）
        if check_gap_up:
            if not prev_high or l <= prev_high:
                continue

        # 跳空向下：今日最高 < 前日最低（兩根K棒之間有可見缺口）
        if check_gap_down:
            if not prev_low or h >= prev_low:
                continue

        # MACD黃金交叉
        if check_macd_gold:
            if is_historical:
                closes_for_macd = s.get("all_closes", [])
            else:
                rows = monthly.get(code, [])
                closes_for_macd = [r["close"] for r in rows if r["date"] <= actual_date and r.get("close")]
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
