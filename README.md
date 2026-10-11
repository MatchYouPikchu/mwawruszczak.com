# mwawruszczak.com

Personal site of Maciej Wawruszczak. Static HTML, CSS and JavaScript with no build step and no dependencies, hosted on GitHub Pages.

## How it is put together

| Part | File | What it does |
| --- | --- | --- |
| Page | `index.html` | All the words. Everything reads fine without JavaScript. |
| Styles | `assets/css/site.css`, `assets/css/recon.css` | Design tokens are at the top of `site.css` (`--night`, `--paper`, `--flag`, ...). |
| The map | `assets/js/world.js`, `assets/js/world-bake.js` | A relief map drawn with raw WebGL2. The terrain is generated in a Web Worker (`world-bake.js`), so the page never stutters. Without WebGL it draws the same land as a flat 2D survey sheet. |
| The trust ladder | `assets/js/recon.js`, `assets/css/recon.css` | The reconciliation experiment. Its words live in `index.html` between the `EXPERIMENT START` and `EXPERIMENT END` comments. The data is invented and fixed, so every visitor sees the same forty lines. |
| Sound | `assets/js/sound.js` | Generated live with Web Audio. Loaded only after someone presses a sound button. |
| Small behaviours | `assets/js/site.js` | Top bar, the menu on small screens, map stop dots, sound buttons. |
| For AI agents | `llms.txt` | A plain-language summary of who I am and what I think. Keep it in step with the page. |

Fonts are self-hosted from Google Fonts (SIL Open Font License, licences in `assets/fonts/`): Poltawski Nowy, Hanken Grotesk and Geist Mono. No cookies, no analytics, no third-party requests.

## Everyday edits

- **The "Now" line**: search `index.html` for `class="now"` and edit the sentence.
- **A new note**: add an `<li>` to the `<ol class="notes">` list in `index.html` (newest first), and add the link to `llms.txt`.
- **The predictions** ("What I think happens next"): the `<ol class="calls">` list. When you grade them next October, add the verdict after each one rather than deleting it.
- **The portrait**: put a photo at `assets/img/portrait.jpg` (about 1000 × 1250 px, exported for the web so it carries no camera or location data), then replace the placeholder `<div class="photo" aria-hidden="true"></div>` in the About section with `<div class="photo"><img src="/assets/img/portrait.jpg" alt="Maciej Wawruszczak" width="1000" height="1250"></div>`.
- **The social preview image** is `assets/img/og.jpg` (1200 × 630). To make a new one, open `/?og` in a 1200 × 630 window (Chrome DevTools, device toolbar) and capture a screenshot: that mode hides the controls and brightens the contour lines. `/?still=2` holds the camera at a given stop, which helps for other stills.
- **A new edition**: when the page changes meaningfully, bump the edition line in the footer of `index.html` and `lastmod` in `sitemap.xml`.

## The map

The land is the real Karkonosze, seen from the Jelenia Góra basin at night. `assets/data/karkonosze-448.png` (and `-320.png` for phones) is a Copernicus GLO-30 elevation tile resampled to the bake's own grid and encoded as `metres = ((R<<8)|G)/10 - 100`; `assets/data/karkonosze.json` holds the shelters, lakes, streams, paths, summits and settlements from OpenStreetMap, already projected into world units. Both are sampled, not drawn, by `world-bake.js`: it decodes the tile, flattens the lakes to their real surfaces, and bakes the light each shelter, station and town throws on the ground. The streams, shorelines and paths are real geometry in `world.js`, widened in screen space, so they stay hairlines however close the camera comes.

Heights are `(metres - 300) × 0.0175`, which puts Śnieżka at 22.8 units and makes a contour line every 50 m (every fifth, at 250 m, drawn heavier; the 25 m lines between them fade up as the camera closes in, so a near slope is drawn rather than bare). Every shelter, the observatory on Śnieżka and the relay above the Śnieżne Kotły are drawn as map symbols that hold their size in pixels, not as buildings — a hut stays a hut at any distance.

The map stops in `WAY` set where the camera looks for each section: target, distance, pitch, yaw and lens, with `pt`/`pd`/`pp`/`py`/`pf` composing the same stop again for a tall phone screen. Open `?still=2&cam=24,16,-8,44,9,22,30` (target x,y,z, distance, pitch, yaw, lens) to try a camera against the real land before writing it into `WAY`. The labels (`LABELS`) are pinned to real places, and give way to each other in that order: the stop's own labels first, then place names, then the graticule. Height is value and distance is readiness, so keep that true if you move things.

Attribution is not optional: the Copernicus notice and the OpenStreetMap credit in the footer must stay with the map.

Respecting visitors: reduced-motion users get clean cuts between stops instead of camera flights, and the render loop pauses whenever the map is off screen.

## Local preview

Any static server works, for example:

```
python -m http.server 8000
```

then open http://localhost:8000.

## Publishing

GitHub Pages serves the `main` branch from the repository root, and the `CNAME` file holds the custom domain. Every push to `main` goes live within a minute or two.
