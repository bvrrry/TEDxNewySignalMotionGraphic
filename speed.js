// Print the approach flight's speed / height / yaw-rate profile: node speed.js
import puppeteer from 'puppeteer';
import fs from 'fs';
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/google/chrome/chrome'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ headless: 'shell', executablePath: process.env.CHROME || chrome, protocolTimeout: 0, args: ['--use-gl=angle', '--use-angle=d3d11', '--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html?w=320&h=180&msaa=0&cut=long', { waitUntil: 'load', timeout: 0 });
await page.waitForFunction('window.READY === true', { timeout: 0, polling: 200 });
const rows = await page.evaluate(() => { const { cityShot, appCurve, appLen } = window.__probe; const T = window.__dbg.TL; const THREE = window.__dbg.THREE; const out = [`path length ${appLen.toFixed(0)} m`];
  const fwd = t => { const s = cityShot(t); return s.tgt.clone().sub(s.pos).normalize(); };
  let prev = cityShot(0).pos.clone(), pf = fwd(0), maxYaw = 0;
  for (let t = 1; t <= T.approachEnd; t += 1) { const s = cityShot(t), f = fwd(t); const yaw = Math.acos(Math.min(1, pf.dot(f))) * 180 / Math.PI; maxYaw = Math.max(maxYaw, yaw);
    out.push(`t=${t}  speed ${s.pos.distanceTo(prev).toFixed(0)} m/s  height ${s.pos.y.toFixed(0)} m  look turn ${yaw.toFixed(1)} deg/s`); prev = s.pos.clone(); pf = f; }
  out.push(`max look turn ${maxYaw.toFixed(1)} deg/s`);
  for (const [name, x, z] of [['pool A (368,-98)', 368, -98], ['pool B (262,-58)', 262, -58]]) { let best = 1e9, bu = 0; for (let u = 0; u <= 1; u += 0.002) { const p = appCurve.getPointAt(u); const d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; bu = u; } } out.push(`${name}: closest at u=${bu.toFixed(3)} dist ${best.toFixed(0)} m`); }
  return out; });
console.log(rows.join('\n'));
await browser.close();
