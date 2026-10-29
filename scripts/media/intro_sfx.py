import numpy as np, sys, wave
SR = 48000
rng = np.random.default_rng(7)

def t(d): return np.arange(int(d * SR)) / SR
def env_ad(n, a, d):
    x = np.arange(n) / SR
    return np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) / d)
def lp(x, fc):  # one-pole lowpass, run twice
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.empty_like(x); s = 0.0
        for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
        x = y
    return x
def hp(x, fc): return x - lp(x, fc)
def lp_fast(x, fc):
    # FFT brick-ish lowpass with smooth rolloff
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / fc) ** 4); return np.fft.irfft(X, len(x))
def bp_fast(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / np.sqrt(1 + (f / hi) ** 4)) * (1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)); return np.fft.irfft(X, len(x))
def reverb(x, dur=2.2, mix=0.3, seed=1):
    r = np.random.default_rng(seed)
    n = int(dur * SR); tt = np.arange(n) / SR
    out = []
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-tt * 6.9 / dur)
        ir = lp_fast(ir, 6000); ir /= np.sqrt((ir ** 2).sum())
        L = len(x) + n; N = 1 << (L - 1).bit_length()
        y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:L]
        out.append(y)
    dry = np.pad(x, (0, n))
    return np.stack([dry * (1 - mix) + out[0] * mix * 1.4, dry * (1 - mix) + out[1] * mix * 1.4])

# ---- sound elements (mono unless noted) ----
def noise_crackle(d=2.2):
    n = int(d * SR); x = rng.standard_normal(n) * 0.25
    x = bp_fast(x, 900, 7000)
    cr = np.zeros(n); idx = rng.integers(0, n, 140); cr[idx] = rng.uniform(-1, 1, 140)
    cr = bp_fast(cr, 1500, 9000) * 6
    e = np.minimum(1, t(d) / 0.08) * np.exp(-t(d) / 1.1)
    flutter = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 11 * t(d)) * np.sin(2 * np.pi * 3.3 * t(d)))
    return (x * flutter + cr) * e * 0.5
def thump(d=1.6, f0=82, f1=42):
    tt = t(d); f = f1 + (f0 - f1) * np.exp(-tt / 0.12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * env_ad(len(tt), 0.006, 0.45)
    click = lp_fast(rng.standard_normal(len(tt)), 1800) * env_ad(len(tt), 0.001, 0.015) * 0.5
    return (x + click) * 0.9
def ping(f=1318.5, d=2.6):
    tt = t(d)
    x = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.01 * tt) + 0.12 * np.sin(2 * np.pi * f * 3.02 * tt))
    return x * env_ad(len(tt), 0.004, 0.55) * 0.42
def riser(d):
    tt = t(d); n = len(tt); p = tt / d
    nz = rng.standard_normal(n)
    # sweep filtered noise by blocks
    out = np.zeros(n); B = 2048
    for s in range(0, n, B):
        seg = nz[s:s + B]; fc = 400 + 7000 * (s / n) ** 2
        out[s:s + B] = bp_fast(np.pad(seg, (0, B - len(seg)))[:B], fc * 0.5, fc)[:len(seg)]
    f = 110 * 2 ** (p * 1.6)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    e = p ** 2.2
    trem = 1 + 0.25 * np.sin(2 * np.pi * (3 + 9 * p) * tt)
    return (out * 0.55 + tone * 0.13) * e * trem
def shimmer(d=2.5, base=1567.98):
    tt = t(d); x = np.zeros(len(tt))
    for k, (r, delay) in enumerate([(1, 0), (1.25, .07), (1.5, .14), (2, .21)]):
        s = int(delay * SR); n = len(tt) - s
        x[s:] += np.sin(2 * np.pi * base * r * tt[:n]) * env_ad(n, 0.003, 0.5) * (0.5 - k * 0.07)
    return x * 0.28
def bell_chord(d=4.5):
    tt = t(d); x = np.zeros(len(tt))
    for f, a in [(261.63, 1), (392.0, .7), (523.25, .8), (659.25, .45), (1046.5, .3)]:
        for ratio, pa, dec in [(1, 1, 1.6), (2.76, .35, .5), (5.4, .15, .25)]:
            x += a * pa * np.sin(2 * np.pi * f * ratio * tt) * env_ad(len(tt), 0.002, dec)
    return x * 0.11
def impact(d=3.5):
    tt = t(d); f = 34 + 46 * np.exp(-tt / 0.18)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(tt), 0.004, 0.9)
    nz = lp_fast(rng.standard_normal(len(tt)), 3500) * env_ad(len(tt), 0.002, 0.12) * 0.45
    return (sub + nz) * 0.85
