# CLAUDE.md: working on the Signal opener

Read README.md first (purpose, goals, beats, creative decisions). Key facts for making changes safely:

- Deterministic rendering: every visual is a pure function of time `t` (seeded RNG `mulberry32(20261031)`). Never use `Math.random()` or wall-clock time.
- Retiming: edit `timelines.json`, not `main.js`. The audio follows automatically (`python audio.py <cut>` after `render.js` has written `events_<cut>.json`).
- Coordinates: city scene in metres, x east, z south, origin at Newcastle Beach (-32.9305, 151.7870). Globe radius 100 units; `ll(lat, lon)` converts.
- Brand: red `#EB0028` (linear `0.831, 0, 0.0212` in shaders), dark theme, title font Bricolage Grotesque 700, logo `logo.png` above the word. The orb lands as the dot of the "i" (the word is rendered with a dotless i; the dot position is measured from the font at load).
- OSM data in `data/` was extracted via Overpass (the cloud sandbox cannot reach OSM directly). Treat it as fixed input. The film edits the geography on top of it (see below).

## Scene notes

- The orb is born at `ORB` (Newcastle Beach sand) and the street front starts there (`IMPACT_OFF` = beach to the first street). No people or rigged models.
- Camera: `cityShot` is the approach spline (`APP_PTS`: one arc from the sea to the beach, look-ahead along the path, no pans) then `riseShot`, driven by the `alt` keys (tilt, swing and aim all follow height). The camera looks at `FOCUS` (the arc's locus) and the aim drifts onto the orb; keep the look turn under about 8 deg/s (`node speed.js` prints it). Check path changes with `node asciimap.js ...`, `node probe.js --path 1 ...` and `node speed.js`. Keep cruise speed and yaw gentle: the old camera was judged too fast and janky.
- Geography: the coastline is exactly the OSM data. Never carve, fill or reshape it (rounds that did were rejected for wrong scale and geography). `inNob` only keeps roads, buildings and procedural suburbs off the Nobbys peninsula; Shortland Esplanade is a class 8 road along the real coast (no lamps, no buildings).
- Lamps: use `streetLamp(x, z, lean)` (pole, arm, head, glow, flat light pool) and `footpath(points)`. No floating glow orbs for street lights.
- Lighting is deliberately low: a modest ambient lift only. When tuning, compare with the night mood in the README before brightening anything (an earlier pass was far too bright).
- The web across Australia is the original sprawl (log-radial points, nearest-neighbour edges). The half-"x" shape was tried and rejected.
- The impact is a screen-space sound-wave distortion in the `grade` pass (`uTau`, ground-plane rings reconstructed from the camera), not light rings; keep light effects minimal there. City to globe uses a zoom-blur and shake in `DualScenePass` (`blur`, `shake`, `zA`, `zB`, set in `frame()` from `T.xfade`).
- Outro: `bgOut` fades the WebGL canvas, `fadeOut` fades the whole stage to black. Both are read from `timelines.json`.

## Tooling

- Windows: Chrome is found automatically; use `--gpu 1` for speed. The local server on port 8123 must be running (`start_preview.bat` or `python -m http.server 8123`).
- Check changes with low-res stills before long renders, then look at the PNGs (`python sheet.py <dir> <out.png> <cols>` makes a contact sheet).
- When patching `main.js` from a script, write the patch to a file; shell quoting mangles GLSL backticks.
- SwiftShader gotchas already hit: `exp()` of a huge argument multiplied by 0 gives NaN and bloom spreads it over the whole frame (the composite pass sanitises NaN, but keep shader maths clamped); very large single triangles mis-rasterise depth at some resolutions, so keep big planes subdivided; screen-space strip materials must be `DoubleSide`.
