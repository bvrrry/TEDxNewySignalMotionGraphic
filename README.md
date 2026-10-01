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
| `long` | 46.1 s | the event opener, played before the show | near final: awaiting sign-off, then 4K render |
| `short` | 10.5 s | a sting before each speaker walks on | built: the long cut from the crossfade onwards, compressed. It fades in from black on the lit city sprawl, punches out to the globe, spreads across the country and the world, brings the orb home to the "i", holds the title, then fades to black. Own audio (take B, short version) |

Final format: 3840 x 2160, 30 fps, H.264 with AAC audio.

## The long cut, beat by beat

1. **0 to 20 s, the glide.** Fades in from black with the camera already moving, straight toward Nobbys lighthouse (the tower and its sweeping beam are the opening image), then past it, round Fort Scratchley, bowing out around the Ocean Baths headland, and a straight run in over the bay to Newcastle Beach. The whole route is smoothed (resampled and averaged) and the look target follows one simple law: lighthouse, then the centre of the arc (the east end of the city), then it settles on the orb about 3 s before the camera stops, so there is nothing to correct at the end and the look direction never turns faster than about 8 degrees per second.
2. **14 to 22 s, the orb is born.** A glow and fine rings in the sand draw in light filaments and motes that spiral up into an orb. It floats up, then drops back into the ground.
3. **22.7 to 30 s, the signal spreads.** As the orb enters the ground a short camera shake and one or two pressure waves distort the picture like a sound wave (screen-space ripple in the grade pass), while the zoom-out kicks in. The tilt, swing and aim of the camera are driven by one shared progress value (the log of the height climbed), so the rotation is built into the zoom as a single smooth move rather than two. Streets, then buildings, light outward while the camera keeps rising to a top-down view of the city.
4. **30.3 to 31 s, city to globe.** A fast zoom-blur punch with a little shake hides the change from detailed map to the satellite view.
5. **31 to 38.7 s, across the country, then the world.** The zoom-out from the state to the whole country is very quick (about 2 s, eased in and out), and the rotation round the earth begins during that zoom and runs slowly through to the title, so Australia stays framed in the lower left when the logo and "Signal" appear. A web sprawls out from Newcastle across Australia, reaching the other cities one by one, then arcs fly out to the rest of the world.
6. **38.7 to 46.1 s, home.** The orb returns and lands as the dot of the "i". The planet and background fade, the text holds for a moment, then fades to black.

## Creative decisions (agreed with Will)

These came out of review and should carry forward:

- **Camera:** slow, smooth, one wide arc that keeps its focus on the locus of the arc (`FOCUS`); never fast or jerky. It may stay a little off the coast at the headlands.
- **No people.** The orb forms from the ground. (An earlier mannequin was dropped.)
- **Geography follows the real coastline, exactly.** The coast, Nobbys Head and breakwall, Nobbys Beach, Fort Scratchley, the baths and Newcastle Beach are as in the OpenStreetMap data. Edits to the coast in earlier rounds (carving a plateau into sea, submerging the Nobbys peninsula) made the scale and geography wrong and were reverted: do not reshape the coastline. What is kept: the Nobbys peninsula has no cottages, lights or small structures; Shortland Esplanade runs along the real coast from the fort to Nobbys Beach as a plain road that lights up with the signal (class 8: no lamps, no buildings).
- **Street lights are real-looking lamps on poles** along the beach footpath and the wall esplanade, not floating glow orbs.
- **Lighting:** a modest ambient lift so the baths, sea and buildings read, without losing the night mood. Windows are warm amber with a few red-orange ones, and glow a little.
- **The spread is a sprawl** over the whole country (not a letter shape). It must reach the coasts before the world arcs begin.
- **Outro:** planet and background fade first, the text holds 1 to 2 s, then everything fades to black. The text stays up longer than it did originally.
- **Audio: take B is the chosen one** (piano-led, A minor lifting to A major). Three takes were made; A and C are kept as alternates. Take A (`audio.py`) is dark and drone-led (sub drone, saw pads, choir, braam hits, subtle beat). Take B (`audio_b.py`) is more musical: a felt-piano arpeggio in A minor, string pads, taiko-style drums building to the impact, staccato strings through the rise, lifting to A major at the title. Take C (`audio_c.py`) is a trailer-style build in D minor lifting to D major: a driving cello ostinato from the orb's birth, celesta bells, taiko into the impact, brass swells into the title. All three have bells on each city and a long reverb. The soundtrack is finalised last, after the picture is locked.

