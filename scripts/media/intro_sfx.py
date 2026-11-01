"""先見 FORESIGHT 開場影片音效（電影預告片風格）。
用法：python3 trailer.py light|dark out.wav
所有時間點都是逐格量測影片畫面得出的字幕／畫面出現時刻（秒）。"""
import numpy as np, sys, wave
from scipy import signal

SR = 48000
rng = np.random.default_rng(11)

def T(d): return np.arange(int(round(d * SR))) / SR
def sos(kind, f, order=4):
    return signal.butter(order, f, btype=kind, fs=SR, output='sos')
def filt(x, kind, f, order=4): return signal.sosfilt(sos(kind, f, order), x)
def adsr(n, a, d, floor=0.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * (floor + (1 - floor) * np.exp(-np.maximum(0, t - a) / d))
def fade(x, fi=0.005, fo=0.05):
    n = len(x); e = np.ones(n)
    a = min(n, int(fi * SR)); b = min(n, int(fo * SR))
    if a: e[:a] = np.linspace(0, 1, a)
    if b: e[-b:] *= np.linspace(1, 0, b)
    return x * e
def saw(f, t, phase=0.0):
    ph = np.cumsum(np.broadcast_to(f, t.shape)) / SR + phase
    return 2 * (ph % 1.0) - 1
def sweep_filter(x, f0, f1, kind='low', block=1024, curve=2.0):
    """時間變化的濾波（逐塊）"""
    y = np.zeros_like(x); n = len(x); zi = None
    for s in range(0, n, block):
        p = s / n; fc = f0 + (f1 - f0) * (p ** curve)
        so = sos(kind, min(fc, SR / 2 - 100), 2)
        if zi is None: zi = np.zeros((so.shape[0], 2))
        y[s:s + block], zi = signal.sosfilt(so, x[s:s + block], zi=zi)
    return y

# ---------- 音色 ----------
def sub_drop(d=4.0, f0=95, f1=28, tau=0.25, dec=1.4):
    t = T(d); f = f1 + (f0 - f1) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr(len(t), 0.003, dec)

def taiko(d=2.2, f=62):
    t = T(d); fr = f * (1 + 0.6 * np.exp(-t / 0.03))
    body = np.sin(2 * np.pi * np.cumsum(fr) / SR) * adsr(len(t), 0.002, 0.42)
    skin = filt(rng.standard_normal(len(t)), 'band', [80, 900]) * adsr(len(t), 0.001, 0.05) * 0.8
    return np.tanh(1.6 * (body + skin)) * 0.9

def metal_hit(d=4.5, base=180.0):
    t = T(d); x = np.zeros(len(t))
    for r, a, dc in [(1, 1, 2.2), (2.32, .7, 1.6), (3.17, .5, 1.1), (4.81, .35, .8), (6.73, .25, .5), (9.1, .15, .3)]:
        x += a * np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6)) * adsr(len(t), 0.001, dc)
    crack = filt(rng.standard_normal(len(t)), 'high', 2500) * adsr(len(t), 0.0005, 0.03)
    return (x * 0.28 + crack * 0.5)

def braam(d=3.2, notes=(32.70, 65.41, 98.0), bright=1400, drive=2.2):
    """Inception 式的低音號角：多組失諧鋸齒波＋濾波打開＋失真"""
    t = T(d); x = np.zeros(len(t))
    for f in notes:
        for det in (-0.12, -0.05, 0.0, 0.06, 0.13):
            x += saw(f * 2 ** (det / 12), t, rng.uniform())
    x /= len(notes) * 5
    env_f = 120 + bright * adsr(len(t), 0.18, 0.9, 0.25)
    y = np.zeros_like(x); zi = None; B = 512
    for s in range(0, len(x), B):
        so = sos('low', float(env_f[s]), 2)
        if zi is None: zi = np.zeros((so.shape[0], 2))
        y[s:s + B], zi = signal.sosfilt(so, x[s:s + B], zi=zi)
    y = np.tanh(drive * y * 3) / np.tanh(drive)
    amp = np.minimum(1, t / 0.06) * np.exp(-np.maximum(0, t - 0.25) / 1.3)
    return fade(y * amp, 0.002, 0.3)

