"""Conservative, explainable daily pattern candidates. No network or database writes.

Versioned research rules, not trading instructions. Only a fresh close through a
boundary plus >=1.3x the previous 20-bar mean volume confirms a candidate.
Pivot confirmation uses two bars on each side, strictly BEFORE the signal bar.
Box/false-break families retain the existing box_pattern state machine.
"""
import datetime
from math import isfinite
from statistics import mean

VERSION = 'chart-patterns-v1'
TYPES = ('box', 'flag', 'falling-wedge', 'rising-wedge', 'w', 'm',
         'inverse-head', 'head', 'triangle-up', 'triangle-down',
         'ascending-triangle', 'descending-triangle', 'round', 'false-up', 'false-down')


def _line(points):
    mx, my = mean(x for x, _ in points), mean(y for _, y in points)
    denominator = sum((x-mx)**2 for x, _ in points)
    if denominator == 0:
        return None
    slope = sum((x-mx)*(y-my) for x, y in points)/denominator
    intercept = my-slope*mx
    residual = max(abs(y-(intercept+slope*x))/my for x, y in points)
    return slope, intercept, residual


def _pivots(values, high):
    result = []
    for i in range(2, len(values)-2):
        neighbours = values[i-2:i]+values[i+1:i+3]
        if (all(values[i]>v for v in neighbours) if high else all(values[i]<v for v in neighbours)):
            if not result or i-result[-1][0]>=4:
                result.append((i, values[i]))
    return result


