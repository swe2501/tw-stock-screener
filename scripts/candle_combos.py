"""
candle_combos.py — K棒組合 16 類（2026-11-04）

規則來源：用戶提供的《K棒組合.md》（朋友網站的最新 16 類版本，照原文實作），加上用戶 2026-11-04 確認的補充：
  - 長紅／長黑一律以實體 3% 為準：紅 C ≥ O×1.03、黑 C ≤ O×0.97（多頭/空頭母子的母棒、紅黑三兵）
  - 內困三日翻紅＝多頭母子＋第3根紅K收盤 > 第1根開盤；翻黑＝空頭母子＋第3根黑K收盤 < 第1根開盤
  - 紅三兵＝連3根長紅、收盤逐日墊高；黑三兵＝連3根長黑、收盤逐日走低；兩者不設量比、不加波段
  - 上升／下降三法（合夥人 11/04 補充）：末棒要黏著倒數第 2 根、不能有缺口（開盤不越過前一根實體）

共用規則（文件原文）：
  - 紅K C>O、黑K C<O，十字(O=C)不算紅黑。實體＝開~收，不含影線。
  - 波段上漲：前段有效低點 ≤ H÷1.3；波段下跌：前段有效高點 ≥ L÷0.7（含等號；H/L＝組合K棒含影線極值）。
  - 反向回撤 10%：往前找時，遇較早高點到其後最低價回落「嚴格大於」10%（上漲波段）或較早低點到其後最高價
    反彈嚴格大於 10%（下跌波段）就停止；先達到波段目標就成立。前段不含組合本身與其後資料，至少一根。
  - 組合與前段都不能跨「缺交易日、無效價、除權息日」切段；戰車的創紀錄比較例外：比對形成前全部保存資料。
  - 篩選：只列最近 3 個共同交易日完成的組合；最低量 收盤≥100 元需 ≥10 萬股、<100 元需 ≥50 萬股（十字線免量）。
  - 資料範圍：只用本機已保存日K（2024-07 起），不下載、不補值，不宣稱每檔都有完整十年。

價格一律轉成整數（×1000）做比較，避免浮點誤差（文件要求 decimal 精確比較、不先四捨五入）。

用法：
  python scripts/candle_combos.py                # 每晚：重算後只覆寫最近 10 個交易日
  python scripts/candle_combos.py --full         # 首次回補／規則修改後全部重寫
  python scripts/candle_combos.py --dry-run      # 算全市場、印統計，不寫資料庫
寫入 Supabase candle_combo_hits（sql/candle_combo_hits.sql）。
"""
import argparse
import json
import sqlite3
import ssl
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wantgoo_scraper as ws          # noqa: E402  LOCAL_DB_PATH

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

RETRACE_PCT = 10          # 反向回撤上限（%），嚴格大於才截斷
SCREEN_DAYS = 3           # 篩選：最近幾個共同交易日完成
CAL_MIN_STOCKS = 500      # 共同交易日：當天至少這麼多檔有資料
EX_CACHE = Path(r"D:\stock_data\ex_rights_cache.json")

COMBOS = {   # id: (中文名, 棒數說明)
    "reversal-doji": "反轉十字線",
    "bullish-engulfing": "陽吞噬",
    "bearish-engulfing": "陰吞噬",
    "piercing": "貫穿線",
    "dark-cloud": "烏雲罩頂",
    "bullish-harami": "多頭母子",
    "bearish-harami": "空頭母子",
    "three-inside-up": "內困三日翻紅",
    "three-inside-down": "內困三日翻黑",
    "two-gap-crows": "雙鴉躍空",
    "three-white-soldiers": "紅三兵",
    "three-black-crows": "黑三兵",
    "bullish-tank": "多頭戰車",
    "bearish-tank": "空頭戰車",
    "rising-three": "上升三法",
    "falling-three": "下降三法",
}

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE


# ───────────────────────── 除權息日（官方：上市 TWT49U、上櫃 exDailyQ） ─────────────────────────
def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=40, context=_CTX).read())