def reverse_swell(d=1.2):
    """反轉鈸聲：在命中點前吸進來"""
    t = T(d); n = filt(rng.standard_normal(len(t)), 'high', 1800)
    cym = n * adsr(len(t), 0.002, 0.45)
    tone = metal_hit(d, 240)[:len(t)] * 0.6
    return fade((cym * 0.7 + tone)[::-1], 0.01, 0.004)

def whoosh(d=0.9, f0=300, f1=4000, pan_dir=1):
    t = T(d); n = rng.standard_normal(len(t))
    y = sweep_filter(n, f0, f1, 'low', curve=1.0)
    y = filt(y, 'high', 120)
    bell = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6
    return y * bell

def glitch(d=1.6):
    """數位雜訊斷續：對應『雜訊，淹沒了市場』"""
    n = int(d * SR); out = np.zeros(n); pos = 0
    while pos < n:
        L = int(rng.uniform(0.012, 0.07) * SR); gap = int(rng.uniform(0.0, 0.05) * SR)
        kind = rng.integers(0, 3); tt = np.arange(L) / SR
        if kind == 0: seg = filt(rng.standard_normal(L), 'band', sorted(rng.uniform(600, 9000, 2)) if True else None, 2)
        elif kind == 1: seg = np.sign(np.sin(2 * np.pi * rng.uniform(80, 1400) * tt)) * 0.5
        else: seg = np.sin(2 * np.pi * rng.uniform(2000, 6000) * tt) * 0.4
        e = min(n, pos + L) - pos; out[pos:pos + e] += seg[:e] * rng.uniform(0.3, 1.0)
        pos += L + gap
    env = np.minimum(1, np.arange(n) / SR / 0.01) * np.exp(-np.arange(n) / SR / 0.7)
    return np.tanh(out * env * 1.5) * 0.55

def static_bed(d):
    t = T(d); n = filt(rng.standard_normal(len(t)), 'band', [700, 6000])
    flick = (rng.random(len(t) // 480 + 1) > 0.55).astype(float).repeat(480)[:len(t)]
    flick = filt(flick, 'low', 60, 2)
    return n * (0.35 + 0.65 * flick)

def heartbeat(d=1.2):
    t = T(d); x = np.zeros(len(t))
    for at, g in [(0, 1.0), (0.24, 0.7)]:
        s = int(at * SR); m = len(t) - s; tt = np.arange(m) / SR
        f = 46 * (1 + 0.8 * np.exp(-tt / 0.02))
        x[s:] += g * np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr(m, 0.003, 0.11)
    return np.tanh(2 * x) * 0.9

def ripple_ping(d=3.0, f=880.0):
    """波動：帶音高顫動的清脆回聲"""
    t = T(d); fm = f * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * t) * np.exp(-t / 1.2))
    ph = 2 * np.pi * np.cumsum(fm) / SR
    x = np.sin(ph) + 0.4 * np.sin(2.0 * ph) + 0.15 * np.sin(3.01 * ph)
    return x * adsr(len(t), 0.002, 0.7) * 0.5

def tick(f=2600):
    t = T(0.06); x = filt(rng.standard_normal(len(t)), 'band', [f * 0.7, f * 1.4]) * adsr(len(t), 0.0003, 0.008)
    x += np.sin(2 * np.pi * f * 0.5 * t) * adsr(len(t), 0.0003, 0.012) * 0.6
    return x

def shepard_riser(d, base=55.0, octaves=1.6):
    t = T(d); p = t / d; x = np.zeros(len(t))
    for k in range(6):
        fk = base * 2 ** (k + octaves * p)
        w = np.exp(-0.5 * ((np.log2(fk / 440)) / 1.3) ** 2)
        x += w * np.sin(2 * np.pi * np.cumsum(fk) / SR)
    noise = sweep_filter(rng.standard_normal(len(t)), 300, 9000, 'low', curve=2.2)
    e = p ** 2.0
    return (x * 0.22 + noise * 0.35) * e