def evaluate(bars, at=None):
    """Return independent candidates at one historical bar; never inspect later bars.

    Input: dicts with date/open/high/low/close/volume. Insufficient or invalid input
    yields no signals. Invalid dates/order are rejected instead of silently sorted.
    """
    at = len(bars)-1 if at is None else at
    if at<30 or at>=len(bars):
        return []
    window = bars[max(0, at-100):at+1]
    try:
        for b in window:
            datetime.date.fromisoformat(str(b['date']))
        if any(not all(isfinite(float(b[k])) for k in ('open','high','low','close','volume'))
               or min(float(b[k]) for k in ('open','high','low','close'))<=0
               or float(b['volume'])<0 or float(b['high'])<max(float(b['open']),float(b['close']),float(b['low']))
               or float(b['low'])>min(float(b['open']),float(b['close'])) for b in window):
            return []
        if any(str(window[i]['date'])>=str(window[i+1]['date']) for i in range(len(window)-1)):
            return []
        history, today = window[:-1], window[-1]
        base_volume = mean(float(b['volume']) for b in history[-20:])
        if base_volume<=0 or float(today['volume'])<1.3*base_volume:
            return []
        previous, close = float(history[-1]['close']), float(today['close'])
    except (KeyError, TypeError, ValueError, OverflowError):
        return []
    signals = {}

    def confirm(kind, direction, boundary, old_boundary, start, evidence):
        crossed = (close>boundary*1.005 and previous<=old_boundary*1.005 if direction=='up'
                   else close<boundary*.995 and previous>=old_boundary*.995)
        if crossed and kind not in signals and boundary>0:
            signals[kind] = dict(type=kind,direction=direction,date=str(today['date']),
                start_date=str(start),boundary=round(boundary,4),close=close,
                volume_ratio=round(float(today['volume'])/base_volume,3),
                rule_version=VERSION,evidence=evidence)

    # Double bottoms/tops and head/shoulders use confirmed, separated swing points.
    segment = history[-60:]
    for is_high, double, shoulder, direction in [(False,'w','inverse-head','up'),(True,'m','head','down')]:
        extrema = _pivots([float(b['high' if is_high else 'low']) for b in segment],is_high)
        if len(extrema)>=2:
            a,b = extrema[-2:]
            if 5<=b[0]-a[0]<=35 and len(segment)-1-b[0]<=15 and abs(a[1]-b[1])/mean([a[1],b[1]])<=.035:
                middle = segment[a[0]+1:b[0]]
                neck = min(float(x['low']) for x in middle) if is_high else max(float(x['high']) for x in middle)
                if abs(neck-mean([a[1],b[1]]))/neck>=.04:
                    confirm(double,direction,neck,neck,segment[a[0]]['date'],'兩個已確認轉折、間隔 5–35 日、頸線突破及量能確認')
        if len(extrema)>=3:
            a,b,c = extrema[-3:]
            head = b[1]>max(a[1],c[1])*1.03 if is_high else b[1]<min(a[1],c[1])*.97
            if head and min(b[0]-a[0],c[0]-b[0])>=5 and len(segment)-1-c[0]<=15 and abs(a[1]-c[1])/mean([a[1],c[1]])<=.04:
                between = []
                for left,right in [(a,b),(b,c)]:
                    indexes = range(left[0]+1,right[0])
                    index = min(indexes,key=lambda i:float(segment[i]['low'])) if is_high else max(indexes,key=lambda i:float(segment[i]['high']))
                    between.append((index,float(segment[index]['low' if is_high else 'high'])))
                line = _line(between)
                if line:
                    slope,intercept,_ = line;n=len(segment)
                    confirm(shoulder,direction,intercept+slope*n,intercept+slope*(n-1),segment[a[0]]['date'],'左右肩誤差 ≤4%、頭部突出 ≥3%、頸線突破及量能確認')

    # Fitted boundaries require >=3 independent touches on each side and low residuals.
    for size in (40,30,20):
        if len(history)<size:
            continue
        segment = history[-size:]
        highs = _pivots([float(b['high']) for b in segment],True)
        lows = _pivots([float(b['low']) for b in segment],False)
        if min(len(highs),len(lows))<3:
            continue
        upper,lower = _line(highs),_line(lows)
        if not upper or not lower or max(upper[2],lower[2])>.015:
            continue
        us,ui,_ = upper;ls,li,_ = lower
        initial,final = ui-li,(ui+us*size)-(li+ls*size)
        price = mean(float(b['close']) for b in segment)
        if initial<=price*.03 or final<=0:
            continue
        converging = final<=initial*.8
        flat = price*.0003
        kinds=[]
        if converging:
            if us<-flat and ls<-flat:kinds.append(('falling-wedge','up'))
            if us>flat and ls>flat:kinds.append(('rising-wedge','down'))
            if us<-flat and ls>flat:kinds.extend([('triangle-up','up'),('triangle-down','down')])
            if abs(us)<=flat and ls>flat:kinds.append(('ascending-triangle','up'))
            if us<-flat and abs(ls)<=flat:kinds.append(('descending-triangle','down'))
        # Flag must have a >=8% impulse, then a counter-trend near-parallel channel.
        if size==20 and len(history)>=30 and abs(us-ls)<=price*.0006:
            impulse=float(history[-21]['close'])/float(history[-30]['close'])-1
            if impulse>=.08 and us<0 and ls<0:kinds.append(('flag','up'))
            if impulse<=-.08 and us>0 and ls>0:kinds.append(('flag','down'))
        for kind,direction in kinds:
            slope,intercept = (us,ui) if direction=='up' else (ls,li)
            # Earlier closes outside the channel invalidate a fresh breakout.
            if any(float(b['close'])>ui+us*i+price*.02 or float(b['close'])<li+ls*i-price*.02 for i,b in enumerate(segment)):
                continue
            confirm(kind,direction,intercept+slope*size,intercept+slope*(size-1),segment[0]['date'],'上下緣各 ≥3 次確認觸碰、擬合偏差 ≤1.5%、首次越界與量能確認')

    # Rounded base: smooth U, interior low and both rims recovered, excluding sharp V shapes.
    for size in (60,40):
        if len(history)<size:
            continue
        segment=history[-size:];values=[float(b['close']) for b in segment]
        bottom=min(range(size),key=values.__getitem__);rim=max(max(values[:5]),max(values[-5:]))
        depth=(rim-min(values))/rim
        if not(.3*size<=bottom<=.7*size and .06<=depth<=.35 and abs(mean(values[:5])-mean(values[-5:]))/rim<=.04):
            continue
        # Compare to the U implied by the observed low and rim, including smoothness.
        curve=[min(values)+(rim-min(values))*((i-bottom)/max(bottom,size-1-bottom))**2 for i in range(size)]
        error=mean(abs(a-b) for a,b in zip(values,curve))/rim
        if error<=.02 and max(abs(values[i]/values[i-1]-1) for i in range(1,size))<=.04:
            confirm('round','up',rim,rim,segment[0]['date'],'40–60 日平滑 U 底、底部位於中間、回復兩側杯緣後放量突破')
    return list(signals.values())
