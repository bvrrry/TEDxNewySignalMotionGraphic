// Print the approach flight's speed / height profile: node speed.js
import puppeteer from 'puppeteer';
import fs from 'fs';
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/google/chrome/chrome'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ headless: 'shell', executablePath: process.env.CHROME || chrome, protocolTimeout: 0, args: ['--use-gl=angle', '--use-angle=d3d11', '--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html?w=320&h=180&msaa=0&cut=long', { waitUntil: 'load', timeout: 0 });
await page.waitForFunction('window.READY === true', { timeout: 0, polling: 200 });
const rows = await page.evaluate(() => { const { cityShot, appLen } = window.__probe; const T = window.__dbg.TL; const out = [`path length ${appLen.toFixed(0)} m`]; let prev = cityShot(0).pos.clone();
  for (let t = 1; t <= T.approachEnd; t += 1) { const p = cityShot(t).pos; out.push(`t=${t}  speed ${p.distanceTo(prev).toFixed(0)} m/s  height ${p.y.toFixed(0)} m`); prev = p; } return out; });
console.log(rows.join('\n'));
await browser.close();
