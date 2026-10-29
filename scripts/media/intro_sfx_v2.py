"""先見開場音效 版本 2（目前上線：淺色 A、深色 B）：三種感受（A 科技精品／B 史詩英雄／C 都會金融），大調、明亮、對拍。
用法：python3 moods.py A|B|C light|dark out.wav"""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from intro_sfx import T, filt, adsr, fade, saw, sweep_filter, Mix, SR, rng, sub_drop, whoosh, switch_click

def mf(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------- 和聲（C 大調：I – vi – IV – V → I） ----------
CH = {
    'I':  [48, 55, 60, 64, 67, 74],
    'vi': [45, 52, 57, 60, 64, 71],
    'IV': [41, 53, 57, 60, 64, 69],
    'V':  [43, 50, 55, 60, 62, 67],   # Gsus4，最後一刻解決到 C
    'LOGO': [36, 48, 55, 60, 64, 67, 72, 76, 79],
}

# ---------- 樂器 ----------
def kick(d=0.7, punch=1.0, tone=48):
    t = T(d); f = tone + 130 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr(len(t), 0.001, 0.2)
    c = filt(rng.standard_normal(len(t)), 'high', 3000) * adsr(len(t), 0.0003, 0.004) * 0.35 * punch
    return np.tanh(1.6 * (x + c)) * 0.9

def clap(d=0.6):
    t = T(d); n = len(t); x = np.zeros(n)
    for k, at in enumerate([0, 0.011, 0.023]):
        s = int(at * SR); m = n - s
        x[s:] += filt(rng.standard_normal(m), 'band', [900, 6000]) * adsr(m, 0.0005, 0.012 if k < 2 else 0.14)
    return x * 0.8

def snare(d=0.35, g=1.0):
    t = T(d); n = len(t)
    body = np.sin(2 * np.pi * 190 * t) * adsr(n, 0.001, 0.05)
    nz = filt(rng.standard_normal(n), 'band', [1500, 9000]) * adsr(n, 0.001, 0.1)
    return (body * 0.6 + nz) * 0.6 * g

def hat(open_=False):
    d = 0.35 if open_ else 0.08; t = T(d)
    return filt(rng.standard_normal(len(t)), 'high', 7500) * adsr(len(t), 0.0005, 0.12 if open_ else 0.018) * 0.35

def crash(d=4.0):
    t = T(d); n = len(t)
    x = filt(rng.standard_normal(n), 'high', 3500) * adsr(n, 0.002, 1.3)
    x += filt(rng.standard_normal(n), 'band', [5000, 12000]) * adsr(n, 0.001, 0.3) * 0.5
    return x * 0.5

def taiko(d=1.6, f=62, g=1.0):
    t = T(d); fr = f * (1 + 0.5 * np.exp(-t / 0.025))
    body = np.sin(2 * np.pi * np.cumsum(fr) / SR) * adsr(len(t), 0.002, 0.35)
    skin = filt(rng.standard_normal(len(t)), 'band', [100, 1200]) * adsr(len(t), 0.001, 0.04) * 0.7
    return np.tanh(1.8 * (body + skin)) * 0.85 * g

def supersaw(notes, d, att=0.4, rel=1.2, cutoff=2400, voices=5, spread=0.14, vib=0.0, hp=0):
    t = T(d); x = np.zeros(len(t))
    for m in notes:
        f = mf(m) * (1 + vib * np.sin(2 * np.pi * 5.2 * t + rng.uniform(0, 6)))
        for v in range(voices):
            det = spread * (v - (voices - 1) / 2) / ((voices - 1) / 2 or 1)
            x += saw(f * 2 ** (det / 12), t, rng.uniform())
    x /= len(notes) * voices
    x = filt(x, 'low', cutoff, 2)
    if hp: x = filt(x, 'high', hp, 2)
    e = np.minimum(1, t / att) * np.minimum(1, np.maximum(0, d - t) / rel)
    return x * e

def pluck(m, d=0.45, bright=5000, dec=0.16):
    t = T(d); f = mf(m)
    x = saw(f, t) * 0.6 + saw(f * 1.006, t, 0.3) * 0.4
    hi = filt(x, 'low', bright, 2) * adsr(len(t), 0.001, dec * 0.35)
    lo = filt(x, 'low', 900, 2) * adsr(len(t), 0.002, dec)
    return fade((hi + lo) * 0.6, 0.001, 0.05)

def glass(m, d=1.6, idx=2.2, dec=0.45):
    """乾淨的玻璃／鐘琴提示音（FM）"""
    t = T(d); f = mf(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * idx * np.exp(-t / 0.15)
    x = np.sin(2 * np.pi * f * t + mod) + 0.25 * np.sin(2 * np.pi * f * 2 * t)
    return x * adsr(len(t), 0.001, dec) * 0.4

def sub_bass(m, d, att=0.02, rel=0.2):
    t = T(d); f = mf(m)
    x = np.sin(2 * np.pi * f * t) + 0.25 * filt(saw(f, t), 'low', 300, 2)
    e = np.minimum(1, t / att) * np.minimum(1, np.maximum(0, d - t) / rel)
    return x * e * 0.7

def bass_note(m, d=0.2):
    t = T(d); f = mf(m)
    x = np.sin(2 * np.pi * f * t) * 0.8 + filt(saw(f, t), 'low', 700, 2) * 0.6
    return x * adsr(len(t), 0.002, 0.09) * 0.8

def brass(notes, d=1.4, peak=3200):
    t = T(d); x = np.zeros(len(t))
    for m in notes:
        for det in (-0.06, 0, 0.07): x += saw(mf(m) * 2 ** (det / 12), t, rng.uniform())
    x /= len(notes) * 3
    cut = 300 + peak * adsr(len(t), 0.05, 0.35, 0.35)
    y = np.zeros_like(x); zi = None; B = 512
    from scipy import signal
    from trailer import sos
    for s in range(0, len(x), B):
        so = sos('low', float(cut[s]), 2)
        if zi is None: zi = np.zeros((so.shape[0], 2))
        y[s:s + B], zi = signal.sosfilt(so, x[s:s + B], zi=zi)
    return np.tanh(2.2 * y) * adsr(len(t), 0.02, 0.6, 0.15)

def clean_riser(d, root=55):
    t = T(d); p = t / d
    nz = sweep_filter(rng.standard_normal(len(t)), 600, 13000, 'low', curve=2.0)
    nz = filt(nz, 'high', 400, 2)
    f = mf(root) * 2 ** (2 * p ** 1.5)
    tone = saw(f, t) * 0.3 + saw(f * 1.5, t) * 0.2
    tone = filt(tone, 'low', 3500, 2)
    return (nz * 0.5 + tone * 0.35) * p ** 2.3

def soft_whoosh(d=1.0): return whoosh(d, 400, 5000) * 0.6

# ---------- 節拍格 ----------
def grid(a, b, P):
    n = max(1, int(round((b - a) / P))); step = (b - a) / n
    return [a + k * step for k in range(n)], step
def accel(a, b, P0, P1):
    """由 P0 加速到 P1，最後一拍剛好在 b 之前收尾"""
    ts = []; t = a; P = P0; k = (P1 / P0)
    total = b - a
    # 先模擬一次決定縮放，讓總長剛好等於 total
    seq = []; s = 0; P = P0
    while s < total * 0.999 and len(seq) < 400:
        seq.append(P); s += P; P = max(P1, P * 0.9)
    scale = total / s
    t = a
    for p in seq: ts.append(t); t += p * scale
    return ts

# ---------- 時間軸（逐格量測） ----------
TL = {
    'light': dict(total=23.7, secs=[(0.35, 4.55, 'I'), (4.55, 6.75, 'vi'), (6.75, 8.25, 'IV'), (8.25, None, 'V')],
                  extra=[9.65], hit=12.71, gap=0.22, owl=15.0, lamp=('click', 17.88), eyes=None),
    'dark':  dict(total=19.5, secs=[(0.0, 1.0, 'I'), (1.0, 2.1, 'vi'), (2.1, None, 'V')],
                  extra=[], hit=5.85, gap=0.2, owl=11.04, lamp=('ramp', 8.4), eyes=12.5),
}

def section_list(tl):
    out = []
    for a, b, c in tl['secs']:
        out.append((a, b if b is not None else tl['hit'] - tl['gap'], c))
    return out

# ---------- A 科技精品 ----------
def mood_A(tl):
    M = Mix(tl['total']); secs = section_list(tl); hit = tl['hit']
    energy = np.linspace(0.55, 1.0, len(secs))
    for si, (a, b, c) in enumerate(secs):
        notes = CH[c]; build = si == len(secs) - 1
        M.add(kick(0.6, 0.6), a, 0.55 * energy[si], rev=0.08)
        M.add(glass(notes[-1] + 12, 1.8), a, 0.45, pan=0.2, rev=0.5)
        M.add(supersaw(notes[1:5], b - a + 0.6, att=0.25, rel=0.6, cutoff=1800 + 1500 * si, hp=180), a, 0.32, rev=0.4)
        M.add(sub_bass(notes[0] - 12, b - a, rel=0.08), a, 0.38 * energy[si], rev=0.0)
        arp = notes[1:] + [notes[2] + 12]
        times = accel(a, b, 0.3, 0.075) if build else grid(a, b, 0.3)[0]
        for k, tt in enumerate(times):
            M.add(pluck(arp[k % len(arp)] + 12, 0.4, 3500 + 2500 * energy[si]), tt, 0.32 * energy[si] * (0.7 + 0.3 * (k % 2 == 0)), pan=0.35 * ((-1) ** k), rev=0.35)
        if build:
            M.add(clean_riser(b - a, 43), a, 0.55, rev=0.3)
    for e in tl['extra']:
        M.add(glass(84, 2.0), e, 0.5, pan=-0.2, rev=0.55); M.add(glass(79, 2.0), e + 0.06, 0.35, pan=0.25, rev=0.55)
    M.duck(hit - tl['gap'], hit)
    L = CH['LOGO']
    M.add(kick(0.9, 1.0, 44), hit, 1.0, rev=0.1)
    M.add(sub_drop(4.0, 100, 32, 0.25, 1.4), hit, 0.75, rev=0.0)
    M.add(crash(4.5), hit, 0.45, rev=0.5)
    M.add(supersaw(L, 5.5, att=0.005, rel=3.5, cutoff=5000, voices=7, spread=0.18), hit, 0.55, rev=0.6)
    for k, m in enumerate([72, 76, 79, 84, 88]):
        M.add(glass(m, 3.0, 1.5, 0.9), hit + 0.04 * k, 0.32, pan=0.4 * np.sin(k), rev=0.6)
    add_tail(M, tl, style='A')
    return M.render()

# ---------- B 史詩英雄 ----------
def mood_B(tl):
    M = Mix(tl['total']); secs = section_list(tl); hit = tl['hit']
    energy = np.linspace(0.6, 1.0, len(secs))
    for si, (a, b, c) in enumerate(secs):
        notes = CH[c]; build = si == len(secs) - 1
        M.add(taiko(1.8, 55, 1.0), a, 0.85 * energy[si], rev=0.35)
        M.add(brass(notes[:4], 1.3), a, 0.6 * energy[si], rev=0.45)
        M.add(supersaw([n + 12 for n in notes[1:]], b - a + 0.8, att=0.5, rel=0.7, cutoff=2600 + 900 * si, vib=0.003, hp=200), a, 0.42, rev=0.55)
        M.add(sub_bass(notes[0] - 12, b - a, att=0.1, rel=0.1), a, 0.3, rev=0.0)
        times = accel(a, b, 0.33, 0.06) if build else grid(a, b, 0.33)[0]
        for k, tt in enumerate(times[1:] if not build else times, 1):
            if build:
                M.add(snare(0.3, 0.5 + 0.6 * (tt - a) / (b - a)), tt, 0.7, pan=0.1, rev=0.35)
                if k % 4 == 1: M.add(taiko(1.2, 70, 0.7), tt, 0.6, rev=0.3)
            else:
                M.add(taiko(1.0, 78 if k % 2 else 66, 0.55), tt, 0.5 * energy[si], pan=0.3 * ((-1) ** k), rev=0.3)
        if build:
            M.add(clean_riser(b - a, 43), a, 0.5, rev=0.3)
    for e in tl['extra']:
        M.add(brass([60, 64, 67, 72], 1.2, 4200), e, 0.55, rev=0.5); M.add(taiko(1.4, 60), e, 0.6, rev=0.3)
    M.duck(hit - tl['gap'], hit)
    L = CH['LOGO']
    M.add(taiko(3.0, 48, 1.2), hit, 1.0, rev=0.45)
    M.add(kick(1.0, 1.0, 40), hit, 0.8, rev=0.1)
    M.add(sub_drop(4.5, 100, 28, 0.3, 1.6), hit, 0.8, rev=0.0)
    M.add(crash(5.0), hit, 0.55, rev=0.6)
    M.add(brass(L[:6], 3.2, 4500), hit, 0.8, rev=0.55)
    M.add(supersaw([n + 12 for n in L[2:]], 6.0, att=0.02, rel=3.5, cutoff=4200, voices=7, vib=0.003), hit, 0.45, rev=0.65)
    add_tail(M, tl, style='B')
    return M.render()

# ---------- C 都會金融 ----------
def mood_C(tl):
    M = Mix(tl['total']); secs = section_list(tl); hit = tl['hit']
    energy = np.linspace(0.6, 1.0, len(secs))
    for si, (a, b, c) in enumerate(secs):
        notes = CH[c]; build = si == len(secs) - 1
        M.add(kick(0.6, 1.0), a, 0.8 * energy[si], rev=0.05)
        M.add(supersaw(notes[1:5], 0.9, att=0.004, rel=0.7, cutoff=4200, voices=5), a, 0.5 * energy[si], rev=0.45)
        M.add(glass(notes[-1] + 12, 1.2, 1.2, 0.3), a, 0.35, pan=0.3, rev=0.4)
        if build:
            times = accel(a, b, 0.16, 0.06)
        else:
            times, step = grid(a, b, 0.16)
        for k, tt in enumerate(times):
            M.add(bass_note(notes[0] - 12 + (12 if k % 4 == 2 else 0), 0.18), tt, 0.5 * energy[si], rev=0.02)
            if k % 2 == 1: M.add(hat(), tt, 0.6 * energy[si], pan=0.25, rev=0.1)
            if k % 4 == 0 and k: M.add(kick(0.5, 0.8), tt, 0.5 * energy[si], rev=0.03)
            if rng.random() < 0.18: M.add(glass(rng.choice([84, 86, 88, 91, 93]), 0.5, 0.8, 0.08), tt, 0.18, pan=rng.uniform(-0.7, 0.7), rev=0.3)
        if build:
            M.add(clean_riser(b - a, 43), a, 0.5, rev=0.3)
            M.add(supersaw(notes[1:5], b - a, att=b - a - 0.05, rel=0.05, cutoff=3500, hp=250), a, 0.3, rev=0.3)
    for e in tl['extra']:
        M.add(clap(), e, 0.6, rev=0.4); M.add(glass(84, 1.4, 1.2, 0.4), e, 0.4, rev=0.5)
    M.duck(hit - tl['gap'], hit)
    L = CH['LOGO']
    M.add(kick(1.0, 1.0, 42), hit, 1.0, rev=0.08)
    M.add(clap(), hit, 0.7, rev=0.5)
    M.add(sub_drop(4.2, 105, 30, 0.25, 1.5), hit, 0.85, rev=0.0)
    M.add(crash(4.5), hit, 0.45, rev=0.5)
    M.add(supersaw(L, 5.0, att=0.004, rel=3.2, cutoff=6000, voices=7, spread=0.2), hit, 0.55, rev=0.65)
    add_tail(M, tl, style='C')
    return M.render()

def add_tail(M, tl, style):
    hit = tl['hit']
    M.add(supersaw([48, 55, 60, 64, 67], 6.0, att=1.0, rel=3.0, cutoff=1400, hp=150), hit + 0.8, 0.22, rev=0.6)
    M.add(soft_whoosh(1.0), tl['owl'] - 0.8, 0.35, pan=-0.2, rev=0.4)
    M.add(glass(76, 2.0, 1.0, 0.6), tl['owl'], 0.28, pan=0.2, rev=0.6)
    kind, at = tl['lamp']
    if kind == 'click':
        M.add(switch_click(), at, 0.9, rev=0.2)
        for k, m in enumerate([79, 84, 88]): M.add(glass(m, 2.4, 1.2, 0.8), at + 0.05 + 0.07 * k, 0.3, pan=0.3 * (k - 1), rev=0.6)
        M.add(supersaw([60, 64, 67, 72], 3.0, att=0.3, rel=2.2, cutoff=2200, hp=200), at + 0.05, 0.25, rev=0.6)
    else:  # 聚光燈慢慢亮起
        M.add(supersaw([60, 64, 67, 72], 3.4, att=2.4, rel=1.0, cutoff=2400, hp=200), at, 0.3, rev=0.6)
        M.add(soft_whoosh(2.5), at, 0.25, rev=0.5)
    if tl['eyes']:
        for k, m in enumerate([84, 88, 91]): M.add(glass(m, 2.0, 1.0, 0.6), tl['eyes'] + 0.06 * k, 0.3, pan=0.3 * (k - 1), rev=0.6)

if __name__ == '__main__':
    mood, theme, out = sys.argv[1], sys.argv[2], sys.argv[3]
    m = {'A': mood_A, 'B': mood_B, 'C': mood_C}[mood](TL[theme])
    pcm = (np.clip(m.T, -1, 1) * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(mood, theme, 'ok')
