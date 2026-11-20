# Your favorite's favorite — Angelo Studio tote

Pre-sale site for the Angelo Studio tote (`tote.angelostudio.art`) and the
WhatsApp bot that takes the orders.

```
site/     the website (Vite + TypeScript, three.js, GSAP) → GitHub Pages
bot/      the WhatsApp payment bot (Cloudflare Worker + D1)
shared/   catalog.ts — prices, dates, stock, used by both
```

> Work in progress: this README is completed as each phase lands.

## Run the site locally

```bash
cd site
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` and `npm run build` first run `npm run images`, which makes the
AVIF/WebP/JPEG sizes of every photo.

## Change prices, dates, add-ons

Everything lives in **`shared/catalog.ts`**. Edit, push to `main`, done.
The site and the bot read the same file, so they can't disagree.

- Prices are whole pesos: `55000` shows as `$55.000`.
- Dates are Bogotá time (`-05:00`).
- Add-ons: add objects to `addOns`, e.g.
  `{ id: "extra-unbound", label: "Copia adicional de UNBOUND", price: 30000 }`.
  An empty list hides the add-ons block.

## Replace placeholder photos

See [ASSETS.md](ASSETS.md) for the shot list. Drop the real file on top of
the placeholder with the same name in `site/public/assets/` and push.
Team members, roles, Instagram handles and item lists are in
`site/src/data/totes.json`.

## Screenshots

```bash
cd site
node scripts/shots.mjs                 # mobile, tablet, desktop → .shots/
node scripts/shots.mjs "" "" --full    # full-page
```

## Deploys

Push to `main`:

- changes in `site/` or `shared/` → GitHub Actions builds and publishes to
  GitHub Pages (`.github/workflows/pages.yml`).
- changes in `bot/` or `shared/` → the bot is deployed with wrangler (phase 7).

First-time account setup (Cloudflare, Meta, Anthropic, DNS) is in
[SETUP.md](SETUP.md).