def hope_pad(d=5.0, notes=(130.81, 196.0, 261.63, 329.63, 392.0)):
    t = T(d); x = np.zeros(len(t))
    for f in notes:
        for det in (-0.08, 0.0, 0.08):
            x += saw(f * 2 ** (det / 12), t, rng.uniform())
    x = filt(x, 'low', 1600, 2) / (len(notes) * 3)
    e = np.minimum(1, t / 0.5) * np.exp(-np.maximum(0, t - 0.8) / 1.8)
    return x * e

def shimmer(d=2.6, base=1046.5):
    t = T(d); x = np.zeros(len(t))
    for i, r in enumerate([1, 1.5, 2, 2.5, 3]):
        s = int(i * 0.06 * SR); m = len(t) - s
        x[s:] += np.sin(2 * np.pi * base * r * T(m / SR)[:m]) * adsr(m, 0.003, 0.6) * (0.5 - i * 0.06)
    return x * 0.35

def switch_click():
    t = T(0.25); n = len(t)
    a = filt(rng.standard_normal(n), 'band', [1500, 7000]) * adsr(n, 0.0003, 0.004)
    b = np.zeros(n); s = int(0.028 * SR)
    b[s:] = filt(rng.standard_normal(n - s), 'band', [900, 5000]) * adsr(n - s, 0.0003, 0.007) * 0.8
    body = np.sin(2 * np.pi * 180 * t) * adsr(n, 0.0005, 0.02) * 0.5
    return (a + b + body) * 1.3

def filament(d=2.5, rise=0.25):
    """燈絲通電的嗡聲（60Hz 諧波）"""
    t = T(d); x = np.zeros(len(t))
    for h, a in [(1, .6), (2, 1), (3, .5), (4, .35), (6, .2), (8, .12)]:
        x += a * np.sin(2 * np.pi * 60 * h * t)
    x = np.tanh(1.5 * x) * 0.3
    e = np.minimum(1, t / rise) * np.exp(-np.maximum(0, t - rise) / (d * 0.5))
    return x * e

def warm_swell(d=3.0, notes=(220.0, 277.18, 329.63, 440.0)):
    t = T(d); x = np.zeros(len(t))
    for f in notes: x += np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return x / len(notes) * e * 0.5

def drone(d, f=36.7):
    t = T(d)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.498 * t) + 0.3 * saw(f * 2, t)
    x = filt(x, 'low', 220, 2)
    air = filt(rng.standard_normal(len(t)), 'band', [80, 600], 2) * 0.5
    lfo = 0.8 + 0.2 * np.sin(2 * np.pi * 0.13 * t)
    return (x * 0.6 + air) * lfo