def _fetch_ex_range(d0, d1):
    """回 {(code, iso)}；d0、d1 為 date。"""
    out = set()
    j = _get_json("https://www.twse.com.tw/rwd/zh/exRight/TWT49U?response=json"
                  f"&startDate={d0:%Y%m%d}&endDate={d1:%Y%m%d}")
    for r in j.get("data") or []:
        s = str(r[0])                                   # 113年07月01日
        try:
            y, rest = s.split("年"); m, rest = rest.split("月"); dd = rest.split("日")[0]
            out.add((str(r[1]).strip(), f"{int(y) + 1911}-{int(m):02d}-{int(dd):02d}"))
        except ValueError:
            continue
    j = _get_json("https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?response=json"
                  f"&startDate={d0:%Y/%m/%d}&endDate={d1:%Y/%m/%d}")
    for t in j.get("tables") or []:
        for r in t.get("data") or []:
            try:
                y, m, dd = str(r[0]).split("/")
                out.add((str(r[1]).strip(), f"{int(y) + 1911}-{int(m):02d}-{int(dd):02d}"))
            except ValueError:
                continue
    return out


def ex_rights(first_iso):
    """{code: set(除權息日)}。本機快取，每次只重抓最近 60 天；快取起日晚於 first_iso 時整段補抓。"""
    cache = {"since": None, "events": []}
    if EX_CACHE.exists():
        try:
            cache = json.loads(EX_CACHE.read_text(encoding="utf-8"))
        except ValueError:
            pass
    events = {tuple(e) for e in cache.get("events", [])}
    today = date.today()
    start = date.fromisoformat(first_iso)
    if cache.get("since") and cache["since"] <= first_iso:
        start = max(start, today - timedelta(days=60))
    d = start
    while d <= today:
        e = min(d + timedelta(days=90), today)
        for attempt in range(3):
            try:
                events |= _fetch_ex_range(d, e)
                break
            except Exception as ex:                      # noqa: BLE001
                if attempt == 2:
                    raise RuntimeError(f"除權息資料讀取失敗 {d}~{e}：{ex}")
                time.sleep(5)
        d = e + timedelta(days=1)
        time.sleep(1)
    since = min(cache.get("since") or first_iso, first_iso)
    EX_CACHE.write_text(json.dumps({"since": since, "events": sorted(events)}, ensure_ascii=False), encoding="utf-8")
    by = defaultdict(set)
    for code, iso in events:
        by[code].add(iso)
    return by


# ───────────────────────── 資料載入與切段 ─────────────────────────
class Bars:
    """單一股票的有效日K（整數價 ×1000），含切段編號 seg 與該段起點 segstart。"""
    __slots__ = ("d", "o", "h", "l", "c", "v", "seg", "segstart")

    def __init__(self):
        self.d, self.o, self.h, self.l, self.c, self.v, self.seg, self.segstart = ([] for _ in range(8))


def _px(x):
    return int(round(float(x) * 1000))


def load_all(conn):
    cal_rows = conn.execute("select trade_date, count(*) from stock_daily group by trade_date").fetchall()
    calendar = sorted(d for d, n in cal_rows if n >= CAL_MIN_STOCKS)
    rows = defaultdict(dict)
    for code, d, o, h, l, c, v in conn.execute(
            "select code, trade_date, open, high, low, close, volume from stock_daily"):
        rows[code][d] = (o, h, l, c, v)
    return calendar, rows


def build(calendar, by_date, exdates):
    """依共同交易日曆建 Bars：缺日、無效價、除權息日都會開新段。"""
    b = Bars()
    days = [d for d in calendar if d >= min(by_date) and d <= max(by_date)]
    seg, brk, start = -1, True, 0
    for d in days:
        r = by_date.get(d)
        ok = False
        if r is not None:
            o, h, l, c, v = r
            try:
                o, h, l, c = _px(o), _px(h), _px(l), _px(c)
                ok = o > 0 and h > 0 and l > 0 and c > 0 and h >= max(o, c) and l <= min(o, c)
            except (TypeError, ValueError):
                ok = False
        if not ok:
            brk = True
            continue
        if d in exdates:
            brk = True
        if brk:
            seg += 1; start = len(b.d); brk = False
        b.d.append(d); b.o.append(o); b.h.append(h); b.l.append(l); b.c.append(c)
        try:
            b.v.append(int(v) if v is not None and int(v) > 0 else 0)
        except (TypeError, ValueError):
            b.v.append(0)
        b.seg.append(seg); b.segstart.append(start)
    return b


