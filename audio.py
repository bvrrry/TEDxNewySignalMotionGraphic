"""Sound design for the Signal opener.
Usage: python3 audio.py long|short   (reads timelines.json and events_<cut>.json written by render.js)
Writes signal_audio_<cut>.wav (48 kHz stereo). Everything is synthesised; no samples are used.
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

def env(t0, a, d, shape=1.0):
    x = t - t0
    return np.where(x < 0, 0, np.where(x < a, (x / max(a, 1e-4)) ** shape, np.exp(-(x - a) / d)))
def ramp(t0, t1, p=1.0):
    if t1 <= t0: return (t >= t0).astype(float)
    return np.clip((t - t0) / (t1 - t0), 0, 1) ** p
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)
def add(sig, pan=0.0, gain=1.0):
    global L, Rr
    L += sig * np.cos((pan + 1) * np.pi / 4) * gain; Rr += sig * np.sin((pan + 1) * np.pi / 4) * gain
def sweep_noise(t0, t1, f0, f1, width=0.5):
    out = np.zeros(N); seg = int(0.02 * SR); noise = rng.standard_normal(N)
    i0, i1 = max(int(t0 * SR), 0), min(int(t1 * SR), N)
    for s in range(i0, i1, seg):
        k = (s - i0) / max(i1 - i0, 1); f = f0 * (f1 / f0) ** k
        lo, hi = max(f * (1 - width), 30), min(f * (1 + width), SR / 2 - 100)
        chunk = noise[max(s - 2048, 0):s + seg]
        if len(chunk) > seg: out[s:s + seg] = bp(chunk, lo, hi)[-seg:][:len(out[s:s + seg])]
    return out

launch, impact, xf0, land = T['launch'], T['impact'], T['xfade'][0], T['land']
g0, gf = max(T['gather0'], 0.0), T['gatherFull']

# ---- bed: low drone + air
drone = np.sin(2 * np.pi * 41.2 * t) + 0.5 * np.sin(2 * np.pi * 61.7 * t + 0.3) + 0.25 * np.sin(2 * np.pi * 82.4 * t)
drone *= (0.10 + 0.08 * ramp(0, impact)) * (1 - ramp(T['dim'][0], T['dim'][1]) * 0.6) * ramp(0, min(1.2, DUR * 0.1))
add(drone, 0, 0.7)
for pan in (-0.3, 0.3):
    add(lp(hp(rng.standard_normal(N), 300), 2500) * 0.02 * ramp(0, 1.5) * (1 + ramp(T['zoom0'], xf0)), pan)
# ---- drone flight over the coast (long cut): wind + distant surf, lighthouse "pass"
if T['drone']:
    wind = bp(rng.standard_normal(N), 250, 1800) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.21 * t) ** 2)
    add(wind * 0.07 * ramp(0, 1.0) * (1 - ramp(T['droneEnd'] - 1.2, T['droneEnd'] + 0.3)), -0.2)
    add(sweep_noise(2.2, 5.6, 300, 1400, 0.6) * env(2.2, 1.6, 1.6) * 0.18, 0.4)
    add(sweep_noise(5.2, 8.0, 1400, 250, 0.6) * env(5.2, 1.0, 1.4) * 0.2, -0.3)
surf = lp(rng.standard_normal(N), 700) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.28 * t)) ** 2
add(surf * 0.12 * (1 - ramp(launch + 0.2, launch + 1.2)), 0.5)
# ---- gathering: shimmer riser + heartbeat
for i, f in enumerate([880, 1320, 1760, 2217, 2637]):
    g = ramp(g0, launch, 2.0) * (1 - ramp(launch, launch + 0.15))
    add(np.sin(2 * np.pi * f * (1 + 0.04 * ramp(g0, launch)) * t) * g * (0.6 + 0.4 * np.sin(2 * np.pi * (5 + i) * t)) * 0.022, (i - 2) * 0.3)
beats = np.arange(g0 + 0.4, launch - 0.2, 0.9 if not SHORT else 0.35)
for tb in beats:
    for dt in (0, 0.28 if not SHORT else 0.14):
        add(np.sin(2 * np.pi * 55 * (t - tb - dt)) * env(tb + dt, 0.005, 0.12) * 0.32)
add(np.sin(2 * np.pi * 72 * (t - gf)) * env(gf, 0.005, 0.4) * 0.3)  # orb completes
# ---- launch: sub drop + whoosh travelling left
add(np.sin(2 * np.pi * (70 - 30 * ramp(launch, launch + 0.5)) * (t - launch)) * env(launch, 0.01, 0.35) * 0.5)
fl = impact - launch
wh = sweep_noise(launch - 0.15, launch + min(1.3, fl), 400, 3500, 0.6) * ramp(launch - 0.15, launch + 0.05) * (1 - ramp(launch + 0.4 * fl / 3.5, launch + min(1.3, fl)))
panm = np.clip((t - launch) / 1.2, 0, 1) * -1.6 + 0.6
L += wh * 0.35 * (0.5 - 0.3 * panm); Rr += wh * 0.35 * (0.5 + 0.3 * panm)
add(np.sin(2 * np.pi * (220 + 180 * ramp(launch, impact)) * t) * ramp(launch, launch + 0.5) * (1 - ramp(impact - 0.05, impact + 0.05)) * 0.05)
for k, tp in enumerate(np.linspace(launch + 0.35 * fl, impact - 0.1, 6 if not SHORT else 3)):
    add(bp(rng.standard_normal(N), 800, 4000) * env(tp, 0.06, 0.09) * 0.25, 0.7 if k % 2 else -0.7)
# ---- impact: boom + zap, then the spreading network crackle
add(np.sin(2 * np.pi * (60 * np.exp(-(t - impact).clip(0) * 3) + 28) * (t - impact)) * env(impact, 0.004, 0.7) * 0.9)
add(lp(rng.standard_normal(N), 1200) * env(impact, 0.002, 0.25) * 0.5)
add(hp(rng.standard_normal(N), 3000) * env(impact, 0.001, 0.08) * 0.35)
tt = impact + 0.05
while tt < xf0:
    dens = 12 + 70 * ((tt - impact) / max(xf0 - impact, 0.1)) ** 1.5
    tt += rng.exponential(1 / dens)
    i = int(tt * SR); ln = int(0.012 * SR)
    if i + ln >= N: break
    f = rng.uniform(1800, 6000)
    blip = np.sin(2 * np.pi * f * np.arange(ln) / SR) * np.exp(-np.arange(ln) / (0.003 * SR)) * rng.uniform(0.03, 0.09)
    p = rng.uniform(-0.9, 0.9); L[i:i + ln] += blip * np.cos((p + 1) * np.pi / 4); Rr[i:i + ln] += blip * np.sin((p + 1) * np.pi / 4)
add(bp(rng.standard_normal(N), 90, 180) * ramp(impact + 0.05, impact + 0.6) * (1 - ramp(xf0 - 0.3, xf0 + 0.4)) * 0.12)
# ---- ultra zoom-out: riser into the globe
z0 = T['zoom0']
ris = sweep_noise(z0 - 0.3, xf0 + 0.3, 200, 7000, 0.4) * ramp(z0 - 0.3, xf0 + 0.2, 2.0) * (1 - ramp(xf0 + 0.2, xf0 + 0.6)) * 0.55
add(ris, -0.2, 0.7); add(np.roll(ris, 240), 0.2, 0.7)
add(np.sin(2 * np.pi * (110 + 440 * ramp(z0, xf0 + 0.2, 2)) * t) * ramp(z0, xf0 + 0.2, 2) * (1 - ramp(xf0 + 0.15, xf0 + 0.35)) * 0.06)
add(np.sin(2 * np.pi * 36 * (t - xf0 - 0.2)) * env(xf0 + 0.2, 0.02, 0.9) * 0.45)
# the web racing across Australia: a rising granular hiss
web0 = T['web0']
add(bp(rng.standard_normal(N), 2500, 9000) * ramp(web0, web0 + 1.5) * (1 - ramp(T['dim'][0] - 0.8, T['dim'][0])) * 0.03, 0.1)
# ---- pings when the signal reaches cities / lands arcs
scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5]
pings = sorted([v for k, v in EV['arrivals'].items() if k != 'newcastle' and v < T['dim'][1]] + [a['t1'] for a in EV['arcs'] if a['t1'] < T['dim'][1]])
for k, ta in enumerate(pings):
    f = scale[k % len(scale)] * (0.5 if k < 4 else 1)
    e = env(ta, 0.003, 0.35 if not SHORT else 0.22)
    add((np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * env(ta, 0.002, 0.08)) * e, rng.uniform(-0.8, 0.8), 0.04 if not SHORT else 0.03)
for f in [130.81, 196.0, 261.63, 329.63]:
    add(np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.2 * t)) * ramp(web0, T['dim'][0]) * (1 - ramp(T['dim'][0], T['dim'][1] + 0.2)) * 0.03, rng.uniform(-0.5, 0.5))
# ---- return to the i + title hit
add(sweep_noise(T['ret0'], land + 0.05, 300, 5000, 0.5) * ramp(T['ret0'], land, 2.2) * (1 - ramp(land - 0.02, land + 0.05)) * 0.4)
add(np.sin(2 * np.pi * (48 * np.exp(-(t - land).clip(0) * 2) + 30) * (t - land)) * env(land, 0.003, 1.3) * 0.9)
add(lp(rng.standard_normal(N), 900) * env(land, 0.002, 0.4) * 0.35)
for f in [523.25, 659.25, 783.99, 1046.5, 1567.98]:
    add(np.sin(2 * np.pi * f * t) * env(land, 0.01, 1.4) * (0.7 + 0.3 * np.sin(2 * np.pi * 6 * t)) * 0.035, rng.uniform(-0.6, 0.6))
add(np.sin(2 * np.pi * 41.2 * t) * env(land, 0.3, 1.6) * 0.25)
add(np.sin(2 * np.pi * 1318.5 * t) * env(T['logo'][0] + 0.1, 0.004, 0.5) * 0.03, 0.2)

# ---- reverb, fades, limiter
ir_len = int(2.2 * SR)
irs = [lp(rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (0.45 * SR)), 5000) for _ in range(2)]
irs = [ir / np.sqrt(np.sum(ir ** 2)) for ir in irs]
outL = L + 0.35 * fftconvolve(L, irs[0])[:N]; outR = Rr + 0.35 * fftconvolve(Rr, irs[1])[:N]
fade = ramp(0, 0.3) * (1 - ramp(DUR - 0.5, DUR))
st = np.stack([outL * fade, outR * fade], 1)
st = np.tanh(st * 1.3) / np.tanh(1.3)
st *= 0.89 / np.max(np.abs(st))
wavfile.write(f'signal_audio_{CUT}.wav', SR, (st * 32767).astype(np.int16))
print('ok', CUT, st.shape)
