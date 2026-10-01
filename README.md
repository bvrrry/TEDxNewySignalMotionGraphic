# TEDxNewy "Signal": event opener

An animated opener for TEDxNewy 2026, built as a real-time Three.js scene of Newcastle (NSW) and rendered frame by frame in headless Chrome to MP4 (up to 4K).

## Purpose and goals

**What it is for.** The video opens the TEDxNewy event and sets up the 2026 theme, **Signal**: an idea starts as a spark in one place and spreads outward until it reaches everyone. It is played on the big screen before the show, and a short version plays before each speaker walks on stage.

**The story in one line.** An orb of light is born in the sand of Newcastle Beach, drops into the ground, and the signal runs out through the streets, across the country and around the world, then comes home to become the dot of the "i" in **Signal**.

**What it should feel like.** Calm, confident and cinematic, never rushed. No sharp pans or fast turns. Moody night colours (black, deep red, warm window lights) so the TEDx red `#EB0028` always reads as the hero. Local and recognisable: the real Newcastle coast, streets and buildings (OpenStreetMap), Nobbys lighthouse, Fort Scratchley, the Ocean Baths and Newcastle Beach.

**Brand rules.** TEDx red `#EB0028`, dark theme, title in Bricolage Grotesque 700 with the TEDxNewy logo above the word. The orb must land as the dot of the "i". The planet and background fade first, the text holds, then fades to black.

**Deliverables.**

| cut | length | use | status |
|---|---|---|---|
| `long` | 46.1 s | the event opener, played before the show | near final: awaiting sign-off, then 4K render and final audio mix |
| `short` | 8.6 s | a sting before each speaker walks on | **parked**: it runs but has not been retimed for the current scene; a bird's-eye signal spreading out through Newcastle, then the same world view and "i" outro |

Final format: 3840 x 2160, 30 fps, H.264 with AAC audio.

## The long cut, beat by beat

1. **0 to 20 s, the glide.** From the sea off Nobbys lighthouse, one wide arc: past the lighthouse and its sweeping beam, round Fort Scratchley, bowing out around the Ocean Baths headland, then a straight run in over the bay to Newcastle Beach. The camera goes wide but keeps looking in at the centre of the arc (the east end of the city), then the aim drifts onto the orb as it eases to a stop. Look direction turns at 8 degrees per second or less.
2. **14 to 22 s, the orb is born.** A glow and fine rings in the sand draw in light filaments and motes that spiral up into an orb. It floats up, then drops back into the ground.
3. **22.7 to 30 s, the signal spreads.** The orb hits the ground with a short camera shake and fast ripples through the sand; streets, then buildings, light outward while the camera rises quickly at first in one continuous move, tilting and swinging round to a top-down view of the city.
4. **30.3 to 31 s, city to globe.** A fast zoom-blur punch with a little shake hides the change from detailed map to the satellite view.
5. **31 to 38.7 s, across the country, then the world.** The zoom-out from the state to the whole country is very quick (about 2 s, eased in and out), then slows into a rotation round the earth. A web sprawls out from Newcastle across Australia, reaching the other cities one by one, then arcs fly out to the rest of the world.
6. **38.7 to 46.1 s, home.** The orb returns and lands as the dot of the "i". The planet and background fade, the text holds for a moment, then fades to black.

## Creative decisions (agreed with Will)

These came out of review and should carry forward:

- **Camera:** slow, smooth, one wide arc that keeps its focus on the locus of the arc (`FOCUS`); never fast or jerky. It may stay a little off the coast at the headlands.
- **No people.** The orb forms from the ground. (An earlier mannequin was dropped.)
- **Geography follows the real coastline.** Nobbys Head, Nobbys Beach, the peninsula and Fort Scratchley are as in the OpenStreetMap data (a round-3 attempt to submerge the peninsula made the lighthouse sit on a strange long stretch and was reverted). The Nobbys peninsula has no cottages, lights or small structures. The only edit is that the empty plateau between the fort and the Ocean Baths is open sea against a retaining wall with the esplanade (road, footpath, street lamps) on top. The Ocean Baths are one rectangular pool and one circular pool. See `CARVE`, `WALL`, `inNob` and the Nobbys block in the land mask in `main.js`.
- **Street lights are real-looking lamps on poles** along the beach footpath and the wall esplanade, not floating glow orbs.
- **Lighting:** a modest ambient lift so the baths, sea and buildings read, without losing the night mood. Windows are warm amber with a few red-orange ones, and glow a little.
- **The spread is a sprawl** over the whole country (not a letter shape). It must reach the coasts before the world arcs begin.
- **Outro:** planet and background fade first, the text holds 1 to 2 s, then everything fades to black. The text stays up longer than it did originally.
- **Audio:** cinematic (drone, pads, choir, braam hits, bells on each city, long reverb) with a subtle beat for energy. Soundtrack is finalised last, after the picture is locked.

