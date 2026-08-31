"""
box_pattern.py — 箱型(矩形整理)型態偵測(規則型、可解釋、無未來資訊洩漏、可回測)。

依 box-pattern-detector-handoff.md 規格實作:
  ATR / 均量 → 容忍帶 → 上下緣觸碰(交替、間距、各≥3次)→ 箱型成立 → 狀態機
  狀態:FORMING / CONFIRMED_UP / CONFIRMED_DOWN / FALSE_UP_THEN_DOWN / FALSE_DOWN_THEN_UP

設計註記(規格未定義、由本實作決定，可調):
  * 上/下緣中心線挑法:視窗以中線分上下半;上緣=上半部「被 high 觸碰次數最多」的候選高點，
    下緣=下半部「被 low 觸碰次數最多」的候選低點(同分取較極端者)。
  * 容忍用「評估時點的 ATR(14)」為單一值(非逐根)，符合規格 reference_edge_price 寫法。
  * 純函數;每次評估只吃「該時點及之前」的 K 線 → 無未來洩漏。
"""
from dataclasses import dataclass, field

DEFAULTS = {
    "lookback_bars": 60,               # ≈ 3 個月交易日(形成區間)
    "max_height_pct": 0.10,            # 箱高上限:(上緣-下緣)/下緣 ≤ 10%(緊密箱)
    "formation_vol_max_spikes": 2,     # 形成期允許最多幾根量 > max(5,10)×量倍(容忍雜訊)
    "breakout_recency_bars": 3,        # 突破須發生在評估日近幾根內才報(否則過期=非當前箱)
    "edge_low_pctile": 5,              # 下外緣取盤整區低點的第5百分位(讓箱框住約9成K棒)
    "edge_high_pctile": 95,            # 上外緣取高點第95百分位
    "max_pierce_frac": 0.15,           # 保險:盤整區插破外緣的根數比例 >此則不算箱
    "required_upper_touches": 3,
    "required_lower_touches": 3,
    "min_touch_spacing_bars": 2,
    "tolerance_mode": "atr_capped",       # atr_capped | percent
    "atr_period": 14,
    "atr_multiplier": 0.25,
    "tolerance_percent_cap": 0.01,
    "fixed_tolerance_percent": 0.01,
    "single_breakout_percent": 0.03,
    "volume_short_ma": 5,
    "volume_long_ma": 10,
    "volume_multiplier": 1.3,
    "consecutive_close_confirm_bars": 3,
}


@dataclass
class Bar:
    ts: object
    open: float
    high: float
    low: float
    close: float
    volume: float


# ── 純指標 ─────────────────────────────────────────────
def true_range(high, low, prev_close):
    return max(high - low, abs(high - prev_close), abs(low - prev_close))


def atr_at(bars, i, period):
    """ATR(period) 於第 i 根(含)之前的簡單平均(初版用 SMA of TR)。第0根無前收→不計。不足期→用現有根數平均。"""
    trs = []
    for k in range(max(1, i - period + 1), i + 1):
        trs.append(true_range(bars[k].high, bars[k].low, bars[k - 1].close))
    return sum(trs) / len(trs) if trs else None


def sma_at(values, i, period):
    """values[i-period+1 .. i] 的平均;不足期→現有根數平均;i<0→None。"""
    if i < 0:
        return None
    lo = max(0, i - period + 1)
    seg = values[lo:i + 1]
    return sum(seg) / len(seg) if seg else None


def tolerance(edge_price, atr_value, cfg):
    if cfg["tolerance_mode"] == "percent":
        return edge_price * cfg["fixed_tolerance_percent"]
    # atr_capped
    a = (atr_value or 0) * cfg["atr_multiplier"]
    return min(a, edge_price * cfg["tolerance_percent_cap"])


# ── 觸碰偵測 ───────────────────────────────────────────
def _pctile(vals, p):
    """最近排名法百分位(不需 numpy)。"""
    if not vals:
        return None
    s = sorted(vals)
    idx = int(round(p / 100.0 * (len(s) - 1)))
    return s[max(0, min(len(s) - 1, idx))]


def _dedup_spacing(indices, spacing):
    """連續貼邊只算一次，且兩次計數至少相隔 spacing 根(中間空 spacing 根)。"""
    out = []
    for i in indices:
        if not out or i - out[-1] >= spacing + 1:
            out.append(i)
    return out


