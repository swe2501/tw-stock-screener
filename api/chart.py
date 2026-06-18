from http.server import BaseHTTPRequestHandler
import json
import time
import urllib.request
import urllib.parse
import http.cookiejar
import zipfile
import io
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed


YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}
TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}

RANGE_DAYS = {"1mo": 35, "3mo": 95, "6mo": 185, "1y": 370, "2y": 730, "3y": 1100}
YF_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]

def _parse_taifex_chunk(content):
    """Parse TAIFEX CSV (TX only) → 台指近全 daily candles.
    Keeps highest-volume row per (date, session) = near-month contract.
    Combines 一般 + 夜盤 into a single candle: 一般 open, merged H/L, 夜盤 close, sum volume."""
    by_session = {}  # (date, session) → near-month row

    def _f(s):
        try:
            return float(s.replace(",", "").replace(" ", ""))
        except Exception:
            return None

    for line in content.split("\n"):
        if not line or not line[0].isdigit():
            continue
        cols = line.split(",")
        if len(cols) < 18:
            continue
        if cols[1].strip() != "TX":
            continue
        session = cols[17].strip()
        if session not in ("一般", "夜盤", "盤後"):
            continue
        if session == "盤後":
            session = "夜盤"
        iso_date = cols[0].strip().replace("/", "-")
        o, h, l, c = _f(cols[3]), _f(cols[4]), _f(cols[5]), _f(cols[6])
        if None in (o, h, l, c) or o == 0:
            continue
        try:
            vol = int(cols[9].replace(",", "").strip() or "0")
        except Exception:
            vol = 0
        key = (iso_date, session)
        existing = by_session.get(key)
        if existing is None or vol > existing["vol"]:
            by_session[key] = {"time": iso_date, "o": o, "h": h, "l": l, "c": c, "vol": vol, "session": session}

    # Merge sessions per date: 一般 open + max H / min L + 夜盤 close (or 一般 if no 夜盤)
    by_date = {}
    for (date, session), r in by_session.items():
        if date not in by_date:
            by_date[date] = {"time": date, "open": None, "high": r["h"], "low": r["l"], "close": None, "volume": 0}
        d = by_date[date]
        d["high"] = max(d["high"], r["h"])
        d["low"]  = min(d["low"],  r["l"])
        d["volume"] += r["vol"]
        if session == "一般":
            if d["open"] is None:
                d["open"] = r["o"]
            if d["close"] is None:
                d["close"] = r["c"]   # fallback if no 夜盤
        elif session == "夜盤":
            d["close"] = r["c"]       # 夜盤 close = final price of the full trading day

    return {date: row for date, row in by_date.items()
            if row["open"] is not None and row["close"] is not None}


_TAIFEX_SESSION = {"cookie": "", "expires": 0.0}


