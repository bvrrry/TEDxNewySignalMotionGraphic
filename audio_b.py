"""Sound design for the Signal opener, take B (a different cinematic feel from audio.py).
Usage: python3 audio_b.py long|short   (reads timelines.json and events_<cut>.json written by render.js)
Writes signal_audio_<cut>_b.wav (48 kHz stereo). Everything is synthesised; no samples are used.

Take A (audio.py) is dark and drone-led: sub drone, saw pads, choir, braam hits.
Take B is more musical and emotional, in A minor lifting to A major at the title:
  - a soft felt-piano arpeggio (96 bpm) that carries the whole piece and follows the chord changes
  - warm string pads, taiko-style low drums that build through the orb's birth to the impact
  - driving staccato strings through the rise, bells for each city and arc, a bright A major bloom at the title
"""
import sys, json
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

CUT = sys.argv[1] if len(sys.argv) > 1 else 'long'
T = json.load(open('timelines.json'))[CUT]
EV = json.load(open(f'events_{CUT}.json'))
SR = 48000
DUR = T['duration']
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)
L = np.zeros(N); Rr = np.zeros(N)
SHORT = CUT == 'short'
BPM = 96.0
BEAT = 60.0 / BPM

# ---------------------------------------------------------------- helpers
def env(t0, a, d, shape=1.0):
    x = t - t0
    return np.where(x < 0, 0, np.where(x < a, (x / max(a, 1e-4)) ** shape, np.exp(-(x - a) / d)))
def ramp(t0, t1, p=1.0):
    if t1 <= t0: return (t >= t0).astype(float)
    return np.clip((t - t0) / (t1 - t0), 0, 1) ** p
def gate(t0, t1, a, r):
    up = np.clip((t - t0) / max(a, 1e-3), 0, 1); up = up * up * (3 - 2 * up)
    dn = np.clip((t1 - t) / max(r, 1e-3), 0, 1); dn = dn * dn * (3 - 2 * dn)
    return up * dn
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)
def sr_(t0, t1, x): return float(np.clip((x - t0) / max(t1 - t0, 1e-6), 0, 1))  # scalar ramp at one moment
def pan_gains(p): return np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
def add(sig, pan=0.0, gain=1.0):
    global L, Rr
    a, b = pan_gains(pan); L += sig * a * gain; Rr += sig * b * gain
def addat(i0, sig, pan=0.0, gain=1.0):
    i1 = min(i0 + len(sig), N)
    if i0 < 0 or i1 <= i0: return
    a, b = pan_gains(pan); L[i0:i1] += sig[:i1 - i0] * a * gain; Rr[i0:i1] += sig[:i1 - i0] * b * gain
def noise(): return rng.standard_normal(N)
def sweep_noise(t0, t1, f0, f1, width=0.5):
    out = np.zeros(N); seg = int(0.02 * SR); nz = noise()
    i0, i1 = max(int(t0 * SR), 0), min(int(t1 * SR), N)
    for s in range(i0, i1, seg):
        k = (s - i0) / max(i1 - i0, 1); f = f0 * (f1 / f0) ** k
        lo, hi = max(f * (1 - width), 30), min(f * (1 + width), SR / 2 - 100)
        chunk = nz[max(s - 2048, 0):s + seg]
        if len(chunk) > seg: out[s:s + seg] = bp(chunk, lo, hi)[-seg:][:len(out[s:s + seg])]
    return out
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def sawish(ph, harm): return sum(np.sin(k * ph) / k for k in range(1, harm + 1)) * 0.6

def piano(t0, n, gain=0.03, pan=0.0, dur=2.4):
    """Soft felt piano: sine plus decaying upper partials, a touch of low-pass."""
    i0 = int(t0 * SR)
    if t0 < 0 or i0 >= N: return
    x = np.arange(int(dur * SR)) / SR; f = midi(n)
    s = (np.sin(2 * np.pi * f * x) + 0.42 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.55) + 0.17 * np.sin(2 * np.pi * 3.01 * f * x) * np.exp(-x / 0.28)
         + 0.07 * np.sin(2 * np.pi * 4.03 * f * x) * np.exp(-x / 0.16))
    s *= np.minimum(x / 0.004, 1) * np.exp(-x / (0.55 + 0.9 * np.exp(-(n - 36) / 14)))
    addat(i0, lp(s, 3200), pan, gain)

