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
  const ang = (a, b) => Math.acos(Math.min(1, a.dot(b))) * 180 / Math.PI;
  for (let t = t0; t <= t1 + 1e-6; t += st) { const a = cityShot(t - dt), b = cityShot(t), c = cityShot(t + dt); const f0 = fwd(t - dt), f1 = fwd(t), f2 = fwd(t + dt);
    const turn1 = ang(f0, f1) / dt, turn2 = ang(f1, f2) / dt; const spd = c.pos.distanceTo(a.pos) / (2 * dt);
    out.push(`t=${t.toFixed(2)} spd ${spd.toFixed(0).padStart(4)} m/s  turn ${((turn1 + turn2) / 2).toFixed(1).padStart(5)} deg/s  turnAccel ${((turn2 - turn1) / dt).toFixed(0).padStart(5)} deg/s2  y ${b.pos.y.toFixed(1).padStart(6)}  V ${altAt(t).toFixed(1)}`); }
  return out; }, t0, t1, st);
console.log(rows.join('\n'));
await browser.close();
