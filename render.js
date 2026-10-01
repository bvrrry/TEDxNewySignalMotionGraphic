// Usage: node render.js --w 960 --h 540 --fps 30 --out draft.mp4
//        node render.js --w 960 --h 540 --stills 0,2,4.5 --outdir stills
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const W = +(args.w || 960), H = +(args.h || 540), FPS = +(args.fps || 30);
const msaa = args.msaa || 4;
const port = args.port || 8123;
const cut = args.cut || 'long';

// Chrome: $CHROME, else the usual Windows / Linux install paths. `--gpu 1` uses the real GPU instead of SwiftShader (much faster).
const chromePaths = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/opt/google/chrome/chrome'];
const chrome = process.env.CHROME || chromePaths.find(p => fs.existsSync(p));
const glArgs = args.gpu === '1' ? ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await puppeteer.launch({
  headless: 'shell', executablePath: chrome,
  args: [...glArgs, '--no-sandbox', '--disable-dev-shm-usage', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  protocolTimeout: 0,
});
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => { console.log('[pageerror]', e.message); process.exit(3); });
await page.goto(`http://localhost:${port}/index.html?w=${W}&h=${H}&msaa=${msaa}&cut=${cut}`, { waitUntil: 'load', timeout: 0 });
await page.waitForFunction('window.READY === true', { timeout: 0, polling: 200 });
const duration = await page.evaluate('window.DURATION');
fs.writeFileSync(`events_${cut}.json`, JSON.stringify(await page.evaluate('window.EVENTS'), null, 1));

async function shot(t) {
  await page.evaluate(t => window.renderFrame(t), t);
  return page.screenshot({ type: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: W, height: H } });
}

if (args.stills) {
  const dir = args.outdir || 'stills'; fs.mkdirSync(dir, { recursive: true });
  for (const s of args.stills.split(',')) { const t = +s; const buf = await shot(t); fs.writeFileSync(`${dir}/t_${t.toFixed(2)}.png`, buf); console.log('still', t); }
} else {
  const out = args.out || 'out.mp4';
  const start = +(args.start || 0), end = +(args.end || duration);
  const crf = args.crf || '16';
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((end - start) * FPS);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = start + i / FPS;
    const buf = await shot(t);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 15 === 0) { const el = (Date.now() - t0) / 1000; console.log(`frame ${i}/${n} t=${t.toFixed(2)} ${(el / (i + 1)).toFixed(2)}s/frame eta ${((n - i - 1) * el / (i + 1) / 60).toFixed(1)}min`); }
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('done', out);
}
await browser.close();