def lamp_click(d=0.4):
    tt = t(d); n = len(tt)
    a = bp_fast(rng.standard_normal(n), 1800, 6000) * env_ad(n, 0.0005, 0.006)
    b = np.zeros(n); s = int(0.045 * SR)
    b[s:] = bp_fast(rng.standard_normal(n - s), 1200, 4500) * env_ad(n - s, 0.0005, 0.01) * 0.7
    tick = np.sin(2 * np.pi * 3100 * tt) * env_ad(n, 0.0003, 0.008) * 0.3
    return (a + b + tick) * 1.1
def warm_glow(d=3.0, f=220.0):
    tt = t(d); x = np.zeros(len(tt))
    for r, a in [(1, 1), (1.5, .5), (2, .35), (3, .12)]:
        x += a * np.sin(2 * np.pi * f * r * tt + 0.3 * np.sin(2 * np.pi * 4.5 * tt))
    e = np.minimum(1, tt / 0.6) * np.exp(-np.maximum(0, tt - 0.6) / 1.0)
    return lp_fast(x, 1800) * e * 0.12
def sparkle(d=1.6):
    tt = t(d); x = np.zeros(len(tt))
    for i, f in enumerate([2093, 2637, 3136, 4186]):
        s = int(i * 0.05 * SR); n = len(tt) - s
        x[s:] += np.sin(2 * np.pi * f * tt[:n]) * env_ad(n, 0.002, 0.25)
    return x * 0.08
def drone(d, f=55.0, dark=True):
    tt = t(d)
    x = np.sin(2 * np.pi * f * tt) + 0.6 * np.sin(2 * np.pi * f * 1.5 * tt + 1) + 0.35 * np.sin(2 * np.pi * f * 2.003 * tt)
    air = lp_fast(rng.standard_normal(len(tt)), 900 if dark else 1400) * 0.4
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.17 * tt)
    return (x * 0.5 + air) * lfo * 0.06

def place(buf, sig, at, gain=1.0, pan=0.0):
    sig = np.atleast_2d(sig)
    if sig.shape[0] == 1: sig = np.vstack([sig[0] * (1 - max(0, pan)), sig[0] * (1 + min(0, pan))])
    s = int(at * SR); e = min(buf.shape[1], s + sig.shape[1])
    if e > s: buf[:, s:e] += sig[:, :e - s] * gain

def build(cues, total):
    buf = np.zeros((2, int(total * SR)))
    dry = np.zeros((2, int(total * SR)))
    for kind, at, *rest in cues:
        g = rest[0] if rest else 1.0
        if kind == 'drone':
            d = rest[1]; dr = drone(d, dark=rest[2]); n = len(dr)
            env = np.minimum(1, np.arange(n) / SR / 1.2) * np.minimum(1, (n - np.arange(n)) / SR / 0.8)
            place(dry, np.vstack([dr * env, np.roll(dr, 400) * env]), at, g)
        elif kind == 'noise': place(buf, noise_crackle(), at, g, -0.2)
        elif kind == 'thump': place(buf, thump(), at, g)
        elif kind == 'ping':
            p = ping(); place(buf, p, at, g, 0.15)
            place(buf, p * 0.45, at + 0.32, g, -0.5); place(buf, p * 0.2, at + 0.64, g, 0.5)
        elif kind == 'riser': place(buf, riser(rest[1]), at, g)
        elif kind == 'shimmer': place(buf, shimmer(), at, g, 0.1)
        elif kind == 'impact':
            place(dry, impact(), at, g); place(buf, bell_chord(), at, g)
        elif kind == 'click': place(dry, lamp_click(), at, g)
        elif kind == 'glow': place(buf, warm_glow(), at, g)
        elif kind == 'sparkle': place(buf, sparkle(), at, g, 0.2)
    wet = reverb(buf.mean(0), 2.6, 0.35)[:, :buf.shape[1]]
    mix = wet + buf * 0.5 + dry
    mix /= np.abs(mix).max() / 0.7
    return mix

THEMES = {
  'light': (23.7, [
    ('drone', 0.0, 0.8, 12.6, False),
    ('noise', 0.15, 1.5), ('thump', 4.25, 1.0), ('ping', 6.55, 1.0),
    ('riser', 8.05, 0.9, 4.3), ('shimmer', 9.55, 0.8),
    ('impact', 12.35, 1.0),
    ('click', 17.8, 2.2), ('glow', 17.85, 1.0), ('sparkle', 17.95, 0.8)]),
  'dark': (19.5, [
    ('drone', 0.0, 1.0, 6.4, True),
    ('noise', 0.0, 1.5), ('thump', 0.85, 1.0), ('ping', 2.05, 1.0),
    ('riser', 2.4, 0.9, 3.65),
    ('impact', 6.05, 1.0),
    ('click', 8.45, 2.2), ('glow', 8.5, 0.9), ('sparkle', 12.45, 0.8)]),
}
name = sys.argv[1]; total, cues = THEMES[name]
m = build(cues, total)
pcm = (np.clip(m.T, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(name, 'ok', m.shape)