# ───────────────────────── 共用判斷 ─────────────────────────
def red(b, i):
    return b.c[i] > b.o[i]


def black(b, i):
    return b.c[i] < b.o[i]


def long_red(b, i):           # 長紅：C ≥ O×1.03
    return 100 * b.c[i] >= 103 * b.o[i]


def long_black(b, i):         # 長黑：C ≤ O×0.97
    return 100 * b.c[i] <= 97 * b.o[i]


def same_seg(b, s, e):
    return s >= 0 and e < len(b.d) and b.seg[s] == b.seg[e]


def wave_up(b, s, H):
    """波段上漲：組合起點 s 之前（同段）有低點 ≤ H÷1.3；途中較早高點→其後低點回落 >10% 就停止。"""
    first = b.segstart[s]
    k = s - 1
    min_after = None                     # k 之後（到 s-1）的最低價
    while k >= first:
        if 13 * b.l[k] <= 10 * H:        # l ≤ H/1.3
            return True
        if min_after is not None and 100 * (b.h[k] - min_after) > RETRACE_PCT * b.h[k]:
            return False
        min_after = b.l[k] if min_after is None else min(min_after, b.l[k])
        k -= 1
    return False


def wave_down(b, s, L):
    """波段下跌：組合起點 s 之前（同段）有高點 ≥ L÷0.7；途中較早低點→其後高點反彈 >10% 就停止。"""
    first = b.segstart[s]
    k = s - 1
    max_after = None
    while k >= first:
        if 7 * b.h[k] >= 10 * L:         # h ≥ L/0.7
            return True
        if max_after is not None and 100 * (max_after - b.l[k]) > RETRACE_PCT * b.l[k]:
            return False
        max_after = b.h[k] if max_after is None else max(max_after, b.h[k])
        k -= 1
    return False


def _hl(b, s, e):
    return max(b.h[s:e + 1]), min(b.l[s:e + 1])


# ───────────────────────── 各組合（i＝最後一根） ─────────────────────────
def is_doji(b, i):
    """反轉十字線：O=C、H>O、L<O；波段上漲或波段下跌任一成立（同棒雙方向只列一次）。不看量。"""
    o, h, l, c = b.o[i], b.h[i], b.l[i], b.c[i]
    if not (o == c and h > o and l < o):
        return False
    return wave_up(b, i, h) or wave_down(b, i, l)


def bull_engulf(b, i):
    s = i - 1
    if not same_seg(b, s, i) or not (black(b, s) and red(b, i)):
        return False
    if not (b.o[i] <= b.l[s] and b.c[i] >= b.h[s]):           # 紅K實體包住前黑K最低~最高（連影線）
        return False
    return wave_down(b, s, _hl(b, s, i)[1])


def bear_engulf(b, i):
    s = i - 1
    if not same_seg(b, s, i) or not (red(b, s) and black(b, i)):
        return False
    if not (b.o[i] >= b.h[s] and b.c[i] <= b.l[s]):
        return False
    return wave_up(b, s, _hl(b, s, i)[0])


def piercing(b, i):
    """貫穿線：黑→紅；後紅實體低點(O2) < 前黑實體低點(C1)；實體交集 ≥ 前黑實體 60%；
    後紅實體高點(C2) ≤ 前黑最高價(含影線)；後量 > 前量且兩日有量；波段下跌。"""
    s = i - 1
    if not same_seg(b, s, i) or not (black(b, s) and red(b, i)):
        return False
    o1, c1, h1, o2, c2 = b.o[s], b.c[s], b.h[s], b.o[i], b.c[i]
    if not o2 < c1:
        return False
    inter = min(o1, c2) - max(c1, o2)
    if 10 * inter < 6 * (o1 - c1):
        return False
    if not c2 <= h1:
        return False
    if not (b.v[s] > 0 and b.v[i] > b.v[s]):
        return False
    return wave_down(b, s, _hl(b, s, i)[1])


