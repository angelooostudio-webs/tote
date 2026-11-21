# Your favorite's favorite — Angelo Studio tote

Pre-sale site for the Angelo Studio tote (`tote.angelostudio.art`) and the
WhatsApp bot that takes the orders.

```
site/     the website (Vite + TypeScript, GSAP, image-sequence hero) → GitHub Pages
bot/      the WhatsApp payment bot (Cloudflare Worker + D1)
shared/   catalog.ts — prices, dates, stock, used by both
```

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

## Checks (with `npm run dev` running in `site/`)

```bash
cd site
node scripts/shots.mjs                 # screenshots: mobile, tablet, desktop → .shots/
node scripts/sheet-test.mjs mobile,tablet,desktop   # 40 order-sheet checks
node scripts/a11y.mjs                  # axe accessibility audit, every pre-sale state + the sheet
node scripts/brand-images.mjs          # re-render og.jpg and the icons in Spalla (after copy changes)
```

Last Lighthouse run (mobile, production build): Performance 99 · Accessibility 100
· Best Practices 100 · SEO 100.

## The WhatsApp bot (`bot/`)

A Cloudflare Worker with a D1 (SQLite) database. Customers' orders arrive as the
prefilled WhatsApp message from the site; the bot checks them against
`shared/catalog.ts`, recomputes the total, reserves stock for 24 h and sends the
payment details. Payment screenshots are read by Claude, checked by code, and
sent to Angelo to confirm. **The bot never confirms an order on its own.**

### Try it locally (no Meta, no Cloudflare, no API key)

```bash
cd bot
npm install
npm test            # 54 tests: parser, totals, checks, the full conversation
npm run simulate    # plays a whole chat: order → screenshot → Angelo confirms → expiry
```

`npm run simulate -- --claude` uses the real Claude for free-form messages
(needs `ANTHROPIC_API_KEY` in your shell).

### Secrets (once, after SETUP.md)

From `bot/`, each command asks for the value:

```bash
npx wrangler secret put WHATSAPP_TOKEN            # permanent system-user token
npx wrangler secret put META_APP_SECRET           # Meta app → Settings → Basic
npx wrangler secret put WEBHOOK_VERIFY_TOKEN      # any long random string; same one in Meta's webhook form
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put CLAUDE_MODEL              # optional; default claude-opus-5-5
npx wrangler secret put ADMIN_NUMBER              # Angelo's WhatsApp, digits only: 573001234567
npx wrangler secret put PAYMENT_NEQUI             # e.g. 300 123 4567
npx wrangler secret put PAYMENT_BANCOLOMBIA       # e.g. Ahorros 123-456789-01
npx wrangler secret put PAYMENT_HOLDER_NAME       # name on the accounts, as banks show it
```

### Angelo's commands (from ADMIN_NUMBER only)

| Write | Does |
|---|---|
| *Confirmar* / *Rechazar* buttons | come with every screenshot to review |
| `OK ANG-7F3K` | confirm (after checking Nequi/Bancolombia) |
| `NO ANG-7F3K el pago no llegó` | reject; the customer sees the reason, the tote goes back to stock |
| `RESUMEN` | counts by status, confirmed totes and revenue, stock left |
| `PENDIENTES` | orders waiting for review |
| `PEDIDO ANG-7F3K` | one order's details |
| `EXPORTAR` | CSV of all orders, sent as a file |

WhatsApp only lets a business send free-form messages to someone who wrote in
the last 24 h — that includes Angelo. **Send the bot any message (e.g.
`RESUMEN`) each morning of the pre-sale** so review requests always reach you.

### Message template `pedido_confirmado`

Used to confirm orders when the customer hasn't written in 24 h. Submit it in
WhatsApp Manager (Utility, Spanish (COL)):

```
Tu pedido {{1}} está confirmado. UNBOUND sale el {{2}}. Te escribimos por este chat para coordinar la entrega.
```

### Live stock on the site

Once the bot is deployed, put its URL in `shared/catalog.ts` → `botBaseUrl`
(e.g. `"https://tote-bot.<subdomain>.workers.dev"`) and push. The site then shows
"QUEDAN XX DE 75" from `GET /stock`; until then the counter stays hidden.

## Seeing every pre-sale state locally

With `npm run dev` running in `site/`, open:

- before (countdown): http://localhost:5173/
- open (Ordenar works): http://localhost:5173/?now=2026-11-28T10:00:00-05:00
- closed: http://localhost:5173/?now=2026-12-03T09:00:00-05:00

The `?now=` override only exists in development, never on the live site.

## Deploys

Push to `main`:

- changes in `site/` or `shared/` → GitHub Actions builds and publishes to
  GitHub Pages (`.github/workflows/pages.yml`).
- changes in `bot/` or `shared/` → tests run, D1 migrations apply, and the
  bot deploys with wrangler (`.github/workflows/bot.yml`).

First-time account setup (Cloudflare, Meta, Anthropic, DNS) is in
[SETUP.md](SETUP.md).
