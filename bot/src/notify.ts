/**
 * Phone push notifications through ntfy (https://ntfy.sh): free, no account, works even when
 * WhatsApp's 24 h window to the admin is closed. Angelo subscribes to NTFY_TOPIC in the ntfy app.
 * Keep the content minimal (code, product, total): it passes through ntfy's server.
 */
import { CATALOG } from "../../shared/catalog.ts";
import type { Ctx } from "./env.ts";

export async function push(ctx: Ctx, title: string, message: string, opts: { priority?: 1 | 2 | 3 | 4 | 5; tags?: string[] } = {}) {
  const topic = ctx.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    const res = await fetch("https://ntfy.sh/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // tapping the notification opens the chat with the bot, where OK / NO are typed
      body: JSON.stringify({ topic, title, message, priority: opts.priority ?? 3, tags: opts.tags ?? [], click: `https://wa.me/${CATALOG.botNumber}` }),
    });
    if (!res.ok) console.error("ntfy push failed", res.status);
  } catch (err) {
    console.error("ntfy push failed", err);
  }
}
