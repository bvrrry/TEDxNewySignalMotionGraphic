// Detailed camera log: node camlog.js t0 t1 step   (position speed, look turn rate, turn acceleration, height)
import puppeteer from 'puppeteer';
import fs from 'fs';
const [t0, t1, st] = [+process.argv[2] || 0, +process.argv[3] || 24, +process.argv[4] || 0.5];
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/google/chrome/chrome'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ headless: 'shell', executablePath: process.env.CHROME || chrome, protocolTimeout: 0, args: ['--use-gl=angle', '--use-angle=d3d11', '--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html?w=320&h=180&msaa=0&cut=long', { waitUntil: 'load', timeout: 0 });
await page.waitForFunction('window.READY === true', { timeout: 0, polling: 200 });
const rows = await page.evaluate((t0, t1, st) => { const { cityShot, altAt } = window.__probe; const out = []; const dt = 0.05;
  const fwd = t => { const s = cityShot(t); return s.tgt.clone().sub(s.pos).normalize(); };
  const yawOf = f => Math.atan2(f.x, f.z) * 180 / Math.PI, pitchOf = f => Math.asin(Math.max(-1, Math.min(1, f.y))) * 180 / Math.PI;
  const dang = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  for (let t = t0; t <= t1 + 1e-6; t += st) { const P = [-1, 0, 1].map(k => cityShot(t + k * dt)), F = [-1, 0, 1].map(k => fwd(t + k * dt));
    const v0 = P[1].pos.clone().sub(P[0].pos).multiplyScalar(1 / dt), v1 = P[2].pos.clone().sub(P[1].pos).multiplyScalar(1 / dt), acc = v1.clone().sub(v0).multiplyScalar(1 / dt);
    const yr0 = dang(yawOf(F[1]), yawOf(F[0])) / dt, yr1 = dang(yawOf(F[2]), yawOf(F[1])) / dt, pr0 = (pitchOf(F[1]) - pitchOf(F[0])) / dt, pr1 = (pitchOf(F[2]) - pitchOf(F[1])) / dt;
    out.push(`t=${t.toFixed(2)} spd ${((v0.length() + v1.length()) / 2).toFixed(0).padStart(4)}  accel ${acc.length().toFixed(0).padStart(4)} m/s2  yaw ${((yr0 + yr1) / 2).toFixed(1).padStart(6)} (${((yr1 - yr0) / dt).toFixed(0).padStart(4)} /s)  pitch ${((pr0 + pr1) / 2).toFixed(1).padStart(6)} (${((pr1 - pr0) / dt).toFixed(0).padStart(4)} /s)  y ${P[1].pos.y.toFixed(1).padStart(6)}  V ${altAt(t).toFixed(1)}`); }
  return out; }, t0, t1, st);
console.log(rows.join('\n'));
await browser.close();
