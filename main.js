// TEDxNewy "Signal" opener — Three.js scene rendered frame-by-frame (see README.md).
// Two cuts share this scene: ?cut=long (~29.5 s) and ?cut=short (7 s). Timings live in timelines.json.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import * as topojson from '/node_modules/topojson-client/src/index.js';

// ================================================================ setup
const params = new URLSearchParams(location.search);
const W = +params.get('w') || 1920, H = +params.get('h') || 1080;
const MSAA = params.has('msaa') ? +params.get('msaa') : 4;
const CUT = params.get('cut') || 'long';
const SC = H / 2160;
const TL = await (await fetch('timelines.json')).json();
const T = TL[CUT];
const DURATION = T.duration;

const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
stage.insertBefore(renderer.domElement, stage.firstChild);
const fx = document.getElementById('fx'); fx.width = W; fx.height = H;
const fxc = fx.getContext('2d');

// ================================================================ utils
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261031);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const RED_LIN = new THREE.Color(0.831, 0.0, 0.0212); // #EB0028, linear
const D2R = Math.PI / 180;
// monotone-safe Catmull-Rom over [[t, v], ...]
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length; if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
  const mono = (a, b, c) => (b - a) * (c - b) > 0;
  const tm = (i > 0 && mono(keys[i - 1][1], v0, v1)) ? (v1 - keys[i - 1][1]) / (t1 - keys[i - 1][0]) : 0;
  const tp = (i + 2 < n && mono(v0, v1, keys[i + 2][1])) ? (keys[i + 2][1] - v0) / (keys[i + 2][0] - t0) : 0;
  const m0 = tm * (t1 - t0), m1 = tp * (t1 - t0);
  const s = (t - t0) / (t1 - t0), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1;
}
// vector track with plain Catmull-Rom tangents (smooth camera paths)
function trackV(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1].clone();
  if (t >= keys[n - 1][0]) return keys[n - 1][1].clone();
  let i = 0; while (t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
  const m0 = i > 0 ? p1.clone().sub(keys[i - 1][1]).multiplyScalar((t1 - t0) / (t1 - keys[i - 1][0])) : new THREE.Vector3();
  const m1 = i + 2 < n ? keys[i + 2][1].clone().sub(p0).multiplyScalar((t1 - t0) / (keys[i + 2][0] - t0)) : new THREE.Vector3();
  const s = (t - t0) / (t1 - t0), s2 = s * s, s3 = s2 * s;
  return p0.clone().multiplyScalar(2 * s3 - 3 * s2 + 1).add(m0.multiplyScalar(s3 - 2 * s2 + s)).add(p1.clone().multiplyScalar(-2 * s3 + 3 * s2)).add(m1.multiplyScalar(s3 - s2));
}
function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const TEX_GLOW = radialTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
const TEX_SOFT = radialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
function glowSprite(color, size, intensity = 1, tex = TEX_GLOW) {
  const mat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat); s.scale.setScalar(size); return s;
}

// Screen-space thick lines ("fat strips"): polylines with per-point scalar `d`, extruded in the vertex shader.
function buildStrips(polys) { // polys: [{pts:[Vector3], d:[number], s:[number]}]
  const pos = [], prev = [], next = [], side = [], dd = [], ss = [], idx = [];
  let base = 0;
  for (const p of polys) {
    const n = p.pts.length; if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const a = p.pts[i], pa = p.pts[Math.max(i - 1, 0)], na = p.pts[Math.min(i + 1, n - 1)];
      for (const sd of [-1, 1]) { pos.push(a.x, a.y, a.z); prev.push(pa.x, pa.y, pa.z); next.push(na.x, na.y, na.z); side.push(sd); dd.push(p.d ? p.d[i] : 0); ss.push(p.s ? p.s[i] : i / (n - 1)); }
      if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    base += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(dd, 1));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1));
  g.setIndex(idx);
  return g;
}
const STRIP_VERT = /* glsl */`
  uniform float uWidth; uniform vec2 uRes; attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aD; attribute float aS;
  varying float vD; varying float vS; varying float vSide;
  void main(){ mat4 m = projectionMatrix*modelViewMatrix; vec4 c = m*vec4(position,1.); vec4 cp = m*vec4(aPrev,1.); vec4 cn = m*vec4(aNext,1.);
    vec2 sp = cp.xy/max(cp.w,1e-4), sn = cn.xy/max(cn.w,1e-4); vec2 d = (sn - sp)*uRes; float L = length(d); d = L > 1e-6 ? d/L : vec2(1.,0.);
    vec2 n = vec2(-d.y, d.x); c.xy += n * aSide * uWidth / uRes * c.w; vD = aD; vS = aS; vSide = aSide; gl_Position = c; }`;

// ================================================================ data
const txt = async f => (await fetch(f)).text();
const lines = s => s.split('\n').map(l => l.trim()).filter(l => l && l[0] !== '#');
const COAST = {}; const BREAKS = [];
for (const l of lines(await txt('data/coast.txt'))) { const [tag, ...rest] = l.split(' '); const pts = rest.map(p => p.split(',').map(Number)); if (tag === 'BREAK') BREAKS.push(pts); else COAST[tag] = pts; }
// Edited geography (see README, "Creative decisions"): the dark plateau between Fort Scratchley and the Ocean Baths is open sea,
// banging against a retaining wall with the esplanade on top; the Nobbys peninsula and breakwall are just hill and lighthouse.
function inPoly(x, z, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
const inCarve = () => false; // (the coast is left exactly as in the OpenStreetMap data; only the Nobbys peninsula is kept clear of roads and buildings)
const inNob = (x, z) => x > 430 && z < -540 && x < 2200;
const ROADS = [];
for (const l of lines(await txt('data/roads.txt'))) { const cls = +l[0]; const toks = l.slice(1).split(' '); const p0 = toks[0].split(',').map(Number); const pts = [p0]; for (let i = 1; i < toks.length; i++) { const [dx, dz] = toks[i].split(',').map(Number); const q = pts[pts.length - 1]; pts.push([q[0] + dx, q[1] + dz]); } let run = []; for (const p of pts) { if (inCarve(p[0], p[1]) || inNob(p[0], p[1])) { if (run.length > 1) ROADS.push({ cls, pts: run }); run = []; } else run.push(p); } if (run.length > 1) ROADS.push({ cls, pts: run }); }
const OSMB = lines(await txt('data/buildings.txt')).map(l => { const [h, x, z, w, d, a] = l.split(' ').map(Number); return { h, x, z, w, d, a: a / 100 }; }).filter(b => !inCarve(b.x, b.z) && !inNob(b.x, b.z));
const LAT0 = -32.9305, LON0 = 151.7870; // local-metre origin (Newcastle Beach)
const toLocal = (lat, lon) => [(lon - LON0) * 93470, (LAT0 - lat) * 110950];

// ---- land masks
// core mask (OSM, 4096 px over 6 km): R = land, G = sand, B = blurred land (shore distance proxy)
const MX0 = -4000, MX1 = 2000, MZ0 = -3000, MZ1 = 3000, MRES = 4096;
const mpx = x => (x - MX0) / (MX1 - MX0) * MRES, mpz = z => (z - MZ0) / (MZ1 - MZ0) * MRES;
function pathPoly(g, pts) { g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(mpx(x), mpz(z)) : g.moveTo(mpx(x), mpz(z))); g.closePath(); }
const cLand = document.createElement('canvas'); cLand.width = cLand.height = MRES;
{
  const g = cLand.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, MRES, MRES); g.fillStyle = '#fff';
  const c = COAST.COAST; const closed = c.concat([[2161, -9000], [-9000, -9000], [-9000, 9000], [-3430, 9000]]);
  pathPoly(g, closed); g.fill();
  g.fillStyle = '#000'; pathPoly(g, COAST.HARBOUR); g.fill();
  g.fillStyle = '#fff'; for (const b of BREAKS) { pathPoly(g, b); g.fill(); }
}
const BEACHES = [ // coastline stretches that are sand
  (x, z) => x > -275 && x < 70 && z > -95 && z < 150,       // Newcastle Beach
  (x, z) => x > 560 && x < 1060 && z > -1135 && z < -690,   // Nobbys Beach
  (x, z) => x > -1720 && x < -1240 && z > 890 && z < 1260,  // Bar Beach
  (x, z) => x < -1880 && z > 1300,                          // Merewether
  (x, z) => z < -1700 && x < 1200,                          // Stockton Beach
];
const cSand = document.createElement('canvas'); cSand.width = cSand.height = MRES;
{
  const g = cSand.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, MRES, MRES);
  g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 110 / ((MX1 - MX0) / MRES);
  const c = COAST.COAST;
  for (let i = 0; i + 1 < c.length; i++) { const [x1, z1] = c[i], [x2, z2] = c[i + 1]; if (BEACHES.some(f => f(x1, z1) && f(x2, z2))) { g.beginPath(); g.moveTo(mpx(x1), mpz(z1)); g.lineTo(mpx(x2), mpz(z2)); g.stroke(); } }
}
const cShore = document.createElement('canvas'); cShore.width = cShore.height = MRES;
{ const g = cShore.getContext('2d'); g.filter = 'blur(10px)'; g.drawImage(cLand, 0, 0); }
const cSandSoft = document.createElement('canvas'); cSandSoft.width = cSandSoft.height = 1024;
{ const g = cSandSoft.getContext('2d'); g.filter = 'blur(6px)'; g.drawImage(cSand, 0, 0, 1024, 1024); }
const sandSoftPix = new Uint8Array(1024 * 1024); { const a = cSandSoft.getContext('2d').getImageData(0, 0, 1024, 1024).data; for (let i = 0; i < 1024 * 1024; i++) sandSoftPix[i] = a[i * 4]; }
const landPix = new Uint8Array(MRES * MRES), sandPix = new Uint8Array(MRES * MRES);
let maskTex;
{
  const a = cLand.getContext('2d').getImageData(0, 0, MRES, MRES).data, b = cSand.getContext('2d').getImageData(0, 0, MRES, MRES).data, c = cShore.getContext('2d').getImageData(0, 0, MRES, MRES).data;
  const out = new Uint8Array(MRES * MRES * 4);
  for (let i = 0, j = 0; i < MRES * MRES; i++, j += 4) { landPix[i] = a[j]; sandPix[i] = b[j]; out[j] = a[j]; out[j + 1] = b[j]; out[j + 2] = c[j]; out[j + 3] = 255; }
  maskTex = new THREE.DataTexture(out, MRES, MRES, THREE.RGBAFormat); maskTex.flipY = false; maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearMipmapLinearFilter; maskTex.generateMipmaps = true; maskTex.needsUpdate = true;
}
// big mask (Natural Earth 1:10m) over +-40 km for the zoom-out and procedural suburbs
const BX = 40000, BRES = 2048;
const topo10 = await (await fetch('/node_modules/world-atlas/land-10m.json')).json();
const cBig = document.createElement('canvas'); cBig.width = cBig.height = BRES;
{
  const g = cBig.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, BRES, BRES); g.fillStyle = '#fff';
  const land = topojson.feature(topo10, topo10.objects.land);
  const bpx = (lon, lat) => { const [x, z] = toLocal(lat, lon); return [(x + BX) / (2 * BX) * BRES, (z + BX) / (2 * BX) * BRES]; };
  for (const f of land.features) { const gm = f.geometry; const polys = gm.type === 'MultiPolygon' ? gm.coordinates : [gm.coordinates];
    for (const poly of polys) { let near = false; for (const p of poly[0]) if (Math.abs(p[0] - LON0) < 1.5 && Math.abs(p[1] - LAT0) < 1.5) { near = true; break; } if (!near) continue;
      g.beginPath(); for (const ring of poly) { ring.forEach((p, i) => { const [x, y] = bpx(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } g.fill('evenodd'); } }
  // stamp the precise OSM harbour so Stockton is separated from the CBD at mid zoom
  g.fillStyle = '#000'; g.beginPath(); COAST.HARBOUR.forEach(([x, z], i) => { const px = (x + BX) / (2 * BX) * BRES, pz = (z + BX) / (2 * BX) * BRES; i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.closePath(); g.fill();
}
const bigPix = new Uint8Array(BRES * BRES);
{ const a = cBig.getContext('2d').getImageData(0, 0, BRES, BRES).data; for (let i = 0; i < BRES * BRES; i++) bigPix[i] = a[i * 4]; }
const bigTex = new THREE.CanvasTexture(cBig); bigTex.colorSpace = THREE.NoColorSpace;
const inCore = (x, z) => x > MX0 + 5 && x < MX1 - 5 && z > MZ0 + 5 && z < MZ1 - 5;
function isLand(x, z) {
  if (inCore(x, z)) { const i = Math.floor(mpz(z)) * MRES + Math.floor(mpx(x)); return landPix[i] > 127; }
  const px = Math.floor((x + BX) / (2 * BX) * BRES), pz = Math.floor((z + BX) / (2 * BX) * BRES);
  if (px < 0 || pz < 0 || px >= BRES || pz >= BRES) return false;
  return bigPix[pz * BRES + px] > 127;
}
const isSand = (x, z) => inCore(x, z) ? sandPix[Math.floor(mpz(z)) * MRES + Math.floor(mpx(x))] > 60 : false;
// terrain (hand-tuned hills: Nobbys head, Flagstaff Hill, The Hill, Shepherds Hill, Cooks Hill)
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
function terrainH(x, z) {
  let h = 26 * gauss(x, z, 1095, -1300, 45) + 30 * gauss(x, z, 425, -530, 80) + 50 * gauss(x, z, -560, 170, 210)
    + 40 * gauss(x, z, -880, 630, 190) + 24 * gauss(x, z, -1500, 850, 420) + 18 * gauss(x, z, -3200, 1600, 1400)
    + 10 * gauss(x, z, -6000, -4000, 3000) + 25 * gauss(x, z, -9000, 2000, 6000);
  h += 3 * Math.sin(x * 0.0021 + 1.3) * Math.sin(z * 0.0017 - 0.4);
  h *= 0.15 + 0.85 * smooth(90, 320, Math.hypot(x + 94, z + 42)); // keep Newcastle Beach flat around the orb
  return Math.max(0.4, h);
}
function sandSoft(x, z) { if (!inCore(x, z)) return 0; const px = Math.floor((x - MX0) / (MX1 - MX0) * 1024), pz = Math.floor((z - MZ0) / (MZ1 - MZ0) * 1024); return clamp(sandSoftPix[pz * 1024 + px] / 160); }
function groundY(x, z) { return lerp(terrainH(x, z), 0.5, sandSoft(x, z)); }

// shared uniforms
const U = {
  uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
  uFogColor: { value: new THREE.Color(0.007, 0.005, 0.011) }, uFogDensity: { value: 0.001 },
  uOrbPos: { value: new THREE.Vector3() }, uOrbI: { value: 0 }, uFront: { value: -1e9 },
  uWidthScale: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) }, uMask: { value: maskTex }, uBig: { value: bigTex },
};
const GLSL_COMMON = /* glsl */`
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec3 uOrbPos; uniform float uOrbI; uniform float uFront; uniform sampler2D uMask; uniform sampler2D uBig;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 maskUV(vec2 xz){ return vec2((xz.x - (${MX0}.0)) / ${MX1 - MX0}.0, (xz.y - (${MZ0}.0)) / ${MZ1 - MZ0}.0); }
bool inCoreRect(vec2 xz){ return xz.x > ${MX0 + 5}.0 && xz.x < ${MX1 - 5}.0 && xz.y > ${MZ0 + 5}.0 && xz.y < ${MZ1 - 5}.0; }
vec2 bigUV(vec2 xz){ return (xz + ${BX}.0) / ${2 * BX}.0; }
vec3 applyFog(vec3 c, vec3 w){ float d = length(w - uCamPos); float f = 1.0 - exp(-pow(d*uFogDensity, 2.0)); return mix(c, uFogColor, f); }
`;

// ================================================================ CITY
const city = new THREE.Scene(); city.background = new THREE.Color(0, 0, 0);
const cityCam = new THREE.PerspectiveCamera(38, W / H, 0.1, 60000);

// ---- sky
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
  uniforms: { ...U }, side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: GLSL_COMMON + `varying vec3 vW;
  void main(){ vec3 d = normalize(vW - uCamPos); float h = d.y;
    float east = 0.35 + 0.65*smoothstep(-0.6, 1.0, dot(normalize(d.xz + vec2(1e-5)), normalize(vec2(0.55, 0.3))));
    vec3 col = vec3(0.0022,0.0026,0.0055) + vec3(0.005,0.006,0.014)*(0.35 + 0.65*smoothstep(-0.2, 0.7, h)) + vec3(0.14,0.005,0.012)*exp(-abs(h)*9.0)*east + vec3(0.022,0.0,0.005)*exp(-abs(h)*2.5);
    vec3 q = d*420.0; vec3 cell = floor(q); float r = hash12(cell.xy + cell.z*17.0);
    vec3 f = fract(q) - 0.5; float st = step(0.985, r) * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.02, 0.25, h);
    col += vec3(0.5,0.5,0.6)*st*(0.3+0.7*fract(r*91.0));
    gl_FragColor = vec4(col,1.); }`
}));
sky.frustumCulled = false; sky.renderOrder = -10; city.add(sky);

