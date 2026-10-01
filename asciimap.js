// ASCII land/sea map with the approach path: node asciimap.js x0 x1 z0 z1 step   (# land, . sea, S sand, * path, O orb, F fort)
import puppeteer from 'puppeteer';
import fs from 'fs';
const [x0, x1, z0, z1, step] = process.argv.slice(2).map(Number);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/google/chrome/chrome'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ headless: 'shell', executablePath: process.env.CHROME || chrome, protocolTimeout: 0, args: ['--use-gl=angle', '--use-angle=d3d11', '--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html?w=320&h=180&msaa=0&cut=long', { waitUntil: 'load', timeout: 0 });
await page.waitForFunction('window.READY === true', { timeout: 0, polling: 200 });
const rows = await page.evaluate((x0, x1, z0, z1, st) => { const P = window.__probe; const g = []; for (let z = z0; z <= z1; z += st) { let r = ''; for (let x = x0; x <= x1; x += st) r += P.isLand(x, z) ? (P.isSand(x, z) ? 'S' : '#') : '.'; g.push(r.split('')); }
  const mark = (x, z, c) => { const i = Math.round((z - z0) / st), j = Math.round((x - x0) / st); if (g[i] && g[i][j] !== undefined) g[i][j] = c; };
  for (let s = 0; s < P.appLen; s += st / 2) { const p = P.appCurve.getPointAt(s / P.appLen); mark(p.x, p.z, '*'); }
  mark(P.ORB.x, P.ORB.z, 'O'); mark(P.FORT.x, P.FORT.z, 'F'); mark(P.NOB.x, P.NOB.z, 'N');
  return g.map((r, i) => String(z0 + i * st).padStart(6) + ' ' + r.join('')); }, x0, x1, z0, z1, step);
console.log(`x from ${x0} to ${x1} step ${step}\n` + rows.join('\n'));
await browser.close();
