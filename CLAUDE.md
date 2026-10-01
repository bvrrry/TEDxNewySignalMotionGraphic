# CLAUDE.md: working on the Signal opener

Read README.md first (purpose, goals, beats, creative decisions). Key facts for making changes safely:

- Deterministic rendering: every visual is a pure function of time `t` (seeded RNG `mulberry32(20261031)`). Never use `Math.random()` or wall-clock time.
- Retiming: edit `timelines.json`, not `main.js`. The audio follows automatically (`python audio.py <cut>` after `render.js` has written `events_<cut>.json`).
- Coordinates: city scene in metres, x east, z south, origin at Newcastle Beach (-32.9305, 151.7870). Globe radius 100 units; `ll(lat, lon)` converts.
- Brand: red `#EB0028` (linear `0.831, 0, 0.0212` in shaders), dark theme, title font Bricolage Grotesque 700, logo `logo.png` above the word. The orb lands as the dot of the "i" (the word is rendered with a dotless i; the dot position is measured from the font at load).
- OSM data in `data/` was extracted via Overpass (the cloud sandbox cannot reach OSM directly). Treat it as fixed input. The film edits the geography on top of it (see below).

## Scene notes

- The orb is born at `ORB` (Newcastle Beach sand) and the street front starts there (`IMPACT_OFF` = beach to the first street). No people or rigged models.
- Camera: `cityShot` is the approach spline (`APP_PTS`: one arc from the sea to the beach, look-ahead along the path, no pans) then `riseShot`, driven by the `alt` keys (tilt, swing and aim all follow height). The camera looks at `FOCUS` (the arc's locus) and the aim drifts onto the orb; keep the look turn under about 8 deg/s and turn acceleration near zero (`node camlog.js t0 t1 step` prints speed, turn rate and turn acceleration; use it on any camera change, especially at 20 s where the glide hands over to the rise). Check path changes with `node asciimap.js ...`, `node probe.js --path 1 ...` and `node speed.js`. Keep cruise speed and yaw gentle: the old camera was judged too fast and janky.
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
- Route lookups: curves used for camera paths need `arcLengthDivisions` raised (we use 6000); the default of 200 makes speed wobble and shows as a hitch at slow speeds.
- Baths are deliberately dim so they blend with the dark coast; keep them subtle.
- Signal lines must look the same all the way through: road ribbon width scales with camera height only as `camH / 2200` (a faster scale made the lines thick and blurry from ~26 s), lit roads all settle to one level (no long fade behind the front), and the generated suburbs reach 38 km so the sprawl is still going when we cross to the globe.
- Short cut: it is the long cut from the crossfade onwards, so it starts mid-story. `impact`, `launch` and the gather times are set far in the past (negative) so no orb effects play, `alt` starts high so the city is already lit (`frontK` x height), and `approachEnd` is 0. Keep its beats in step with the long cut when the globe or outro changes.
- Lines are drawn at a minimum on-screen width (`uLinePx`) and junction flares fade with height, so every red line looks the same at every height. Camera moves at the drop are averaged over a short window (`riseShot`) so the zoom and rotation start together and ease in.
