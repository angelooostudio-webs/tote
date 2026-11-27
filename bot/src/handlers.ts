/**
 * Conversation logic. Every customer message lands in `handleInbound`.
 * Orders are handled entirely by code; Claude only classifies free-form text.
 */
import { CATALOG, formatCOP, presalePhase } from "../../shared/catalog.ts";
import { orderTotal, type Order } from "../../shared/order.ts";
import type { Ctx } from "./env.ts";
import {
  createOrderIfStock,
  getOrder,
  isFirstContact,
  latestOrderFor,
  logInbound,
  logOutbound,
  recentConversation,
  remainingStock,
  rowToOrder,
} from "./db.ts";
import { parseOrderMessage } from "./parse.ts";
import { T, paymentInstructions } from "./texts.ts";
import type { InboundMessage } from "./whatsapp.ts";
import { push } from "./notify.ts";
import { handleAdmin, isAdminCommand } from "./admin.ts";
import { handleImage } from "./payments.ts";
import { contactLabel } from "./messenger.ts";

/** Sends a text and logs it (the log also tells us whether we've written to this number before). */
export async function say(ctx: Ctx, to: string, body: string, orderCode: string | null = null) {
  await ctx.wa.sendText(to, body);
  await logOutbound(ctx.env.DB, to, "text", body, orderCode, ctx.now());
}

export const paymentDetails = (ctx: Ctx) => ({
  nequi: ctx.env.PAYMENT_NEQUI,
  bancolombia: ctx.env.PAYMENT_BANCOLOMBIA,
  holder: ctx.env.PAYMENT_HOLDER_NAME,
});

/** Tells Angelo about something a person needs to handle, with the recent conversation. */
export async function forwardToAdmin(ctx: Ctx, waId: string, reason: string, name?: string) {
  const convo = await recentConversation(ctx.env.DB, waId, 8);
  const lines = convo.map((m) => `${m.direction === "in" ? "Cliente" : "Bot"}: ${(m.body ?? `[${m.kind}]`).slice(0, 300)}`);
  await push(ctx, "Un cliente necesita respuesta", reason, { priority: 4, tags: ["speech_balloon"] });
  const body = [`Para revisar: ${reason}`, `De: ${contactLabel(waId)}${name ? ` (${name})` : ""}`, "", ...lines].join("\n").slice(0, 4000);
  try {
    await ctx.wa.sendText(ctx.env.ADMIN_NUMBER, body);
    await logOutbound(ctx.env.DB, ctx.env.ADMIN_NUMBER, "text", body, null, ctx.now());
  } catch (err) {
    // outside the admin's 24 h window WhatsApp refuses free-form messages; it's logged so nothing is lost
    console.error("could not reach admin", err);
  }
}

const adminTesting = (ctx: Ctx) => ctx.env.ADMIN_TEST_MODE === "1";

export async function handleInbound(ctx: Ctx, msg: InboundMessage, profileName?: string) {
  const db = ctx.env.DB;
  const waId = msg.from;
  const body = msg.text?.body ?? msg.image?.caption ?? msg.interactive?.button_reply?.title ?? msg.button?.text ?? null;
  // Meta may deliver the same webhook more than once: the message id dedupes it
  const isNew = await logInbound(db, msg.id, waId, msg.type, body, ctx.now());
  if (!isNew) return;

  // the admin number: commands (OK, NO, RESUMEN, PENDIENTES, PEDIDO, EXPORTAR, AYUDA) go to the admin
  // handler; anything else (an order, a screenshot, a question) is handled like any customer's
  if (waId === ctx.env.ADMIN_NUMBER && isAdminCommand(msg)) return handleAdmin(ctx, msg);

  switch (msg.type) {
    case "text":
      return handleText(ctx, waId, msg.text?.body ?? "", profileName);
    case "image":
      return handleImage(ctx, waId, msg);
    case "document":
      if (msg.document?.mime_type?.startsWith("image/")) return handleImage(ctx, waId, { ...msg, image: { id: msg.document.id, mime_type: msg.document.mime_type } });
      return say(ctx, waId, "Por ahora solo puedo leer texto y pantallazos (imágenes). Envía el comprobante como imagen, por favor.");
    default:
      return say(ctx, waId, "Por ahora solo puedo leer texto y pantallazos (imágenes).");
  }
}

