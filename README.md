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

The map stops in `world.js` (`WAY`) set where the camera looks for each section of the page: target, distance, pitch and yaw (`pt` is an optional target for tall phone screens, where the words sit below the land instead of beside it). The labels (`LABELS`) are pinned to places on the land. The features in `F` (peaks, plateau, river, trails) are what the terrain is built around. Height is value and distance is readiness, so keep that true if you move things.

Respecting visitors: reduced-motion users get clean cuts between stops instead of camera flights, and the render loop pauses whenever the map is off screen.

## Local preview

Any static server works, for example:

```
python -m http.server 8000
```

then open http://localhost:8000.

## Publishing

GitHub Pages serves the `main` branch from the repository root, and the `CNAME` file holds the custom domain. Every push to `main` goes live within a minute or two.
