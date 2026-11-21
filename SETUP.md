# Setup — the steps only you can do

Do these in order. **Start step 3 today**: Meta's business checks and the
message-template review can take several days, and the pre-sale opens on
27.11.

Nothing here goes in the repo. The repo is public.

---

## 0. GitHub CLI (needed to publish the site)

```bash
brew install gh
gh auth login        # choose GitHub.com, sign in as angelooostudio-webs
```

## 1. Cloudflare account and API token

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Note your **Account ID**: dashboard → any domain or *Workers & Pages* →
   right-hand sidebar.
3. *My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"
   template*. Add permission **Account · D1 · Edit**. Create it and copy the
   token (shown once).
4. In GitHub: repo `angelooostudio-webs/tote` → *Settings → Secrets and
   variables → Actions → New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the account ID

### 1b. The bot's database (once)

```bash
cd bot
npx wrangler login
npx wrangler d1 create tote-bot
```

Copy the `database_id` it prints into `bot/wrangler.toml` (replace the
`00000000-…` placeholder) and push. Then set the secrets listed in the
README ("Secrets") and push again: GitHub Actions deploys the bot and prints its
URL (`https://tote-bot.<your-subdomain>.workers.dev`).

## 2. Anthropic API key

1. <https://console.anthropic.com> → sign in → *Settings → Billing*: add a
   card and a small credit (USD 10 is plenty for this drop).
2. *API Keys → Create Key*, name it `tote-bot`. Copy it (shown once).
   You will paste it in step 4 of the README (`wrangler secret put`).

## 3. Meta: WhatsApp Business Platform

You need a phone number that is **not** registered in the normal WhatsApp or
WhatsApp Business app. A new prepaid SIM works. If the number is in the app,
delete that WhatsApp account first.

1. <https://business.facebook.com> → create a **Meta Business account** for
   Angelo Studio (legal name, address in El Retiro, business email).
2. *Business settings → Security centre → Start verification*. Upload the
   RUT or Cámara de Comercio document. Verification raises your messaging
   limits; without it you can still message 250 people a day, which is
   enough to start.
3. <https://developers.facebook.com> → *My Apps → Create app* → use case
   **"Connect with customers through WhatsApp"** → link it to the business
   account.
4. In the app: *WhatsApp → API Setup → Add phone number*. Display name:
   **Angelo Studio**. Verify the number by SMS. Display names are reviewed by
   Meta (usually 1–2 days).
5. The **Phone number ID** (not the phone number) from API Setup is already in `bot/wrangler.toml`.
6. **Permanent token:** *Business settings → Users → System users → Add*
   (role Admin) → *Assign assets*: the app (full control) and the WhatsApp
   account (full control) → *Generate new token*, expiry **Never**,
   permissions `whatsapp_business_messaging` and
   `whatsapp_business_management`. Copy it.
7. *App settings → Basic* → copy the **App secret**.
8. Put the bot's number (country code, no `+`, e.g. `573001234567`) in
   `shared/catalog.ts` → `botNumber`, and push.

## 4. Webhook

After the bot is deployed (phase 7), its URL looks like
`https://tote-bot.<your-subdomain>.workers.dev`.

1. App → *WhatsApp → Configuration → Webhook → Edit*.
2. Callback URL: `https://tote-bot.<your-subdomain>.workers.dev/webhook`
3. Verify token: the same random string you set as `WEBHOOK_VERIFY_TOKEN`.
4. *Webhook fields → messages → Subscribe*.

## 5. Message template `pedido_confirmado`

Needed to confirm orders to customers who haven't written in the last 24 h.

*WhatsApp Manager → Message templates → Create template*

- Category: **Utility**
- Name: `pedido_confirmado`
- Language: **Spanish (COL)** — `es_CO`
- Body:

  ```
  Tu pedido {{1}} está confirmado. UNBOUND sale el {{2}}. Te escribimos por este chat para coordinar la entrega.
  ```
- Sample values: `{{1}}` = `ANG-7F3K`, `{{2}}` = `4 de diciembre de 2026`

Submit. Approval is usually minutes to a day.

## 6. Custom domain (later): tote.angelostudio.art

For now the site lives at https://angelooostudio-webs.github.io/tote/. When you want the domain:

1. In `shared/catalog.ts` set `siteUrl: "https://tote.angelostudio.art/"`.
2. Create `site/public/CNAME` containing `tote.angelostudio.art`, push.
3. Add the DNS record below, then in GitHub → Settings → Pages enter the domain and tick Enforce HTTPS.

### DNS record

At the provider where `angelostudio.art` is registered, add:

| Type | Host / Name | Value / Target | TTL |
|---|---|---|---|
| `CNAME` | `tote` | `angelooostudio-webs.github.io` | Auto / 3600 |

Then GitHub → repo → *Settings → Pages*: confirm the custom domain shows
`tote.angelostudio.art`, wait for the certificate (minutes to an hour), and
tick **Enforce HTTPS**.

## 7. Adobe Fonts

Kit `dzr8yxn` is already wired in. At <https://fonts.adobe.com/my_fonts#web_projects-section>
→ that project → *Edit project*:

- **Domains**: add `tote.angelostudio.art` and `localhost`.
- **Font display**: set to **swap** (the kit currently serves `auto`, which
  hides text while Spalla loads on slow connections).
