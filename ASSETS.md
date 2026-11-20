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
| `unbound-cover.jpg` | 1200 × 1600 | 3:4 | Hero: cover of the small 3D magazine that spills out | Flat scan/export of the UNBOUND cover, no mockup. |
| `og.jpg` | 1200 × 630 | 1.91:1 | Link preview on WhatsApp, Instagram, X | Tote on paper background + "Your favorite's favorite". Keep text inside the middle 1000 px. |
| `wordmark.svg` | vector | — | 3D tote print and favicon | ANGELO / STUDIO wordmark exactly as printed on the tote, black, outlined paths (no live text). Not created yet: the site uses Spalla until this file exists. |
| `hero-poster.jpg` | 1200 × 1500 | 4:5 | First paint of the hero, before 3D loads | **Rendered automatically from the 3D scene** — do not shoot. |

## Flat-lay hotspots

In `site/src/data/totes.json`, each item has `x` and `y` (0 to 1, from the
photo's top-left corner). On desktop, hovering an item lights up that spot.
After the real photo is in, open it, find the center of each object, and
write its position as a fraction of width and height
(e.g. 400 px from the left of a 1600 px photo → `x: 0.25`).
