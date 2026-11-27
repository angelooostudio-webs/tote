/** WhatsApp Cloud API webhook: signature check and the payload shapes the bot uses. */

/** Verifies Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret). Constant-time compare. */
export async function verifySignature(rawBody: ArrayBuffer | Uint8Array, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7).toLowerCase();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export interface InboundMessage {
  id: string; // wamid…
  from: string; // sender's number (digits), or their business-scoped user ID when they hide their number
  from_user_id?: string; // business-scoped user ID (users with a WhatsApp username may send no number)
  timestamp: string;
  type: "text" | "image" | "interactive" | "button" | "document" | "audio" | "video" | "sticker" | "location" | "contacts" | "reaction" | string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; sha256?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  interactive?: { type: "button_reply" | "list_reply"; button_reply?: { id: string; title: string } };
  button?: { payload: string; text: string };
}

export interface WebhookPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        messages?: InboundMessage[];
        contacts?: { wa_id?: string; user_id?: string; profile?: { name?: string } }[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

/** Flattens a webhook payload into its inbound messages (status updates are ignored). */
export function inboundMessages(p: WebhookPayload): { msg: InboundMessage; profileName?: string }[] {
  const out: { msg: InboundMessage; profileName?: string }[] = [];
  for (const e of p.entry ?? [])
    for (const c of e.changes ?? []) {
      const names = new Map<string | undefined, string | undefined>();
      for (const x of c.value?.contacts ?? []) {
        if (x.wa_id) names.set(x.wa_id, x.profile?.name);
        if (x.user_id) names.set(x.user_id, x.profile?.name);
      }
      for (const m of c.value?.messages ?? []) {
        // the phone number when Meta sends one, otherwise the business-scoped user ID
        const from = m.from || m.from_user_id;
        if (!from) continue;
        out.push({ msg: { ...m, from }, profileName: names.get(m.from) ?? names.get(m.from_user_id) });
      }
    }
  return out;
}
