# TEDxNewy — "Signal" opener

A real-time Three.js scene of Newcastle (NSW), rendered frame-by-frame in headless Chrome and encoded to MP4.
One scene, two cuts:

| cut | length | use |
|---|---|---|
| `long`  | 46.6 s | event opener: slow glide in from the sea past Nobbys lighthouse, round Fort Scratchley and the Ocean Baths to Newcastle Beach; an orb is born in the sand, rises and drops back into the ground; the signal lights the streets while the camera rises in one continuous move; it spreads across Australia as the left half of the TEDx "x"; world arcs; the orb returns to become the dot of the "i" in **Signal**; the planet fades, the text holds, then fades to black |
| `short` | 8.6 s | pre-talk sting. **Parked**: it runs but has not been retimed for the new scene yet |

## Story beats and where they live

All timings are in `timelines.json` (per cut). `main.js` reads them, so re-timing a beat is a JSON edit.

- `approachEnd`, `appRamp`: the glide in from the sea. Speed follows a velocity profile (ease up over appRamp[0] s, cruise, long ease down over appRamp[1] s). Waypoints are `APP_PTS` in main.js.
- `gather0`, `gatherFull`, `hover0`, `launch`, `impact`: the orb forms from the sand, rises, drops into the ground.
- `front`, `zoom0`, `alt`: street front speed and the single continuous rise (`alt` is camera height in metres; tilt, swing and aim all follow height).
- `xfade`, `web0`, `armKm`, `worldFrac`: city to globe, the half-x web (two arms from Newcastle, through Darwin and Melbourne), and when world arcs may start.
- `globeLat` / `globeLon`: where the globe camera looks over time.
- `dim`, `ret0`, `land`, `logo`: globe dims, orb returns, lands as the i-dot, logo fades in.
- `bgOut`, `fadeOut`: the planet and background fade out leaving the text, then the text fades to black.

## Files

- `index.html` — stage, title overlay (logo + "Signal" in Bricolage Grotesque 700), import map.
- `main.js` — the whole scene: land masks, terrain, OSM streets and buildings, landmarks (Nobbys lighthouse, Fort Scratchley, Ocean Baths, breakwalls, coal ships), the person (rigged Xbot, posed with 2-bone IK), orb + energy streams, network front, globe + Australia web + world arcs, post-processing, title overlay. `window.renderFrame(t)` renders time `t` deterministically.
- `render.js` — puppeteer driver: renders stills or an MP4 at any resolution; also writes `events_<cut>.json` (city arrival times, arcs) for the audio.
- `audio.py` — synthesised sound design, timed from `timelines.json` + `events_<cut>.json`.
- `data/coast.txt`, `data/roads.txt`, `data/buildings.txt` — OpenStreetMap extracts (coastline, harbour, breakwalls, streets, building footprints as oriented boxes) in local metres. Origin −32.9305, 151.7870 (Newcastle Beach); x east, z south.
- `logo.png`, `bricolage-grotesque-latin-*.woff2` — brand assets.

## Preview

- **Live scrub preview:** double-click `start_preview.bat` (starts the local server and opens `preview.html`). Drag the slider or jump to a beat; it renders any moment on demand.
- **Draft video:** `node render.js --cut long --w 1280 --h 720 --gpu 1 --msaa 2 --preset veryfast --crf 20 --out previews/long_draft_silent.mp4` (about 3 min on a normal GPU), then `python audio.py long` and mux with ffmpeg.
- `--gpu 1` makes render.js use the real GPU instead of SwiftShader (roughly 20x faster).
- Dev tools: `probe.js` (render from any camera, optionally with the flight path drawn), `asciimap.js` (land/sea map with the path), `speed.js` (flight speed and height profile).

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

Map data © OpenStreetMap contributors (ODbL). Coastlines: Natural Earth via world-atlas.