def dark_cloud(b, i):
    """烏雲罩頂：紅→黑；後黑實體高點(O2) > 前紅實體高點(C1)；實體交集 ≥ 前紅實體 60%；
    後黑實體低點(C2) ≥ 前紅開盤；波段上漲。"""
    s = i - 1
    if not same_seg(b, s, i) or not (red(b, s) and black(b, i)):
        return False
    o1, c1, o2, c2 = b.o[s], b.c[s], b.o[i], b.c[i]
    if not o2 > c1:
        return False
    inter = min(c1, o2) - max(o1, c2)
    if 10 * inter < 6 * (c1 - o1):
        return False
    if not c2 >= o1:
        return False
    return wave_up(b, s, _hl(b, s, i)[0])


def _bull_harami_pair(b, s, e):
    """多頭母子：長黑 → 紅，母棒實體較大且完整包住子棒實體（含等號），不看子棒影線；波段下跌。"""
    if not same_seg(b, s, e) or not (black(b, s) and long_black(b, s) and red(b, e)):
        return False
    if not (b.c[s] <= b.o[e] and b.c[e] <= b.o[s] and (b.o[s] - b.c[s]) > (b.c[e] - b.o[e])):
        return False
    return wave_down(b, s, _hl(b, s, e)[1])


def _bear_harami_pair(b, s, e):
    if not same_seg(b, s, e) or not (red(b, s) and long_red(b, s) and black(b, e)):
        return False
    if not (b.o[s] <= b.c[e] and b.o[e] <= b.c[s] and (b.c[s] - b.o[s]) > (b.o[e] - b.c[e])):
        return False
    return wave_up(b, s, _hl(b, s, e)[0])


def bull_harami(b, i):
    return _bull_harami_pair(b, i - 1, i)


def bear_harami(b, i):
    return _bear_harami_pair(b, i - 1, i)


def three_inside_up(b, i):
    """內困三日翻紅：K1-K2 為多頭母子，K3 紅K 收盤 > K1 開盤。"""
    s = i - 2
    return same_seg(b, s, i) and red(b, i) and b.c[i] > b.o[s] and _bull_harami_pair(b, s, s + 1)


def three_inside_down(b, i):
    s = i - 2
    return same_seg(b, s, i) and black(b, i) and b.c[i] < b.o[s] and _bear_harami_pair(b, s, s + 1)


def two_gap_crows(b, i):
    """雙鴉躍空：紅→黑→黑；K2、K3 開盤與收盤都嚴格高於 C1；K1 須先通過波段上漲（只用 K1 自己的 High）。"""
    s = i - 2
    if not same_seg(b, s, i) or not (red(b, s) and black(b, s + 1) and black(b, i)):
        return False
    c1 = b.c[s]
    if not all(x > c1 for x in (b.o[s + 1], b.c[s + 1], b.o[i], b.c[i])):
        return False
    return wave_up(b, s, b.h[s])


def three_white(b, i):
    """紅三兵：連續 3 根長紅（C ≥ O×1.03），收盤逐日墊高。不設量比、不加波段。"""
    s = i - 2
    if not same_seg(b, s, i):
        return False
    if not all(red(b, k) and long_red(b, k) for k in (s, s + 1, i)):
        return False
    return b.c[s] < b.c[s + 1] < b.c[i]


def three_black(b, i):
    s = i - 2
    if not same_seg(b, s, i):
        return False
    if not all(black(b, k) and long_black(b, k) for k in (s, s + 1, i)):
        return False
    return b.c[s] > b.c[s + 1] > b.c[i]


def _bodies_touch(b, a, c):
    return max(min(b.o[a], b.c[a]), min(b.o[c], b.c[c])) <= min(max(b.o[a], b.c[a]), max(b.o[c], b.c[c]))


def bull_tank(b, i, prior_max_high):
    """多頭戰車：紅→黑→紅；C1 > 形成前全部保存資料最高價；C3 > H2×1.03；V3 ≥ V2×1.5；相鄰實體相交或碰到。"""
    s = i - 2
    if not same_seg(b, s, i) or not (red(b, s) and black(b, s + 1) and red(b, i)):
        return False
    pm = prior_max_high[s]
    if pm is None or not b.c[s] > pm:
        return False
    if not 100 * b.c[i] > 103 * b.h[s + 1]:
        return False
    if not (b.v[s + 1] > 0 and b.v[i] > 0 and 2 * b.v[i] >= 3 * b.v[s + 1]):
        return False
    return _bodies_touch(b, s, s + 1) and _bodies_touch(b, s + 1, i)


