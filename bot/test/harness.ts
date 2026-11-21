/**
 * Local test harness: D1 on Node's built-in SQLite, a fake WhatsApp that
 * records what the bot sends, and a fixed clock. Used by the unit tests and
 * by scripts/simulate.ts — nothing here touches Meta, Cloudflare or Anthropic.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Env, Ctx } from "../src/env.ts";
import type { Button, Messenger } from "../src/messenger.ts";
import type { InboundMessage, WebhookPayload } from "../src/whatsapp.ts";
import { KeywordAssistant, type Assistant } from "../src/assistant.ts";

class Stmt {
  private db: DatabaseSync;
  private sql: string;
  private params: unknown[];
  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }
  private p() {
    return this.params.map((v) => (typeof v === "boolean" ? Number(v) : v ?? null)) as never[];
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.p()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.p()).map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.p());
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

/** Minimal D1Database over node:sqlite (prepare/bind/first/all/run/batch/exec). */
export class SqliteD1 {
  readonly db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    const dir = fileURLToPath(new URL("../migrations/", import.meta.url).href);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) this.db.exec(readFileSync(dir + f, "utf8"));
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    return Promise.all(stmts.map((s) => s.run()));
  }
  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
}

export interface Sent {
  to: string;
  kind: "text" | "buttons" | "image" | "document" | "template";
  body: string;
  buttons?: Button[];
  extra?: unknown;
}

/** Records every outbound message instead of calling the Cloud API. */
export class FakeMessenger implements Messenger {
  sent: Sent[] = [];
  media = new Map<string, { bytes: Uint8Array; mime: string }>();
  onSend?: (s: Sent) => void;
  private push(s: Sent) {
    this.sent.push(s);
    this.onSend?.(s);
  }
  async sendText(to: string, body: string) {
    this.push({ to, kind: "text", body });
  }
  async sendButtons(to: string, body: string, buttons: Button[]) {
    this.push({ to, kind: "buttons", body, buttons });
  }
  async sendImage(to: string, mediaId: string, caption?: string) {
    this.push({ to, kind: "image", body: caption ?? "", extra: mediaId });
  }
  async sendDocument(to: string, data: Uint8Array, filename: string, mime: string, caption?: string) {
    this.push({ to, kind: "document", body: caption ?? "", extra: { filename, mime, text: new TextDecoder().decode(data) } });
  }
  async sendTemplate(to: string, name: string, lang: string, params: string[]) {
    this.push({ to, kind: "template", body: `${name} (${lang}): ${params.join(" | ")}` });
  }
  async downloadMedia(mediaId: string) {
    const m = this.media.get(mediaId);
    if (!m) throw new Error(`no media ${mediaId}`);
    return m;
  }
  to(n: string) {
    return this.sent.filter((s) => s.to === n);
  }
  last(n: string) {
    return this.to(n).at(-1);
  }
}

export const ADMIN = "573000000001";
export const CUSTOMER = "573001112233";

export function testEnv(db = new SqliteD1()): Env {
  return {
    DB: db as unknown as D1Database,
    SITE_ORIGIN: "https://tote.angelostudio.art",
    WHATSAPP_TOKEN: "test",
    WHATSAPP_PHONE_NUMBER_ID: "000",
    META_APP_SECRET: "test-app-secret",
    WEBHOOK_VERIFY_TOKEN: "verify-me",
    ANTHROPIC_API_KEY: "",
    ADMIN_NUMBER: ADMIN,
    PAYMENT_NEQUI: "300 000 0000",
    PAYMENT_BANCOLOMBIA: "Ahorros 000-000000-00",
    PAYMENT_HOLDER_NAME: "Angelo Studio",
  };
}

/** A context with a controllable clock (defaults to during the pre-sale). */
export function testCtx(opts: { at?: string; ai?: Assistant; env?: Env } = {}) {
  let t = new Date(opts.at ?? "2026-11-28T10:00:00-05:00").getTime();
  const wa = new FakeMessenger();
  const ctx: Ctx = { env: opts.env ?? testEnv(), now: () => new Date(t), wa, ai: opts.ai ?? new KeywordAssistant() };
  return { ctx, wa, advance: (ms: number) => void (t += ms), setTime: (iso: string) => void (t = new Date(iso).getTime()) };
}

let n = 0;
/** A WhatsApp webhook payload carrying one inbound message. */
export function inbound(from: string, m: { text?: string; image?: { id: string; caption?: string }; button?: { id: string; title: string }; id?: string }): WebhookPayload {
  const id = m.id ?? `wamid.test.${++n}`;
  const msg: InboundMessage = m.text !== undefined
    ? { id, from, timestamp: "0", type: "text", text: { body: m.text } }
    : m.image
      ? { id, from, timestamp: "0", type: "image", image: { id: m.image.id, mime_type: "image/jpeg", caption: m.image.caption } }
      : { id, from, timestamp: "0", type: "interactive", interactive: { type: "button_reply" as const, button_reply: m.button } };
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: from, profile: { name: "Cliente" } }], messages: [msg] } }] }] };
}

export async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}
