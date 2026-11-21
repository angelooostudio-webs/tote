# Assets — shot list

All files live in `site/public/assets/`. Every one already exists as a
canvas-colored placeholder with a label, so the site never shows a broken
image. To replace one, drop a real file with **the same name** on top of it.
The build makes the AVIF/WebP/small versions by itself.

Export JPEG, sRGB, quality ~90. Larger is fine; the build resizes down.

| File | Size (px) | Ratio | Where it appears | Shot notes |
|---|---|---|---|---|
| `people/01.jpg` | 1600 × 2000 | 4:5 | 02 / Contigo, back card of the stack | Person holding the tote, printed side visible. Plain or warm background. |
| `people/02.jpg` | 1600 × 2000 | 4:5 | 02 / Contigo | A different person, tote on the shoulder. |
| `people/03.jpg` | 1600 × 2000 | 4:5 | 02 / Contigo | Walking shot, El Retiro street or plaza. |
| `people/04.jpg` | 1600 × 2000 | 4:5 | 02 / Contigo, front card (seen first) | Strongest image. Print clearly readable. |
| `totes/miguel.jpg` | 1600 × 1600 | 1:1 | 03 / ¿Qué llevan?, Miguel's card | Top-down flat-lay of what he carries, tote included. Even light, no harsh shadows. |
| `totes/guadalupe.jpg` | 1600 × 1600 | 1:1 | 03 / ¿Qué llevan? | Same setup as above. |
| `totes/samantha.jpg` | 1600 × 1600 | 1:1 | 03 / ¿Qué llevan? | Same setup. |
| `totes/libni.jpg` | 1600 × 1600 | 1:1 | 03 / ¿Qué llevan? | Same setup. |
| `totes/jhohan.jpg` | 1600 × 1600 | 1:1 | 03 / ¿Qué llevan? | Same setup. |
| `totes/martin.jpg` | 1600 × 1600 | 1:1 | 03 / ¿Qué llevan? | Same setup. |
| `og.jpg` | 1200 × 630 | 1.91:1 | Link preview on WhatsApp, Instagram, X | Tote on paper background + "Your favorite's favorite". Keep text inside the middle 1000 px. |
| `wordmark.svg` | vector | — | Favicon | ANGELO / STUDIO wordmark, black, outlined paths (no live text). Not created yet. |
| `hero-poster.jpg`, `hero-poster-print.jpg` | 1080 × 1440 | 3:4 | First paint of the hero / reduced-motion version | **Made automatically** from the first and last frame of the turn video. |

## The turn video (hero)

The hero is the product render (1440 × 1920, 24 fps, plain side → print, **on pure black**), turned into an image sequence that scrolling scrubs through: every 4th frame, background keyed out, shown on the page's paper with a soft contact shadow. To replace it with a new render, keep the background pure black (#000) and end with the print facing the camera:

```bash
cd site
swift scripts/extract-frames.swift "/path/to/new-video.mp4" /tmp/tote-frames
node scripts/encode-frames.mjs /tmp/tote-frames 4      # every 4th frame, keyed → public/assets/turn/, posters
```

## Flat-lay hotspots

In `site/src/data/totes.json`, each item has `x` and `y` (0 to 1, from the
photo's top-left corner). On desktop, hovering an item lights up that spot.
After the real photo is in, open it, find the center of each object, and
write its position as a fraction of width and height
(e.g. 400 px from the left of a 1600 px photo → `x: 0.25`).
