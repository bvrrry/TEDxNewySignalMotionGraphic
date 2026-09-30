# CLAUDE.md — working on the Signal opener

Read README.md first. Key facts for making changes safely:

- Deterministic rendering: every visual is a pure function of time `t` (seeded RNG `mulberry32(20261031)`). Never use `Math.random()` or wall-clock time.
- Retiming: edit `timelines.json`, not `main.js`. The audio follows automatically (`python3 audio.py <cut>` after `render.js` has written `events_<cut>.json`).
- Coordinates: city scene in metres, x east, z south, origin at Newcastle Beach (−32.9305, 151.7870). Globe radius 100 units; `ll(lat, lon)` converts.
- Brand: red `#EB0028` (linear `0.831, 0, 0.0212` in shaders), dark theme, title font Bricolage Grotesque 700, logo `logo.png` above the word. The orb lands as the dot of the "i" (the word is rendered with a dotless ı; the dot position is measured from the font at load).
- SwiftShader gotchas already hit: any `exp()` of a huge argument multiplied by 0 gives NaN and bloom spreads it over the whole frame (the composite pass sanitises NaN, but keep shader maths clamped); very large single triangles (e.g. an un-subdivided 400 km plane) mis-rasterise depth at some resolutions — keep big planes subdivided; screen-space strip materials must be `DoubleSide`.
- Check changes with low-res stills before long renders: `node render.js --cut long --w 960 --h 540 --stills 1,9,14.5,20.7,23,27 --outdir stills`, then look at the PNGs.
- OSM data in `data/` was extracted via Overpass (the cloud sandbox cannot reach OSM directly). Treat it as fixed input.