def _taifex_cookie_str():
    """GET TAIFEX session cookie; cache for 5 min within the same warm process."""
    now = time.time()
    if _TAIFEX_SESSION["cookie"] and now < _TAIFEX_SESSION["expires"]:
        return _TAIFEX_SESSION["cookie"]
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [
        ("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
        ("Accept", "text/html,application/xhtml+xml,*/*;q=0.9"),
        ("Accept-Language", "zh-TW,zh;q=0.9"),
    ]
    opener.open("https://www.taifex.com.tw/cht/3/dlFutDailyMarketView", timeout=6)
    parts = [f"{c.name}={c.value}" for c in jar]
    cookie_str = "; ".join(parts)
    _TAIFEX_SESSION["cookie"] = cookie_str
    _TAIFEX_SESSION["expires"] = now + 300
    return cookie_str


def _fetch_taifex_chunk(cookie_str, start_dt, end_dt):
    """POST one ≤85-day chunk for TX futures. Returns parsed by_date dict or {}."""
    begin = start_dt.strftime("%Y/%m/%d")
    end   = end_dt.strftime("%Y/%m/%d")
    post_data = urllib.parse.urlencode({
        "down_type": "1", "commodity_id": "TX", "commodity_id2": "",
        "queryStartDate": begin, "queryEndDate": end,
    }).encode()
    req = urllib.request.Request(
        "https://www.taifex.com.tw/cht/3/futDataDown",
        data=post_data,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.taifex.com.tw/cht/3/dlFutDailyMarketView",
            "Origin": "https://www.taifex.com.tw",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie_str,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = r.read()
        content = None
        for enc in ("utf-8-sig", "utf-8", "ms950", "big5"):
            try:
                content = raw.decode(enc)
                break
            except Exception:
                pass
        if not content or "alert" in content[:500]:
            return {}
        return _parse_taifex_chunk(content)
    except Exception:
        return {}


def _parse_tx_from_zip(zip_bytes):
    """Decode TAIFEX annual ZIP and extract TX 一般 rows."""
    if not zip_bytes or len(zip_bytes) < 100:
        return {}
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            if not names:
                return {}
            with zf.open(names[0]) as f:
                raw = f.read()
        for enc in ("ms950", "big5", "utf-8-sig", "utf-8"):
            try:
                return _parse_taifex_chunk(raw.decode(enc))
            except Exception:
                pass
    except Exception:
        pass
    return {}


def _fetch_annual_zip(year):
    """Download TAIFEX annual futures ZIP for given year; return TX by_date dict."""
    post_data = urllib.parse.urlencode({
        "down_type": "2", "his_year": str(year),
    }).encode()
    req = urllib.request.Request(
        "https://www.taifex.com.tw/cht/3/futDataDown",
        data=post_data,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.taifex.com.tw/cht/3/dlFutDailyMarketView",
            "Origin": "https://www.taifex.com.tw",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": _taifex_cookie_str(),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return _parse_tx_from_zip(r.read())
    except Exception:
        return {}


def fetch_tx(range_str="3y"):
    """Real TX 近月期貨 data:
    1. Annual ZIPs (down_type=2) for past complete years — correct TX prices.
       TAIFEX serves ZIPs sequentially (~8-9s each); 3y = ~25s first load.
       Vercel CDN caches the response for 1h so subsequent requests are instant.
    2. ^TWII proxy via Yahoo for current-year data (Jan 1 → today).
       TAIFEX down_type=1 is IP-restricted from Vercel; TWII ≈ TX within 0.5%.
    3. TAIFEX monthly chunk for last 35 days — correct TX prices (overwrites TWII proxy)."""
    days = RANGE_DAYS.get(range_str, 1100)
    tz_offset = timedelta(hours=8)
    now_dt = datetime.now(tz=timezone(tz_offset))
    start_dt = now_dt - timedelta(days=days)
    current_year = now_dt.year
    taifex_cutoff = now_dt - timedelta(days=35)

    by_date = {}

    # 1. Annual ZIPs for past complete years (sequential due to TAIFEX rate-limit)
    for year in range(start_dt.year, current_year):
        by_date.update(_fetch_annual_zip(year))

    # 2. TWII proxy for entire current year (Jan 1 → today); TAIFEX chunk overwrites if available
    gap_start = max(datetime(current_year, 1, 1, tzinfo=now_dt.tzinfo), start_dt)
    twii = fetch_chart("^TWII", range_str, "1d")
    if twii and twii.get("data"):
        gs = gap_start.strftime("%Y-%m-%d")
        for c in twii["data"]:
            if c["time"] >= gs:
                # Scale TWII volume (~7M shares) down to TX futures contract scale (~130K)
                proxy = {**c, "volume": int(c.get("volume", 0) // 54)}
                by_date.setdefault(c["time"], proxy)  # don't overwrite real TX

    # 3. Real TX for last 35 days (overwrites TWII proxy where available)
    try:
        cookie_str = _taifex_cookie_str()
        by_date.update(_fetch_taifex_chunk(cookie_str, taifex_cutoff, now_dt))
    except Exception:
        pass

    if not by_date:
        return None
    candles = sorted(by_date.values(), key=lambda x: x["time"])
    return {"code": "TX=F", "name": "台指期貨 (TX)", "currency": "TWD", "data": candles}


_TW_INDUSTRY_CODES = {
    "01": "水泥工業", "02": "食品工業", "03": "塑膠工業",
    "04": "紡織纖維", "05": "電機機械", "06": "電器電纜",
    "07": "化學工業", "08": "玻璃陶瓷", "09": "造紙工業",
    "10": "鋼鐵工業", "11": "橡膠工業", "12": "汽車工業",
    "13": "電子工業", "14": "建材營建業", "15": "航運業",
    "16": "觀光餐旅", "17": "金融保險業", "18": "貿易百貨業",
    "20": "其他業", "21": "化學生技醫療業", "22": "生技醫療業",
    "23": "油電燃氣業", "24": "半導體業", "25": "電腦及週邊設備業",
    "26": "光電業", "27": "通信網路業", "28": "電子零組件業",
    "29": "電子通路業", "30": "資訊服務業", "31": "其他電子業",
    "32": "文化創意業", "33": "農業科技業", "34": "電子商務業",
    "35": "綠能環保業", "36": "數位雲端業", "37": "運動休閒業",
    "38": "居家生活業",
}

# 上市個股代碼 → 產業別代碼（來源: TWSE t187ap03_L, 2026-06-18）
_TW_STOCK_INDUSTRY = {
    "1101": "01", "1102": "01", "1103": "01", "1104": "01", "1108": "01",
    "1109": "01", "1110": "01", "1201": "02", "1203": "02", "1210": "02",
    "1213": "02", "1215": "02", "1216": "02", "1217": "02", "1218": "02",
    "1219": "02", "1220": "02", "1225": "02", "1227": "02", "1229": "02",
    "1231": "02", "1232": "02", "1233": "02", "1234": "02", "1235": "02",
    "1236": "02", "1256": "02", "1301": "03", "1303": "03", "1304": "03",
    "1305": "03", "1307": "03", "1308": "03", "1309": "03", "1310": "03",
    "1312": "03", "1313": "03", "1314": "03", "1315": "03", "1316": "14",
    "1319": "12", "1321": "03", "1323": "03", "1324": "03", "1325": "03",
    "1326": "03", "1337": "03", "1338": "12", "1339": "12", "1340": "03",
    "1341": "03", "1342": "20", "1402": "04", "1409": "04", "1410": "04",
    "1413": "04", "1414": "04", "1416": "20", "1417": "04", "1418": "04",
    "1419": "04", "1423": "04", "1432": "37", "1434": "04", "1435": "20",
    "1436": "14", "1437": "20", "1438": "14", "1439": "14", "1440": "04",
    "1441": "04", "1442": "14", "1443": "20", "1444": "04", "1445": "04",
    "1446": "04", "1447": "04", "1449": "04", "1451": "04", "1452": "04",
    "1453": "14", "1454": "04", "1455": "04", "1456": "14", "1457": "04",
    "1459": "04", "1460": "04", "1463": "04", "1464": "04", "1465": "04",
    "1466": "04", "1467": "04", "1468": "04", "1470": "04", "1471": "28",
    "1472": "14", "1473": "04", "1474": "04", "1475": "04", "1476": "04",
    "1477": "04", "1503": "05", "1504": "05", "1506": "05", "1512": "12",
    "1513": "05", "1514": "05", "1515": "05", "1516": "20", "1517": "05",
    "1519": "05", "1521": "12", "1522": "12", "1524": "12", "1525": "12",
    "1526": "05", "1527": "05", "1528": "05", "1529": "05", "1530": "05",
    "1531": "05", "1532": "05", "1533": "12", "1535": "05", "1536": "12",
    "1537": "05", "1538": "05", "1539": "05", "1540": "05", "1541": "05",
    "1558": "05", "1560": "05", "1563": "12", "1568": "12", "1582": "28",
    "1583": "05", "1587": "12", "1589": "05", "1590": "05", "1597": "05",
    "1598": "37", "1603": "06", "1604": "06", "1605": "06", "1608": "06",
    "1609": "06", "1611": "06", "1612": "06", "1614": "06", "1615": "06",
    "1616": "06", "1617": "06", "1618": "06", "1623": "06", "1626": "06",
    "1702": "02", "1707": "22", "1708": "21", "1709": "21", "1710": "21",
    "1711": "21", "1712": "21", "1713": "21", "1714": "21", "1717": "21",
    "1718": "21", "1720": "22", "1721": "21", "1722": "21", "1723": "21",
    "1725": "21", "1726": "21", "1727": "21", "1730": "21", "1731": "22",
    "1732": "21", "1733": "22", "1734": "22", "1735": "21", "1736": "37",
    "1737": "02", "1752": "22", "1760": "22", "1762": "22", "1773": "21",
    "1776": "21", "1783": "22", "1786": "22", "1789": "22", "1795": "22",
    "1802": "08", "1805": "14", "1806": "08", "1808": "14", "1809": "08",
    "1810": "08", "1817": "08", "1903": "09", "1904": "09", "1905": "09",
    "1906": "09", "1907": "09", "1909": "09", "2002": "10", "2006": "10",
    "2007": "10", "2008": "10", "2009": "10", "2010": "10", "2012": "10",
    "2013": "10", "2014": "10", "2015": "10", "2017": "10", "2020": "10",
    "2022": "10", "2023": "10", "2024": "10", "2025": "10", "2027": "10",
    "2028": "10", "2029": "10", "2030": "10", "2031": "10", "2032": "10",
    "2033": "10", "2034": "10", "2038": "10", "2049": "05", "2059": "28",
    "2062": "38", "2069": "10", "2072": "35", "2101": "11", "2102": "11",
    "2103": "11", "2104": "11", "2105": "11", "2106": "11", "2107": "11",
    "2108": "11", "2109": "11", "2114": "11", "2115": "12", "2201": "12",
    "2204": "12", "2206": "12", "2207": "12", "2208": "15", "2211": "10",
    "2227": "12", "2228": "12", "2231": "12", "2233": "12", "2236": "12",
    "2239": "12", "2241": "12", "2243": "12", "2247": "12", "2248": "12",
    "2250": "12", "2254": "12", "2258": "12", "2301": "25", "2302": "24",
    "2303": "24", "2305": "25", "2308": "28", "2312": "31", "2313": "28",
    "2314": "27", "2316": "28", "2317": "31", "2321": "27", "2323": "26",
    "2324": "25", "2327": "28", "2328": "28", "2329": "24", "2330": "24",
    "2331": "25", "2332": "27", "2337": "24", "2338": "24", "2340": "24",
    "2342": "24", "2344": "24", "2345": "27", "2347": "29", "2348": "20",
    "2349": "26", "2351": "24", "2352": "25", "2353": "25", "2354": "31",
    "2355": "28", "2356": "25", "2357": "25", "2359": "31", "2360": "31",
    "2362": "25", "2363": "24", "2364": "25", "2365": "25", "2367": "28",
    "2368": "28", "2369": "24", "2371": "05", "2373": "31", "2374": "26",
    "2375": "28", "2376": "25", "2377": "25", "2379": "24", "2380": "25",
    "2382": "25", "2383": "28", "2385": "28", "2387": "25", "2388": "24",
    "2390": "31", "2392": "28", "2393": "26", "2395": "25", "2397": "25",
    "2399": "25", "2401": "24", "2402": "28", "2404": "31", "2405": "25",
    "2406": "26", "2408": "24", "2409": "26", "2412": "27", "2413": "28",
    "2414": "29", "2415": "28", "2417": "25", "2419": "27", "2420": "28",
    "2421": "28", "2423": "31", "2424": "27", "2425": "25", "2426": "26",
    "2427": "30", "2428": "28", "2429": "26", "2430": "29", "2431": "28",
    "2432": "25", "2433": "31", "2434": "24", "2436": "24", "2438": "26",
    "2439": "27", "2440": "28", "2441": "24", "2442": "14", "2444": "27",
    "2449": "24", "2450": "27", "2451": "24", "2453": "30", "2454": "24",
    "2455": "27", "2457": "28", "2458": "24", "2459": "31", "2460": "28",
    "2461": "31", "2462": "28", "2464": "31", "2465": "25", "2466": "26",
    "2467": "28", "2468": "30", "2471": "30", "2472": "28", "2474": "31",
    "2476": "28", "2477": "31", "2478": "28", "2480": "30", "2481": "24",
    "2482": "31", "2483": "28", "2484": "28", "2485": "27", "2486": "26",
    "2488": "31", "2489": "26", "2491": "26", "2492": "28", "2493": "28",
    "2495": "25", "2496": "20", "2497": "12", "2498": "27", "2501": "14",
    "2504": "14", "2505": "14", "2506": "14", "2509": "14", "2511": "14",
    "2514": "20", "2515": "14", "2516": "14", "2520": "14", "2524": "14",
    "2527": "14", "2528": "14", "2530": "14", "2534": "14", "2535": "14",
    "2536": "14", "2537": "14", "2538": "14", "2539": "14", "2540": "14",
    "2542": "14", "2543": "14", "2545": "14", "2546": "14", "2547": "14",
    "2548": "14", "2597": "14", "2601": "15", "2603": "15", "2605": "15",
    "2606": "15", "2607": "15", "2608": "15", "2609": "15", "2610": "15",
    "2611": "15", "2612": "15", "2613": "15", "2614": "20", "2615": "15",
    "2616": "23", "2617": "15", "2618": "15", "2630": "15", "2633": "15",
    "2634": "15", "2636": "15", "2637": "15", "2642": "15", "2645": "15",
    "2646": "15", "2701": "16", "2702": "16", "2704": "16", "2705": "16",
    "2706": "16", "2707": "16", "2712": "16", "2722": "16", "2723": "16",
    "2727": "16", "2731": "16", "2739": "16", "2748": "16", "2753": "16",
    "2762": "37", "2801": "17", "2812": "17", "2816": "17", "2820": "17",
    "2832": "17", "2834": "17", "2836": "17", "2838": "17", "2845": "17",
    "2849": "17", "2850": "17", "2851": "17", "2852": "17", "2855": "17",
    "2867": "17", "2880": "17", "2881": "17", "2882": "17", "2883": "17",
    "2884": "17", "2885": "17", "2886": "17", "2887": "17", "2889": "17",
    "2890": "17", "2891": "17", "2892": "17", "2897": "17", "2901": "18",
    "2903": "18", "2904": "20", "2905": "18", "2906": "18", "2908": "18",
    "2910": "18", "2911": "18", "2912": "18", "2913": "18", "2915": "18",
    "2923": "14", "2929": "18", "2939": "18", "2945": "18", "3002": "25",
    "3003": "28", "3004": "10", "3005": "25", "3006": "24", "3008": "26",
    "3010": "29", "3011": "28", "3013": "25", "3014": "24", "3015": "28",
    "3016": "24", "3017": "25", "3018": "31", "3019": "26", "3021": "28",
    "3022": "25", "3023": "28", "3024": "26", "3025": "27", "3026": "28",
    "3027": "27", "3028": "29", "3029": "30", "3030": "31", "3031": "26",
    "3032": "28", "3033": "29", "3034": "24", "3035": "24", "3036": "29",
    "3037": "28", "3038": "26", "3040": "20", "3041": "24", "3042": "28",
    "3043": "31", "3044": "28", "3045": "27", "3046": "25", "3047": "27",
    "3048": "29", "3049": "26", "3050": "26", "3051": "26", "3052": "14",
    "3054": "02", "3055": "29", "3056": "14", "3057": "25", "3058": "28",
    "3059": "26", "3060": "25", "3062": "27", "3090": "28", "3092": "28",
    "3094": "24", "3130": "36", "3135": "24", "3138": "27", "3149": "26",
    "3150": "24", "3164": "22", "3167": "05", "3168": "26", "3189": "24",
    "3209": "29", "3229": "28", "3231": "25", "3257": "24", "3266": "14",
    "3296": "28", "3305": "31", "3308": "28", "3311": "27", "3312": "29",
    "3321": "28", "3338": "28", "3346": "12", "3356": "26", "3376": "28",
    "3380": "27", "3406": "26", "3413": "24", "3416": "25", "3419": "27",
    "3432": "28", "3437": "26", "3443": "24", "3447": "27", "3450": "24",
    "3481": "26", "3494": "25", "3501": "28", "3504": "26", "3515": "25",
    "3518": "31", "3528": "29", "3530": "24", "3532": "24", "3533": "28",
    "3535": "26", "3543": "26", "3545": "24", "3550": "28", "3557": "38",
    "3563": "26", "3576": "26", "3583": "24", "3588": "24", "3591": "26",
    "3592": "24", "3593": "28", "3596": "27", "3605": "28", "3607": "28",
    "3617": "31", "3622": "26", "3645": "28", "3652": "25", "3653": "28",
    "3661": "24", "3665": "31", "3669": "27", "3673": "26", "3679": "28",
    "3686": "24", "3694": "27", "3701": "25", "3702": "29", "3703": "14",
    "3704": "27", "3705": "22", "3706": "25", "3708": "35", "3711": "24",
    "3712": "25", "3714": "26", "3715": "28", "3716": "22", "3717": "12",
    "4104": "22", "4106": "22", "4108": "22", "4119": "22", "4133": "22",
    "4137": "22", "4142": "22", "4148": "22", "4155": "22", "4164": "22",
    "4169": "22", "4178": "22", "4190": "22", "4195": "22", "4306": "03",
    "4414": "04", "4426": "04", "4438": "04", "4439": "04", "4440": "04",
    "4441": "04", "4526": "05", "4532": "05", "4536": "37", "4540": "05",
    "4545": "28", "4551": "12", "4552": "05", "4555": "05", "4557": "12",
    "4560": "05", "4562": "05", "4564": "05", "4566": "05", "4569": "12",
    "4571": "05", "4572": "05", "4576": "05", "4581": "12", "4582": "35",
    "4583": "05", "4585": "31", "4588": "31", "4590": "05", "4720": "21",
    "4722": "21", "4736": "22", "4737": "22", "4739": "21", "4746": "22",
    "4755": "21", "4763": "21", "4764": "21", "4766": "21", "4770": "21",
    "4771": "22", "4807": "18", "4904": "27", "4906": "27", "4912": "28",
    "4915": "28", "4916": "25", "4919": "24", "4927": "28", "4930": "06",
    "4934": "26", "4935": "26", "4938": "25", "4942": "26", "4943": "28",
    "4949": "26", "4952": "24", "4956": "26", "4958": "28", "4960": "26",
    "4961": "24", "4967": "24", "4968": "24", "4976": "26", "4977": "27",
    "4989": "28", "4994": "30", "4999": "28", "5007": "10", "5203": "30",
    "5215": "25", "5222": "24", "5225": "31", "5234": "26", "5243": "26",
    "5244": "26", "5258": "25", "5269": "24", "5283": "06", "5284": "20",
    "5285": "24", "5288": "05", "5292": "35", "5306": "37", "5388": "27",
    "5434": "29", "5469": "28", "5471": "24", "5484": "26", "5515": "14",
    "5519": "14", "5521": "14", "5522": "14", "5525": "14", "5531": "14",
    "5533": "14", "5534": "14", "5538": "10", "5546": "14", "5607": "15",
    "5608": "15", "5706": "16", "5871": "20", "5876": "17", "5880": "17",
    "5906": "18", "5907": "18", "6005": "17", "6024": "17", "6108": "28",
    "6112": "30", "6115": "28", "6116": "26", "6117": "25", "6120": "26",
    "6128": "25", "6133": "28", "6136": "27", "6139": "31", "6141": "28",
    "6142": "27", "6152": "27", "6153": "28", "6155": "28", "6164": "26",
    "6165": "36", "6166": "25", "6168": "26", "6176": "26", "6177": "14",
    "6183": "30", "6184": "20", "6189": "29", "6191": "28", "6192": "31",
    "6196": "31", "6197": "28", "6201": "31", "6202": "24", "6205": "28",
    "6206": "25", "6209": "26", "6213": "28", "6214": "30", "6215": "31",
    "6216": "27", "6224": "28", "6225": "26", "6226": "26", "6230": "25",
    "6235": "25", "6239": "24", "6243": "24", "6257": "24", "6269": "28",
    "6271": "24", "6272": "28", "6277": "25", "6278": "26", "6281": "29",
    "6282": "28", "6283": "31", "6285": "27", "6405": "26", "6409": "31",
    "6412": "28", "6414": "25", "6415": "24", "6416": "27", "6426": "27",
    "6431": "22", "6438": "31", "6442": "27", "6443": "26", "6446": "22",
    "6449": "28", "6451": "24", "6456": "26", "6464": "20", "6472": "22",
    "6477": "26", "6491": "22", "6504": "20", "6505": "23", "6515": "24",
    "6525": "24", "6526": "24", "6531": "24", "6533": "24", "6534": "22",
    "6541": "22", "6550": "22", "6552": "24", "6558": "31", "6573": "24",
    "6579": "25", "6581": "35", "6582": "11", "6585": "20", "6589": "22",
    "6591": "25", "6592": "20", "6598": "22", "6605": "12", "6606": "05",
    "6614": "36", "6625": "20", "6641": "35", "6645": "22", "6655": "20",
    "6657": "22", "6658": "31", "6666": "22", "6668": "26", "6669": "25",
    "6670": "37", "6671": "38", "6672": "28", "6674": "27", "6689": "36",
    "6691": "31", "6695": "24", "6698": "31", "6706": "26", "6715": "28",
    "6719": "24", "6722": "31", "6742": "26", "6743": "31", "6753": "15",
    "6754": "38", "6756": "24", "6757": "15", "6768": "37", "6770": "24",
    "6771": "35", "6776": "29", "6781": "28", "6782": "22", "6789": "24",
    "6790": "09", "6792": "27", "6794": "22", "6796": "22", "6799": "24",
    "6805": "28", "6806": "35", "6807": "38", "6830": "31", "6831": "25",
    "6834": "28", "6835": "28", "6838": "22", "6854": "24", "6861": "22",
    "6862": "28", "6863": "27", "6869": "35", "6873": "35", "6885": "22",
    "6887": "35", "6890": "37", "6901": "20", "6902": "36", "6906": "36",
    "6908": "29", "6909": "24", "6914": "20", "6916": "26", "6918": "22",
    "6919": "22", "6921": "24", "6923": "35", "6924": "28", "6928": "25",
    "6931": "22", "6933": "25", "6934": "22", "6936": "22", "6937": "24",
    "6944": "35", "6949": "22", "6951": "35", "6952": "20", "6955": "22",
    "6957": "20", "6958": "20", "6962": "24", "6965": "37", "6969": "35",
    "6988": "12", "6994": "35", "7610": "35", "7631": "31", "7705": "16",
    "7711": "25", "7721": "36", "7722": "36", "7730": "24", "7732": "12",
    "7736": "12", "7740": "35", "7749": "24", "7750": "05", "7760": "16",
    "7765": "36", "7768": "24", "7769": "24", "7780": "02", "7786": "35",
    "7788": "28", "7791": "02", "7795": "28", "7799": "22", "7803": "22",
    "7818": "35", "7821": "12", "7822": "24", "7823": "36", "7827": "22",
    "8011": "27", "8016": "24", "8021": "31", "8028": "24", "8033": "20",
    "8039": "28", "8045": "27", "8046": "28", "8070": "29", "8072": "29",
    "8081": "24", "8101": "27", "8103": "28", "8104": "26", "8105": "26",
    "8110": "24", "8112": "29", "8114": "25", "8131": "24", "8150": "24",
    "8162": "24", "8163": "25", "8201": "31", "8210": "25", "8213": "28",
    "8215": "26", "8222": "05", "8249": "28", "8261": "24", "8271": "24",
    "8341": "35", "8367": "15", "8374": "05", "8404": "20", "8411": "20",
    "8422": "35", "8429": "18", "8438": "35", "8442": "20", "8443": "18",
    "8454": "36", "8462": "37", "8463": "20", "8464": "38", "8466": "20",
    "8467": "37", "8473": "35", "8476": "35", "8478": "37", "8481": "20",
    "8482": "38", "8487": "36", "8488": "20", "8499": "31", "8926": "23",
    "8940": "16", "8996": "05", "9103": "91", "910322": "91", "9105": "91",
    "910861": "91", "9110": "91", "911608": "91", "911622": "91",
    "911868": "91", "912000": "91", "9136": "91", "9802": "37", "9902": "20",
    "9904": "37", "9905": "20", "9906": "14", "9907": "20", "9908": "23",
    "9910": "37", "9911": "38", "9912": "25", "9914": "37", "9917": "20",
    "9918": "23", "9919": "20", "9921": "37", "9924": "38", "9925": "20",
    "9926": "23", "9927": "20", "9928": "20", "9929": "20", "9930": "35",
    "9931": "23", "9933": "20", "9934": "38", "9935": "38", "9937": "23",
    "9938": "20", "9939": "20", "9940": "20", "9941": "20", "9942": "20",
    "9943": "16", "9944": "20", "9945": "20", "9946": "14", "9955": "35",
    "9958": "10",
}


# Process-level cache：同一個 warm instance 內不重複打 API
_NAME_CACHE: dict = {}
_IND_CACHE:  dict = {}


def _fetch_tw_name(code):
    """Try TWSE MIS real-time API for Chinese stock name. Returns name or None."""
    if not code or not code[0].isdigit():   # 排除 ^TWII、TX=F 等，允許含字母的 ETF (00633L)
        return None
    if code in _NAME_CACHE:
        return _NAME_CACHE[code]
    def _try(market):
        try:
            url = f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={market}_{code}.tw&json=1"
            req = urllib.request.Request(url, headers=TWSE_HEADERS)
            with urllib.request.urlopen(req, timeout=4) as r:
                d = json.loads(r.read())
            arr = d.get("msgArray") or []
            return arr[0]["n"] if arr and arr[0].get("n") else None
        except Exception:
            return None
    # tse 和 otc 並行，取最先成功的那個，不等另一個
    ex = ThreadPoolExecutor(max_workers=2)
    futures = {ex.submit(_try, m) for m in ("tse", "otc")}
    name = None
    for f in as_completed(futures):
        result = f.result()
        if result:
            name = result
            break
    ex.shutdown(wait=False)
    if name:
        _NAME_CACHE[code] = name
    return name


def _fetch_tw_industry(code):
    """Return Chinese industry name for a TW listed stock (static lookup, no API)."""
    if not code or not code[0].isdigit():
        return ""
    if code in _IND_CACHE:
        return _IND_CACHE[code]
    ind_code = _TW_STOCK_INDUSTRY.get(code, "")
    result = _TW_INDUSTRY_CODES.get(ind_code.zfill(2), "") if ind_code else ""
    if result:
        _IND_CACHE[code] = result
    return result


def _fetch_twse_month(code, yyyymm):
    """Fetch one month of OHLCV candles from TWSE STOCK_DAY. Returns list or []."""
    url = (f"https://www.twse.com.tw/exchangeReport/STOCK_DAY"
           f"?response=json&date={yyyymm}01&stockNo={code}")
    try:
        req = urllib.request.Request(url, headers=TWSE_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read())
        if d.get("stat") != "OK" or not d.get("data"):
            return []
        candles = []
        for row in d["data"]:
            try:
                parts = row[0].split("/")
                date_str = f"{int(parts[0])+1911}-{parts[1]}-{parts[2]}"
                candles.append({
                    "time":   date_str,
                    "open":   round(float(row[3].replace(",", "")), 2),
                    "high":   round(float(row[4].replace(",", "")), 2),
                    "low":    round(float(row[5].replace(",", "")), 2),
                    "close":  round(float(row[6].replace(",", "")), 2),
                    "volume": int(row[1].replace(",", "")),
                })
            except Exception:
                continue
        return candles
    except Exception:
        return []


def fetch_twse_chart(code, range_str="3mo"):
    """Build daily chart from TWSE STOCK_DAY (months fetched in parallel).
    Faster than YF for TW stocks. Returns sorted candle list or []."""
    tz_offset = timedelta(hours=8)
    now_dt = datetime.now(tz=timezone(tz_offset))
    months_needed = {"1mo": 2, "3mo": 4, "6mo": 7, "1y": 13}.get(range_str, 4)
    cutoff_dt = now_dt - timedelta(days=RANGE_DAYS.get(range_str, 95))
    cutoff = cutoff_dt.strftime("%Y-%m-%d")

    yyyymm_list = []
    for i in range(months_needed):
        m = now_dt.month - i
        y = now_dt.year
        while m <= 0:
            m += 12
            y -= 1
        yyyymm_list.append(f"{y}{m:02d}")

    all_candles = []
    with ThreadPoolExecutor(max_workers=min(months_needed, 6)) as ex:
        for rows in ex.map(_fetch_twse_month, [code] * months_needed, yyyymm_list):
            all_candles.extend(rows)

    all_candles.sort(key=lambda x: x["time"])
    return [c for c in all_candles if c["time"] >= cutoff]


def _yf_symbol(code):
    """Return Yahoo Finance symbol. Indices (^) and futures (=F) are used as-is."""
    if code.startswith("^") or "=" in code:
        return code
    return f"{code}.TW"


def _twse_latest_candle(code_str):
    """Fetch the most recent TWSE STOCK_DAY candle for a TW stock."""
    tz_offset = timedelta(hours=8)
    now_dt = datetime.now(tz=timezone(tz_offset))
    for delta in (0, -1):
        m = now_dt.month + delta
        y = now_dt.year
        if m < 1:
            m, y = 12, y - 1
        url = (f"https://www.twse.com.tw/exchangeReport/STOCK_DAY"
               f"?response=json&date={y}{m:02d}01&stockNo={code_str}")
        try:
            req = urllib.request.Request(url, headers=TWSE_HEADERS)
            with urllib.request.urlopen(req, timeout=10) as resp:
                d = json.loads(resp.read())
            if d.get("stat") != "OK":
                continue
            rows = d.get("data") or []
            if not rows:
                continue
            row = rows[-1]
            parts = row[0].split("/")
            twse_date = f"{int(parts[0])+1911}-{parts[1]}-{parts[2]}"
            return {
                "time":   twse_date,
                "open":   round(float(row[3].replace(",", "")), 2),
                "high":   round(float(row[4].replace(",", "")), 2),
                "low":    round(float(row[5].replace(",", "")), 2),
                "close":  round(float(row[6].replace(",", "")), 2),
                "volume": int(row[1].replace(",", "")),
            }
        except Exception:
            continue
    return None


def _try_yf_url(url):
    """Single YF chart request. Returns (last_ts, result0) or (0, None)."""
    try:
        req = urllib.request.Request(url, headers=YF_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read())
        result = d.get("chart", {}).get("result") or []
        if not result:
            return 0, None
        ts = result[0].get("timestamp") or []
        return (max(ts) if ts else 0), result[0]
    except Exception:
        return 0, None


def fetch_chart(code, range_str="3mo", interval="1d", adj=False):
    # TX=F daily → TAIFEX annual ZIPs + TWII proxy
    if code == "TX=F" and interval == "1d":
        result = fetch_tx(range_str)
        if result:
            return result
        twii = fetch_chart("^TWII", range_str, interval)
        if twii:
            twii["code"] = "TX=F"
            twii["name"] = "台指期（大盤指數近似）"
        return twii
    # TX=F intraday → Yahoo Finance TX=F directly (falls through to YF code below)
    yf_sym = _yf_symbol(code)
    is_daily = interval == "1d"
    is_tw_stock = yf_sym.endswith(".TW")

    if is_daily:
        days = RANGE_DAYS.get(range_str, 95)
        now = int(time.time())
        period1 = now - days * 86400
        period2 = now + 86400
        url_params = f"interval=1d&period1={period1}&period2={period2}&events=div%2Csplits"
        url_params_alt = f"interval=1d&range={range_str}&events=div%2Csplits"
    else:
        url_params = f"interval={interval}&range={range_str}"
        url_params_alt = None

    encoded_sym = urllib.parse.quote(yf_sym)
    attempts = []
    for host in YF_HOSTS:
        attempts.append(f"https://{host}/v8/finance/chart/{encoded_sym}?{url_params}")
        if url_params_alt:
            attempts.append(f"https://{host}/v8/finance/chart/{encoded_sym}?{url_params_alt}")

    # ── 台股日K (range ≤ 1y)：TWSE 主路徑，YF 並行只取 events（不阻塞）────────
    use_twse_primary = (is_daily and is_tw_stock and not adj
                        and range_str in ("1mo", "3mo", "6mo", "1y"))
    if use_twse_primary:
        ex = ThreadPoolExecutor(max_workers=4)
        f_candles = ex.submit(fetch_twse_chart, code, range_str)
        f_yf_ev   = ex.submit(_try_yf_url, attempts[0])   # 只取 events，不用 price
        f_name    = ex.submit(_fetch_tw_name, code)
        f_ind     = ex.submit(_fetch_tw_industry, code)

        candles = f_candles.result() or []
        # name/industry 與 candles 並行，TWSE candles 完成後最多再等 4s
        # （兩者已在 candles 跑的同時同步執行，實際等待遠低於 4s）
        try:
            tw_name = f_name.result(timeout=4.0)
        except Exception:
            tw_name = None
        try:
            tw_industry = f_ind.result(timeout=4.0) or ""
        except Exception:
            tw_industry = ""

        # TWSE 完成後最多再等 0.5s 拿 YF events；超時直接給空
        events = []
        try:
            _, yf_r0 = f_yf_ev.result(timeout=0.5)
            if yf_r0:
                tz_offset = timedelta(hours=8)
                raw_ev = yf_r0.get("events") or {}
                for ts_str, div in (raw_ev.get("dividends") or {}).items():
                    try:
                        dt = datetime.fromtimestamp(int(ts_str), tz=timezone(tz_offset))
                        events.append({"date": dt.strftime("%Y-%m-%d"), "type": "div",
                                       "amount": round(float(div.get("amount", 0)), 4)})
                    except Exception:
                        pass
                for ts_str, sp in (raw_ev.get("splits") or {}).items():
                    try:
                        dt = datetime.fromtimestamp(int(ts_str), tz=timezone(tz_offset))
                        events.append({"date": dt.strftime("%Y-%m-%d"), "type": "split",
                                       "ratio": f"{sp.get('numerator',0)}/{sp.get('denominator',1)}"})
                    except Exception:
                        pass
        except Exception:
            pass
        ex.shutdown(wait=False)  # 不阻塞等 YF；YF 仍在跑的話讓它背景結束

        if candles:
            return {
                "code": code,
                "name": tw_name or code,
                "industry": tw_industry,
                "currency": "TWD",
                "data": candles,
                "events": events,
            }
        # TWSE 失敗時 fallback 到 YF（保底）

    # ── 其他情況（3y、還原日、外國股、指數）走 YF ────────────────────────────
    tasks = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for url in attempts:
            tasks[ex.submit(_try_yf_url, url)] = ("yf", url)
        if is_daily and is_tw_stock:
            tasks[ex.submit(_twse_latest_candle, code)] = ("twse", None)
        if is_tw_stock and not use_twse_primary:
            tasks[ex.submit(_fetch_tw_name, code)]     = ("name", None)
            tasks[ex.submit(_fetch_tw_industry, code)] = ("ind",  None)

        best_result = None
        best_last_ts = 0
        twse_candle = None
        tw_name = tw_name if use_twse_primary else None
        tw_industry = tw_industry if use_twse_primary else ""

        for f in as_completed(tasks):
            kind, _ = tasks[f]
            try:
                val = f.result()
            except Exception:
                continue
            if kind == "yf":
                last_ts, r0 = val
                if last_ts > best_last_ts:
                    best_last_ts = last_ts
                    best_result = r0
            elif kind == "twse":
                twse_candle = val
            elif kind == "name":
                tw_name = val
            elif kind == "ind":
                tw_industry = val or ""

    if not best_result:
        return None

    meta = best_result.get("meta", {})
    timestamps = best_result.get("timestamp") or []
    q = (best_result.get("indicators", {}).get("quote") or [{}])[0]
    opens   = q.get("open")   or []
    highs   = q.get("high")   or []
    lows    = q.get("low")    or []
    closes  = q.get("close")  or []
    volumes = q.get("volume") or []

    adjcloses = []
    if adj and is_daily:
        adjcloses = ((best_result.get("indicators", {}).get("adjclose") or [{}])[0]
                     .get("adjclose") or [])

    tz_offset = timedelta(hours=8)
    candles = []
    for i, ts in enumerate(timestamps):
        o = opens[i]  if i < len(opens)   else None
        h = highs[i]  if i < len(highs)   else None
        l = lows[i]   if i < len(lows)    else None
        c = closes[i] if i < len(closes)  else None
        v = volumes[i] if i < len(volumes) else None
        if None in (o, h, l, c):
            continue
        if adj and adjcloses and i < len(adjcloses) and adjcloses[i] and c:
            ratio = adjcloses[i] / c
            o, h, l, c = o * ratio, h * ratio, l * ratio, adjcloses[i]
        if is_daily:
            dt = datetime.fromtimestamp(ts, tz=timezone(tz_offset))
            t_val = dt.strftime("%Y-%m-%d")
        else:
            t_val = int(ts)
        candles.append({
            "time":   t_val,
            "open":   round(float(o), 4),
            "high":   round(float(h), 4),
            "low":    round(float(l), 4),
            "close":  round(float(c), 4),
            "volume": int(v) if v else 0,
        })

    last_yf = candles[-1]["time"] if candles else "0000-00-00"
    if twse_candle and twse_candle["time"] > last_yf:
        candles.append(twse_candle)
        candles.sort(key=lambda x: x["time"])

    events = []
    if is_daily:
        raw_events = best_result.get("events") or {}
        for ts_str, div in (raw_events.get("dividends") or {}).items():
            try:
                dt = datetime.fromtimestamp(int(ts_str), tz=timezone(tz_offset))
                events.append({"date": dt.strftime("%Y-%m-%d"), "type": "div",
                               "amount": round(float(div.get("amount", 0)), 4)})
            except Exception:
                pass
        for ts_str, sp in (raw_events.get("splits") or {}).items():
            try:
                dt = datetime.fromtimestamp(int(ts_str), tz=timezone(tz_offset))
                events.append({"date": dt.strftime("%Y-%m-%d"), "type": "split",
                               "ratio": f"{sp.get('numerator',0)}/{sp.get('denominator',1)}"})
            except Exception:
                pass

    yf_name = meta.get("longName") or meta.get("shortName") or code
    return {
        "code": code,
        "name": tw_name or yf_name,
        "industry": tw_industry,
        "currency": meta.get("currency", ""),
        "data": candles,
        "events": events,
    }


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _json(self, code, data, cache="no-store"):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        code = (params.get("code") or [""])[0].strip()
        range_str = (params.get("range") or ["3mo"])[0].strip()
        interval = (params.get("interval") or ["1d"])[0].strip()
        adj = (params.get("adj") or ["0"])[0].strip() == "1"

        if not code:
            self._json(400, {"error": "missing code parameter"})
            return

        try:
            result = fetch_chart(code, range_str, interval, adj=adj)
            # TX=F intraday: Yahoo Finance has no TX=F 5m data → fall back to ^TWII
            if not result and code == "TX=F" and interval != "1d":
                result = fetch_chart("^TWII", range_str, interval)
                if result:
                    result["code"] = "TX=F"
                    result["name"] = "台指期貨走勢（大盤近似）"
            if not result:
                self._json(404, {"error": f"no data for {code}"})
                return
            # 指數/期貨日K：CDN 快取 4h（一天只更新一次）
            INDEX_CODES = {"^TWII", "^N225", "^KS11", "^IXIC", "^DJI", "TX=F"}
            if code in INDEX_CODES and interval == "1d":
                cache = "public, s-maxage=14400, stale-while-revalidate=86400"
            else:
                cache = "no-store"
            self._json(200, result, cache=cache)
        except Exception as e:
            self._json(500, {"error": str(e)})