def _touch_indices(prices, level, tol, spacing):
    """prices 碰到 [level-tol, level+tol] 的 bar 索引(含間距去重)。供候選粗篩/單元測試用。"""
    raw = [i for i, p in enumerate(prices) if level - tol <= p <= level + tol]
    return _dedup_spacing(raw, spacing)


def _alternating_ok(upper_idx, lower_idx, need_u, need_l):
    """上下觸碰嚴格交替(可從上或下開始);回傳 (是否合格, 第6次觸碰完成的視窗索引)。"""
    tagged = sorted([(i, "U") for i in upper_idx] + [(i, "L") for i in lower_idx])
    seq, seen_idx = [], set()
    for i, side in tagged:
        if i in seen_idx:      # 同一根同時碰上下緣 → 保守跳過
            continue
        if not seq or seq[-1][1] != side:
            seq.append((i, side)); seen_idx.add(i)
        # 若與上一個同側 → 不接受(破壞交替);略過該點
    u = sum(1 for _, s in seq if s == "U")
    l = sum(1 for _, s in seq if s == "L")
    if u >= need_u and l >= need_l:
        # 第 (need_u+need_l) 次交替觸碰完成的 bar
        establish = seq[need_u + need_l - 1][0]
        return True, establish, seq
    return False, None, seq


