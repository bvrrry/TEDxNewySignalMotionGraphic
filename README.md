# TEDxNewy — "Signal" opener

A real-time Three.js scene of Newcastle (NSW), rendered frame-by-frame in headless Chrome and encoded to MP4.
One scene, two cuts:

| cut | length | use |
|---|---|---|
| `long`  | 29.5 s | event opener: drone over Nobbys → Fort Scratchley → Newcastle Beach, a person forms the orb, it flies through the east-end streets, the network spreads, ultra zoom-out, the web races across Australia, arcs to the world, the orb returns to become the dot of the "i" in **Signal** |
| `short` | 7 s    | pre-talk sting: same story compressed (orb launch → streets → spread → globe → title) |

## Story beats and where they live

All timings are in `timelines.json` (per cut). The scene code in `main.js` reads them, so re-timing a beat is a JSON edit.

- `droneEnd`, `gather0`, `gatherFull`, `hover0`, `launch`, `impact` — beach and orb.
- `frontSpeed`, `craneEnd`, `zoom0`, `alt` (camera altitude keys, metres) — the crane-up and ultra zoom-out.
- `xfade` — crossfade from the city scene to the globe scene; `web0` — the Australia web starts spreading.
- `globeLat` / `globeLon` — where the globe camera looks over time.
- `dim`, `ret0`, `land`, `logo` — globe dims, orb returns, lands as the i-dot, logo fades in.

## Files

- `index.html` — stage, title overlay (logo + "Signal" in Bricolage Grotesque 700), import map.
- `main.js` — the whole scene: land masks, terrain, OSM streets and buildings, landmarks (Nobbys lighthouse, Fort Scratchley, Ocean Baths, breakwalls, coal ships), the person (rigged Xbot, posed with 2-bone IK), orb + energy streams, network front, globe + Australia web + world arcs, post-processing, title overlay. `window.renderFrame(t)` renders time `t` deterministically.
- `render.js` — puppeteer driver: renders stills or an MP4 at any resolution; also writes `events_<cut>.json` (city arrival times, arcs) for the audio.
- `audio.py` — synthesised sound design, timed from `timelines.json` + `events_<cut>.json`.
- `data/coast.txt`, `data/roads.txt`, `data/buildings.txt` — OpenStreetMap extracts (coastline, harbour, breakwalls, streets, building footprints as oriented boxes) in local metres. Origin −32.9305, 151.7870 (Newcastle Beach); x east, z south.
- `models/Xbot.glb` — humanoid from the three.js examples (Mixamo character).
- `logo.png`, `bricolage-grotesque-latin-*.woff2` — brand assets.

## Setup

```bash
npm install                      # three, puppeteer, world-atlas, topojson-client, fonts
python3 -m pip install numpy scipy
python3 -m http.server 8123 &    # the page must be served over http (ES modules)
```

Chrome: `render.js` uses `$CHROME` if set, else `/opt/google/chrome/chrome`. Any Chrome/Chromium/headless-shell works; WebGL runs on SwiftShader (CPU) when there is no GPU.

## Preview and render

```bash
# stills (fast checks)
node render.js --cut long  --w 960 --h 540 --stills 1,9,14.5,20.7,23,27 --outdir stills
# draft video
node render.js --cut short --w 960 --h 540 --msaa 2 --preset veryfast --crf 20 --out draft_short.mp4
# final 4K
node render.js --cut long  --w 3840 --h 2160 --msaa 0 --crf 16 --out video_long_4k.mp4
# audio + mux
python3 audio.py long
ffmpeg -i video_long_4k.mp4 -i signal_audio_long.wav -c:v copy -c:a aac -b:a 320k -shortest Signal_opener_long_4K.mp4
```

You can also open `http://localhost:8123/index.html?cut=long&w=1920&h=1080` in a browser and call `renderFrame(12.3)` from the console to inspect any moment.

Render cost on a 2-core CPU with SwiftShader: roughly 3 s/frame at 960×540 and 25–40 s/frame at 4K. A machine with a real GPU is far faster. Long renders can be split with `--start`/`--end` and concatenated with ffmpeg.

## Credits

Map data © OpenStreetMap contributors (ODbL). Coastlines: Natural Earth via world-atlas. Humanoid: three.js examples (Mixamo).