def strings(notes, t0, t1, atk, rel, gain, cut=2000, spread=0.8):
    """Warm string pad: detuned saws, slow bow-like swell."""
    i0, i1 = max(int((t0 - 0.05) * SR), 0), min(int((t1 + 0.05) * SR), N)
    if i1 <= i0: return
    tt = t[i0:i1]; g = gate(t0, t1, atk, rel)[i0:i1]
    l = np.zeros(i1 - i0); r = np.zeros(i1 - i0)
    for vi, n in enumerate(notes):
        for di, d in enumerate((0.0, 0.0045, -0.0045)):
            ph = 2 * np.pi * midi(n) * (1 + d) * tt + 0.003 * np.sin(2 * np.pi * (0.4 + 0.06 * vi) * tt + di)
            v = sawish(ph, 8) / (1 + 0.12 * (n - 36) / 12)
            p = np.clip(spread * np.sin(vi * 1.9 + di * 2.3), -1, 1); a, b = pan_gains(p); l += v * a; r += v * b
    L[i0:i1] += lp(l, cut) * g * gain; Rr[i0:i1] += lp(r, cut) * g * gain

def choir(notes, t0, t1, atk, rel, gain, vowel=(700, 1100, 2800)):
    i0, i1 = max(int((t0 - 0.05) * SR), 0), min(int((t1 + 0.05) * SR), N)
    if i1 <= i0: return
    tt = t[i0:i1]; g = gate(t0, t1, atk, rel)[i0:i1]; src = np.zeros(i1 - i0)
    for vi, n in enumerate(notes):
        for d in (0.0, 0.006, -0.006): src += sawish(2 * np.pi * midi(n) * (1 + d) * tt + 0.004 * np.sin(2 * np.pi * (4.6 + 0.3 * vi) * tt), 14)
    out = np.zeros(i1 - i0)
    for fc, gn in zip(vowel, (1.0, 0.55, 0.22)): out += bp(src, fc * 0.88, fc * 1.12, 2) * gn
    out *= g * gain; L[i0:i1] += out * 0.85; Rr[i0:i1] += np.roll(out, 53) * 0.85

def taiko(t0, gain=0.5, f=62.0, d=0.45):
    i0 = int(t0 * SR)
    if t0 < 0 or i0 >= N: return
    x = np.arange(int(1.2 * SR)) / SR
    body = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.9 * np.exp(-x / 0.035))) / SR) * np.exp(-x / d)
    skin = lp(rng.standard_normal(len(x)), 900) * np.exp(-x / 0.05) * 0.5
    addat(i0, (body + skin) * np.minimum(x / 0.002, 1), 0, gain)

def stab(notes, t0, dur, gain):  # short orchestral chord stab (brass/strings)
    i0 = int(t0 * SR); i1 = min(int((t0 + dur) * SR), N)
    if t0 < 0 or i1 <= i0: return
    x = t[i0:i1] - t0; sig = np.zeros(i1 - i0)
    for n in notes:
        for d in (0.0, 0.005, -0.005): sig += sawish(2 * np.pi * midi(n) * (1 + d) * x, 12)
    sig = lp(sig, 2600) * np.minimum(x / 0.02, 1) * np.exp(-x / (dur * 0.4))
    L[i0:i1] += sig * gain; Rr[i0:i1] += sig * gain

def bell(t0, f, gain=0.04, d=1.6, pan=0.0):
    e = env(t0, 0.003, d)
    add((np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * env(t0, 0.002, d * 0.35) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * env(t0, 0.001, d * 0.15)) * e, pan, gain)

# ---------------------------------------------------------------- harmony
Am9 = [45, 52, 57, 60, 64, 71]; Fmaj = [41, 48, 53, 57, 60, 64]; Dm = [38, 45, 50, 53, 57, 62]; Cmaj = [48, 55, 60, 64, 67, 72]; Gmaj = [43, 50, 55, 59, 62, 67]
Amaj = [45, 52, 57, 61, 64, 69, 76]
A_PENT = [69, 72, 74, 76, 79, 81, 84, 88]   # A minor pentatonic for bells
A_MAJ_PENT = [69, 71, 73, 76, 78, 81, 83, 85]