# ── 箱型偵測(單一視窗) ─────────────────────────────────
def detect_box(bars, end_i, cfg):
    """在 bars[.. end_i] 的最後 lookback 根視窗內找箱型。回傳 dict(含 centers/outer/touches/establish)或 None。"""
    start = max(0, end_i - cfg["lookback_bars"] + 1)
    win = bars[start:end_i + 1]
    if len(win) < cfg["required_upper_touches"] + cfg["required_lower_touches"]:
        return None
    highs = [b.high for b in win]
    lows = [b.low for b in win]
    atr_value = atr_at(bars, end_i, cfg["atr_period"])
    rng_hi, rng_lo = max(highs), min(lows)
    if rng_hi <= rng_lo:
        return None
    mid = (rng_hi + rng_lo) / 2
    up_cand = [i for i, h in enumerate(highs) if h >= mid]
    lo_cand = [i for i, l in enumerate(lows) if l <= mid]
    if not up_cand or not lo_cand:
        return None
    # 候選邊(粗篩:單邊觸碰≥門檻，去重)
    req_u, req_l, spacing = cfg["required_upper_touches"], cfg["required_lower_touches"], cfg["min_touch_spacing_bars"]
    up_levels = {highs[i] for i in up_cand}
    lo_levels = {lows[i] for i in lo_cand}
    up_levels = sorted({U for U in up_levels
                        if len(_touch_indices(highs, U, tolerance(U, atr_value, cfg), spacing)) >= req_u}, reverse=True)
    lo_levels = sorted({L for L in lo_levels
                        if len(_touch_indices(lows, L, tolerance(L, atr_value, cfg), spacing)) >= req_l})
    if not up_levels or not lo_levels:
        return None
    # 搜尋能構成合法交替箱型的配對；取「最近成形」者(第6觸碰=establish 最靠近評估日),
    # 而非最外側舊箱 → 抓當前有效箱。
    # 觸碰採「不跨箱」規則:一根只有 high 碰上緣且 low 沒碰下緣才算上緣觸碰(反之亦然)，
    # 跨滿整箱的 bar 兩邊都不算 → 排除過窄假箱;突破群聚也因無法與對邊交替而被排除。
    best = None
    vols = [b.volume for b in bars]
    for upper_center in up_levels:
        upper_tol = tolerance(upper_center, atr_value, cfg)
        for lower_center in lo_levels:
            if upper_center <= lower_center:
                continue
            lower_tol = tolerance(lower_center, atr_value, cfg)
            up_raw, lo_raw = [], []
            for i in range(len(win)):
                in_up = upper_center - upper_tol <= highs[i] <= upper_center + upper_tol
                in_lo = lower_center - lower_tol <= lows[i] <= lower_center + lower_tol
                if in_up and not in_lo:
                    up_raw.append(i)
                elif in_lo and not in_up:
                    lo_raw.append(i)
            upper_touch = _dedup_spacing(up_raw, spacing)
            lower_touch = _dedup_spacing(lo_raw, spacing)
            if len(upper_touch) < req_u or len(lower_touch) < req_l:
                continue
            ok, establish_win, _seq = _alternating_ok(upper_touch, lower_touch, req_u, req_l)
            if not ok:
                continue
            # 箱高上限 + 形成期量縮:只有「完全合格」的箱才參與競選最近，
            # 避免挑到最近但不合格的箱而漏掉合格箱。
            if lower_center <= 0 or (upper_center - lower_center) / lower_center > cfg["max_height_pct"]:
                continue
            establish_i = start + establish_win
            spikes = 0
            bad = False
            for i in range(start, establish_i + 1):
                thr = max(sma_at(vols, i, cfg["volume_short_ma"]) or 0,
                          sma_at(vols, i, cfg["volume_long_ma"]) or 0) * cfg["volume_multiplier"]
                if thr > 0 and (bars[i].volume or 0) > thr:
                    spikes += 1
                    if spikes > cfg["formation_vol_max_spikes"]:
                        bad = True
                        break
            if bad:
                continue
            # 取 establish 最大(最近成形);同 establish 取上緣較高
            if best is None or establish_win > best[6] or (establish_win == best[6] and upper_center > best[0]):
                best = (upper_center, upper_tol, upper_touch,
                        lower_center, lower_tol, lower_touch, establish_win)
    if not best:
        return None
    upper_center, upper_tol, upper_touch, lower_center, lower_tol, lower_touch, establish_win = best
    # 外邊界:盤整區(首觸碰~末觸碰)高低點的 P95/P5,並至少含中心±容忍 → 讓箱框住約9成K棒
    all_t = upper_touch + lower_touch
    a0, a1 = min(all_t), max(all_t)
    a_lows = [lows[i] for i in range(a0, a1 + 1)]
    a_highs = [highs[i] for i in range(a0, a1 + 1)]
    lower_outer = min(lower_center - lower_tol, _pctile(a_lows, cfg["edge_low_pctile"]))
    upper_outer = max(upper_center + upper_tol, _pctile(a_highs, cfg["edge_high_pctile"]))
    # 保險:盤整區插破外緣的根數比例 > max_pierce_frac → 不算乾淨箱
    span = a1 - a0 + 1
    pierce = sum(1 for i in range(a0, a1 + 1) if lows[i] < lower_outer or highs[i] > upper_outer)
    if span > 0 and pierce / span > cfg["max_pierce_frac"]:
        return None
    return {
        "window_start_i": start,
        "establish_i": start + establish_win,       # 換回「全域索引」
        "upper_center": upper_center,
        "lower_center": lower_center,
        "upper_tol": upper_tol,
        "lower_tol": lower_tol,
        "upper_outer": upper_outer,
        "lower_outer": lower_outer,
        "atr_value": atr_value,
        "upper_touch_indices": [start + i for i in upper_touch],
        "lower_touch_indices": [start + i for i in lower_touch],
    }


# ── 有效突破判定(單根) ─────────────────────────────────
def _volume_threshold(bars, i, cfg):
    vols = [b.volume for b in bars]
    s = sma_at(vols, i, cfg["volume_short_ma"])
    l = sma_at(vols, i, cfg["volume_long_ma"])
    return max(s or 0, l or 0) * cfg["volume_multiplier"]


def _single_breakout(bars, i, box, cfg):
    """回傳 'up' / 'down' / None(單日 價+量 有效突破)。"""
    c = bars[i].close
    vt = _volume_threshold(bars, i, cfg)
    up_px = box["upper_outer"] * (1 + cfg["single_breakout_percent"])
    dn_px = box["lower_outer"] * (1 - cfg["single_breakout_percent"])
    if c >= up_px and bars[i].volume >= vt:
        return "up"
    if c <= dn_px and bars[i].volume >= vt:
        return "down"
    return None


def _consecutive_breakout(bars, i, box, cfg):
    """回傳 'up'/'down'/None(連續 N 根收盤在外緣之外，不看量)。"""
    n = cfg["consecutive_close_confirm_bars"]
    if i - n + 1 < 0:
        return None
    seg = bars[i - n + 1:i + 1]
    if all(b.close > box["upper_outer"] for b in seg):
        return "up"
    if all(b.close < box["lower_outer"] for b in seg):
        return "down"
    return None


