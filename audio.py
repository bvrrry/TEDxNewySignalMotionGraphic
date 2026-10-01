"""Sound design for the Signal opener (cinematic pass).
Usage: python3 audio.py long|short   (reads timelines.json and events_<cut>.json written by render.js)
Writes signal_audio_<cut>.wav (48 kHz stereo). Everything is synthesised; no samples are used.

Layers: ocean + wind bed, sub drone, slow detuned-saw pads that move through a chord progression (Dm9 -> Bb -> Dm -> F -> Gm -> D major),
a formant "choir" pad for the zoom-out, heartbeat + shimmer during the orb's birth, a braam/boom on impact and on the title landing,
bells for each city the signal reaches and each arc, risers and whooshes, and a long reverb tail. All timing comes from timelines.json.
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
rng = np.random.default_rng(7)
L = np.zeros(N); Rr = np.zeros(N)
SHORT = CUT == 'short'

# ---------------------------------------------------------------- helpers
def env(t0, a, d, shape=1.0):
    x = t - t0
    return np.where(x < 0, 0, np.where(x < a, (x / max(a, 1e-4)) ** shape, np.exp(-(x - a) / d)))
def ramp(t0, t1, p=1.0):
    if t1 <= t0: return (t >= t0).astype(float)
    return np.clip((t - t0) / (t1 - t0), 0, 1) ** p
def gate(t0, t1, a, r):  # smooth attack from t0, smooth release ending at t1
    up = np.clip((t - t0) / max(a, 1e-3), 0, 1); up = up * up * (3 - 2 * up)
    dn = np.clip((t1 - t) / max(r, 1e-3), 0, 1); dn = dn * dn * (3 - 2 * dn)
    return up * dn
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)
def add(sig, pan=0.0, gain=1.0):
    global L, Rr
    L += sig * np.cos((pan + 1) * np.pi / 4) * gain; Rr += sig * np.sin((pan + 1) * np.pi / 4) * gain
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
def sawish(ph, harm):  # band-limited-ish saw from summed harmonics
    return sum(np.sin(k * ph) / k for k in range(1, harm + 1)) * 0.6

def pad(notes, t0, t1, atk, rel, gain, cut=1600, spread=0.7, harm=9, detune=(0.0, 0.004, -0.004), vib=0.0025):
    """Slow detuned-saw pad: notes are MIDI numbers, spread across the stereo field, low-passed, long smooth attack and release."""
    i0, i1 = max(int((t0 - 0.05) * SR), 0), min(int((t1 + 0.05) * SR), N)
    if i1 <= i0: return
    tt = t[i0:i1]; g = gate(t0, t1, atk, rel)[i0:i1]
    l = np.zeros(i1 - i0); r = np.zeros(i1 - i0)
    for vi, n in enumerate(notes):
        f = midi(n)
        for di, d in enumerate(detune):
            ph = 2 * np.pi * f * (1 + d) * tt + vib * np.sin(2 * np.pi * (0.35 + 0.07 * vi) * tt + di)
            v = sawish(ph, harm) / (1 + 0.15 * (n - 36) / 12)  # higher notes a little softer
            pan = np.clip(spread * np.sin(vi * 1.7 + di * 2.1), -1, 1)
            l += v * np.cos((pan + 1) * np.pi / 4); r += v * np.sin((pan + 1) * np.pi / 4)
    sl, sr_ = lp(l, cut) * g * gain, lp(r, cut) * g * gain
    L[i0:i1] += sl; Rr[i0:i1] += sr_

def choir(notes, t0, t1, atk, rel, gain, vowel=(800, 1150, 2900)):
    """Formant 'ah' choir: saw stack through three band-passes."""
    i0, i1 = max(int((t0 - 0.05) * SR), 0), min(int((t1 + 0.05) * SR), N)
    if i1 <= i0: return
    tt = t[i0:i1]; g = gate(t0, t1, atk, rel)[i0:i1]
    src = np.zeros(i1 - i0)
    for vi, n in enumerate(notes):
        f = midi(n)
        for d in (0.0, 0.006, -0.006):
            src += sawish(2 * np.pi * f * (1 + d) * tt + 0.9 * np.sin(2 * np.pi * (4.8 + 0.3 * vi) * tt) * 0.01, 14)
    out = np.zeros(i1 - i0)
    for fc, gn in zip(vowel, (1.0, 0.6, 0.25)): out += bp(src, fc * 0.88, fc * 1.12, 2) * gn
    out *= g * gain
    L[i0:i1] += out * 0.85; Rr[i0:i1] += np.roll(out, 61) * 0.85

def braam(t0, f0=36.7, dur=3.2, gain=0.5, bright=1400):
    """Big detuned low brass/saw hit with a pitch sag, saturated."""
    i0, i1 = max(int(t0 * SR), 0), min(int((t0 + dur) * SR), N)
    if i1 <= i0: return
    x = t[i0:i1] - t0
    f = f0 * (1 + 0.35 * np.exp(-x / 0.25))
    sig = np.zeros(i1 - i0)
    for mult, d in ((1, 0.0), (1, 0.006), (1, -0.006), (2, 0.004), (3, -0.003)):
        ph = 2 * np.pi * np.cumsum(f * mult * (1 + d)) / SR
        sig += sawish(ph, 14) / mult
    k = np.exp(-x / 0.9)  # bright at the attack, closing down as it rings
    sig = lp(sig, bright) * k + lp(sig, bright * 0.3) * (1 - k)
    sig = np.tanh(2.2 * sig) * np.minimum(x / 0.012, 1) * np.exp(-x / (dur * 0.42))
    L[i0:i1] += sig * gain; Rr[i0:i1] += sig * gain
def sub_hit(t0, f=44.0, gain=0.8, d=0.9):
    add(np.sin(2 * np.pi * (f * np.exp(-(t - t0).clip(0) * 3.0) + 26) * (t - t0)) * env(t0, 0.004, d), 0, gain)
def bell(t0, f, gain=0.04, d=1.4, pan=0.0):
    e = env(t0, 0.003, d)
    add((np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * env(t0, 0.002, d * 0.35) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * env(t0, 0.001, d * 0.15)) * e, pan, gain)

# chords (MIDI): D minor add9, Bb, D minor, F, G minor, D major
Dm9 = [38, 45, 50, 53, 57, 64]; Bb = [34, 46, 53, 58, 62, 65]; Dm = [38, 50, 53, 57, 62]; F = [41, 48, 53, 57, 60, 65]
Gm = [43, 50, 55, 58, 62, 67]; Dmaj = [38, 50, 54, 57, 62, 66, 69, 76]
PENT = [74, 76, 78, 81, 83, 86, 88, 90]  # D major pentatonic, bell register

launch, impact, xf0, land = T['launch'], T['impact'], T['xfade'][0], T['land']
g0, gf = max(T['gather0'], 0.0), T['gatherFull']
appEnd = T.get('approachEnd', 0.0)
z0 = T['zoom0']; web0 = T['web0']
dim0, dim1 = T['dim']
bg = T.get('bgOut', [DUR + 1, DUR + 2]); fo = T.get('fadeOut', [DUR - 0.6, DUR])
tWorld = EV.get('tWorld', web0 + 4)

# ---------------------------------------------------------------- beds
# sub drone (D1) swells in and carries the whole piece
drone = np.sin(2 * np.pi * 36.71 * t) + 0.5 * np.sin(2 * np.pi * 73.42 * t + 0.3) + 0.22 * np.sin(2 * np.pi * 110.1 * t)
add(drone * (0.05 + 0.10 * ramp(0, impact, 1.3)) * ramp(0, min(3.0, DUR * 0.15)) * (1 - 0.75 * ramp(dim0, dim1 + 0.5)) * gate(-1, bg[1] + 0.5, 1, 2.5), 0, 0.8)
# air
for pan in (-0.35, 0.35):
    add(lp(hp(noise(), 300), 2600) * 0.016 * ramp(0, 2.0) * (1 + ramp(z0, xf0)) * gate(-1, bg[1], 1, 2.0), pan)
# ocean + wind over the approach
if appEnd > 0:
    wind = bp(noise(), 250, 1800) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * t) ** 2)
    add(wind * 0.06 * ramp(0, 1.5) * (1 - ramp(appEnd - 4.0, appEnd - 0.5)), -0.2)
    surf = lp(noise(), 650) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t)) ** 2
    add(surf * 0.11 * ramp(0, 1.2) * (1 - ramp(appEnd - 3.0, appEnd + 1.5)), 0.4)
    # low horn as the lighthouse slides past, a swoosh as the fort comes by
    horn = (np.sin(2 * np.pi * midi(38) * t) + 0.5 * np.sin(2 * np.pi * midi(45) * t) + 0.25 * np.sin(2 * np.pi * midi(50) * t)) * gate(2.4, 8.4, 1.6, 3.6)
    add(lp(horn, 500) * 0.07, 0.35)
    add(sweep_noise(6.4, 10.4, 350, 1500, 0.6) * env(6.4, 1.8, 1.8) * 0.12, 0.45)
    add(sweep_noise(10.0, 14.0, 1500, 300, 0.6) * env(10.0, 1.2, 1.8) * 0.12, -0.35)

# ---------------------------------------------------------------- harmony (pads move with the picture)
a_end = max(appEnd, g0 + 1.0)
pad(Dm9, 1.0, g0 + 2.0, 4.5, 3.5, 0.060, cut=1100)                       # over the sea
pad(Bb, g0 - 1.0, impact + 0.3, 3.0, 0.4, 0.075, cut=1500)                # the orb is born
choir([50, 57, 62, 65], gf - 1.5, impact + 0.2, 2.5, 0.3, 0.030)
pad(Dm, impact, xf0 + 0.3, 0.12, 2.0, 0.090, cut=2200)                    # the signal leaves
pad(F, impact + (xf0 - impact) * 0.45, xf0 + 1.0, 2.2, 2.0, 0.070, cut=2600)
choir([57, 62, 65, 69, 72], impact + 0.5, xf0 + 1.5, 2.5, 2.0, 0.040)
pad(Gm, xf0 - 0.3, tWorld + 0.6, 1.4, 1.2, 0.070, cut=2600)               # across the country
pad(Bb, tWorld - 1.2, dim1, 1.8, 1.2, 0.060, cut=3000)                     # the world
choir([58, 62, 65, 70, 74], tWorld - 0.8, dim1 + 0.4, 1.8, 1.2, 0.042)
pad(Dmaj, land - 0.04, fo[1] - 0.2, 0.25, 1.4, 0.085, cut=3400, spread=0.9)  # the title: D major blooms and holds
choir([62, 66, 69, 74, 78], land, fo[1] - 0.5, 0.5, 1.4, 0.045)
pad(Dmaj, land - 0.04, bg[0] + 0.5, 0.25, 2.0, 0.030, cut=8000, harm=14)  # a little extra air on the bloom while the planet is still there

# ---------------------------------------------------------------- gathering: heartbeat + shimmer
beat_gap = 1.0 if not SHORT else 0.4
beats = np.arange(g0 + 0.3, launch - 0.25, beat_gap)
for k, tb in enumerate(beats):
    amp = 0.18 + 0.30 * (k / max(len(beats) - 1, 1))
    for dt, a in ((0, 1.0), (0.24 if not SHORT else 0.1, 0.6)):
        add(np.sin(2 * np.pi * 52 * (t - tb - dt)) * env(tb + dt, 0.005, 0.14), 0, amp * a)
add(np.sin(2 * np.pi * 73.4 * (t - gf)) * env(gf, 0.005, 0.6), 0, 0.30)   # orb completes
n_sh = 26 if not SHORT else 9
for k in range(n_sh):  # rising shimmer arpeggio: D major pentatonic, denser as the orb strengthens
    x = k / max(n_sh - 1, 1); tk = g0 + 0.6 + (gf - g0) * (x ** 0.8)
    bell(tk, midi(PENT[(k * 3) % len(PENT)]) * (0.5 if k < n_sh // 2 else 1.0), 0.012 + 0.03 * x, 1.6, rng.uniform(-0.7, 0.7))
for i, f in enumerate([880, 1320, 1760, 2217, 2637]):
    gsh = ramp(g0, launch, 2.0) * (1 - ramp(launch, launch + 0.15))
    add(np.sin(2 * np.pi * f * (1 + 0.03 * ramp(g0, launch)) * t) * gsh * (0.6 + 0.4 * np.sin(2 * np.pi * (5 + i) * t)) * 0.012, (i - 2) * 0.3)
add(sweep_noise(g0 + 0.5, launch, 300, 6000, 0.45) * ramp(g0 + 0.5, launch, 2.2) * (1 - ramp(launch, launch + 0.08)) * 0.22, 0)

# ---------------------------------------------------------------- launch + impact
sub_hit(launch, 70, 0.35, 0.35)
add(np.sin(2 * np.pi * (200 + 900 * ramp(launch, impact, 1.5)) * t) * ramp(launch, launch + 0.15) * (1 - ramp(impact - 0.03, impact + 0.03)) * 0.05)
add(sweep_noise(impact - 0.9, impact, 2000, 9000, 0.5) * ramp(impact - 0.9, impact, 2.5) * (1 - ramp(impact, impact + 0.02)) * 0.3)  # reverse-cymbal
braam(impact, 36.71, 3.6, 0.55)
sub_hit(impact, 58, 0.95, 1.0)
add(lp(noise(), 1400) * env(impact, 0.002, 0.3) * 0.5)
add(hp(noise(), 3500) * env(impact, 0.001, 0.09) * 0.32)
for k, tp in enumerate([impact + 0.06 * j for j in range(1, 7)]):   # sand thrown up
    add(bp(noise(), 1200, 6000) * env(tp, 0.004, 0.08) * (0.14 / (1 + 0.3 * k)), (-1) ** k * 0.6)
# the network spreading over the streets: fine crackle that thickens
tt = impact + 0.05
while tt < xf0:
    dens = 10 + 75 * ((tt - impact) / max(xf0 - impact, 0.1)) ** 1.6
    tt += rng.exponential(1 / dens)
    i = int(tt * SR); ln = int(0.012 * SR)
    if i + ln >= N: break
    f = rng.uniform(1800, 6500)
    blip = np.sin(2 * np.pi * f * np.arange(ln) / SR) * np.exp(-np.arange(ln) / (0.003 * SR)) * rng.uniform(0.02, 0.07)
    p = rng.uniform(-0.9, 0.9); L[i:i + ln] += blip * np.cos((p + 1) * np.pi / 4); Rr[i:i + ln] += blip * np.sin((p + 1) * np.pi / 4)
add(bp(noise(), 90, 180) * ramp(impact + 0.05, impact + 1.0) * (1 - ramp(xf0 - 0.3, xf0 + 0.4)) * 0.10)

# ---------------------------------------------------------------- the long rise: riser into the globe
ris = sweep_noise(z0 - 0.5, xf0 + 0.3, 200, 7500, 0.4) * ramp(z0 - 0.5, xf0 + 0.2, 2.0) * (1 - ramp(xf0 + 0.2, xf0 + 0.6)) * 0.50
add(ris, -0.2, 0.7); add(np.roll(ris, 240), 0.2, 0.7)
add(np.sin(2 * np.pi * (110 + 660 * ramp(z0 - 0.5, xf0 + 0.2, 2)) * t) * ramp(z0 - 0.5, xf0 + 0.2, 2) * (1 - ramp(xf0 + 0.15, xf0 + 0.35)) * 0.045)
sub_hit(xf0 + 0.2, 40, 0.5, 1.1)
add(sweep_noise(xf0 + 0.1, xf0 + 1.6, 6000, 600, 0.5) * env(xf0 + 0.1, 0.3, 0.9) * 0.14, 0.3)   # the air rushing out as we leave the city

# ---------------------------------------------------------------- the web across the country, then the world
add(bp(noise(), 2500, 9000) * ramp(web0, web0 + 2.0) * (1 - ramp(dim0 - 0.8, dim0)) * 0.025, 0.1)
add(sweep_noise(tWorld - 1.6, tWorld + 0.3, 400, 5000, 0.45) * ramp(tWorld - 1.6, tWorld, 2.0) * (1 - ramp(tWorld, tWorld + 0.4)) * 0.16)  # the x completes
sub_hit(tWorld, 50, 0.5, 1.2)
pings = sorted([v for k, v in EV['arrivals'].items() if k != 'newcastle' and v < dim1] + [a['t1'] for a in EV['arcs'] if a['t1'] < dim1])
for k, ta in enumerate(pings):
    f = midi(PENT[k % len(PENT)]) * (0.5 if ta < tWorld else 1.0)
    bell(ta, f, 0.050 if not SHORT else 0.04, 1.6 if not SHORT else 0.9, rng.uniform(-0.8, 0.8))
for a in EV['arcs']:  # small whoosh as each arc launches
    if a['t0'] < dim1: add(sweep_noise(a['t0'], a['t1'], 600, 3000, 0.5) * env(a['t0'], 0.15, 0.3) * 0.05, rng.uniform(-0.7, 0.7))

# ---------------------------------------------------------------- return to the i, the title, the hold, the fade
add(sweep_noise(T['ret0'], land + 0.05, 300, 6000, 0.5) * ramp(T['ret0'], land, 2.2) * (1 - ramp(land - 0.02, land + 0.05)) * 0.36)
add(np.sin(2 * np.pi * (200 + 1400 * ramp(T['ret0'], land, 2.0)) * t) * ramp(T['ret0'], land, 2.0) * (1 - ramp(land - 0.02, land + 0.03)) * 0.04)
braam(land, 36.71, 4.2, 0.60, bright=1800)
sub_hit(land, 46, 1.0, 1.5)
add(lp(noise(), 1000) * env(land, 0.002, 0.45) * 0.4)
add(hp(noise(), 4000) * env(land, 0.001, 0.12) * 0.22)
for f, dly in zip([midi(74), midi(78), midi(81), midi(86), midi(90)], [0, 0.07, 0.14, 0.21, 0.3]):  # a glint of D major over the hit
    bell(land + dly, f, 0.035, 2.2, rng.uniform(-0.6, 0.6))
bell(T['logo'][0] + 0.1, midi(93), 0.03, 1.8, 0.2)
add(np.sin(2 * np.pi * 36.71 * t) * env(land, 0.3, 2.4) * 0.22)

# ---------------------------------------------------------------- a subtle beat: soft kick on the grid (one lands on the impact), off-beat hats, a gentle pump on the pads
BPM = 112.0
beat = 60.0 / BPM
k0 = impact - np.ceil((impact - gf) / beat) * beat   # first kick after the orb completes, grid locked to the impact
beat_gain = (0.05 + 0.10 * ramp(gf, impact)) * (0.85 + 0.15 * ramp(impact, xf0)) * (1 - ramp(dim0 - 0.2, dim1 + 0.3))
kick = np.zeros(N); kenv = np.zeros(N); hats = np.zeros(N)
tk = k0
while tk < dim1 + 0.3 and tk < DUR - 0.5:
    i0 = int(max(tk, 0) * SR); ln = int(0.45 * SR); i1 = min(i0 + ln, N)
    if i1 > i0 and tk >= 0:
        x = np.arange(i1 - i0) / SR
        body = np.sin(2 * np.pi * np.cumsum(46 + 95 * np.exp(-x / 0.03)) / SR) * np.exp(-x / 0.17) * np.minimum(x / 0.003, 1)
        kick[i0:i1] += body; kenv[i0:i1] += np.exp(-x / 0.12)
        th = tk + beat / 2; j0 = int(th * SR); j1 = min(j0 + int(0.06 * SR), N)
        if j1 > j0 and th > impact - 0.1:
            y = np.arange(j1 - j0) / SR; hats[j0:j1] += rng.standard_normal(j1 - j0) * np.exp(-y / 0.012)
    tk += beat
pump = 1 - 0.16 * np.clip(kenv, 0, 1) * ramp(impact - 0.2, impact + 0.3)
L *= pump; Rr *= pump
add(kick * beat_gain, 0, 1.0)
add(hp(hats, 6500) * beat_gain * 0.22 * ramp(impact, impact + 1.0), 0.15, 1.0)

# ---------------------------------------------------------------- reverb, final fade, limiter
ir_len = int(3.6 * SR)
x = np.arange(ir_len)
irs = []
for _ in range(2):
    ir = noise()[:ir_len] * np.exp(-x / (0.9 * SR))
    ir = lp(ir, 6500) * (0.4 + 0.6 * np.exp(-x / (0.5 * SR)))  # darker as it decays
    ir[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))   # slight pre-delay onset
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
wetL = fftconvolve(L, irs[0])[:N]; wetR = fftconvolve(Rr, irs[1])[:N]
outL = L + 0.5 * wetL; outR = Rr + 0.5 * wetR
fade = ramp(0, 0.6) * (1 - ramp(fo[0], fo[1], 1.3))
st = np.stack([outL * fade, outR * fade], 1)
st = np.tanh(st * 1.25) / np.tanh(1.25)
st *= 0.89 / np.max(np.abs(st))
wavfile.write(f'signal_audio_{CUT}.wav', SR, (st * 32767).astype(np.int16))
print('ok', CUT, st.shape)
