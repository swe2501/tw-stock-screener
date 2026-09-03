# -*- coding: utf-8 -*-
"""box_pattern 自動化測試(規格第 11 節 10 案例)。用法: python scripts/test_box_pattern.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import box_pattern as bp
from box_pattern import Bar, evaluate, detect_box, tolerance, _touch_indices, DEFAULTS

_PASS = _FAIL = 0
def check(name, cond, extra=""):
    global _PASS, _FAIL
    if cond: _PASS += 1; print(f"  [PASS] {name}")
    else:    _FAIL += 1; print(f"  [FAIL] {name}  {extra}")

def bar(h, l, c, v, ts, o=None):
    return Bar(ts, o if o is not None else (h + l) / 2, h, l, c, v)

def base_box(warmup=14):
    """壓力100(high=100)/支撐90(low=90)交替箱型;U at 14,20,26 / L at 17,23,29;establish=29。"""
    bars, ts = [], 0
    for _ in range(warmup):
        bars.append(bar(97, 93, 95, 1000, ts)); ts += 1
    seq = ['U','in','in','L','in','in','U','in','in','L','in','in','U','in','in','L']
    for tag in seq:
        if tag == 'U':   bars.append(bar(100, 98, 99, 1000, ts))
        elif tag == 'L': bars.append(bar(93, 91, 92, 1000, ts))   # 下緣 91 → 箱高(100-91)/91≈9.9%≤10%
        else:            bars.append(bar(97, 93, 95, 1000, ts))
        ts += 1
    return bars                     # len 30, establish 全域索引 29

def add(bars, h, l, c, v):
    bars.append(bar(h, l, c, v, len(bars))); return bars

print("== box_pattern 測試 ==")

# 1. 六次交替觸碰 → FORMING
b = base_box(); add(b,97,93,95,1000); add(b,97,93,95,1000)
r = evaluate(b, len(b)-1)
check("1 六次交替→FORMING", r and r["status"]=="FORMING", r["status"] if r else "None")
check("1 上緣=100/下緣=91", r and abs(r["upper_center"]-100)<1e-6 and abs(r["lower_center"]-91)<1e-6,
      f'{r["upper_center"]}/{r["lower_center"]}' if r else "None")

# 2. 少於六次(只2上2下) → 不成箱
b2 = [bar(97,93,95,1000,i) for i in range(14)]
for tag in ['U','in','in','L','in','in','U','in','in','L']:
    h,l,c = (100,98,99) if tag=='U' else ((92,90,91) if tag=='L' else (97,93,95))
    add(b2,h,l,c,1000)
r2 = evaluate(b2, len(b2)-1)
check("2 少於六次→非箱型(None)", r2 is None, r2["status"] if r2 else "None")

# 3. 同側間距不足不重複計數(直接測 _touch_indices)
prices = [100, 100, 100, 95, 95, 100]     # 前三根連續貼邊
ti = _touch_indices(prices, 100, 0.5, DEFAULTS["min_touch_spacing_bars"])
check("3 間距不足不重複計數", ti == [0, 5], str(ti))   # 0 之後要隔≥3根 → 下一個是5

# 4. 單日 價+量 上破 → CONFIRMED_UP
b = base_box(); add(b,105,101,105,3000)
r = evaluate(b, len(b)-1)
check("4 單日價量→CONFIRMED_UP", r and r["status"]=="CONFIRMED_UP" and r["breakout_reason"]=="price_volume",
      f'{r["status"]}/{r["breakout_reason"]}' if r else "None")

# 5. 向下對稱 → CONFIRMED_DOWN
b = base_box(); add(b,89,85,85,3000)
r = evaluate(b, len(b)-1)
check("5 單日價量→CONFIRMED_DOWN", r and r["status"]=="CONFIRMED_DOWN" and r["breakout_reason"]=="price_volume",
      f'{r["status"]}/{r["breakout_reason"]}' if r else "None")

# 6. 不放量未達3%，但連續3根收盤在外緣外 → CONFIRMED_UP(consecutive)
b = base_box()
for _ in range(3): add(b,102.5,101.2,102,1000)     # close102>outer101、<101*1.03=104.03、量不放大
r = evaluate(b, len(b)-1)
check("6 連續三收在外→CONFIRMED_UP(consecutive)",
      r and r["status"]=="CONFIRMED_UP" and r["breakout_reason"]=="consecutive_closes",
      f'{r["status"]}/{r["breakout_reason"]}' if r else "None")

# 7. 假上破後真跌破 → FALSE_UP_THEN_DOWN
b = base_box()
add(b,102.5,101,102,1000)    # 暫越上緣(未有效)
add(b,97,93,95,1000)         # 收回箱內
add(b,89,85,85,3000)         # 有效下破
r = evaluate(b, len(b)-1)
check("7 假上破→真跌破→FALSE_UP_THEN_DOWN", r and r["status"]=="FALSE_UP_THEN_DOWN",
      r["status"] if r else "None")

# 8. 假下破後真突破 → FALSE_DOWN_THEN_UP
b = base_box()
add(b,89,87.5,88,1000)       # 暫破下緣(未有效)
add(b,97,93,95,1000)         # 收回箱內
add(b,105,101,105,3000)      # 有效上破
r = evaluate(b, len(b)-1)
check("8 假下破→真突破→FALSE_DOWN_THEN_UP", r and r["status"]=="FALSE_DOWN_THEN_UP",
      r["status"] if r else "None")

# 9. 高 ATR 下容忍距離不超過箱緣價格 1%
cfg = {**DEFAULTS}
tol = tolerance(100.0, atr_value=40.0, cfg=cfg)   # ATR*0.25=10 vs 100*1%=1 → 取1
check("9 高ATR容忍被1%封頂", abs(tol-1.0)<1e-9, str(tol))

# 10. 無未來洩漏:establish 當根仍 FORMING、突破當根才 CONFIRMED
b = base_box(); add(b,105,101,105,3000)    # 突破在索引 30
r_before = evaluate(b, 29)                  # 只看到 establish
r_at     = evaluate(b, 30)                  # 看到突破
check("10a establish當根=FORMING", r_before and r_before["status"]=="FORMING",
      r_before["status"] if r_before else "None")
check("10b 突破當根=CONFIRMED_UP", r_at and r_at["status"]=="CONFIRMED_UP",
      r_at["status"] if r_at else "None")

# 11. 箱高 >10% → 非箱型(下緣85 → (100-85)/85≈17.6%)
def wide_box():
    ts=[0]; b=[]
    for _ in range(14): b.append(bar(97,93,95,1000, ts[0])); ts[0]+=1
    for tag in ['U','in','in','L','in','in','U','in','in','L','in','in','U','in','in','L']:
        if tag=='U': b.append(bar(100,98,99,1000, ts[0]))
        elif tag=='L': b.append(bar(87,85,86,1000, ts[0]))
        else: b.append(bar(97,93,95,1000, ts[0]))
        ts[0]+=1
    return b
r=evaluate(wide_box(), 29)
check("11 箱高>10%→非箱型(None)", r is None, r["status"] if r else "None")

# 12. 形成期爆量:容忍 2 根,第 3 根才作廢
b=base_box(); b[16].volume=5000; b[20].volume=5000              # 2 根爆量 → 仍是箱
r=evaluate(b, 29)
check("12a 形成期2根爆量→仍FORMING", r and r["status"]=="FORMING", r["status"] if r else "None")
b=base_box(); b[16].volume=5000; b[20].volume=5000; b[24].volume=5000   # 3 根 → 作廢
r=evaluate(b, 29)
check("12b 形成期3根爆量→非箱型(None)", r is None, r["status"] if r else "None")

# 13. 突破過期(距評估日 >3 根)→ 非當前箱(None);3 根內仍算
b=base_box(); add(b,105,101,105,3000)
for _ in range(4): add(b,97,93,95,1000)      # 突破在30、評估在34 → 距4>3
check("13a 突破過期(距4)→None", evaluate(b, len(b)-1) is None)
b=base_box(); add(b,105,101,105,3000)
for _ in range(3): add(b,97,93,95,1000)      # 距3 ≤3 → 仍 CONFIRMED_UP
r=evaluate(b, len(b)-1)
check("13b 突破距3根內→CONFIRMED_UP", r and r["status"]=="CONFIRMED_UP", r["status"] if r else "None")

print(f"\n== 結果: {_PASS} passed, {_FAIL} failed ==")
sys.exit(1 if _FAIL else 0)