def bear_tank(b, i, prior_min_low):
    s = i - 2
    if not same_seg(b, s, i) or not (black(b, s) and red(b, s + 1) and black(b, i)):
        return False
    pm = prior_min_low[s]
    if pm is None or not b.c[s] < pm:
        return False
    if not 100 * b.c[i] < 97 * b.l[s + 1]:
        return False
    if not (b.v[s + 1] > 0 and b.v[i] > 0 and b.v[i] < b.v[s + 1]):
        return False
    return _bodies_touch(b, s, s + 1) and _bodies_touch(b, s + 1, i)


def three_methods(b, rising):
    """上升三法／下降三法（逐棒處理，回 [(起點, 完成點)]）。
    上升：首末紅；每根中間實體在首棒實體 [O1,C1] 內（含等號、影線不限）；末棒 O1≤On≤C1、Cn>H1、Vn≥前日量×1.5。
    下降：首末黑；中間實體在 [C1,O1] 內；末棒 C1≤On≤O1、Cn<L1、Vn<前日量。
    中間至少 3 根、無上限；多個起點同時成立取最早；完成後從下一交易日重找首棒。"""
    out = []
    cands = []                                   # 仍有效的首棒（依時間排序）
    n = len(b.d)
    j = 0
    while j < n:
        if cands and b.seg[cands[0]] != b.seg[j]:
            cands = []
        done = None
        for s in cands:                           # 先試 j 當末棒（最早起點優先）
            if j - s - 1 < 3:
                continue
            o1, c1 = b.o[s], b.c[s]
            vp = b.v[j - 1]
            # 2026-11-04 合夥人補充：末棒要黏著倒數第 2 根、不能有缺口（缺口用網站跳空定義：開盤越過前一根實體）
            # 上升：末棒開盤 ≤ 前一根實體上緣；下降：末棒開盤 ≥ 前一根實體下緣（等於算黏著）
            if rising:
                ok = (red(b, j) and o1 <= b.o[j] <= c1 and b.c[j] > b.h[s]
                      and b.o[j] <= max(b.o[j - 1], b.c[j - 1])
                      and vp > 0 and b.v[j] > 0 and 2 * b.v[j] >= 3 * vp)
            else:
                ok = (black(b, j) and c1 <= b.o[j] <= o1 and b.c[j] < b.l[s]
                      and b.o[j] >= min(b.o[j - 1], b.c[j - 1])
                      and vp > 0 and b.v[j] > 0 and b.v[j] < vp)
            if ok:
                done = s
                break
        if done is not None:
            out.append((done, j))
            cands = []
            j += 1
            continue
        lo_j, hi_j = min(b.o[j], b.c[j]), max(b.o[j], b.c[j])     # j 當中間棒：實體要在首棒實體內
        cands = [s for s in cands if min(b.o[s], b.c[s]) <= lo_j and hi_j <= max(b.o[s], b.c[s])]
        if (red(b, j) if rising else black(b, j)):
            cands.append(j)
        j += 1
    return out


SINGLE = [("reversal-doji", is_doji, 1)]
DOUBLE = [("bullish-engulfing", bull_engulf, 2), ("bearish-engulfing", bear_engulf, 2),
          ("piercing", piercing, 2), ("dark-cloud", dark_cloud, 2),
          ("bullish-harami", bull_harami, 2), ("bearish-harami", bear_harami, 2)]
TRIPLE = [("three-inside-up", three_inside_up, 3), ("three-inside-down", three_inside_down, 3),
          ("two-gap-crows", two_gap_crows, 3), ("three-white-soldiers", three_white, 3),
          ("three-black-crows", three_black, 3)]


