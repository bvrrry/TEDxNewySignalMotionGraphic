// Debug tool: render the city scene from an arbitrary camera.
// node probe.js --out ../_probe/top.png --w 1280 --h 720 --t 17 --pos 300,3500,-400 --tgt 300,0,-400 [--fov 40] [--up 0,0,-1]
import puppeteer from 'puppeteer';
import fs from 'fs';
const a = Object.fromEntries(process.argv.slice(2).reduce((r, v, i, arr) => (v.startsWith('--') ? r.concat([[v.slice(2), arr[i + 1]]]) : r), []));
const W = +(a.w || 1280), H = +(a.h || 720);
const v3 = s => s.split(',').map(Number);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/google/chrome/chrome'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ headless: 'shell', executablePath: process.env.CHROME || chrome, protocolTimeout: 0,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-sandbox', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
const page = await browser.newPage();
page.on('pageerror', e => { console.log('[pageerror]', e.message); process.exit(3); });
await page.goto(`http://localhost:8123/index.html?w=${W}&h=${H}&msaa=0&cut=${a.cut || 'long'}`, { waitUntil: 'load', timeout: 0 });
await page.waitForFunction('window.READY === true', { timeout: 0, polling: 200 });
await page.evaluate((pos, tgt, fov, t) => { const T = window.__dbg.THREE; window.__camOverride = { pos: new T.Vector3(...pos), tgt: new T.Vector3(...tgt), fov }; }, v3(a.pos), v3(a.tgt), +(a.fov || 40));
if (a.path) await page.evaluate(() => { // draw the approach flight path: yellow dots every 20 m, big green dots every 2 s
  const T = window.__dbg.THREE, { appCurve, appLen, altAt } = window.__probe, scene = window.__dbg.city;
  const mk = (r, c) => new T.Mesh(new T.SphereGeometry(r, 8, 6), new T.MeshBasicMaterial({ color: c }));
  for (let s = 0; s < appLen; s += 20) { const m = mk(6, new T.Color(6, 5, 0)); m.position.copy(appCurve.getPointAt(s / appLen)); scene.add(m); }
  const { appU } = window.__probe, end = window.__dbg.TL.approachEnd;
  for (let t = 0; t <= end + 0.01; t += 2) { const u = appU(t); const m = mk(20, new T.Color(0, 6, 1)); m.position.copy(appCurve.getPointAt(Math.min(u, 1))); scene.add(m); }
});
await page.evaluate(t => window.renderFrame(t), +(a.t || 0));
fs.mkdirSync(a.out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
fs.writeFileSync(a.out, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } }));
await browser.close();
