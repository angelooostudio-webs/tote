/**
 * tote-bot — Cloudflare Worker.
 *   GET  /webhook  Meta's verification handshake
 *   POST /webhook  inbound WhatsApp messages (signature checked on every request)
 *   GET  /stock    public stock counter for the site (CORS, cached 60 s)
 */
import { CATALOG } from "../../shared/catalog.ts";
import { ClaudeAssistant, KeywordAssistant } from "./assistant.ts";
import { remainingStock } from "./db.ts";
import type { Ctx, Env } from "./env.ts";
import { handleInbound } from "./handlers.ts";
import { panelHtml, paymentsCsv, pickupCsv, shippingCsv } from "./sheet.ts";
import { runExpiry } from "./expiry.ts";
import { CloudApiMessenger } from "./messenger.ts";
import { inboundMessages, verifySignature, type WebhookPayload } from "./whatsapp.ts";

export function makeCtx(env: Env): Ctx {
  return {
    env,
    now: () => new Date(),
    wa: new CloudApiMessenger(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID),
    ai: env.ANTHROPIC_API_KEY ? new ClaudeAssistant(env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL || undefined) : new KeywordAssistant(),
  };
}

/** Swappable so the simulator and tests can run the real routes with a fake WhatsApp and clock. */
let ctxFactory: (env: Env) => Ctx = makeCtx;
export const setCtxFactory = (f: (env: Env) => Ctx) => void (ctxFactory = f);

const cors = (env: Env) => ({
  "Access-Control-Allow-Origin": env.SITE_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  Vary: "Origin",
});

/** Processes a verified webhook body. Exported so the simulator can drive it. */
export async function processWebhook(ctx: Ctx, payload: WebhookPayload) {
  const inbound = inboundMessages(payload);
  if (inbound.length) console.log(`webhook: ${inbound.length} inbound message(s)`);
  for (const { msg, profileName } of inboundMessages(payload)) {
    try {
      await handleInbound(ctx, msg, profileName);
    } catch (err) {
      console.error("failed to handle message", msg.id, err);
    }
  }
}

export default {
  async fetch(req: Request, env: Env, exec: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/webhook" && req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.WEBHOOK_VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
    }

    if (url.pathname === "/webhook" && req.method === "POST") {
      const raw = await req.arrayBuffer();
      if (!(await verifySignature(raw, req.headers.get("X-Hub-Signature-256"), env.META_APP_SECRET))) {
        console.warn("webhook rejected: signature does not match META_APP_SECRET");
        return new Response("bad signature", { status: 401 });
      }
      let payload: WebhookPayload;
      try {
        payload = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return new Response("bad json", { status: 400 });
      }
      // answer Meta immediately; the work continues in the background
      exec.waitUntil(processWebhook(ctxFactory(env), payload));
      return new Response("ok", { status: 200 });
    }

    // Google Sheet feeds (=IMPORTDATA). Customer data: only with the secret key.
    if (url.pathname === "/sheet/entrega.csv" || url.pathname === "/sheet/envios.csv" || url.pathname === "/sheet/pagos.csv") {
      if (!env.SHEET_KEY || url.searchParams.get("key") !== env.SHEET_KEY) return new Response("forbidden", { status: 403 });
      const p = url.pathname;
      const body = p.endsWith("entrega.csv") ? await pickupCsv(env.DB) : p.endsWith("envios.csv") ? await shippingCsv(env.DB) : await paymentsCsv(env.DB);
      return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
    }
    // printable order lists for Angelo (same key as the CSV feeds)
    if (url.pathname === "/panel") {
      const key = url.searchParams.get("key") ?? "";
      if (!env.SHEET_KEY || key !== env.SHEET_KEY) return new Response("forbidden", { status: 403 });
      const html = await panelHtml(env.DB, url.searchParams.get("v") ?? "entrega", key, new Date());
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    }
    if (url.pathname === "/stock") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
      const remaining = await remainingStock(env.DB, ctxFactory === makeCtx ? new Date() : ctxFactory(env).now());
      return Response.json(
        { remaining, total: CATALOG.stockTotal },
        { headers: { ...cors(env), "Cache-Control": "public, max-age=60" } }
      );
    }

    if (url.pathname === "/") return new Response("tote-bot ok");
    return new Response("not found", { status: 404 });
  },

  // every 15 min: the 20 h reminder and the 24 h expiry of unpaid reservations
  async scheduled(_event: ScheduledController, env: Env, exec: ExecutionContext) {
    exec.waitUntil(runExpiry(ctxFactory(env)).then((r) => console.log("expiry", r)));
  },
} satisfies ExportedHandler<Env>;