launch, impact, xf0, xf1, land = T['launch'], T['impact'], T['xfade'][0], T['xfade'][1], T['land']
g0, gf = max(T['gather0'], 0.0), T['gatherFull']
appEnd = T.get('approachEnd', 0.0)
z0 = T['zoom0']; web0 = T['web0']; dim0, dim1 = T['dim']
bg = T.get('bgOut', [DUR + 1, DUR + 2]); fo = T.get('fadeOut', [DUR - 0.6, DUR])
tWorld = EV.get('tWorld', web0 + 3)
tF = impact + (xf0 - impact) * 0.5
tG = xf1 + 1.2 + (tWorld - xf1 - 1.2) * 0.45

SECTIONS = [(0.0, Am9), (g0 - 0.5, Fmaj), (impact, Dm), (tF, Am9), (xf0, Fmaj), (tG, Cmaj), (tWorld + 0.3, Gmaj), (dim0 - 0.4, Fmaj), (land - 0.04, Amaj)]
def chord_at(tt):
    c = SECTIONS[0][1]
    for ts, ch in SECTIONS:
        if tt >= ts: c = ch
    return c

# ---------------------------------------------------------------- beds
add((np.sin(2 * np.pi * 55.0 * t) + 0.4 * np.sin(2 * np.pi * 110.0 * t + 0.4)) * (0.05 + 0.07 * ramp(0, impact, 1.4)) * ramp(0, 3.0) * (1 - 0.7 * ramp(dim0, dim1 + 0.5)) * gate(-1, bg[1] + 0.5, 1, 2.5), 0, 0.8)
for pan in (-0.35, 0.35): add(lp(hp(noise(), 300), 2400) * 0.013 * ramp(0, 2.0) * gate(-1, bg[1], 1, 2.0), pan)
if appEnd > 0:   # sea and wind over the glide
    wind = bp(noise(), 250, 1700) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * t) ** 2)
    add(wind * 0.05 * ramp(0, 1.5) * (1 - ramp(appEnd - 4.0, appEnd - 0.5)), -0.2)
    surf = lp(noise(), 650) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t)) ** 2
    add(surf * 0.10 * ramp(0, 1.2) * (1 - ramp(appEnd - 3.0, appEnd + 1.5)), 0.4)
    add(lp(sweep_noise(2.6, 6.6, 300, 1300, 0.6), 2500) * env(2.6, 1.4, 1.6) * 0.10, 0.4)   # the lighthouse slides past

# ---------------------------------------------------------------- strings and choir
strings(Am9, 0.8, g0 + 1.0, 4.5, 3.0, 0.050, cut=1200)
strings(Fmaj, g0 - 0.5, impact + 0.2, 2.5, 0.3, 0.070, cut=1700)
choir([57, 60, 64, 69], gf - 1.0, impact + 0.2, 2.0, 0.3, 0.030)
strings(Dm, impact, tF + 0.6, 0.1, 1.6, 0.085, cut=2400)
strings(Am9, tF, xf0 + 0.6, 1.6, 1.4, 0.075, cut=2600)
choir([57, 62, 65, 69, 72], impact + 0.6, xf0 + 1.2, 2.0, 1.4, 0.038)
strings(Fmaj, xf0 - 0.2, tG + 0.6, 1.0, 1.0, 0.070, cut=2800)
strings(Cmaj, tG, tWorld + 0.9, 1.4, 1.2, 0.072, cut=3000)
strings(Gmaj, tWorld + 0.3, dim0 + 0.2, 1.2, 1.0, 0.066, cut=3200)
strings(Fmaj, dim0 - 0.4, land + 0.1, 1.0, 0.25, 0.060, cut=2600)
choir([60, 65, 69, 72, 77], tG, dim1 + 0.4, 1.8, 1.2, 0.040)
strings(Amaj, land - 0.04, fo[1] - 0.2, 0.2, 1.6, 0.090, cut=3600, spread=0.9)   # A major: the lift
choir([57, 61, 64, 69, 73], land, fo[1] - 0.4, 0.5, 1.5, 0.048)

if SHORT:   # the short cut opens with its own swell and a low drum as it fades in from black
    strings(Am9, -0.1, 1.6, 0.5, 0.7, 0.075, cut=1700); taiko(0.1, 0.5, 50.0, 0.7)