## Where things live

All timings are in `timelines.json` (per cut); `main.js` reads them, so re-timing a beat is a JSON edit.

- `approachEnd`, `appRamp`: the glide and its speed profile (ease up, cruise, long ease down). The path is `APP_PTS` in `main.js`.
- `gather0`, `gatherFull`, `hover0`, `launch`, `impact`: the orb forms, rises and drops.
- `alt`, `frontK`, `zoom0`: the single continuous rise (the zoom accelerates steadily through the crossfade to the globe, with no slow patch) (`alt` is camera height in metres; tilt, swing and aim all follow height; the zoom launches the instant of the impact), and the street lighting, which is `frontK` times how far the camera has risen, so it accelerates exactly as smoothly as the zoom (`zoom0` is only used by the audio). `frontK` is kept near 0.5 so the leading edge of the signal stays on screen and keeps expanding right through the crossfade; the country-wide web uses the same value.
- `xfade`, `web0`, `worldKm`: city to globe, when the web starts, and how far it must spread before world arcs may start.
- `globeLat` / `globeLon`: where the globe camera looks over time.
- `dim`, `ret0`, `land`, `logo`: globe dims, orb returns, lands as the i-dot, logo fades in.
- `bgOut`, `fadeOut`: planet and background fade out, then the text fades to black.

## Files

- `index.html`: stage and the title overlay (logo + "Signal"), import map.
- `main.js`: the whole scene. Land masks, terrain, OSM streets and buildings, landmarks, beach lamps and footpaths, the orb and its effects, the street front, the globe, the Australia web, world arcs, post-processing, the title overlay. `window.renderFrame(t)` renders time `t` deterministically.
- `timelines.json`: every timing and camera key for both cuts.
- `render.js`: puppeteer driver. Renders stills or an MP4 at any resolution and writes `events_<cut>.json` (city arrival times, arcs, world timing) for the audio.
- `audio.py`, `audio_b.py`, `audio_c.py`: three synthesised sound designs (takes A, B and C), timed from `timelines.json` and `events_<cut>.json`. Output `signal_audio_<cut>.wav`, `_b.wav` and `_c.wav`.
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
- **Previews** (about 4 minutes for the long cut, 1 minute for the short, on a normal GPU). The two current previews are `previews/preview long.mp4` and `previews/preview short.mp4`:

```bash
node render.js --cut long  --w 1280 --h 720 --gpu 1 --msaa 2 --preset veryfast --crf 22 --out previews/silent_long.mp4
node render.js --cut short --w 1280 --h 720 --gpu 1 --msaa 2 --preset veryfast --crf 22 --out previews/silent_short.mp4
python audio_b.py long ; python audio_b.py short
ffmpeg -i previews/silent_long.mp4  -i signal_audio_long_b.wav  -c:v libx264 -crf 25 -c:a aac -b:a 192k -shortest "previews/preview long.mp4"
ffmpeg -i previews/silent_short.mp4 -i signal_audio_short_b.wav -c:v libx264 -crf 25 -c:a aac -b:a 192k -shortest "previews/preview short.mp4"
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
3. Sign off the short cut, then render it at 4K too (same command with `--cut short`).

## Credits

Map data (c) OpenStreetMap contributors (ODbL). Coastlines: Natural Earth via world-atlas.