# ── 狀態機(從箱型成立後走到 end_i) ─────────────────────
def evaluate(bars, end_i, cfg=None):
    """在 end_i 這個時點評估箱型狀態。只用 bars[.. end_i]。回傳 result dict 或 None(無箱型)。"""
    cfg = {**DEFAULTS, **(cfg or {})}
    box = detect_box(bars, end_i, cfg)
    if not box:
        return None

    status = "FORMING"
    breakout_i = None
    breakout_dir = None
    breakout_reason = None
    pending = None          # 'up' / 'down' 假突破待反轉

    # 從箱型成立後的下一根，逐根推進狀態(無未來洩漏:只到 end_i)
    for i in range(box["establish_i"] + 1, end_i + 1):
        # 已確認突破則定案(不再翻轉，除非做假突破反轉;規格:假突破在「有效突破前」回箱才算)
        sb = _single_breakout(bars, i, box, cfg)
        cb = _consecutive_breakout(bars, i, box, cfg)
        eff = sb or cb
        reason = "price_volume" if sb else ("consecutive_closes" if cb else None)

        if eff == "up":
            if pending == "down":
                status, breakout_i, breakout_dir, breakout_reason = "FALSE_DOWN_THEN_UP", i, "up", reason
            else:
                status, breakout_i, breakout_dir, breakout_reason = "CONFIRMED_UP", i, "up", reason
            pending = None
            break
        if eff == "down":
            if pending == "up":
                status, breakout_i, breakout_dir, breakout_reason = "FALSE_UP_THEN_DOWN", i, "down", reason
            else:
                status, breakout_i, breakout_dir, breakout_reason = "CONFIRMED_DOWN", i, "down", reason
            pending = None
            break

        # 未有效突破:偵測假突破(收在外緣外，但這根/近幾根未構成有效突破，之後回箱內)
        c = bars[i].close
        if c > box["upper_outer"]:
            pending = "up"          # 暫越上緣(尚未有效)
        elif c < box["lower_outer"]:
            pending = "down"
        else:
            # 回到箱內:若先前暫越 → 標記假突破 pending 維持(等反向有效突破)
            if pending == "up":
                status = "FALSE_UP_PENDING"
            elif pending == "down":
                status = "FALSE_DOWN_PENDING"

    # 突破過期(距評估日 > breakout_recency_bars 根)→ 非當前箱,不報
    if breakout_i is not None and (end_i - breakout_i) > cfg["breakout_recency_bars"]:
        return None
    # PENDING 為內部中間態(非規格輸出列舉)→ 對外視為仍在 FORMING
    out_status = "FORMING" if status in ("FALSE_UP_PENDING", "FALSE_DOWN_PENDING") else status
    result = {
        "status": out_status,
        "window_start": bars[box["window_start_i"]].ts,
        "window_end": bars[end_i].ts,
        "upper_center": round(box["upper_center"], 4),
        "lower_center": round(box["lower_center"], 4),
        "upper_outer": round(box["upper_outer"], 4),
        "lower_outer": round(box["lower_outer"], 4),
        "tolerance_value": round((box["upper_tol"] + box["lower_tol"]) / 2, 4),
        "tolerance_mode": cfg["tolerance_mode"],
        "atr_value": round(box["atr_value"], 4) if box["atr_value"] else None,
        "upper_touch_indices": box["upper_touch_indices"],
        "lower_touch_indices": box["lower_touch_indices"],
        "breakout_timestamp": bars[breakout_i].ts if breakout_i is not None else None,
        "breakout_direction": breakout_dir,
        "breakout_reason": breakout_reason,
        "volume_threshold": round(_volume_threshold(bars, end_i, cfg), 2),
    }
    return result


def scan(bars, cfg=None):
    """滑動窗掃描:對每個時點只吃截至該點的資料，回傳 [(end_i, result), ...](有箱型者)。"""
    cfg = {**DEFAULTS, **(cfg or {})}
    out = []
    for t in range(len(bars)):
        r = evaluate(bars, t, cfg)
        if r:
            out.append((t, r))
    return out