# ---------------------------------------------------------------- felt-piano arpeggio carries the piece
pat = [0, 2, 3, 4, 3, 2, 4, 3]          # eighth-note pattern over the chord tones, low to high
step = BEAT / 2
tk = 0.3 if SHORT else 2.0; k = 0
while tk < min(land + 4.5, DUR - 0.8):
    ch = chord_at(tk)
    n = ch[pat[k % len(pat)] % len(ch)] + (12 if (k % 16) in (3, 11) else 0)
    lvl = 0.052 if SHORT else (0.018 + 0.040 * sr_(2.0, gf, tk) + 0.010 * sr_(impact, xf0, tk))
    if tk > dim0 - 0.2 and tk < land - 0.1: lvl *= 0.6
    if tk >= land: lvl = 0.040 * (1 - sr_(bg[0], fo[1], tk))
    if tk < bg[1] + 1.2 or tk >= land:
        piano(tk, n, lvl * (1.25 if k % 4 == 0 else 1.0), pan=0.3 * np.sin(k * 0.7))
    tk += step; k += 1

# ---------------------------------------------------------------- gathering: heartbeat of drums into a roll
beats = np.arange(g0 + 0.4, launch - 0.3, BEAT)
for i, tb in enumerate(beats):
    taiko(tb, 0.12 + 0.28 * i / max(len(beats) - 1, 1), 55.0, 0.30)
add(sweep_noise(g0 + 0.5, launch, 300, 7000, 0.45) * ramp(g0 + 0.5, launch, 2.2) * (1 - ramp(launch, launch + 0.08)) * 0.20, 0)
for i in range(18 if not SHORT else 7):                      # rising bells as the orb takes form
    x = i / 17; tkb = g0 + 0.8 + (gf - g0) * (x ** 0.85)
    bell(tkb, midi(A_PENT[(i * 3) % 8]) * (0.5 if i < 9 else 1.0), 0.010 + 0.026 * x, 1.6, rng.uniform(-0.7, 0.7))
for k2, ta in enumerate(np.arange(launch - 0.3, impact, BEAT / 4)): taiko(ta, 0.14 + 0.05 * k2, 70.0, 0.12)   # the roll into the drop

# ---------------------------------------------------------------- impact: drum, stab, boom and the pressure wave
add(sweep_noise(impact - 0.9, impact, 2000, 9000, 0.5) * ramp(impact - 0.9, impact, 2.5) * (1 - ramp(impact, impact + 0.02)) * 0.28)
taiko(impact, 0.9, 46.0, 0.9)
add(np.sin(2 * np.pi * (58 * np.exp(-(t - impact).clip(0) * 2.8) + 24) * (t - impact)) * env(impact, 0.004, 1.1), 0, 0.9)
stab(Am9[:5], impact, 1.4, 0.10)
add(lp(noise(), 1200) * env(impact, 0.002, 0.3) * 0.45)
add(hp(noise(), 3500) * env(impact, 0.001, 0.09) * 0.28)
for j in range(1, 3): add(sweep_noise(impact + 0.3 * j, impact + 0.3 * j + 0.9, 900, 120, 0.7) * env(impact + 0.3 * j, 0.1, 0.5) * 0.12, (-1) ** j * 0.4)   # the wave rolling outward

# ---------------------------------------------------------------- the rise: staccato strings drive upward
stp = BEAT / 2; tk = impact + stp * 2; k = 0
while tk < xf0 + 0.6:
    prog = (tk - impact) / max(xf0 - impact, 0.1)
    ch = chord_at(tk); n = ch[(k * 2) % len(ch)] + 12 * (1 + int(prog > 0.5))
    f = midi(n); x = np.arange(int(0.22 * SR)) / SR
    note = lp(sawish(2 * np.pi * f * x, 10) * np.exp(-x / 0.07) * np.minimum(x / 0.004, 1), 1200 + 3800 * prog)
    addat(int(tk * SR), note, 0.5 * np.sin(k), 0.030 + 0.050 * prog)
    if k % 2 == 0: taiko(tk, 0.18 + 0.10 * prog, 58.0, 0.2)
    tk += stp; k += 1