async function handleText(ctx: Ctx, waId: string, text: string, profileName?: string) {
  const parsed = parseOrderMessage(text);
  if (parsed.ok) return handleOrder(ctx, waId, parsed.order, parsed.statedTotal, parsed.testKey);
  if (parsed.looksLikeOrder) {
    const problems = parsed.errors.map((e) => T.fieldNames[e] ?? e);
    return say(ctx, waId, T.badOrder(problems));
  }
  return handleFreeForm(ctx, waId, text, profileName);
}

export async function handleOrder(ctx: Ctx, waId: string, order: Order, statedTotal: number | null, testKey?: string) {
  const db = ctx.env.DB;
  const now = ctx.now();
  const first = await isFirstContact(db, waId);

  const phase = presalePhase(now);
  // the test link (?prueba=<TEST_KEY>) lets a tester order before opening
  const tester = !!ctx.env.TEST_KEY && testKey === ctx.env.TEST_KEY;
  if (tester) console.log(`test order ${order.code} from the test link`);
  if (phase === "before" && !tester && !(adminTesting(ctx) && waId === ctx.env.ADMIN_NUMBER)) return say(ctx, waId, T.presaleNotOpen() + (first ? `\n\n${T.privacyLine}` : ""));
  if (phase === "closed") return say(ctx, waId, T.presaleClosed() + (first ? `\n\n${T.privacyLine}` : ""));

  // the same order sent twice (or re-sent later): answer with where it stands, never create it twice
  const existing = await getOrder(db, order.code);
  if (existing) {
    if (existing.wa_id !== waId) return say(ctx, waId, T.codeTakenByOther);
    const msg = T.alreadyHaveOrder(existing.code, existing.status);
    if (existing.status === "AWAITING_PAYMENT") return say(ctx, waId, `${msg}\n\n${paymentInstructions(rowToOrder(existing), paymentDetails(ctx), false)}`, existing.code);
    return say(ctx, waId, msg, existing.code);
  }

  // the total always comes from code: the "Total" line in the message is never trusted
  const total = orderTotal(order);
  if (statedTotal !== null && statedTotal !== total) console.warn(`order ${order.code}: message said ${formatCOP(statedTotal)}, real total ${formatCOP(total)}`);

  const created = await createOrderIfStock(db, order, waId, total, now);
  if (!created) {
    const left = await remainingStock(db, now);
    return say(ctx, waId, left <= 0 ? T.soldOut : T.notEnoughStock(left));
  }
  await say(ctx, waId, paymentInstructions(order, paymentDetails(ctx), first), order.code);
  await push(ctx, `Nuevo pedido ${order.code}`, `${order.qty} × ${CATALOG.options[order.option].label} · ${formatCOP(total)} · esperando pago`, { tags: ["shopping_bags"] });
}

async function handleFreeForm(ctx: Ctx, waId: string, text: string, profileName?: string) {
  const db = ctx.env.DB;
  const first = await isFirstContact(db, waId);
  const history = await recentConversation(db, waId, 8);
  const { intent, reply } = await ctx.ai.classify(text, history.slice(0, -1));
  const withPrivacy = (s: string) => (first ? `${s}\n\n${T.privacyLine}` : s);

  switch (intent) {
    case "ignore":
      return; // prompt injection, spam: no answer at all
    case "faq":
      return say(ctx, waId, withPrivacy(reply || T.handoff));
    case "price":
      return say(ctx, waId, withPrivacy(T.priceInfo()));
    case "how_to_order":
      return say(ctx, waId, T.greeting(first));
    case "status": {
      const o = await latestOrderFor(db, waId);
      return say(ctx, waId, withPrivacy(o ? T.status(o.code, o.status) : T.statusNone), o?.code ?? null);
    }
    case "delete_data":
      await say(ctx, waId, T.deleteData);
      return forwardToAdmin(ctx, waId, "pide borrar sus datos (Ley 1581)", profileName);
    case "human":
    default:
      await say(ctx, waId, withPrivacy(T.handoff));
      return forwardToAdmin(ctx, waId, "pregunta o problema que el bot no responde", profileName);
  }
}