// ---- ocean (foam from the blurred OSM coastline)
const oceanMat = new THREE.ShaderMaterial({
  uniforms: { ...U },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: GLSL_COMMON + `varying vec3 vW;
  vec2 waveGrad(vec2 p, float t){ vec2 g = vec2(0.);
    vec2 d1 = normalize(vec2(-0.55,-0.85)); float k1 = 0.09; g += d1*k1*cos(dot(p,d1)*k1 + t*1.1) * 0.9;
    vec2 d2 = normalize(vec2(-0.9,-0.45)); float k2 = 0.21; g += d2*k2*cos(dot(p,d2)*k2 + t*1.7) * 0.45;
    vec2 d3 = normalize(vec2(-0.3, 1.0)); float k3 = 0.55; g += d3*k3*cos(dot(p,d3)*k3 + t*2.6) * 0.18;
    vec2 d4 = normalize(vec2(0.8, 0.6)); float k4 = 1.3; g += d4*k4*cos(dot(p,d4)*k4 + t*3.9) * 0.07;
    vec2 d5 = normalize(vec2(-0.2,-1.0)); float k5 = 2.9; g += d5*k5*cos(dot(p,d5)*k5 + t*5.3) * 0.03;
    return g; }
  void main(){
    float dist = length(vW - uCamPos);
    float amp = 0.55 / (1.0 + dist*0.004);
    vec2 g = waveGrad(vW.xz, uTime) * amp;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(uCamPos - vW); vec3 R = reflect(-V, n);
    float fres = 0.02 + 0.98*pow(1.0 - max(dot(n, V), 0.0), 5.0);
    float h = max(R.y, 0.0);
    float east = 0.35 + 0.65*smoothstep(-0.6, 1.0, dot(normalize(R.xz + vec2(1e-4)), normalize(vec2(0.55, 0.3))));
    vec3 skyc = vec3(0.0022,0.0026,0.0055) + vec3(0.008,0.009,0.02)*(0.4 + 0.6*h) + vec3(0.17,0.006,0.013)*exp(-h*9.0)*east;
    vec3 col = vec3(0.0032,0.0048,0.0085)*(1.0-fres) + skyc*fres;
    col += vec3(0.35,0.38,0.55) * pow(max(dot(R, normalize(vec3(-0.35,0.45,-0.45))), 0.0), 140.0) * 0.4; // moon glints on the swell
    vec3 L = uOrbPos - vW; float dl = length(L); L /= max(dl, 1e-3);
    col += vec3(1.0,0.12,0.15) * pow(max(dot(R, L), 0.0), 120.0) * 40.0 / (1.0 + dl*dl*0.004) * uOrbI;
    if (inCoreRect(vW.xz)) {
      vec4 m = texture2D(uMask, maskUV(vW.xz));
      float shore = m.b;
      float near = smoothstep(0.0, 0.08, shore) * (1.0 - smoothstep(0.35, 0.55, shore));
      float ph = shore*55.0 - uTime*1.6 + sin(vW.x*0.03 + vW.z*0.02)*1.2;
      float foam = smoothstep(0.8, 1.0, sin(ph)) * near;
      float wash = smoothstep(0.3, 0.5, shore) * (0.6 + 0.4*sin(uTime*0.9 + vW.z*0.02 + vW.x*0.013));
      col += vec3(0.03,0.028,0.032) * (foam + wash*0.5);
    }
    col = applyFog(col, vW);
    gl_FragColor = vec4(col, 1.);
  }`
});
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000, 400, 400).rotateX(-Math.PI / 2).translate(0, -0.05, 0), oceanMat); city.add(ocean);

// ---- land: precise core grid + coarse outer grid, both clipped by masks in the fragment shader
const landMat = (core) => new THREE.ShaderMaterial({
  uniforms: { ...U },
  vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN = normal; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: GLSL_COMMON + `varying vec3 vW; varying vec3 vN;
  void main(){
    float sand = 0.0, shore = 1.0;
    ${core ? `vec4 m = texture2D(uMask, maskUV(vW.xz)); if (m.r < 0.5 && vW.y < 0.9) discard; sand = m.g; shore = m.b;`
           : `if (inCoreRect(vW.xz)) discard; if (texture2D(uBig, bigUV(vW.xz)).r < 0.5) discard;`}
    vec3 n = normalize(vN);
    vec3 col = vec3(0.0072,0.0072,0.0100) * (0.7 + 0.3*n.y) + vec3(0.003,0.0,0.001)*(1.0-n.y)*4.0;
    vec3 sandC = vec3(0.043,0.035,0.033) * (0.85 + 0.3*hash12(floor(vW.xz*6.0)));
    sandC *= mix(0.35, 1.0, smoothstep(0.52, 0.72, shore));
    col = mix(col, sandC, smoothstep(0.2, 0.6, sand));
    vec3 L = uOrbPos - vW; float d2 = dot(L,L);
    col += vec3(0.83,0.02,0.04) * uOrbI * 22.0 / (d2 + 6.0) * max(dot(n, normalize(L)), 0.0);
    col = applyFog(col, vW);
    gl_FragColor = vec4(col,1.);
  }`
});
{
  const seg = 600; const g = new THREE.PlaneGeometry(MX1 - MX0, MZ1 - MZ0, seg, seg).rotateX(-Math.PI / 2);
  g.translate((MX0 + MX1) / 2, 0, (MZ0 + MZ1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, isLand(x, z) ? groundY(x, z) : -2.0); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, landMat(true)); m.frustumCulled = false; city.add(m);
}
{
  const S = 90000, seg = 360; const g = new THREE.PlaneGeometry(S, S, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, isLand(x, z) ? terrainH(x, z) : 0.2); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, landMat(false)); m.frustumCulled = false; city.add(m);
}

// ================================================================ street network (real OSM streets + organic suburbs)
const nodes = []; const nodeKey = new Map();
function nodeAt(x, z) { const k = Math.round(x / 3) + ',' + Math.round(z / 3); let id = nodeKey.get(k); if (id === undefined) { id = nodes.length; nodes.push({ x, z, adj: [] }); nodeKey.set(k, id); } return id; }
const edges = []; // [a, b, len, cls]
function addEdge(a, b, cls) { if (a === b) return; const L = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); edges.push([a, b, L, cls]); nodes[a].adj.push([b, L]); nodes[b].adj.push([a, L]); }
for (const r of ROADS) { let prev = -1; for (const [x, z] of r.pts) { const id = nodeAt(x, z); if (prev >= 0) addEdge(prev, id, r.cls); prev = id; } }
// heal gaps in the simplified OSM data: join dead ends to the nearest node within 25 m
{
  const n0 = nodes.length, g = new Map(), key = (x, z) => Math.floor(x / 25) + ',' + Math.floor(z / 25);
  nodes.forEach((n, k) => { const kk = key(n.x, n.z); if (!g.has(kk)) g.set(kk, []); g.get(kk).push(k); });
  for (let k = 0; k < n0; k++) { const n = nodes[k]; if (n.adj.length !== 1) continue; let best = -1, bd = 25 * 25;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of g.get((Math.floor(n.x / 25) + dx) + ',' + (Math.floor(n.z / 25) + dz)) || []) {
      if (j === k || n.adj.some(([v]) => v === j)) continue; const d = (nodes[j].x - n.x) ** 2 + (nodes[j].z - n.z) ** 2; if (d < bd) { bd = d; best = j; } }
    if (best >= 0) addEdge(k, best, 4); }
}
{ // Shortland Esplanade along the real coast, from the fort round to Nobbys Beach
  const c = COAST.COAST, n0 = nodes.length; let prev = -1, first = -1;
  const inZone = (x, z) => x > 400 && x < 1150 && z > -1230 && z < -470;
  for (let i = 0; i + 1 < c.length; i++) { const [x1, z1] = c[i], [x2, z2] = c[i + 1];
    if (!inZone(x1, z1) || !inZone(x2, z2)) { prev = -1; continue; }
    const L = Math.hypot(x2 - x1, z2 - z1) || 1, nx = -(z2 - z1) / L, nz = (x2 - x1) / L, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, sg = isLand(mx + nx * 12, mz + nz * 12) ? 1 : -1;
    for (let sd = 0; sd < L; sd += 26) { const x = x1 + (x2 - x1) * sd / L + nx * sg * 14, z = z1 + (z2 - z1) * sd / L + nz * sg * 14; if (!isLand(x, z)) { prev = -1; continue; }
      const id = nodeAt(x, z); if (first < 0) first = id; if (prev >= 0 && prev !== id) addEdge(prev, id, 8); prev = id; } }
  if (first >= 0) { let b = -1, bd = 1e18; for (let k = 0; k < n0; k++) { const d = (nodes[k].x - nodes[first].x) ** 2 + (nodes[k].z - nodes[first].z) ** 2; if (d < bd) { bd = d; b = k; } } if (b >= 0) addEdge(first, b, 8); }
}
const realCount = nodes.length;
const CITY_C = V3(-900, 0, 150);
const REAL_R = { x0: -2800, x1: 1300, z0: -1150, z1: 1500 };
const inReal = (x, z, m = 0) => x > REAL_R.x0 + m && x < REAL_R.x1 - m && z > REAL_R.z0 + m && z < REAL_R.z1 - m;
{
  const outer = [];
  for (let i = 0; i < 9000 && outer.length < 5200; i++) {
    const r = 1300 * Math.pow(16000 / 1300, rng()), th = rng() * Math.PI * 2;
    const x = CITY_C.x + Math.cos(th) * r, z = CITY_C.z + Math.sin(th) * r;
    if (inReal(x, z, 120) || !isLand(x, z) || inNob(x, z)) continue;
    outer.push(nodeAt(x, z));
  }
  const cand = outer.concat(nodes.map((n, k) => k).filter(k => k < realCount && !inReal(nodes[k].x, nodes[k].z, 250)));
  const cell = 400, grid = new Map();
  for (const k of cand) { const key = Math.floor(nodes[k].x / cell) + ',' + Math.floor(nodes[k].z / cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); }
  const seen = new Set();
  for (const k of outer) {
    const n = nodes[k]; const cx = Math.floor(n.x / cell), cz = Math.floor(n.z / cell); const near = [];
    for (let rr = 1; rr <= 4 && near.length < 6; rr++) { near.length = 0; for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) for (const j of grid.get((cx + dx) + ',' + (cz + dz)) || []) if (j !== k) near.push([j, Math.hypot(nodes[j].x - n.x, nodes[j].z - n.z)]); }
    near.sort((a, b) => a[1] - b[1]);
    let made = 0;
    for (const [j, d] of near) { if (made >= 3) break; if (inNob(nodes[j].x, nodes[j].z)) continue; const key = k < j ? k + '_' + j : j + '_' + k; if (seen.has(key)) { made++; continue; }
      let landN = 0; for (const f of [0.2, 0.4, 0.5, 0.6, 0.8]) if (isLand(lerp(n.x, nodes[j].x, f), lerp(n.z, nodes[j].z, f))) landN++;
      if (landN < 4 && !(landN >= 2 && d < 900)) continue;
      seen.add(key); addEdge(k, j, 9); made++; }
  }
}
const nearestNode = (x, z, maxK = nodes.length) => { let b = -1, bd = 1e18; for (let k = 0; k < maxK; k++) { const d = (nodes[k].x - x) ** 2 + (nodes[k].z - z) ** 2; if (d < bd) { bd = d; b = k; } } return b; };
function dijkstra(src) {
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
  dist[src] = 0; const heap = [[0, src]];
  const push = e => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) { const [d, u] = pop(); if (done[u]) continue; done[u] = 1; for (const [v, L] of nodes[u].adj) if (d + L < dist[v]) { dist[v] = d + L; prev[v] = u; push([dist[v], v]); } }
  return { dist, prev };
}
// the orb is born in the sand of Newcastle Beach; the signal then runs out along the nearest street (the esplanade)
const ORB = V3(-94, 0, -42);
ORB.y = groundY(ORB.x, ORB.z);
const IMPACT = nearestNode(ORB.x, ORB.z, realCount);
const { dist } = dijkstra(IMPACT);
const IMPACT_OFF = Math.hypot(nodes[IMPACT].x - ORB.x, nodes[IMPACT].z - ORB.z); // beach to first street, so the front starts at the orb
let maxDist = 0; for (const d of dist) if (isFinite(d)) maxDist = Math.max(maxDist, d);