def scan_stock(b):
    """回 [(combo, start_idx, end_idx)]。"""
    hits = []
    n = len(b.d)
    pmh, pml = [None] * n, [None] * n           # 形成前全部保存資料的最高/最低（不受切段影響）
    mh = ml = None
    for k in range(n):
        pmh[k], pml[k] = mh, ml
        mh = b.h[k] if mh is None else max(mh, b.h[k])
        ml = b.l[k] if ml is None else min(ml, b.l[k])
    for i in range(n):
        for cid, fn, k in SINGLE + DOUBLE + TRIPLE:
            if i - k + 1 >= 0 and fn(b, i):
                hits.append((cid, i - k + 1, i))
        if i >= 2:
            if bull_tank(b, i, pmh):
                hits.append(("bullish-tank", i - 2, i))
            if bear_tank(b, i, pml):
                hits.append(("bearish-tank", i - 2, i))
    hits += [("rising-three", s, e) for s, e in three_methods(b, True)]
    hits += [("falling-three", s, e) for s, e in three_methods(b, False)]
    return hits


def liquid(b, i, cid):
    """篩選最低量：收盤 ≥100 元需 ≥10 萬股，<100 元需 ≥50 萬股；十字線免量。"""
    if cid == "reversal-doji":
        return True
    need = 100_000 if b.c[i] >= 100_000 else 500_000     # 價格 ×1000
    return b.v[i] >= need


def run():
    t0 = time.time()
    conn = sqlite3.connect(f"file:{ws.LOCAL_DB_PATH}?mode=ro", uri=True, timeout=120)
    calendar, rows = load_all(conn)
    conn.close()
    print(f"[載入] {len(rows)} 檔、共同交易日 {calendar[0]}~{calendar[-1]}（{len(calendar)} 天） {time.time() - t0:.1f}s")
    ex = ex_rights(calendar[0])
    print(f"[除權息] {sum(len(v) for v in ex.values())} 筆事件、{len(ex)} 檔")
    recent = set(calendar[-SCREEN_DAYS:])
    out = []
    for code, by_date in rows.items():
        b = build(calendar, by_date, ex.get(code, set()))
        if len(b.d) < 2:
            continue
        for cid, s, e in scan_stock(b):
            out.append({"code": code, "combo": cid, "start_date": b.d[s], "end_date": b.d[e],
                        "liquid": liquid(b, e, cid)})
    print(f"[計算] {len(out)} 筆組合 {time.time() - t0:.1f}s")
    tot = Counter(r["combo"] for r in out)
    rec = Counter(r["combo"] for r in out if r["end_date"] in recent and r["liquid"])
    print(f"近 {SCREEN_DAYS} 日 {sorted(recent)}（已套最低量）：")
    for cid, name in COMBOS.items():
        print(f"  {name:<8} 全期 {tot[cid]:>6}   近{SCREEN_DAYS}日 {rec[cid]:>4}")
    return out, calendar


def upload(out, calendar, full=False, keep_days=10):
    """寫 Supabase candle_combo_hits：預設只重寫最近 keep_days 個交易日完成的組合（先刪後寫）；--full 全部重寫。
    組合只用完成日以前的資料判斷，舊的命中不會因新資料改變，所以每晚只需重算最近幾天。"""
    import broker_signals as bs
    env = bs._load_env()
    cutoff = calendar[0] if full else calendar[-keep_days]
    rows = [r for r in out if r["end_date"] >= cutoff]
    st, _ = bs._sb(env, "/candle_combo_hits", method="DELETE", params=[("end_date", f"gte.{cutoff}")])
    if st not in (200, 204):
        raise RuntimeError(f"刪除 {cutoff} 以後舊資料失敗 status={st}")
    for k in range(0, len(rows), 1000):
        st, resp = bs._sb(env, "/candle_combo_hits", method="POST", body=rows[k:k + 1000])
        if st not in (200, 201, 204):
            raise RuntimeError(f"寫入失敗 status={st} {str(resp)[:200]}")
    print(f"[上傳] candle_combo_hits {cutoff} 以後 {len(rows)} 筆")
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只計算與統計，不寫資料庫")
    ap.add_argument("--full", action="store_true", help="全部重寫（首次回補或規則修改後用）")
    a = ap.parse_args()
    out, calendar = run()
    if a.dry_run:
        p = Path(r"D:\stock_data\candle_combos_dryrun.json")
        p.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        print(f"[dry-run] 結果寫到 {p}")
        return
    upload(out, calendar, full=a.full)


if __name__ == "__main__":
    main()