ris = sweep_noise(z0 - 0.4, xf0 + 0.3, 200, 7500, 0.4) * ramp(z0 - 0.4, xf0 + 0.2, 2.0) * (1 - ramp(xf0 + 0.2, xf0 + 0.6)) * 0.45
add(ris, -0.2, 0.7); add(np.roll(ris, 240), 0.2, 0.7)
taiko(xf0 + 0.15, 0.6, 44.0, 0.9)
add(sweep_noise(xf0 + 0.1, xf1 + 1.4, 6000, 500, 0.5) * env(xf0 + 0.1, 0.3, 0.9) * 0.14, 0.3)

# ---------------------------------------------------------------- across the country and the world
add(bp(noise(), 2500, 9000) * ramp(web0, web0 + 2.0) * (1 - ramp(dim0 - 0.8, dim0)) * 0.020, 0.1)
pings = sorted([v for k, v in EV['arrivals'].items() if k != 'newcastle' and v < dim1] + [a['t1'] for a in EV['arcs'] if a['t1'] < dim1])
for k3, ta in enumerate(pings):
    bell(ta, midi(A_PENT[k3 % 8]) * (0.5 if ta < tWorld else 1.0), 0.045 if not SHORT else 0.035, 1.8 if not SHORT else 1.0, rng.uniform(-0.8, 0.8))
for a in EV['arcs']:
    if a['t0'] < dim1: add(sweep_noise(a['t0'], a['t1'], 600, 3000, 0.5) * env(a['t0'], 0.15, 0.3) * 0.045, rng.uniform(-0.7, 0.7))
add(sweep_noise(tWorld - 1.4, tWorld + 0.3, 400, 5000, 0.45) * ramp(tWorld - 1.4, tWorld, 2.0) * (1 - ramp(tWorld, tWorld + 0.4)) * 0.14)
taiko(tWorld, 0.5, 52.0, 0.8)
kt = tWorld + BEAT
while kt < dim1: taiko(kt, 0.10 * (1 - sr_(dim0, dim1, kt)), 55.0, 0.25); kt += BEAT * 2     # a slow pulse under the arcs

# ---------------------------------------------------------------- home: return, the title, the hold
add(sweep_noise(T['ret0'], land + 0.05, 300, 6000, 0.5) * ramp(T['ret0'], land, 2.2) * (1 - ramp(land - 0.02, land + 0.05)) * 0.34)
for k4, ta in enumerate(np.arange(T['ret0'], land - 0.05, BEAT / 4)): taiko(ta, 0.08 + 0.18 * (k4 / 8.0), 66.0, 0.1)
taiko(land, 1.0, 44.0, 1.2)
add(np.sin(2 * np.pi * (50 * np.exp(-(t - land).clip(0) * 2.2) + 28) * (t - land)) * env(land, 0.003, 1.4), 0, 0.9)
add(lp(noise(), 1000) * env(land, 0.002, 0.45) * 0.35); add(hp(noise(), 4000) * env(land, 0.001, 0.12) * 0.2)
stab(Amaj[:6], land, 2.2, 0.075)
for f, dly in zip([midi(81), midi(85), midi(88), midi(93), midi(97)], [0, 0.08, 0.16, 0.24, 0.34]): bell(land + dly, f, 0.032, 2.4, rng.uniform(-0.6, 0.6))
add(np.sin(2 * np.pi * 55.0 * t) * env(land, 0.3, 2.6) * 0.20)

# ---------------------------------------------------------------- reverb, final fade, limiter
ir_len = int(4.2 * SR); x = np.arange(ir_len); irs = []
for _ in range(2):
    ir = noise()[:ir_len] * np.exp(-x / (1.05 * SR)); ir = lp(ir, 6000) * (0.4 + 0.6 * np.exp(-x / (0.6 * SR)))
    ir[: int(0.025 * SR)] *= np.linspace(0, 1, int(0.025 * SR)); irs.append(ir / np.sqrt(np.sum(ir ** 2)))
wetL = fftconvolve(L, irs[0])[:N]; wetR = fftconvolve(Rr, irs[1])[:N]
outL = L + 0.52 * wetL; outR = Rr + 0.52 * wetR
fade = ramp(0, 0.6) * (1 - ramp(fo[0], fo[1], 1.3))
st = np.stack([outL * fade, outR * fade], 1)
st = np.tanh(st * 1.25) / np.tanh(1.25)
st *= 0.89 / np.max(np.abs(st))
wavfile.write(f'signal_audio_{CUT}_b.wav', SR, (st * 32767).astype(np.int16))
print('ok', CUT, st.shape)