// roads: ribbons on the terrain, dark until the signal front reaches them
const roadMat = new THREE.ShaderMaterial({
  uniforms: { ...U }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: GLSL_COMMON + `
  uniform float uWidthScale; attribute vec2 aDir; attribute float aSide; attribute float aD; attribute float aW;
  varying float vD; varying float vSide; varying vec3 vW;
  void main(){ vec3 p = position; vec2 perp = vec2(-aDir.y, aDir.x);
    p.xz += perp * aSide * aW * uWidthScale * 0.5;
    vec4 wp = modelMatrix*vec4(p,1.); vW = wp.xyz; vD = aD; vSide = aSide; gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: GLSL_COMMON + `varying float vD; varying float vSide; varying vec3 vW;
  void main(){
    float edge = 1.0 - vSide*vSide;
    float x = uFront - vD;
    vec3 red = vec3(0.831,0.0,0.03);
    vec3 col = vec3(0.012,0.006,0.007);
    float headW = 25.0 + max(uFront, 0.0)*0.02;
    float head = exp(-pow(x/headW, 2.0));
    float lit = step(0.0, x);
    col += red * lit * (0.38 + 0.6*exp(-max(x,0.0)/(150.0 + max(uFront, 0.0)*0.05)));
    col += vec3(1.0,0.35,0.35) * head * 0.8 * smoothstep(8.0, 60.0, length(vW-uCamPos));
    col *= edge * (0.25 + 0.75*smoothstep(6.0, 70.0, length(vW-uCamPos)));
    float fogK = 1.0 - exp(-pow(length(vW-uCamPos)*uFogDensity, 2.0));
    col *= (1.0 - fogK*0.85);
    gl_FragColor = vec4(col, 1.0);
  }`
});
const WIDTH = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 8: 4, 9: 4.5 };
{
  const pos = [], dir = [], side = [], dd = [], ww = [], idx = []; let vi = 0;
  for (const [a, b, L, cls] of edges) {
    const A = nodes[a], B = nodes[b]; if (!isFinite(dist[a]) && !isFinite(dist[b])) continue;
    const dx = (B.x - A.x) / L, dz = (B.z - A.z) / L;
    const n = Math.max(1, Math.ceil(L / (cls === 9 ? 40 : 12)));
    for (let k = 0; k <= n; k++) {
      const s = L * k / n, x = A.x + dx * s, z = A.z + dz * s;
      const d = Math.min(dist[a] + s, dist[b] + (L - s));
      const y = (isLand(x, z) ? groundY(x, z) : 0.3) + 0.45;
      for (const sd of [-1, 1]) { pos.push(x, y, z); dir.push(dx, dz); side.push(sd); dd.push(d); ww.push(WIDTH[cls] || 3); }
      if (k < n) idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      vi += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1)); g.setAttribute('aD', new THREE.Float32BufferAttribute(dd, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(ww, 1)); g.setIndex(idx);
  const m = new THREE.Mesh(g, roadMat); m.frustumCulled = false; m.renderOrder = 2; city.add(m);
}
// street lights along the real streets: warm, turning red as the signal passes
const lampMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uPx: { value: H / 1080 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: GLSL_COMMON + `uniform float uPx; attribute float aD; varying float vA; varying float vLit;
  void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); float x = uFront - aD; vLit = step(0.0, x);
    vA = 0.55 + 2.0*vLit*exp(-max(x,0.0)/50.0);
    gl_PointSize = clamp(uPx * 3.2 * (220.0 / -mv.z), 0.0, uPx*14.0); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; varying float vLit; void main(){ float r = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,r); a*=a; vec3 c = mix(vec3(1.0,0.55,0.25)*0.7, vec3(1.0,0.12,0.18), vLit); gl_FragColor = vec4(c*a*vA, 1.0); }`
});
{
  const p = [], d = [];
  for (const [a, b, L, cls] of edges) { if (cls >= 8 || !isFinite(dist[a])) continue; const A = nodes[a], B = nodes[b]; const n = Math.floor(L / 34);
    for (let k = 0; k < n; k++) { const s = (k + 0.5) / n; const x = lerp(A.x, B.x, s), z = lerp(A.z, B.z, s); p.push(x, groundY(x, z) + 7, z); d.push(Math.min(dist[a] + s * L, dist[b] + (1 - s) * L)); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('aD', new THREE.Float32BufferAttribute(d, 1));
  const pts = new THREE.Points(g, lampMat); pts.frustumCulled = false; pts.renderOrder = 3; city.add(pts);
}
// junction pulses
const nodeMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uPx: { value: H / 1080 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: GLSL_COMMON + `uniform float uPx; attribute float aD; varying float vA;
  void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); float x = uFront - aD;
    vA = step(0.0,x) * (0.2 + 2.2*exp(-max(x,0.0)/60.0));
    gl_PointSize = clamp(uPx * 8.0 * (300.0 / -mv.z) * (1.0 + 2.0*exp(-max(x,0.0)/40.0)), 0.0, uPx*26.0);
    gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,r); a *= a; gl_FragColor = vec4(vec3(1.0,0.2,0.25)*a*vA, 1.0); }`
});
{
  const p = [], d = []; nodes.forEach((n, k) => { if (isFinite(dist[k]) && n.adj.length > 2) { p.push(n.x, (isLand(n.x, n.z) ? groundY(n.x, n.z) : 0.3) + 0.8, n.z); d.push(dist[k]); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('aD', new THREE.Float32BufferAttribute(d, 1));
  const pts = new THREE.Points(g, nodeMat); pts.frustumCulled = false; pts.renderOrder = 3; city.add(pts);
}

// ================================================================ buildings
const bld = []; // {x,z,w,d,h,a,base,dist}
const occ = new Set(); const occKey = (x, z) => Math.floor(x / 9) + ',' + Math.floor(z / 9);
const distGrid = new Map(); nodes.forEach((n, k) => { if (!isFinite(dist[k])) return; const key = Math.floor(n.x / 60) + ',' + Math.floor(n.z / 60); if (!distGrid.has(key)) distGrid.set(key, []); distGrid.get(key).push(k); });
function nodeDistAt(x, z) {
  let best = Infinity;
  for (let rr = 1; rr <= 3 && !isFinite(best); rr++) for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) for (const j of distGrid.get((Math.floor(x / 60) + dx) + ',' + (Math.floor(z / 60) + dz)) || []) best = Math.min(best, dist[j] + Math.hypot(nodes[j].x - x, nodes[j].z - z));
  return best;
}
const OSM_BOX = { x0: -1589, x1: 841, z0: -833, z1: 665 };
for (const b of OSMB) {
  let h = b.h;
  if (!h) { const cbd = b.x > -1300 && b.z < -80; h = cbd ? 8 + rng() * 10 : 4.5 + rng() * 3.5; }
  bld.push({ x: b.x, z: b.z, w: b.w, d: b.d, h, a: b.a, base: groundY(b.x, b.z), dist: nodeDistAt(b.x, b.z) + rng() * 15 });
  const c = Math.cos(b.a), s = Math.sin(b.a);
  for (let u = -b.w / 2; u <= b.w / 2; u += 6) for (let v = -b.d / 2; v <= b.d / 2; v += 6) occ.add(occKey(b.x + u * c - v * s, b.z + u * s + v * c));
}
for (const [a, b, L, cls] of edges) { // procedural buildings lining real streets outside the OSM footprint area
  if (cls >= 8) continue; const A = nodes[a], B = nodes[b]; const dx = (B.x - A.x) / L, dz = (B.z - A.z) / L; const ang = Math.atan2(dz, dx);
  for (let s = 8; s < L - 8; s += 13) for (const sd of [-1, 1]) {
    const off = (WIDTH[cls] || 3) / 2 + 9 + rng() * 5;
    const x = A.x + dx * s - dz * off * sd, z = A.z + dz * s + dx * off * sd;
    if (x > OSM_BOX.x0 && x < OSM_BOX.x1 && z > OSM_BOX.z0 && z < OSM_BOX.z1) continue;
    if (!isLand(x, z) || isSand(x, z) || occ.has(occKey(x, z))) continue;
    occ.add(occKey(x, z));
    const big = cls <= 2 && rng() < 0.35;
    bld.push({ x, z, w: big ? 14 + rng() * 10 : 8 + rng() * 5, d: big ? 14 + rng() * 10 : 9 + rng() * 6, h: big ? 8 + rng() * 10 : 4 + rng() * 4, a: ang, base: groundY(x, z), dist: nodeDistAt(x, z) + rng() * 10 });
  }
}
for (const [a, b, L, cls] of edges) { // suburb houses along the organic outer edges
  if (cls !== 9) continue; const A = nodes[a], B = nodes[b]; const r = Math.hypot(A.x - CITY_C.x, A.z - CITY_C.z); if (r > 7000) continue;
  const step = 26 + r * 0.008; const dx = (B.x - A.x) / L, dz = (B.z - A.z) / L; const ang = Math.atan2(dz, dx);
  for (let s = 10; s < L - 10; s += step) for (const sd of [-1, 1]) {
    if (rng() < 0.35) continue;
    const off = 12 + rng() * 6; const x = A.x + dx * s - dz * off * sd, z = A.z + dz * s + dx * off * sd;
    if (!isLand(x, z) || occ.has(occKey(x, z))) continue; occ.add(occKey(x, z));
    bld.push({ x, z, w: 8 + rng() * 6, d: 9 + rng() * 6, h: 4 + rng() * 3.5, a: ang, base: inCore(x, z) ? groundY(x, z) : terrainH(x, z), dist: Math.min(dist[a] + s, dist[b] + L - s) + rng() * 20 });
  }
}
const bldMat = new THREE.ShaderMaterial({
  uniforms: { ...U },
  vertexShader: GLSL_COMMON + `attribute float aRand; attribute float aDist; attribute float aH; attribute float aBase;
  varying vec3 vW; varying vec3 vN; varying float vRand; varying float vDist; varying float vY; varying float vH; varying float vBase;
  void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position,1.); vW = w.xyz;
    vN = normalize(mat3(instanceMatrix)*normal); vRand = aRand; vDist = aDist; vY = position.y; vH = aH; vBase = aBase;
    gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: GLSL_COMMON + `varying vec3 vW; varying vec3 vN; varying float vRand; varying float vDist; varying float vY; varying float vH; varying float vBase;
  void main(){
    vec3 n = normalize(vN);
    vec3 col = vec3(0.0105,0.011,0.015) * (0.55 + 0.45*max(n.y,0.0) + 0.12*n.x);
    float since = uFront - vDist;
    float act = smoothstep(0.0, 80.0, since);
    float flash = step(0.0, since) * exp(-max(since,0.0)/70.0);
    if (abs(n.y) < 0.5) {
      vec2 t2 = normalize(vec2(-n.z, n.x) + vec2(1e-5));
      float u = dot(vW.xz, t2);
      vec2 q = vec2(u/2.9, (vW.y - vBase)/3.4);
      vec2 cell = floor(q); vec2 f = fract(q);
      float win = step(0.2,f.x)*step(f.x,0.8)*step(0.28,f.y)*step(f.y,0.78);
      float h = hash12(cell + vec2(vRand*131.0, vRand*57.0) + n.xz*7.0);
      float lit = step(0.77, h), red = step(0.955, h);
      vec3 wc = mix(vec3(1.0,0.58,0.24)*0.5, vec3(1.0,0.2,0.07)*1.25, red);
      float lit2 = step(0.55, h) * act;
      vec3 wcol = wc*lit + vec3(1.0,0.24,0.07)*lit2*0.75 + vec3(1.0,0.4,0.26)*flash*step(0.3,h)*0.7;
      float aa = clamp(1.0 - (fwidth(q.x)+fwidth(q.y))*0.9, 0.0, 1.0);
      vec3 avg = (wc*0.2 + vec3(1.0,0.24,0.07)*0.45*0.75*act + vec3(1.0,0.4,0.26)*flash*0.7*0.7)*0.3;
      col += mix(avg, win*wcol, aa) * step(0.4, q.y);
      col += vec3(0.831,0.0,0.03) * smoothstep(0.985, 1.0, vY) * (0.04 + 0.6*act + 1.5*flash) * step(7.0, vH);
    } else col += vec3(0.831,0.0,0.03) * flash * 0.15;
    vec3 L = uOrbPos - vW; float d2 = dot(L,L);
    col += vec3(0.9,0.05,0.07) * uOrbI * 30.0 / (d2 + 20.0) * max(dot(n, normalize(L)), 0.0);
    col = applyFog(col, vW);
    gl_FragColor = vec4(col,1.);
  }`
});
{
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(box, bldMat, bld.length);
  const aR = new Float32Array(bld.length), aD = new Float32Array(bld.length), aH = new Float32Array(bld.length), aB = new Float32Array(bld.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = V3(0, 1, 0);
  bld.forEach((b, k) => { const sink = 5; q.setFromAxisAngle(up, -b.a); sc.set(b.w, b.h + sink, b.d); ps.set(b.x, b.base - sink, b.z); m.compose(ps, q, sc); mesh.setMatrixAt(k, m); aR[k] = rng(); aD[k] = isFinite(b.dist) ? b.dist : 1e9; aH[k] = b.h; aB[k] = b.base; });
  box.setAttribute('aRand', new THREE.InstancedBufferAttribute(aR, 1)); box.setAttribute('aDist', new THREE.InstancedBufferAttribute(aD, 1));
  box.setAttribute('aH', new THREE.InstancedBufferAttribute(aH, 1)); box.setAttribute('aBase', new THREE.InstancedBufferAttribute(aB, 1));
  mesh.frustumCulled = false; city.add(mesh);
}

// ================================================================ landmarks
city.add(new THREE.HemisphereLight(0x4a4a72, 0x140e10, 0.65));
const moonL = new THREE.DirectionalLight(0x7888b8, 0.55); moonL.position.set(-250, 300, 200); city.add(moonL);
const dirL = new THREE.DirectionalLight(0xff3040, 0.25); dirL.position.set(-100, 60, 40); city.add(dirL);
const rimL = new THREE.DirectionalLight(0xff4050, 1.6); rimL.position.set(300, 60, -400); city.add(rimL);
const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.85, flatShading: true });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, emissive: 0x1c1712, emissiveIntensity: 0.5, roughness: 0.9, flatShading: true });
function pitchedRoof(w, d) { const g = new THREE.CylinderGeometry(0.01, d * 0.66, w, 4, 1).rotateY(Math.PI / 4).rotateZ(Math.PI / 2); g.scale(1, 0.42, 1); return g; }
// Nobbys lighthouse + cottages + rotating beam
const NOB = V3(1066, 0, -1324); NOB.y = terrainH(NOB.x, NOB.z);
{
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xbfbab0, emissive: 0xa8a49c, emissiveIntensity: 0.9, roughness: 0.6 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.3, 9.8, 20), towerMat); tower.position.set(NOB.x, NOB.y + 4.9, NOB.z); city.add(tower);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 20), darkMat); gallery.position.set(NOB.x, NOB.y + 9.9, NOB.z); city.add(gallery);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.8, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.2) })); cap.position.set(NOB.x, NOB.y + 11, NOB.z); city.add(cap);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkMat); dome.position.set(NOB.x, NOB.y + 11.9, NOB.z); city.add(dome);
  const lamp = glowSprite(0xfff0dd, 22, 1.5);
  const base = glowSprite(0xffe6c0, 26, 0.35, TEX_SOFT); base.position.set(NOB.x, NOB.y + 5, NOB.z); city.add(base); // the tower stands in its own soft light lamp.position.set(NOB.x, NOB.y + 11, NOB.z); city.add(lamp);
}
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vL; varying vec3 vN; varying vec3 vV; void main(){ float a = pow(vL, 2.2) * 0.035 * pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(vec3(1.0,0.9,0.8)*a, 1.0); }`
});
const beam = new THREE.Group(); beam.position.set(NOB.x, NOB.y + 11, NOB.z); city.add(beam);
{ const c = new THREE.Mesh(new THREE.ConeGeometry(30, 700, 32, 1, true), beamMat); c.rotation.z = Math.PI / 2; c.position.x = 350; beam.add(c); const c2 = c.clone(); c2.position.x = -350; c2.rotation.z = -Math.PI / 2; beam.add(c2); }
// Fort Scratchley on Flagstaff Hill: rampart ring, barracks, gun pits facing the sea, flagstaff, observation post — floodlit
const FORT = V3(412, 0, -522); FORT.y = terrainH(FORT.x, FORT.z);
{
  const ring = [[-62, -10], [-40, -48], [10, -60], [58, -34], [66, 12], [36, 50], [-18, 56], [-58, 28]];
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes.push(new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x * 0.86, -z * 0.86)).reverse()));
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 4.2, bevelEnabled: false }).rotateX(-Math.PI / 2), stoneMat); wall.position.set(FORT.x, FORT.y - 2.5, FORT.z); city.add(wall);
  const parade = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x * 0.86, -z * 0.86)))).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1 }));
  parade.position.set(FORT.x, FORT.y + 0.3, FORT.z); city.add(parade);
  const bMat = new THREE.MeshStandardMaterial({ color: 0x6e645a, emissive: 0x2e2620, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });
  for (const [dx, dz, w, d, r] of [[-22, -18, 30, 9, 0.35], [-26, 14, 24, 8, 0.2], [8, 26, 20, 8, -0.3], [22, -22, 14, 8, 0.9]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), bMat); b.position.set(FORT.x + dx, FORT.y + 2.1, FORT.z + dz); b.rotation.y = r; city.add(b);
    const roof = new THREE.Mesh(pitchedRoof(w, d), darkMat); roof.position.set(b.position.x, b.position.y + 2.7, b.position.z); roof.rotation.y = r; city.add(roof);
    const wl = glowSprite(0xffc890, 4, 0.7); wl.position.copy(b.position); city.add(wl);
  }
  for (const [dx, dz, yaw] of [[38, -8, 0.4], [44, 14, 0.05], [24, -38, 0.8]]) {
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 1.6, 24, 1, true), stoneMat); pit.position.set(FORT.x + dx, FORT.y + 0.8, FORT.z + dz); city.add(pit);
    const gun = new THREE.Group(); gun.position.set(FORT.x + dx, FORT.y + 1.4, FORT.z + dz); gun.rotation.y = -yaw; city.add(gun);
    const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 12).rotateZ(Math.PI / 2), darkMat); brl.position.x = 3; brl.rotation.z = 0.12; gun.add(brl);
    gun.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 3.2), darkMat));
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 22, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x555555, emissiveIntensity: 0.4 }));
  pole.position.set(FORT.x - 4, FORT.y + 11, FORT.z - 4); city.add(pole);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 6).rotateZ(Math.PI / 2), darkMat); yard.position.set(FORT.x - 4, FORT.y + 18, FORT.z - 4); city.add(yard);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4, 8, 1), new THREE.MeshStandardMaterial({ color: 0x220306, emissive: 0x3a0308, side: THREE.DoubleSide })); flag.position.set(FORT.x - 1.8, FORT.y + 20.6, FORT.z - 4); city.add(flag); window.__flag = flag;
  const fl = glowSprite(RED_LIN, 7, 2); fl.position.set(FORT.x - 4, FORT.y + 22.5, FORT.z - 4); city.add(fl);
  const op = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 7), bMat); op.position.set(FORT.x - 1, FORT.y + 3, FORT.z - 30); city.add(op);
  const opw = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.8, 7.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.3, 0.15) })); opw.position.set(FORT.x - 1, FORT.y + 4.5, FORT.z - 30); city.add(opw);
  for (let i = 0; i < 8; i++) { const [x, z] = ring[i]; const s = glowSprite(0xffd8b0, 10, 0.4, TEX_SOFT); s.position.set(FORT.x + x * 1.02, FORT.y + 1.5, FORT.z + z * 1.02); city.add(s); }
}
for (const b of BREAKS) city.add(new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(b.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 3, bevelEnabled: false }).rotateX(-Math.PI / 2), darkMat));
// Newcastle Ocean Baths + Canoe Pool
{
  const poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.011, 0.031, 0.04) });
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.105, 0.1) });
  for (const [x, z, w, d, a, round] of [[368, -98, 52, 26, -0.33, false], [262, -58, 56, 56, 0, true]]) {
    const g = new THREE.Group(); g.position.set(x, groundY(x, z) + 0.25, z); g.rotation.y = -a; city.add(g);
    g.add(new THREE.Mesh(round ? new THREE.CircleGeometry(w / 2, 56).rotateX(-Math.PI / 2) : new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), poolMat));
    if (round) { const wall = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 + 0.6, w / 2 + 0.6, 0.9, 56, 1, true), rimMat); wall.material = rimMat.clone(); wall.material.side = THREE.DoubleSide; wall.position.y = 0.2; g.add(wall); }
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.35, d * 1.35).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TEX_SOFT, color: new THREE.Color(0.3, 0.5, 0.62), transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false })); pg.position.y = 0.4; pg.renderOrder = 2; g.add(pg);
    if (!round) for (const [px, pz, bw, bd] of [[0, -d / 2, w + 1, 1], [0, d / 2, w + 1, 1], [-w / 2, 0, 1, d], [w / 2, 0, 1, d]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.9, bd), rimMat); r.position.set(px, 0.2, pz); g.add(r); }
  }
  const neon = new THREE.Mesh(new THREE.BoxGeometry(36, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.831 * 2.5, 0, 0.05) })); neon.position.set(307, groundY(307, -110) + 6.5, -104); neon.rotation.y = 0.35; city.add(neon);
}
// street lights on poles (warm, a short arm leaning over the footpath) and a footpath along the beach and the new wall
const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.3 });
const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.75) });
function streetLamp(x, z, lean, h = 5.4) { // lean: unit vector (x,z) the arm points
  const y = groundY(x, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8), poleMat); pole.position.set(x, y + h / 2, z); city.add(pole);
  const ax = x + lean[0] * 0.9, az = z + lean[1] * 0.9;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.07), poleMat); arm.position.set(x + lean[0] * 0.45, y + h, z + lean[1] * 0.45); arm.rotation.y = -Math.atan2(lean[1], lean[0]); city.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.26), headMat); head.position.set(ax, y + h - 0.08, az); head.rotation.y = arm.rotation.y; city.add(head);
  const g = glowSprite(0xffa860, 2.6, 0.95); g.position.set(ax, y + h - 0.15, az); city.add(g);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TEX_SOFT, color: new THREE.Color(1.0, 0.55, 0.25), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); pool.position.set(ax, groundY(ax, az) + 0.2, az); pool.renderOrder = 2; city.add(pool);
}
function footpath(all, w = 2.0) { // flat ribbon along a polyline of [x, z]; split where the line jumps
  let run = []; const runs = [];
  for (const p of all) { const q = run[run.length - 1]; if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) > 30) { runs.push(run); run = []; } run.push(p); }
  runs.push(run);
  for (const pts of runs) if (pts.length > 1) footpathRun(pts, w);
}
function footpathRun(pts, w) {
  const pos = [], idx = [];
  pts.forEach(([x, z], i) => { const [xa, za] = pts[Math.max(i - 1, 0)], [xb, zb] = pts[Math.min(i + 1, pts.length - 1)]; const dx = xb - xa, dz = zb - za, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2, y = groundY(x, z) + 0.14;
    pos.push(x - nx, y, z - nz, x + nx, y, z + nz); if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.047, 0.045), side: THREE.DoubleSide })); city.add(m);
}
{
  const c = COAST.COAST, path = [];
  for (let i = 0; i + 1 < c.length; i++) { const [x1, z1] = c[i], [x2, z2] = c[i + 1]; if (!BEACHES[0](x1, z1)) continue; const L = Math.hypot(x2 - x1, z2 - z1); const nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
    for (let s = 0; s < L; s += 13) { const x = x1 + (x2 - x1) * s / L - nx * 58, z = z1 + (z2 - z1) * s / L - nz * 58; if (!isLand(x, z)) continue; path.push([x, z]); if (Math.round(s / 13) % 2 === 0 && Math.hypot(x - ORB.x, z - ORB.z) > 65) streetLamp(x, z, [nx, nz]); } }
  if (path.length > 1) footpath(path);
  // promenade lamps at the baths
  for (let k = 0; k < 6; k++) streetLamp(300 + k * 7, -114 + k * 2.2, [0.3, 0.95], 4.6);
}
// coal ships waiting offshore
const shipLights = [];
for (const [x, z, r] of [[2600, -300, 0.4], [3200, 400, 0.1], [2300, 1200, -0.2], [3900, -900, 0.6], [4300, 900, 0.0], [3500, 1800, 0.25], [5000, -100, 0.35], [2900, 2600, -0.3]]) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; city.add(g);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(190, 12, 30), darkMat); hull.position.y = 4; g.add(hull);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(20, 18, 26), darkMat); sup.position.set(80, 18, 0); g.add(sup);
  for (let k = 0; k < 7; k++) { const s = glowSprite(0xffc890, 10, 0.7); s.position.set(-85 + k * 26, 11, 0); g.add(s); }
  const m = glowSprite(RED_LIN, 16, 2); m.position.set(80, 32, 0); g.add(m); shipLights.push(m);
  const w = glowSprite(0xfff4e0, 11, 1.2); w.position.set(80, 22, 13); g.add(w);
}
// port cranes north of the harbour
for (const [cx, cz] of [[-1350, -1250], [-1450, -1300], [-1550, -1350], [-2150, -1500], [-2250, -1560]]) {
  if (!isLand(cx, cz)) continue;
  for (const dz of [-6, 6]) for (const dx of [-5, 5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 40, 1.2), darkMat); leg.position.set(cx + dx, 20, cz + dz); city.add(leg); }
  const boom = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 80), darkMat); boom.position.set(cx, 40, cz + 25); city.add(boom);
  const l = glowSprite(RED_LIN, 12, 2); l.position.set(cx, 44, cz); city.add(l);
}

// ================================================================ the orb: born in the sand, rises, then drops back into the ground to start the signal
const HOVER_Y = 3.0, PEAK_Y = 5.6;             // heights above the sand (metres)
const ORB_LIGHT = new THREE.PointLight(0xff2030, 0, 70, 2); city.add(ORB_LIGHT);
const orbCore = glowSprite(0xffffff, 0.5, 3.0), orbHalo = glowSprite(RED_LIN, 2.5, 2.2), orbOuter = glowSprite(RED_LIN, 8, 0.6, TEX_SOFT);
[orbOuter, orbHalo, orbCore].forEach(s => { s.renderOrder = 5; city.add(s); });
function orbHeight(t) {
  if (t < T.gatherFull) return 0.12 + (HOVER_Y - 0.12) * Math.pow(smoother(T.gather0 + 0.8, T.gatherFull, t), 1.3);       // seed in the sand swells and lifts
  if (t < T.launch) { const k = smoother(T.hover0, T.launch - 0.2, t); return HOVER_Y + (PEAK_Y - HOVER_Y) * k + Math.sin((t - T.gatherFull) * 2.2) * 0.06 * (1 - k); } // slow anticipation rise
  if (t < T.impact) { const s = (t - T.launch) / (T.impact - T.launch); return 0.25 + (PEAK_Y - 0.25) * (1 - s * s); } // plunge
  return 0.25;
}
const orbPos = t => ORB.clone().add(V3(0, orbHeight(t), 0));

// light filaments spiralling up out of the sand into the orb (clean strips, not point particles)
const STREAM_VERT = /* glsl */`
  uniform float uWidth; uniform vec2 uRes; uniform vec3 uShift; attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aD; attribute float aS;
  varying float vD; varying float vS; varying float vSide;
  void main(){ vec3 sh = uShift*aS*aS; mat4 m = projectionMatrix*modelViewMatrix; vec4 c = m*vec4(position+sh,1.); vec4 cp = m*vec4(aPrev+sh,1.); vec4 cn = m*vec4(aNext+sh,1.);
    vec2 sp = cp.xy/max(cp.w,1e-4), sn = cn.xy/max(cn.w,1e-4); vec2 d = (sn - sp)*uRes; float L = length(d); d = L > 1e-6 ? d/L : vec2(1.,0.);
    vec2 n = vec2(-d.y, d.x); c.xy += n * aSide * uWidth / uRes * c.w; vD = aD; vS = aS; vSide = aSide; gl_Position = c; }`;
const STREAMS = [];
const NSTREAM = 46;
for (let i = 0; i < NSTREAM; i++) {
  const th0 = rng() * Math.PI * 2, r0 = 2.6 + rng() * 5.2, spin = (1.0 + rng() * 1.5) * (rng() < 0.5 ? -1 : 1), bulge = 0.2 + rng() * 0.5;
  const pts = [], ss = [];
  for (let k = 0; k <= 90; k++) {
    const u = k / 90, e = Math.pow(1 - u, 1.5);
    const th = th0 + spin * (1 - e) * 2.4 + spin * u * 0.5;
    const r = r0 * e + 0.03, y = 0.08 + HOVER_Y * Math.pow(u, 1.15) + Math.sin(u * Math.PI) * bulge;
    pts.push(ORB.clone().add(V3(Math.cos(th) * r, y, Math.sin(th) * r))); ss.push(u);
  }
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uWidth: { value: Math.max(1.6, (2.4 + rng() * 2.4) * SC * 2) }, uRes: U.uRes, uHead: { value: -1 }, uAlpha: { value: 0 }, uShift: { value: new THREE.Vector3() } },
    side: THREE.DoubleSide, vertexShader: STREAM_VERT,
    fragmentShader: `uniform float uHead; uniform float uAlpha; varying float vS; varying float vSide;
      void main(){ float d = uHead - vS; if (d < 0.0 || d > 0.42) discard; float k = 1.0 - d/0.42; float e = 1.0 - vSide*vSide;
        vec3 c = mix(vec3(0.83,0.0,0.05), vec3(1.0,0.75,0.75), pow(k, 6.0)); gl_FragColor = vec4(c * pow(k, 2.2) * e * uAlpha * 2.2, 1.0); }` });
  const mesh = new THREE.Mesh(buildStrips([{ pts, s: ss }]), mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; city.add(mesh);
  STREAMS.push({ mesh, t0: lerp(T.gather0, T.gatherFull - 1.0, i / (NSTREAM - 1)) + (rng() - 0.5) * 0.5, dur: 1.3 + rng() * 0.9 });
}
// motes of light drawn up out of the sand
const moteMat = new THREE.ShaderMaterial({
  uniforms: { uT: U.uTime, uA: { value: 0 }, uPx: { value: H / 1080 }, uBase: { value: ORB.clone() }, uOrbY: { value: HOVER_Y } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `uniform float uT; uniform float uA; uniform float uPx; uniform vec3 uBase; uniform float uOrbY; attribute vec4 aSeed; varying float vA; varying float vQ;
    void main(){ float P = 1.3 + aSeed.w*1.4; float q = fract(uT/P + aSeed.z);
      float r = aSeed.y * pow(1.0 - q, 1.6); float th = aSeed.x + (1.0 - (1.0-q)*(1.0-q)) * (2.0 + aSeed.w*2.0);
      vec3 p = uBase + vec3(cos(th)*r, 0.05 + pow(q, 1.4)*uOrbY, sin(th)*r);
      vec4 mv = modelViewMatrix*vec4(p,1.); vA = uA * smoothstep(0.0, 0.12, q) * (1.0 - smoothstep(0.82, 1.0, q)); vQ = q;
      gl_PointSize = clamp(uPx * (1.3 + 2.4*aSeed.w) * 55.0/(-mv.z), 1.5, uPx*16.0); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; varying float vQ; void main(){ float r = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,r); a *= a; vec3 c = mix(vec3(1.0,0.1,0.15), vec3(1.0,0.75,0.75), vQ*vQ); gl_FragColor = vec4(c*a*vA, 1.0); }`
});
{
  const n = 520, g = new THREE.BufferGeometry(); const s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { s[i * 4] = rng() * Math.PI * 2; s[i * 4 + 1] = 1.2 + rng() * 6.5; s[i * 4 + 2] = rng(); s[i * 4 + 3] = rng(); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  const pts = new THREE.Points(g, moteMat); pts.frustumCulled = false; pts.renderOrder = 6; city.add(pts);
}
// sparks thrown up out of the sand at the moment of impact
const sparkMat = new THREE.ShaderMaterial({
  uniforms: { uT: U.uTime, uImpact: { value: T.impact }, uPx: { value: H / 1080 }, uBase: { value: ORB.clone() } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `uniform float uT; uniform float uImpact; uniform float uPx; uniform vec3 uBase; attribute vec4 aSeed; varying float vA;
    void main(){ float tau = max(uT - uImpact, 0.0); float sp = 2.0 + aSeed.y*16.0; float up = 3.0 + aSeed.z*14.0;
      vec3 p = uBase + vec3(cos(aSeed.x)*sp*tau, 0.3 + up*tau - 4.0*tau*tau, sin(aSeed.x)*sp*tau);
      vec4 mv = modelViewMatrix*vec4(p,1.); vA = (uT > uImpact ? 1.0 : 0.0) * exp(-tau/(0.45 + aSeed.w*0.5)) * step(0.0, p.y - uBase.y);
      gl_PointSize = clamp(uPx * (1.0 + 2.5*aSeed.w) * 55.0/(-mv.z), 1.0, uPx*14.0); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,r); a *= a; gl_FragColor = vec4(mix(vec3(1.0,0.1,0.15), vec3(1.0,0.8,0.8), a*a)*a*vA*1.4, 1.0); }`
});
{
  const n = 260, g = new THREE.BufferGeometry(); const s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { s[i * 4] = rng() * Math.PI * 2; s[i * 4 + 1] = rng(); s[i * 4 + 2] = rng(); s[i * 4 + 3] = rng(); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  const pts = new THREE.Points(g, sparkMat); pts.frustumCulled = false; pts.renderOrder = 6; city.add(pts);
}
// glow in the sand with rings contracting into the seed point
const groundGlowMat = new THREE.ShaderMaterial({
  uniforms: { uT: U.uTime, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uT; uniform float uA; varying vec2 vP;
    void main(){ float r = length(vP); float ring = 0.0;
      for (int i = 0; i < 4; i++) { float ph = fract(uT*0.36 + float(i)*0.25); float rr = mix(6.5, 0.3, ph); float w = 0.05 + 0.022*rr; ring += exp(-pow((r-rr)/w, 2.0)) * sin(3.14159*ph); }
      float core = exp(-r*r/2.6); float edge = 1.0 - smoothstep(6.5, 8.5, r);
      vec3 c = vec3(0.831,0.0,0.03)*(ring*0.7 + core*0.55) + vec3(1.0,0.5,0.5)*core*core*0.18;
      gl_FragColor = vec4(c*edge*uA, 1.0); }`
});
const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), groundGlowMat); groundGlow.position.copy(ORB).setY(ORB.y + 0.12); groundGlow.renderOrder = 2; groundGlow.frustumCulled = false; city.add(groundGlow);
const shockMat = new THREE.ShaderMaterial({
  uniforms: { uTau: { value: -1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTau; varying vec2 vP;
    void main(){ if (uTau < 0.0) discard; float r = length(vP); float a = 0.0;
      for (int i = 0; i < 6; i++) { float tr = uTau - 0.13*float(i); if (tr <= 0.0) continue; float R = 520.0*(1.0 - exp(-tr/0.75)); float w = 1.2 + 0.035*R; a += exp(-pow((r-R)/w, 2.0)) * exp(-tr/0.9) / (1.0 + 0.3*float(i)); }
      vec3 c = mix(vec3(0.9,0.05,0.1), vec3(1.0,0.7,0.7), clamp(a - 0.8, 0.0, 1.0)); gl_FragColor = vec4(c*a*1.5*smoothstep(1500.0, 0.0, r), 1.0); }`
});
const shock = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), shockMat); shock.visible = false; shock.position.copy(ORB).setY(ORB.y + 0.25); shock.renderOrder = 2; shock.frustumCulled = false; city.add(shock);
const column = glowSprite(0xff2a3a, 1, 1, TEX_SOFT); column.center.set(0.5, 0.0); column.position.copy(ORB); column.renderOrder = 5; city.add(column);
// trail while the orb drops
const NT = 40;
const tGeo = new THREE.BufferGeometry();
tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NT * 3), 3));
tGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(NT), 1));
tGeo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(NT), 1));
const trailMat = new THREE.ShaderMaterial({
  uniforms: { uPx: { value: H / 1080 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `uniform float uPx; attribute float aA; attribute float aS; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vA = aA; gl_PointSize = uPx*aS*60.0/(-mv.z); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,r); gl_FragColor = vec4(mix(vec3(1.0,0.05,0.12), vec3(1.0,0.8,0.8), a*a)*a*vA*1.3, 1.0); }`
});
const trail = new THREE.Points(tGeo, trailMat); trail.frustumCulled = false; trail.renderOrder = 6; city.add(trail);
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.08, 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 128).rotateX(-Math.PI / 2), ringMat); ring.position.copy(ORB).setY(ORB.y + 0.6); city.add(ring);
const gatherRingMat = ringMat.clone(); const gatherRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96).rotateX(-Math.PI / 2), gatherRingMat); gatherRing.position.copy(ORB).setY(ORB.y + 0.3); city.add(gatherRing);
const pillar = glowSprite(0xff4050, 1, 1); pillar.position.copy(ORB); pillar.center.set(0.5, 0.0); city.add(pillar);

// ================================================================ GLOBE
const globe = new THREE.Scene(); globe.background = new THREE.Color(0, 0, 0);
const globeCam = new THREE.PerspectiveCamera(38, W / H, 0.001, 20000);
const R = 100, KM = R / 6371;
function ll(lat, lon, r = R) { const p = lat * D2R, l = lon * D2R; return V3(r * Math.cos(p) * Math.sin(l), r * Math.sin(p), r * Math.cos(p) * Math.cos(l)); }
const NEWCASTLE = [-32.93, 151.78];
function gcKm(a, b) { const la1 = a[0] * D2R, lo1 = a[1] * D2R, la2 = b[0] * D2R, lo2 = b[1] * D2R; const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))); }
const GU = { uPxK: { value: H / 1080 }, uTime: U.uTime, uCamPos: { value: new THREE.Vector3() }, uBright: { value: 1 }, uMask: { value: null },
  uCity: { value: Array.from({ length: 48 }, () => new THREE.Vector3()) }, uCityT: { value: new Array(48).fill(1e9) }, uNCity: { value: 0 } };
const globeMat = new THREE.ShaderMaterial({
  uniforms: GU,
  vertexShader: `varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform sampler2D uMask; uniform float uTime; uniform vec3 uCamPos; uniform float uBright; uniform float uPxK;
  uniform vec3 uCity[48]; uniform float uCityT[48]; uniform int uNCity;
  varying vec3 vP; varying vec3 vW;
  float landAt(float lat, float lon){ return texture2D(uMask, vec2((lon+180.)/360., (lat+90.)/180.)).r; }
  float dotLayer(float lat, float lon, float s, float pix){
    float row = floor((lat+90.)/s); float latc = (row+0.5)*s - 90.;
    float cl = cos(radians(latc)); float n = max(floor(360.*cl/s), 1.); float sl = 360./n;
    float col = floor((lon+180.)/sl); float lonc = (col+0.5)*sl - 180.;
    float land = landAt(latc, lonc);
    float dy = lat - latc; float dx = (lon - lonc)*cos(radians(lat));
    float d = length(vec2(dx,dy)); float r = s*0.22;
    float a = 1. - smoothstep(r - pix, r + pix, d);
    float sizePx = s/pix;
    float vis = smoothstep(4.0*uPxK, 6.5*uPxK, sizePx) * (1. - smoothstep(12.*uPxK, 17.*uPxK, sizePx));
    return a * vis * step(0.5, land);
  }
  void main(){
    vec3 p = normalize(vP);
    float lat = degrees(asin(clamp(p.y,-1.,1.))); float lon = degrees(atan(p.x, p.z));
    float pix = max(fwidth(lat), 1e-6);
    float land = landAt(lat, lon);
    vec3 col = mix(vec3(0.0022,0.0022,0.004), vec3(0.010,0.0095,0.012), land);
    float glow = 0.0;
    for (int i = 0; i < 48; i++) { if (i >= uNCity) break; float dt = uTime - uCityT[i];
      if (dt > 0.0) { float ang = acos(clamp(dot(p, uCity[i]), -1., 1.)); glow += exp(-ang/0.006) * smoothstep(0.0, 0.25, dt); } }
    float d = max(max(max(dotLayer(lat,lon,0.028,pix), dotLayer(lat,lon,0.07,pix)), dotLayer(lat,lon,0.175,pix)), max(dotLayer(lat,lon,0.44,pix), dotLayer(lat,lon,1.1,pix)));
    vec3 dotCol = vec3(0.035,0.035,0.045) + vec3(0.9,0.05,0.1) * clamp(glow*0.8, 0., 1.5);
    col += d * dotCol + vec3(0.831,0.0,0.03) * clamp(glow,0.,1.) * 0.1;
    vec3 V = normalize(uCamPos - vW); float fr = pow(1.0 - max(dot(normalize(vW), V), 0.0), 3.0);
    col += vec3(0.22,0.0,0.03)*fr*0.7;
    gl_FragColor = vec4(col*uBright, 1.);
  }`
});
globe.add(new THREE.Mesh(new THREE.SphereGeometry(R, 384, 192), globeMat));
const atmoMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float k = pow(clamp(0.72 + dot(vN, vV), 0.0, 1.0), 4.0); gl_FragColor = vec4(vec3(0.6,0.02,0.06)*k*uA*1.6, 1.0); }`
});
globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 96, 48), atmoMat));
{ const p = []; for (let i = 0; i < 2500; i++) { const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = 6000; p.push(Math.sqrt(1 - u * u) * Math.cos(th) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(th) * r); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  globe.add(new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(0.35, 0.35, 0.42), size: 3.2 * SC, sizeAttenuation: false }))); }
const cityGlow = glowSprite(RED_LIN, 1, 2.5); cityGlow.position.copy(ll(...NEWCASTLE, R * 1.001)); globe.add(cityGlow);
const topo50 = await (await fetch('/node_modules/world-atlas/land-50m.json')).json();
const land50 = topojson.feature(topo50, topo50.objects.land);
const polys50 = []; for (const f of land50.features) { const gm = f.geometry; if (gm.type === 'MultiPolygon') polys50.push(...gm.coordinates); else polys50.push(gm.coordinates); }
{
  const c = document.createElement('canvas'); c.width = 8192; c.height = 4096; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff';
  const px = ([lon, lat]) => [(lon + 180) / 360 * c.width, (90 - lat) / 180 * c.height];
  for (const poly of polys50) { g.beginPath(); for (const rc of poly) { rc.forEach((pt, i) => { const [x, y] = px(pt); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } g.fill('evenodd'); }
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; GU.uMask.value = tex;
  const mesh = topojson.mesh(topo50, topo50.objects.land); const pos = [];
  for (const line of mesh.coordinates) for (let i = 0; i + 1 < line.length; i++) { const a = ll(line[i][1], line[i][0], R * 1.0002), b = ll(line[i + 1][1], line[i + 1][0], R * 1.0002); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  globe.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.2, 0.03, 0.045), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
}
const AUS = { lon0: 112, lon1: 155, lat0: -44.5, lat1: -9.5, res: 0.02 };
const ausW = Math.round((AUS.lon1 - AUS.lon0) / AUS.res), ausH = Math.round((AUS.lat1 - AUS.lat0) / AUS.res);
const ausPix = new Uint8Array(ausW * ausH);
{
  const c = document.createElement('canvas'); c.width = ausW; c.height = ausH; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, ausW, ausH); g.fillStyle = '#fff';
  for (const poly of polys50) { let near = false; for (const p of poly[0]) if (p[0] > 105 && p[0] < 160 && p[1] < -5 && p[1] > -48) { near = true; break; } if (!near) continue;
    g.beginPath(); for (const rc of poly) { rc.forEach(([lo, la], i) => { const x = (lo - AUS.lon0) / AUS.res, y = (AUS.lat1 - la) / AUS.res; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } g.fill('evenodd'); }
  const d = g.getImageData(0, 0, ausW, ausH).data; for (let i = 0; i < ausW * ausH; i++) ausPix[i] = d[i * 4];
}
const ausLand = (lat, lon) => { const x = Math.floor((lon - AUS.lon0) / AUS.res), y = Math.floor((AUS.lat1 - lat) / AUS.res); return x >= 0 && y >= 0 && x < ausW && y < ausH && ausPix[y * ausW + x] > 127; };

// ---- the spreading web across Australia (log-radial density from Newcastle, spreading like an infection)
const CITIES = {
  newcastle: NEWCASTLE, sydney: [-33.87, 151.21], brisbane: [-27.47, 153.03], melbourne: [-37.81, 144.96], canberra: [-35.28, 149.13],
  tamworth: [-31.09, 150.93], adelaide: [-34.93, 138.6], perth: [-31.95, 115.86], darwin: [-12.46, 130.84], hobart: [-42.88, 147.33],
  cairns: [-16.92, 145.77], alice: [-23.7, 133.88], townsville: [-19.26, 146.82], broome: [-17.96, 122.24], goldcoast: [-28.0, 153.4], wollongong: [-34.42, 150.89],
  auckland: [-36.85, 174.76], wellington: [-41.29, 174.78], singapore: [1.35, 103.82], tokyo: [35.68, 139.69], la: [34.05, -118.24], sf: [37.77, -122.42],
  ny: [40.71, -74.0], london: [51.5, -0.12], joburg: [-26.2, 28.05], saopaulo: [-23.55, -46.63], mumbai: [19.08, 72.88], dubai: [25.2, 55.27],
  hongkong: [22.32, 114.17], jakarta: [-6.2, 106.85], seoul: [37.57, 126.98], honolulu: [21.31, -157.86], santiago: [-33.45, -70.67], vancouver: [49.28, -123.12],
  manila: [14.6, 120.98], nairobi: [-1.29, 36.82], fiji: [-18.14, 178.44], delhi: [28.61, 77.2], mexico: [19.43, -99.13],
  bourke: [-30.09, 145.94], mtisa: [-20.73, 139.49], wagga: [-35.12, 147.37],
};
const AUS_CITIES = ['newcastle', 'sydney', 'brisbane', 'melbourne', 'canberra', 'tamworth', 'adelaide', 'perth', 'darwin', 'hobart', 'cairns', 'alice', 'townsville', 'broome', 'goldcoast', 'wollongong', 'bourke', 'mtisa', 'wagga'];
function destPoint(lat, lon, bearing, km) { const d = km / 6371, la = lat * D2R, lo = lon * D2R; const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(bearing)); const lo2 = lo + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)); return [la2 / D2R, lo2 / D2R]; }
function bearingTo(a, b) { const la1 = a[0] * D2R, la2 = b[0] * D2R, dl = (b[1] - a[1]) * D2R; return Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)); }
const web = (() => {
  const pts = [NEWCASTLE], cls = [1];
  for (let i = 0; i < 14000 && pts.length < 4200; i++) { const km = 3 * Math.pow(4300 / 3, rng()); const p = destPoint(...NEWCASTLE, rng() * Math.PI * 2, km); if (ausLand(...p)) { pts.push(p); cls.push(1); } }
  const cityIdx = {};
  for (const c of AUS_CITIES.slice(1)) { cityIdx[c] = pts.length; pts.push(CITIES[c]); cls.push(1); for (let i = 0; i < 70; i++) { const p = destPoint(...CITIES[c], rng() * Math.PI * 2, 2 * Math.pow(90 / 2, rng())); if (ausLand(...p)) { pts.push(p); cls.push(1); } } }
  const n = pts.length; const xy = pts.map(([la, lo]) => [lo * Math.cos(-28 * D2R) * 111.2, la * 111.2]);
  const adj = Array.from({ length: n }, () => []); const E = []; const seen = new Set();
  for (let i = 0; i < n; i++) {
    const cand = [];
    for (let j = 0; j < n; j++) if (j !== i) { const d = (xy[i][0] - xy[j][0]) ** 2 + (xy[i][1] - xy[j][1]) ** 2; if (cand.length < 3 || d < cand[cand.length - 1][1]) { cand.push([j, d]); cand.sort((a, b) => a[1] - b[1]); if (cand.length > 3) cand.pop(); } }
    for (const [j] of cand) { const key = i < j ? i + '_' + j : j + '_' + i; if (seen.has(key)) continue; const km = gcKm(pts[i], pts[j]);
      if (!ausLand((pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2) && km > 60) continue;
      seen.add(key); E.push([i, j, km]); adj[i].push([j, km]); adj[j].push([i, km]); }
  }
  { const h = cityIdx.hobart, m = cityIdx.melbourne, km = gcKm(pts[h], pts[m]); E.push([h, m, km]); adj[h].push([m, km]); adj[m].push([h, km]); } // Bass Strait hop
  // join any disconnected islands of the web to the main network
  for (;;) {
    const seenN = new Uint8Array(n); const st = [0]; seenN[0] = 1; while (st.length) { const u = st.pop(); for (const [v] of adj[u]) if (!seenN[v]) { seenN[v] = 1; st.push(v); } }
    const start = seenN.indexOf(0); if (start < 0) break;
    const comp = [start]; const inC = new Uint8Array(n); inC[start] = 1; for (let q = 0; q < comp.length; q++) for (const [v] of adj[comp[q]]) if (!inC[v]) { inC[v] = 1; comp.push(v); }
    let bi = -1, bj = -1, bd = Infinity; for (const i of comp) for (let j = 0; j < n; j++) if (seenN[j]) { const d = (xy[i][0] - xy[j][0]) ** 2 + (xy[i][1] - xy[j][1]) ** 2; if (d < bd) { bd = d; bi = i; bj = j; } }
    const km = gcKm(pts[bi], pts[bj]); E.push([bi, bj, km]); adj[bi].push([bj, km]); adj[bj].push([bi, km]);
  }
  const d = new Float64Array(n).fill(Infinity); d[0] = 0; const done = new Uint8Array(n);
  for (;;) { let u = -1, best = Infinity; for (let i = 0; i < n; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; } if (u < 0) break; done[u] = 1; for (const [v, w] of adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w; }
  return { pts, E, d, cls };
})();
const webMat = new THREE.ShaderMaterial({
  uniforms: { uWidth: { value: 2.6 * SC * 2 }, uRes: U.uRes, uFront: { value: -1 }, uFade: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide, vertexShader: STRIP_VERT,
  fragmentShader: `uniform float uFront; uniform float uFade; varying float vD; varying float vS; varying float vSide;
    void main(){ float x = uFront - vD; if (x < 0.0) discard; float hw = 2.0 + uFront*0.06; float head = exp(-pow(x/hw, 2.0));
      float e = 1.0 - vSide*vSide; vec3 c = (vec3(0.831,0.0,0.03)*(0.55 + 0.8*exp(-x/(hw*4.0))) + vec3(1.0,0.4,0.4)*head*1.6) * vS;
      gl_FragColor = vec4(c*e*uFade, 1.0); }`
});
{
  const polys = [];
  for (const [i, j, km] of web.E) { const A = ll(...web.pts[i], 1), B = ll(...web.pts[j], 1); const ang = A.angleTo(B); const n = Math.max(1, Math.ceil(km / 40)); const pts = [], d = [], s = [];
    const br = Math.max(web.cls[i], web.cls[j]) ? 1.0 : 0.3; // corridor webs bright, background web dim
    for (let k = 0; k <= n; k++) { const f = k / n; const v = ang < 1e-7 ? A.clone() : A.clone().multiplyScalar(Math.sin((1 - f) * ang) / Math.sin(ang)).add(B.clone().multiplyScalar(Math.sin(f * ang) / Math.sin(ang))); pts.push(v.normalize().multiplyScalar(R * 1.0004)); d.push(Math.min(web.d[i] + f * km, web.d[j] + (1 - f) * km)); s.push(br); }
    polys.push({ pts, d, s }); }
  const m = new THREE.Mesh(buildStrips(polys), webMat); m.frustumCulled = false; m.renderOrder = 2; globe.add(m);
}

// ================================================================ camera + fronts
const ALT_KEYS = T.alt.map(([t, a]) => [t, Math.log(a)]);
function altAt(t) { return Math.exp(track(ALT_KEYS, t)); }
const webFront = t => t < T.web0 ? -1 : 0.55 * altAt(t) / 1000;
// street front: metres from the orb along the streets. It is a fixed fraction of how far the camera has risen since the impact, so it accelerates exactly as smoothly as the zoom does (no ramps, no jumps)
const cityFront = t => { if (t <= T.impact) return -1e9; return Math.max(0, (T.frontK || 0.6) * (altAt(t) - altAt(T.impact))) - IMPACT_OFF; };
const arrival = {};
for (const c of AUS_CITIES) { let best = 0, bd = Infinity; web.pts.forEach((p, i) => { const d = gcKm(p, CITIES[c]); if (d < bd) { bd = d; best = i; } }); const need = web.d[best] + bd; let t = T.web0; while (t < DURATION && webFront(t) < need) t += 0.01; arrival[c] = t; }
arrival.newcastle = T.xfade[0];
const HOPS = [['sydney', 'auckland'], ['brisbane', 'fiji'], ['sydney', 'la'], ['brisbane', 'tokyo'], ['darwin', 'singapore'], ['darwin', 'manila'], ['perth', 'joburg'], ['perth', 'mumbai'],
  ['auckland', 'wellington'], ['singapore', 'jakarta'], ['singapore', 'hongkong'], ['tokyo', 'seoul'], ['fiji', 'honolulu'], ['la', 'sf'], ['la', 'mexico'], ['sf', 'vancouver'], ['la', 'ny'],
  ['auckland', 'santiago'], ['mumbai', 'dubai'], ['mumbai', 'delhi'], ['joburg', 'nairobi'], ['dubai', 'london'], ['ny', 'london'], ['santiago', 'saopaulo']];
const arcMat = () => new THREE.ShaderMaterial({
  uniforms: { uHead: { value: 0 }, uFade: { value: 1 }, uWidth: { value: Math.max(1.4, 5 * SC) }, uRes: U.uRes },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: STRIP_VERT,
  fragmentShader: `uniform float uHead; uniform float uFade; varying float vS; varying float vSide;
    void main(){ float d = uHead - vS; if (d < 0.0) discard; float head = exp(-d*d/0.004); float trail = 0.22 + 0.9*exp(-d*4.0);
      float e = 1.0 - vSide*vSide; vec3 col = (vec3(0.831,0.01,0.05)*trail + vec3(1.0,0.6,0.6)*head*2.2) * e * uFade; gl_FragColor = vec4(col, 1.0); }`
});
const arcs = [];
// world arcs wait until the web has spread out to the far coasts
const T_WORLD = (() => { let t = T.web0; while (t < DURATION && webFront(t) < (T.worldKm || 3300)) t += 0.01; return t; })();
{
  const pending = HOPS.slice();
  while (pending.length) { const i = pending.findIndex(([a]) => a in arrival); if (i < 0) break; const [a, b] = pending.splice(i, 1)[0];
    const A = ll(...CITIES[a], 1), B = ll(...CITIES[b], 1); const ang = A.angleTo(B);
    const t0 = Math.max(arrival[a], T_WORLD) + 0.12 * T.worldScale + rng() * 0.25 * T.worldScale; const dur = (0.28 + 0.55 * Math.sqrt(ang / Math.PI)) * Math.max(T.worldScale, 0.6);
    if (!(b in arrival) || arrival[b] > t0 + dur) arrival[b] = t0 + dur;
    const hgt = R * (0.004 + 0.16 * ang); const pts = [];
    for (let k = 0; k <= 96; k++) { const s = k / 96; const v = A.clone().multiplyScalar(Math.sin((1 - s) * ang) / Math.sin(ang)).add(B.clone().multiplyScalar(Math.sin(s * ang) / Math.sin(ang))).normalize(); pts.push(v.multiplyScalar(R * 1.0005 + hgt * Math.sin(Math.PI * s))); }
    const mesh = new THREE.Mesh(buildStrips([{ pts }]), arcMat()); mesh.frustumCulled = false; mesh.renderOrder = 3; globe.add(mesh);
    const headSpr = glowSprite(0xff3a4a, 1, 2.2); headSpr.renderOrder = 4; globe.add(headSpr);
    arcs.push({ a, b, t0, dur, pts, mesh, headSpr }); }
}
const cityKeys = Object.keys(arrival);
cityKeys.forEach((k, i) => { if (i < 48) { GU.uCity.value[i].copy(ll(...CITIES[k], 1).normalize()); GU.uCityT.value[i] = arrival[k]; } });
GU.uNCity.value = Math.min(cityKeys.length, 48);
const citySprites = cityKeys.map(k => { const s = glowSprite(RED_LIN, 1, 2.0); s.position.copy(ll(...CITIES[k], R * 1.001)); s.renderOrder = 4; globe.add(s); return { k, s }; });

const CITY_CENTRE = V3(-900, 0, 150);
const CAMDIR = V3(0.8, 0, 0.6).normalize();  // from the orb back out over the bay (south-east, over open water): the glide ends on this straight line
// ---- shot 1: one slow glide in from the sea. The camera always looks along its own flight path (no pans, no turns),
// drifts past Nobbys lighthouse, sweeps round the seaward side of Fort Scratchley and settles in front of the orb on Newcastle Beach.
const ORB_AIM = ORB.clone().add(V3(0, 2.6, 0));
const ALT0 = 1.5;                                                // camera height above the aim point when the glide ends
const END_D = 14.5;                                              // ...and its distance from the orb
const END_POS = ORB_AIM.clone().add(CAMDIR.clone().multiplyScalar(END_D)).add(V3(0, ALT0, 0));
const APP_PTS = (() => { // moving in from the sea toward Nobbys lighthouse and past it, then one wide arc round the headland and the baths, then a straight run in to the orb over the bay
  const lead = [V3(1640, 50, -1330), V3(1420, 50, -1255)], P2 = V3(1160, 47, -1195);
  const T1 = END_POS.clone().add(CAMDIR.clone().multiplyScalar(340)), cx = T1.x - P2.x, cz = T1.z - P2.z, cl = Math.hypot(cx, cz), px = cz / cl, pz = -cx / cl, BOW = 330;
  const pts = lead.slice();
  for (let k = 0; k <= 34; k++) { const u = k / 34, b = BOW * Math.sin(Math.PI * Math.pow(u, 2.4));
    pts.push(V3(P2.x + cx * u + px * b, 28 + (48 - 28) * (1 - smoother(0.3, 1, u)), P2.z + cz * u + pz * b)); }
  for (const [d, h] of [[220, 16], [130, 10], [70, 7.5], [30, 6]]) pts.push(END_POS.clone().add(CAMDIR.clone().multiplyScalar(d)).setY(h));
  pts.push(END_POS.clone()); return pts; })();
const appCurve0 = new THREE.CatmullRomCurve3(APP_PTS, false, 'centripetal');
appCurve0.arcLengthDivisions = 6000; // fine distance table: the default (200) makes the speed wobble
// the whole route is resampled evenly and averaged over about 140 m so it never twists; the first and last stretches stay exactly as designed
const appCurve = (() => {
  const n = Math.round(appCurve0.getLength() / 10), P = []; for (let i = 0; i <= n; i++) P.push(appCurve0.getPointAt(i / n));
  const S = P.map((p, i) => { let w = 0; const a = new THREE.Vector3();
    for (let k = -30; k <= 30; k++) { const g = Math.exp(-(k * k) / (2 * 14 * 14)); a.addScaledVector(P[clamp(i + k, 0, n)], g); w += g; }
    a.multiplyScalar(1 / w); const u = i / n; return a.lerp(p, smoother(0.8, 0.95, u)).lerp(p, 1 - smoother(0.0, 0.04, u)); });
  const c = new THREE.CatmullRomCurve3(S.filter((_, i) => i % 3 === 0 || i === n), false, 'centripetal'); c.arcLengthDivisions = 6000; return c; })();
const appLen = appCurve.getLength();
const FOCUS = V3(-800, 15, -300); // the locus the arc sweeps round: the camera goes wide but keeps looking in at it
const NOB_TOP = V3(NOB.x, NOB.y + 14, NOB.z);
// flight timing from a velocity profile: already moving at the fade-in (appV0), ease to cruise over appRamp[0] s, long ease down to a stop over appRamp[1] s before approachEnd
const APP_TAB = (() => { const n = Math.max(1, Math.round(T.approachEnd * 200)), tab = new Float64Array(n + 1); const [r0, r1] = T.appRamp || [4, 6]; let acc = 0;
  for (let i = 1; i <= n; i++) { const t = i / 200; acc += ((T.appV0 || 0) + (1 - (T.appV0 || 0)) * smoother(0, r0, t)) * (1 - smoother(T.approachEnd - r1, T.approachEnd, t)); tab[i] = acc; }
  for (let i = 0; i <= n; i++) tab[i] /= acc; return tab; })();
function appU(t) { const n = APP_TAB.length - 1, x = clamp(t / T.approachEnd) * n, i = Math.min(Math.floor(x), n - 1); return lerp(APP_TAB[i], APP_TAB[i + 1], x - i); }
function approachRaw(t) {
  t = Math.min(t, T.approachEnd);
  const focus = FOCUS.clone().lerp(ORB_AIM, smoother(T.approachEnd - 14, T.approachEnd - 3, t));   // the centre of the arc slides onto the orb well before the end
  const tgt = NOB_TOP.clone().lerp(focus, smoother(0.6, 6.0, t));                                    // open on the lighthouse, then look in
  return { pos: appCurve.getPointAt(appU(t)), tgt, fov: 40 };
}
// the look target is also averaged over a couple of seconds (gaussian), so the view glides rather than snaps
function approachShot(t) {
  const raw = approachRaw(t), tgt = new THREE.Vector3(); let wsum = 0;
  for (let k = -8; k <= 8; k++) { const w = Math.exp(-(k * k) / 30); tgt.addScaledVector(approachRaw(Math.max(0, t + k * 0.3)).tgt, w); wsum += w; }
  raw.tgt = tgt.multiplyScalar(1 / wsum).lerp(ORB_AIM, smoother(T.approachEnd - 3, T.approachEnd - 0.6, t)); return raw;
}
// ---- shot 2: a single continuous rise from the beach to orbit height. Height comes from the `alt` keys; the tilt, the swing round
// from the north-east to the south and the drift of the aim point from the orb to the city centre are all driven by that height.
const PHI_KEYS = [[Math.log(ALT0), Math.atan(END_D / ALT0) / D2R], [Math.log(6), 82], [Math.log(30), 76], [Math.log(120), 67], [Math.log(400), 53], [Math.log(1500), 36], [Math.log(6000), 14], [Math.log(40000), 8]];
const AZ0 = Math.atan2(CAMDIR.z, CAMDIR.x), AZ1 = Math.PI / 2; // swings east over the sea, then round to the south (north-up, as the globe expects)
function riseShot(t) {
  const V = altAt(t), lv = Math.log(V);
  // one shared progress value (log of the height climbed) drives the tilt, the swing round and the drift of the aim together, so the zoom and the rotation are a single move
  const P = clamp((lv - Math.log(2.2)) / (Math.log(14000) - Math.log(2.2)));
  const e = Math.pow(smoother(0, 1, P), 1.7);
  const phi = lerp(Math.atan(END_D / ALT0) / D2R, 8, Math.pow(e, 0.9));
  const D = V * Math.tan(phi * D2R);
  const aimFar = V3(-700, 0, -150).lerp(CITY_CENTRE, smoother(Math.log(3000), Math.log(25000), lv));
  const tgt = ORB_AIM.clone().lerp(aimFar, e);
  const az = lerp(AZ0, AZ1, e);
  return { pos: tgt.clone().add(V3(Math.cos(az) * D, V, Math.sin(az) * D)), tgt, fov: lerp(40, 44, e) };
}
const cityShot = t => window.__camOverride || (t < T.approachEnd ? approachShot(t) : riseShot(t));
function globeShot(t) {
  const lat = track(T.globeLat, t), lon = track(T.globeLon, t);
  const altU = altAt(t) / 1000 * KM;
  const up = ll(lat, lon, 1).normalize();
  const north = V3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  const offK = 1 - smooth(T.xfade[1], T.xfade[1] + 0.8, t);
  const tgt = ll(lat, lon, R).add(east.clone().multiplyScalar(CITY_CENTRE.x / 1000 * KM * offK)).add(north.clone().multiplyScalar(-CITY_CENTRE.z / 1000 * KM * offK));
  const pos = tgt.clone().add(up.clone().multiplyScalar(altU)).add(north.clone().multiplyScalar(-altU * Math.tan(8 * D2R)));
  return { pos, tgt, up: north, fov: 44 };
}

// ================================================================ post
const rtOpts = { type: THREE.HalfFloatType, samples: MSAA };
class DualScenePass extends Pass {
  constructor() {
    super(); this.rtA = new THREE.WebGLRenderTarget(W, H, rtOpts); this.rtB = new THREE.WebGLRenderTarget(W, H, rtOpts); this.mix = 0; this.needsSwap = true;
    this.blur = 0; this.shake = [0, 0]; this.zA = 1; this.zB = 1;
    this.mat = new THREE.ShaderMaterial({ uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uBlur: { value: 0 }, uShake: { value: new THREE.Vector2() }, uZA: { value: 1 }, uZB: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `uniform sampler2D tA, tB; uniform float uMix, uBlur, uZA, uZB; uniform vec2 uShake; varying vec2 vUv;
        vec4 sane(vec4 c){ return (any(isnan(c)) || any(isinf(c))) ? vec4(0.) : min(max(c, vec4(0.)), vec4(40.)); }
        vec4 zoomBlur(sampler2D tx, float z){ vec4 acc = vec4(0.); for (int i = 0; i < 28; i++) { float k = float(i)/27.0; vec2 p = vec2(0.5) + (vUv - 0.5)*z*(1.0 - uBlur*k) + uShake; acc += sane(texture2D(tx, p)); } return acc/28.0; }
        void main(){ vec4 a, b; if (uBlur > 0.001) { a = zoomBlur(tA, uZA); b = zoomBlur(tB, uZB); } else { a = sane(texture2D(tA, vUv)); b = sane(texture2D(tB, vUv)); } gl_FragColor = uMix <= 0.0 ? a : (uMix >= 1.0 ? b : mix(a, b, uMix) + max(a,b)*0.25*sin(3.14159*uMix)); }` });
    this.fsq = new FullScreenQuad(this.mat);
  }
  render(renderer, writeBuffer) {
    if (this.mix < 1) { renderer.setRenderTarget(this.rtA); renderer.clear(); renderer.render(city, cityCam); }
    if (this.mix > 0) { renderer.setRenderTarget(this.rtB); renderer.clear(); renderer.render(globe, globeCam); }
    this.mat.uniforms.tA.value = this.rtA.texture; this.mat.uniforms.tB.value = this.rtB.texture; this.mat.uniforms.uMix.value = this.mix;
    this.mat.uniforms.uBlur.value = this.blur; this.mat.uniforms.uShake.value.set(this.shake[0], this.shake[1]); this.mat.uniforms.uZA.value = this.zA; this.mat.uniforms.uZB.value = this.zB;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(renderer);
  }
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
composer.setPixelRatio(1); composer.setSize(W, H);
const dual = new DualScenePass(); composer.addPass(dual);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.35, 0.3); composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uTau: { value: -1 }, uCamPos: { value: new THREE.Vector3() }, uCamR: { value: new THREE.Vector3() }, uCamU: { value: new THREE.Vector3() }, uCamF: { value: new THREE.Vector3() }, uTan: { value: new THREE.Vector2() }, uOrbG: { value: new THREE.Vector3() }, uShockC: { value: new THREE.Vector2(0.5, 0.5) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uFlash; uniform float uTau; uniform vec3 uCamPos, uCamR, uCamU, uCamF, uOrbG; uniform vec2 uTan, uShockC; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  void main(){ vec2 c = vUv - 0.5; float r2 = dot(c,c); vec2 off = c * r2 * 0.012;
    vec2 sw = vec2(0.0); float press = 0.0;
    if (uTau > 0.0) { // the impact as a pressure wave: two ground-plane rings that bend the picture, compressing then stretching it
      vec3 ray = normalize(uCamF + uCamR*((vUv.x*2.0 - 1.0)*uTan.x) + uCamU*((vUv.y*2.0 - 1.0)*uTan.y)); float tt = (uOrbG.y - uCamPos.y)/ray.y;
      if (tt > 0.0) { vec3 wp = uCamPos + ray*tt; float r = length(wp.xz - uOrbG.xz); float amp = 0.0;
        for (int i = 0; i < 2; i++) { float tr = uTau - 0.42*float(i); if (tr > 0.0) { float R = 460.0*(1.0 - exp(-tr/1.0)); float w = 12.0 + 0.07*R; float x = (r - R)/w; amp += exp(-x*x) * sin(x*3.4) * exp(-tr/1.4) / (1.0 + 0.6*float(i)); } }
        sw = normalize(vUv - uShockC + vec2(1e-5)) * amp * 0.042; press = amp; } }
    vec3 col = vec3(texture2D(tDiffuse, vUv + off + sw*1.18).r, texture2D(tDiffuse, vUv + sw).g, texture2D(tDiffuse, vUv - off + sw*0.84).b);
    col = pow(max(col, vec3(0.0)), vec3(0.95)); // lift the shadows a touch
    col *= 1.0 + press * 0.3;
    col *= 1.0 - smoothstep(0.08, 0.62, r2) * 0.7;
    col += vec3(1.0,0.25,0.3) * uFlash;
    col += (h(vUv*vec2(1733.,977.) + fract(uTime*7.13)) - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0); }`
});
composer.addPass(grade); composer.addPass(new OutputPass());

// ================================================================ title overlay
const logoEl = document.getElementById('logo'), wordEl = document.getElementById('word'), fadeEl = document.getElementById('fade');
const FONT_PX = 440 * SC;
wordEl.style.fontSize = FONT_PX + 'px'; wordEl.style.letterSpacing = (-0.025 * FONT_PX) + 'px';
const LOGO_W = 1180 * SC; logoEl.style.width = LOGO_W + 'px';
let dotInfo = null;
function layoutTitle() {
  const logoH = LOGO_W * (256 / 1413), gap = 90 * SC, wordH = FONT_PX * 0.75, total = logoH + gap + wordH;
  const top = H / 2 - total / 2 - 20 * SC;
  logoEl.style.top = top + 'px'; wordEl.style.top = '0px';
  const bl0 = document.getElementById('bl').getBoundingClientRect().top - stage.getBoundingClientRect().top;
  wordEl.style.top = (top + logoH + gap + wordH - bl0) + 'px';
  const c = document.createElement('canvas'); const fs = FONT_PX; c.width = fs; c.height = fs * 1.4; const g = c.getContext('2d');
  g.font = `700 ${fs}px "Bricolage Grotesque"`; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  const base = fs * 1.1; g.fillText('i', 0, base);
  const dotless = g.measureText('ı').actualBoundingBoxAscent;
  const img = g.getImageData(0, 0, c.width, c.height).data;
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
  for (let y = 0; y < base - dotless - 2; y++) for (let x = 0; x < c.width; x++) if (img[(y * c.width + x) * 4 + 3] > 128) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const ir = document.getElementById('ichar').getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const blY = document.getElementById('bl').getBoundingClientRect().top - sr.top;
  dotInfo = { x: ir.left - sr.left + (minx + maxx) / 2, y: blY - (base - (miny + maxy) / 2), r: Math.max(maxx - minx, maxy - miny) / 2 };
}

// ================================================================ frame
function setCam(cam, s, up = V3(0, 1, 0)) { cam.position.copy(s.pos); cam.up.copy(up); cam.lookAt(s.tgt); cam.fov = s.fov; cam.updateProjectionMatrix(); }
function frame(t) {
  U.uTime.value = t;
  // ---------------- city camera
  const cs = cityShot(t);
  { const ts = t - T.impact; if (ts > 0 && ts < 1.5) { // the orb hits the ground: a short, decaying shake
      const amp = Math.exp(-ts / 0.38) * (1 - smooth(1.0, 1.5, ts)), a = 0.0045 * cs.pos.distanceTo(cs.tgt) * amp;
      cs.pos.x += Math.sin(t * 67) * a * 0.6; cs.pos.y += Math.sin(t * 53 + 1) * a * 0.8; cs.pos.z += Math.cos(t * 59) * a * 0.6;
      cs.tgt.x += Math.sin(t * 71 + 2) * a; cs.tgt.y += Math.cos(t * 49) * a * 0.7; cs.tgt.z += Math.sin(t * 43) * a; } }
  { const gy = isLand(cs.pos.x, cs.pos.z) ? groundY(cs.pos.x, cs.pos.z) : 0.2; if (cs.pos.y < gy + 0.7) cs.pos.y = gy + 0.7; }
  setCam(cityCam, cs);
  const camH = Math.max(1, cityCam.position.y);
  cityCam.near = Math.max(0.08, camH * 0.02); cityCam.far = Math.max(9000, camH * 12); cityCam.updateProjectionMatrix();
  U.uCamPos.value.copy(cityCam.position);
  U.uFogDensity.value = 1 / Math.max(1500, camH * 9);
  U.uWidthScale.value = Math.max(1, camH / 260);
  sky.position.copy(cityCam.position); sky.scale.setScalar(cityCam.far * 0.8 / 1000);
  // ---------------- orb
  const op = orbPos(t), oy = orbHeight(t);
  const formed = smooth(T.gather0 + 0.6, T.gatherFull, t);
  const anticip = smooth(T.hover0, T.launch, t);
  const afterImpact = t - T.impact;
  let oi = formed * (1 + 0.16 * Math.sin(t * 9.0) * (1 - anticip) + 0.22 * anticip * Math.sin(t * 15.0));
  oi += 0.8 * Math.exp(-Math.pow((t - T.launch) / 0.08, 2));
  if (afterImpact > 0) oi = 1.8 * Math.exp(-afterImpact / 0.14);
  U.uOrbPos.value.copy(op); U.uOrbI.value = oi;
  const sz = 1;
  const coreS = 0.1 + 0.85 * formed;
  for (const s of [orbCore, orbHalo, orbOuter]) s.position.copy(op);
  orbCore.scale.setScalar(coreS * (afterImpact > 0 ? 1 + afterImpact * 8 : 1)); orbHalo.scale.setScalar(coreS * 4); orbOuter.scale.setScalar(coreS * 9 * (afterImpact > 0 ? 1 + afterImpact * 6 : 1));
  const vis = Math.min(oi, 3); orbCore.material.opacity = clamp(vis); orbHalo.material.opacity = clamp(vis); orbOuter.material.opacity = clamp(vis * 0.8);
  ORB_LIGHT.position.copy(op); ORB_LIGHT.intensity = 60 * oi;
  // filaments and motes drawn up out of the sand; glow, contracting rings and a thin column of light on the ground
  const shift = V3(0, oy - HOVER_Y, 0);
  for (const s of STREAMS) { const p = (t - s.t0) / s.dur; s.mesh.visible = p > 0 && p < 1.45; const u = s.mesh.material.uniforms; u.uHead.value = p; u.uShift.value.copy(shift); u.uAlpha.value = smooth(0, 0.15, p) * (1 - smooth(1.2, 1.45, p)); }
  moteMat.uniforms.uA.value = smooth(T.gather0, T.gather0 + 0.9, t) * (1 - smooth(T.gatherFull + 0.2, T.gatherFull + 1.2, t));
  moteMat.uniforms.uOrbY.value = oy;
  groundGlowMat.uniforms.uA.value = smooth(T.gather0, T.gather0 + 2.0, t) * (afterImpact > 0 ? Math.exp(-afterImpact / 0.2) : 1) * (0.75 + 0.25 * formed) + (afterImpact > 0 ? 0.8 * Math.exp(-afterImpact / 0.15) : 0);
  column.scale.set(0.8 + 0.6 * formed, Math.max(oy * 1.05, 0.01), 1);
  column.material.opacity = 0.42 * formed * (t < T.impact ? 1 : Math.exp(-afterImpact / 0.2));
  const gr = t - T.gatherFull;
  if (gr > 0 && gr < 1.6) { gatherRing.scale.setScalar(0.5 + gr * 8); gatherRingMat.opacity = 0.5 * Math.exp(-gr / 0.4); } else gatherRingMat.opacity = 0;
  // trail while the orb drops
  const tp = tGeo.attributes.position.array, ta = tGeo.attributes.aA.array, ts = tGeo.attributes.aS.array;
  for (let i = 0; i < NT; i++) {
    const tt = Math.min(t, T.impact) - i * 0.012;
    const q = orbPos(Math.max(tt, 0)); tp[i * 3] = q.x; tp[i * 3 + 1] = q.y; tp[i * 3 + 2] = q.z;
    ta[i] = (tt > T.launch && t < T.impact + 0.25 ? 1 : 0) * Math.pow(1 - i / NT, 1.5) * (t > T.impact ? Math.exp(-(t - T.impact) / 0.08) : 1);
    ts[i] = (3.2 * (1 - i / NT) + 0.5) * sz;
  }
  tGeo.attributes.position.needsUpdate = true; tGeo.attributes.aA.needsUpdate = true; tGeo.attributes.aS.needsUpdate = true;
  { const g = grade.uniforms; cityCam.updateMatrixWorld(true); const e = cityCam.matrixWorld.elements;
    g.uCamPos.value.copy(cityCam.position); g.uCamR.value.set(e[0], e[1], e[2]); g.uCamU.value.set(e[4], e[5], e[6]); g.uCamF.value.set(-e[8], -e[9], -e[10]);
    const ty = Math.tan(cityCam.fov * D2R / 2); g.uTan.value.set(ty * cityCam.aspect, ty); g.uOrbG.value.copy(ORB);
    const sc = ORB.clone().project(cityCam); g.uShockC.value.set(sc.x * 0.5 + 0.5, sc.y * 0.5 + 0.5);
    g.uTau.value = (t > T.impact && t < T.xfade[0] && t < T.impact + 5) ? t - T.impact : -1; }
  U.uFront.value = cityFront(t);
  const tau = t - T.impact;
  if (tau > 0) { const rr = 3 + 320 * (1 - Math.exp(-tau / 0.8)); ring.scale.setScalar(rr); ringMat.opacity = 0.35 * Math.exp(-tau / 0.5); pillar.scale.set(2 + tau * 5, 26 * Math.exp(-tau / 0.3), 1); pillar.material.opacity = 0.6 * Math.exp(-tau / 0.25); }
  else { ringMat.opacity = 0; pillar.material.opacity = 0; }
  beam.rotation.y = 1.4 + t * 0.85;
  if (window.__flag) { const p = window.__flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 2; p.setZ(i, Math.sin(x * 1.6 - t * 6) * 0.25 * (x / 4)); } p.needsUpdate = true; }
  shipLights.forEach((s, i) => { s.material.opacity = 0.5 + 0.5 * Math.max(0, Math.sin(t * 3 + i * 1.7)); });

  // ---------------- globe
  const gs = globeShot(t); setCam(globeCam, gs, gs.up);
  const altU = altAt(t) / 1000 * KM;
  globeCam.near = Math.max(altU * 0.05, 0.0005); globeCam.far = 20000; globeCam.updateProjectionMatrix();
  GU.uCamPos.value.copy(globeCam.position);
  const dim = 1 - 0.72 * smoother(T.dim[0], T.dim[1], t);
  GU.uBright.value = dim;
  atmoMat.uniforms.uA.value = smooth(T.web0 + 0.9, T.web0 + 1.9, t) * dim * 0.6;
  webMat.uniforms.uFront.value = webFront(t); webMat.uniforms.uFade.value = dim;
  webMat.uniforms.uWidth.value = Math.max(1.8, (2.4 + 1.6 * (1 - smooth(T.web0 + 0.5, T.web0 + 2.5, t))) * SC * 2);
  const camDist = p => globeCam.position.distanceTo(p);
  cityGlow.scale.setScalar(camDist(cityGlow.position) * 0.05); cityGlow.material.opacity = smooth(T.xfade[0], T.xfade[1] + 0.3, t) * (0.6 + 0.4 * Math.sin(t * 5)) * dim;
  for (const a of arcs) {
    const p = clamp((t - a.t0) / a.dur); const e = 1 - Math.pow(1 - p, 2.2);
    a.mesh.visible = p > 0; a.mesh.material.uniforms.uHead.value = e; a.mesh.material.uniforms.uFade.value = dim;
    if (p > 0 && p < 1) { const i = e * (a.pts.length - 1); const i0 = Math.floor(i), i1 = Math.min(i0 + 1, a.pts.length - 1); a.headSpr.position.lerpVectors(a.pts[i0], a.pts[i1], i - i0); a.headSpr.visible = true; a.headSpr.scale.setScalar(camDist(a.headSpr.position) * 0.018); a.headSpr.material.opacity = dim; }
    else a.headSpr.visible = false;
  }
  for (const { k, s } of citySprites) { const dt = t - arrival[k]; s.visible = dt > 0 && k !== 'newcastle'; if (s.visible) { s.scale.setScalar(camDist(s.position) * (0.011 + 0.03 * Math.exp(-dt * 4))); s.material.opacity = (0.6 + 1.4 * Math.exp(-dt * 3)) * dim; } }

  // ---------------- composite
  dual.mix = smooth(T.xfade[0], T.xfade[1], t);
  { const m = dual.mix, bell = Math.sin(Math.PI * m); // a fast punch through the cut: both scenes zoom, blur radially and shake
    dual.blur = 0.38 * bell; dual.zA = 1 - 0.28 * m * m; dual.zB = 1 - 0.28 * (1 - m) * (1 - m) * (m > 0 ? 1 : 0);
    dual.shake = [0.007 * bell * Math.sin(t * 93.0), 0.007 * bell * Math.cos(t * 71.0)]; }
  grade.uniforms.uTime.value = t;
  bloom.strength = 0.5;
  grade.uniforms.uFlash.value = 0.05 * Math.exp(-Math.pow((t - T.impact - 0.03) / 0.07, 2));
  composer.render();

  // ---------------- overlay: the signal returns home and becomes the dot of the i
  fxc.clearRect(0, 0, W, H);
  const NS = ll(...NEWCASTLE, R * 1.001).project(globeCam);
  const nx = (NS.x * 0.5 + 0.5) * W, ny = (-NS.y * 0.5 + 0.5) * H;
  if (dotInfo && t > T.ret0 && t < T.land + 0.05) {
    const trailN = 26;
    const pathAt = tt => { const k = smoother(T.ret0, T.land, tt); const cx = (nx + dotInfo.x) / 2 + 380 * SC, cy = Math.min(ny, dotInfo.y) - 520 * SC; const u = 1 - k; return [u * u * nx + 2 * u * k * cx + k * k * dotInfo.x, u * u * ny + 2 * u * k * cy + k * k * dotInfo.y]; };
    fxc.globalCompositeOperation = 'lighter';
    for (let i = trailN; i >= 0; i--) {
      const tt = t - i * 0.012 * Math.min(1, (T.land - T.ret0) / 0.85); if (tt < T.ret0) continue;
      const [x, y] = pathAt(tt); const a = Math.pow(1 - i / trailN, 1.6);
      const rad = (dotInfo.r * 0.9 + 10 * SC) * (1 - i / trailN * 0.85);
      const g2 = fxc.createRadialGradient(x, y, 0, x, y, rad * 2.2);
      g2.addColorStop(0, `rgba(255,${i === 0 ? 220 : 40},${i === 0 ? 220 : 60},${(i === 0 ? 1 : 0.35) * a})`); g2.addColorStop(0.35, `rgba(235,0,40,${0.18 * a})`); g2.addColorStop(1, 'rgba(235,0,40,0)');
      fxc.fillStyle = g2; fxc.beginPath(); fxc.arc(x, y, rad * 2.2, 0, Math.PI * 2); fxc.fill();
    }
    fxc.globalCompositeOperation = 'source-over';
  }
  const land = t - T.land;
  if (dotInfo && land > -0.05) {
    const pulse = Math.exp(-Math.max(land, 0) / 0.25); const r = dotInfo.r * (1 + 0.6 * pulse);
    fxc.globalCompositeOperation = 'lighter';
    const halo = fxc.createRadialGradient(dotInfo.x, dotInfo.y, 0, dotInfo.x, dotInfo.y, r * 5 + pulse * 300 * SC);
    halo.addColorStop(0, `rgba(235,0,40,${0.55 + 0.4 * pulse})`); halo.addColorStop(1, 'rgba(235,0,40,0)');
    fxc.fillStyle = halo; fxc.beginPath(); fxc.arc(dotInfo.x, dotInfo.y, r * 5 + pulse * 300 * SC, 0, Math.PI * 2); fxc.fill();
    if (land > 0 && land < 1.2) { const rr = dotInfo.r + land * 900 * SC; fxc.strokeStyle = `rgba(235,0,40,${0.6 * (1 - land / 1.2)})`; fxc.lineWidth = 5 * SC; fxc.beginPath(); fxc.arc(dotInfo.x, dotInfo.y, rr, 0, Math.PI * 2); fxc.stroke(); }
    fxc.globalCompositeOperation = 'source-over';
    fxc.fillStyle = '#EB0028'; fxc.beginPath(); fxc.arc(dotInfo.x, dotInfo.y, dotInfo.r, 0, Math.PI * 2); fxc.fill();
    if (pulse > 0.02) { fxc.fillStyle = `rgba(255,220,220,${pulse})`; fxc.beginPath(); fxc.arc(dotInfo.x, dotInfo.y, dotInfo.r * 0.7, 0, Math.PI * 2); fxc.fill(); }
  }
  if (dotInfo) {
    const k = smoother(T.land - 0.02, T.land + 0.55, t);
    const cxp = dotInfo.x / W * 100;
    wordEl.style.clipPath = `inset(-20% ${(100 - cxp) * (1 - k)}% -20% ${cxp * (1 - k)}%)`;
    wordEl.style.opacity = k > 0 ? 1 : 0;
    wordEl.style.filter = `blur(${(1 - smooth(T.land, T.land + 0.7, t)) * 14 * SC}px)`;
    wordEl.style.textShadow = `0 0 ${60 * SC}px rgba(235,0,40,${0.25 + 0.6 * Math.exp(-Math.max(t - T.land, 0) / 0.5)})`;
    wordEl.style.letterSpacing = ((-0.025 + 0.06 * (1 - smoother(T.land, T.land + 1.2, t))) * FONT_PX) + 'px';
    const lk = smoother(T.logo[0], T.logo[1], t);
    logoEl.style.opacity = lk; logoEl.style.transform = `translateX(-50%) translateY(${(1 - lk) * -30 * SC}px)`; logoEl.style.filter = `blur(${(1 - lk) * 10 * SC}px)`;
  }
  // outro: the planet and everything behind the title fade out first (leaving the text and the red dot), then the text fades to black
  const bgOut = T.bgOut || [1e9, 1e9 + 1], fadeOut = T.fadeOut || [1e9, 1e9 + 1];
  renderer.domElement.style.opacity = 1 - smoother(bgOut[0], bgOut[1], t);
  fadeEl.style.opacity = Math.max(1 - smooth(T.fadeIn[0], T.fadeIn[1], t), smoother(fadeOut[0], fadeOut[1], t));
}

// events for the sound design
window.EVENTS = { cut: CUT, T, tWorld: +T_WORLD.toFixed(3), impactOff: +IMPACT_OFF.toFixed(1), arrivals: Object.fromEntries(Object.entries(arrival).map(([k, v]) => [k, +v.toFixed(3)])), arcs: arcs.map(a => ({ a: a.a, b: a.b, t0: +a.t0.toFixed(3), t1: +(a.t0 + a.dur).toFixed(3) })) };
window.renderFrame = async (t) => { frame(t); await new Promise(r => requestAnimationFrame(() => r())); return true; };
window.frame = frame; window.DURATION = DURATION;
window.__probe = { isLand, groundY, terrainH, sandSoft, isSand, ORB, cityShot, appCurve, appLen, appU, altAt, NOB, FORT };
window.__dbg = { THREE, renderer, city, cityCam, globe, globeCam, composer, dual, U, TL: T, trackFn: track };
await document.fonts.load(`700 ${FONT_PX}px "Bricolage Grotesque"`);
await new Promise(r => { if (logoEl.complete) r(); else logoEl.onload = r; });
layoutTitle();
frame(0);
window.READY = true;
console.log('ready', CUT, 'nodes', nodes.length, 'real', realCount, 'edges', edges.length, 'bld', bld.length, 'appLen', appLen.toFixed(0), 'web', web.pts.length, web.E.length, 'maxDist', maxDist.toFixed(0));