## Where things live

All timings are in `timelines.json` (per cut); `main.js` reads them, so re-timing a beat is a JSON edit.

- `approachEnd`, `appRamp`: the glide and its speed profile (ease up, cruise, long ease down). The path is `APP_PTS` in `main.js`.
- `gather0`, `gatherFull`, `hover0`, `launch`, `impact`: the orb forms, rises and drops.
- `front`, `zoom0`, `alt`: how fast the street lighting spreads, and the single continuous rise (`alt` is camera height in metres; tilt, swing and aim all follow height).
- `xfade`, `web0`, `worldKm`: city to globe, when the web starts, and how far it must spread before world arcs may start.
- `globeLat` / `globeLon`: where the globe camera looks over time.
- `dim`, `ret0`, `land`, `logo`: globe dims, orb returns, lands as the i-dot, logo fades in.
- `bgOut`, `fadeOut`: planet and background fade out, then the text fades to black.

## Files

- `index.html`: stage and the title overlay (logo + "Signal"), import map.
- `main.js`: the whole scene. Land masks, terrain, OSM streets and buildings, landmarks, beach lamps and footpaths, the orb and its effects, the street front, the globe, the Australia web, world arcs, post-processing, the title overlay. `window.renderFrame(t)` renders time `t` deterministically.
- `timelines.json`: every timing and camera key for both cuts.
- `render.js`: puppeteer driver. Renders stills or an MP4 at any resolution and writes `events_<cut>.json` (city arrival times, arcs, world timing) for the audio.
- `audio.py`: synthesised sound design, timed from `timelines.json` and `events_<cut>.json`.
- `preview.html`, `start_preview.bat`: live scrub preview.
- `probe.js`, `asciimap.js`, `speed.js`: dev tools (render from any camera with the flight path drawn; ASCII land/sea map with the path; flight speed and height profile).
- `data/`: OpenStreetMap extracts (coastline, harbour, breakwalls, streets, building footprints) in local metres. Origin -32.9305, 151.7870 (Newcastle Beach); x east, z south.
- `logo.png`, `bricolage-grotesque-latin-*.woff2`: brand assets.

## Setup (Windows or Linux)

```bash
npm install                      # three, puppeteer, world-atlas, topojson-client, fonts
python -m pip install numpy scipy
python -m http.server 8123       # the page must be served over http (ES modules); start_preview.bat does this
```

Chrome is found automatically on Windows, else set `$CHROME`. Add `--gpu 1` to use the real GPU (about 20x faster than the software renderer).

## Preview

- **Live scrub preview:** double-click `start_preview.bat`. Drag the slider or jump to a beat; it renders any moment on demand.
- **Draft video** (about 3 minutes on a normal GPU):

```bash
node render.js --cut long --w 1280 --h 720 --gpu 1 --msaa 2 --preset veryfast --crf 22 --out previews/long_draft_silent.mp4
python audio.py long
ffmpeg -i previews/long_draft_silent.mp4 -i signal_audio_long.wav -c:v libx264 -crf 25 -c:a aac -b:a 192k -shortest previews/Signal_long_draft.mp4
```

- **Stills** for quick checks: `node render.js --cut long --w 960 --h 540 --gpu 1 --stills 1,9,15,21,27,35 --outdir stills`

## Final 4K render

```bash
node render.js --cut long --w 3840 --h 2160 --gpu 1 --msaa 0 --crf 16 --out video_long_4k.mp4
python audio.py long
ffmpeg -i video_long_4k.mp4 -i signal_audio_long.wav -c:v copy -c:a aac -b:a 320k -shortest Signal_opener_long_4K.mp4
```

Long renders can be split with `--start` / `--end` and joined with ffmpeg.

## Next steps

1. Sign off the long cut (picture, then audio).
2. Render the long cut at 4K and mux the audio.
3. Retime the short cut: bird's-eye view of the signal spreading through Newcastle, then the same world view and "i" outro.

## Credits

Map data (c) OpenStreetMap contributors (ODbL). Coastlines: Natural Earth via world-atlas.