# ---------- 混音 ----------
class Mix:
    def __init__(self, total):
        n = int(total * SR)
        self.dry = np.zeros((2, n)); self.send = np.zeros(n)
    def add(self, sig, at, g=1.0, pan=0.0, rev=0.3, width=0):
        s = int(round(at * SR))
        if s < 0: sig = sig[-s:]; s = 0
        e = min(self.dry.shape[1], s + len(sig)); m = e - s
        if m <= 0: return
        L = sig[:m] * g * np.sqrt(0.5 * (1 - pan)) * 1.414
        R = sig[:m] * g * np.sqrt(0.5 * (1 + pan)) * 1.414
        if width:
            R = np.concatenate([np.zeros(width), R[:-width]]) if width < m else R
        self.dry[0, s:e] += L; self.dry[1, s:e] += R
        self.send[s:e] += sig[:m] * g * rev
    def end_before(self, at, before, d=1.2, g=1.0, **kw):
        """讓 pre-roll 音效剛好在 at 秒結束（對拍用）"""
        self.add(before(d), at - d, g, **kw)
    def duck(self, a, b, depth=0.04):
        s, e = int(a * SR), int(b * SR); r = int(0.04 * SR)
        g = np.ones(self.dry.shape[1]); g[s:e] = depth
        g[s - r:s] = np.linspace(1, depth, r)
        self.dry *= g; self.send *= g; self.duck_g = g
    def render(self):
        n = self.dry.shape[1]; L = int(3.4 * SR); tt = np.arange(L) / SR
        wet = []
        for ch in range(2):
            ir = rng.standard_normal(L) * np.exp(-tt * 6.9 / 3.4)
            ir = filt(ir, 'low', 5500, 2); ir[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
            ir /= np.sqrt((ir ** 2).sum())
            wet.append(signal.fftconvolve(self.send, ir)[:n])
        wet = np.array(wet)
        if hasattr(self, 'duck_g'): wet *= self.duck_g
        out = self.dry + wet * 0.9
        return out / (np.abs(out).max() / 0.95)

def build_light():
    M = Mix(23.7)
    # 雜訊，淹沒了市場（0.35）
    dd = 12.71 - 0.22; M.add(drone(dd) * np.minimum(1, T(dd) / 0.6) * np.minimum(1, (dd - T(dd)) / 0.06), 0.0, 0.11, rev=0.05)
    M.add(static_bed(4.2) * np.minimum(1, T(4.2) / 0.3) * np.exp(-T(4.2) / 2.2), 0.3, 0.07, pan=-0.2, rev=0.1)
    M.end_before(0.35, whoosh, 0.5, 0.35)
    M.add(glitch(1.8), 0.35, 0.8, pan=0.15, rev=0.25)
    M.add(taiko(), 0.35, 0.55, rev=0.25)
    # 價格，從不說出真相（4.55）— 低音號角
    M.end_before(4.55, reverse_swell, 1.4, 0.55)
    M.add(braam(3.4), 4.55, 1.0, rev=0.45)
    M.add(sub_drop(3.0, 70, 30), 4.55, 0.7, rev=0.05)
    # 但每一次波動，都留下線索（6.75）— 心跳＋波紋
    M.add(heartbeat(), 6.75, 0.95, rev=0.15)
    M.add(ripple_ping(3.0, 880), 6.75, 0.55, pan=0.25, rev=0.6)
    M.add(ripple_ping(2.5, 880) * 0.5, 7.08, 0.5, pan=-0.35, rev=0.6)
    M.add(heartbeat(), 7.75, 0.6, rev=0.15)
    # 當訊號開始聚合（8.25）→ 先機已經浮現（9.65）→ Logo（12.71）
    hit = 12.71; gap = 0.22
    M.add(shepard_riser(hit - gap - 8.25), 8.25, 0.85, rev=0.3)
    M.add(heartbeat(), 8.25, 0.7, rev=0.15)
    # 加速的時鐘滴答，最後一聲落在 hit 前
    tk, iv = 8.25, 0.5
    while tk < hit - gap - 0.03:
        M.add(tick(2600 if int(tk * 10) % 2 else 3100), tk, 0.45 + 0.4 * (tk - 8.25) / (hit - 8.25), pan=0.3 * np.sin(tk * 7), rev=0.2)
        tk += iv; iv = max(0.07, iv * 0.86)
    M.add(shimmer(2.6, 1046.5), 9.65, 0.6, pan=0.1, rev=0.5)
    M.add(taiko(), 9.65, 0.45, rev=0.3)
    M.duck(hit - gap, hit)
    M.end_before(hit, reverse_swell, 0.9, 0.55)
    # Logo 命中：重低音＋鼓＋金屬＋大調號角
    M.add(sub_drop(4.5, 110, 26, 0.3, 1.6), hit, 1.0, rev=0.05)
    M.add(taiko(2.5, 55), hit, 0.9, rev=0.4)
    M.add(metal_hit(5.0, 196.0), hit, 0.75, rev=0.7)
    M.add(braam(3.6, (32.70, 65.41, 98.0, 130.81, 164.81), 2200, 1.8), hit, 0.75, rev=0.5)
    M.add(hope_pad(5.0), hit + 0.15, 0.35, rev=0.6)
    # 貓頭鷹出現（15.0–15.6 溶接）
    M.add(whoosh(1.1, 200, 2500), 14.8, 0.3, pan=-0.2, rev=0.4)
    # 開燈（17.88）
    M.add(switch_click(), 17.88, 0.9, rev=0.25)
    M.add(filament(3.0, 0.3), 17.9, 0.35, rev=0.2)
    M.add(warm_swell(3.2), 17.95, 0.5, rev=0.5)
    M.add(shimmer(2.2, 1567.98), 18.0, 0.35, pan=0.2, rev=0.5)
    return M.render()

def build_dark():
    M = Mix(19.5)
    dd = 5.85 - 0.2; M.add(drone(dd) * np.minimum(1, T(dd) / 0.05) * np.minimum(1, (dd - T(dd)) / 0.06), 0.0, 0.11, rev=0.05)
    M.add(static_bed(1.6) * np.exp(-T(1.6) / 0.9), 0.0, 0.08, pan=-0.2, rev=0.1)
    # 雜訊，淹沒了市場（0.0 大字掃入）
    M.add(glitch(1.0), 0.0, 0.85, pan=0.15, rev=0.25)
    M.add(taiko(), 0.0, 0.7, rev=0.3)
    M.add(whoosh(0.5, 4000, 400), 0.0, 0.4, rev=0.2)
    # 價格，從不說出真相（1.0）
    M.end_before(1.0, reverse_swell, 0.9, 0.45)
    M.add(braam(2.4), 1.0, 0.95, rev=0.45)
    M.add(sub_drop(2.4, 70, 30), 1.0, 0.65, rev=0.05)
    # 但每一次波動＋當訊號開始聚合（2.1 同時出現）
    M.add(heartbeat(), 2.1, 0.95, rev=0.15)
    M.add(ripple_ping(2.8, 880), 2.1, 0.55, pan=0.25, rev=0.6)
    M.add(ripple_ping(2.4, 880) * 0.5, 2.43, 0.5, pan=-0.35, rev=0.6)
    hit = 5.85; gap = 0.2
    M.add(shepard_riser(hit - gap - 2.4), 2.4, 0.85, rev=0.3)
    M.add(heartbeat(), 3.1, 0.6, rev=0.15)
    tk, iv = 2.4, 0.42
    while tk < hit - gap - 0.03:
        M.add(tick(2600 if int(tk * 10) % 2 else 3100), tk, 0.45 + 0.4 * (tk - 2.4) / (hit - 2.4), pan=0.3 * np.sin(tk * 7), rev=0.2)
        tk += iv; iv = max(0.07, iv * 0.84)
    M.duck(hit - gap, hit)
    M.end_before(hit, reverse_swell, 0.9, 0.55)
    M.add(sub_drop(4.5, 110, 26, 0.3, 1.6), hit, 1.0, rev=0.05)
    M.add(taiko(2.5, 55), hit, 0.9, rev=0.4)
    M.add(metal_hit(5.0, 196.0), hit, 0.75, rev=0.7)
    M.add(braam(3.6, (32.70, 65.41, 98.0, 130.81, 164.81), 2200, 1.8), hit, 0.75, rev=0.5)
    M.add(hope_pad(4.5), hit + 0.15, 0.32, rev=0.6)
    # 聚光燈慢慢亮起（8.4–10.9）：燈絲嗡聲漸強
    M.add(filament(2.8, 2.2), 8.4, 0.35, rev=0.3)
    M.add(warm_swell(3.0, (110.0, 164.81, 220.0)), 8.6, 0.4, rev=0.5)
    # 貓頭鷹出現（11.04 切換）
    M.add(whoosh(0.7, 300, 2500), 11.04 - 0.55, 0.35, rev=0.4)
    M.add(taiko(1.5, 70), 11.04, 0.35, rev=0.4)
    # 睜眼（12.5）
    M.add(shimmer(2.2, 1567.98), 12.5, 0.45, pan=0.2, rev=0.5)
    return M.render()

if __name__ == '__main__':
    m = build_light() if sys.argv[1] == 'light' else build_dark()
    pcm = (np.clip(m.T, -1, 1) * 32767).astype('<i2')
    with wave.open(sys.argv[2], 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(sys.argv[1], 'ok', m.shape[1] / SR)
