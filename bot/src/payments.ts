/**
 * Payment screenshots:
 *   download from WhatsApp → fingerprint → Claude reads the fields → code checks
 *   → PENDING_REVIEW + review request to Angelo (pass), or a polite explanation
 *   and a request for a new screenshot (fail; after 2 failures a person takes it).
 * The bot never confirms an order by itself. The image is never stored: only its
 * fingerprint and the fields read from it.
 */
import { push } from "./notify.ts";
import { CATALOG, formatCOP, siteLabel } from "../../shared/catalog.ts";
import { DELIVERY_LABEL } from "../../shared/order.ts";
import type { Ctx } from "./env.ts";
import type { InboundMessage } from "./whatsapp.ts";
import { say } from "./handlers.ts";
import { bumpFailedAttempts, latestOrderFor, otherOrderHashes, saveProof, setStatus, type OrderRow } from "./db.ts";
import { SAME_IMAGE_MAX_DISTANCE, checkProof, hashDistance, imageHash, type Extracted, type Problem } from "./proofs.ts";

export const MAX_FAILED_ATTEMPTS = 2;

function problemText(p: Problem, x: Extracted | null, o: OrderRow, holder: string): string {
  switch (p) {
    case "amount":
      return x?.amount != null
        ? `En el comprobante vemos ${formatCOP(x.amount)}, y el total de tu pedido es ${formatCOP(o.total)}. El pago tiene que ser por el valor exacto.`
        : `No vemos el valor del pago. El total de tu pedido es ${formatCOP(o.total)}.`;
    case "recipient":
      return `No vemos que el pago haya llegado a nuestra cuenta. Revisa que el destinatario sea ${holder}.`;
    case "date":
      return "La fecha del comprobante no se ve o es anterior a tu pedido. Envía el del pago que hiciste para este pedido.";
    case "duplicate":
      return "Este comprobante ya se usó para otro pedido.";
    case "not_receipt":
    case "confidence":
      return "No logramos leer bien el comprobante. Envía un pantallazo completo y nítido del pago.";
  }
}

/** The review request Angelo gets: summary, what was read, the screenshot, and two buttons. */
export async function sendReview(ctx: Ctx, o: OrderRow, x: Extracted | null, problems: Problem[] | null, image?: { bytes: Uint8Array; mime: string }) {
  const admin = ctx.env.ADMIN_NUMBER;
  await push(ctx, `Pago por revisar ${o.code}`, `${o.name} · ${formatCOP(o.total)} · ${problems?.length ? "la verificación automática falla" : "la verificación automática pasa"}. Responde OK o NO en WhatsApp.`, { priority: 4, tags: ["moneybag"] });
  const yesNo = (ok: boolean) => (ok ? "sí" : "NO");
  const read = x
    ? [
        "Lectura del comprobante:",
        `- Valor: ${x.amount != null ? formatCOP(x.amount) : "no se ve"} (coincide: ${yesNo(!problems?.includes("amount"))})`,
        `- Destinatario: ${x.recipient_name ?? "no se ve"}${x.recipient_account_last4 ? ` · cuenta …${x.recipient_account_last4}` : ""} (coincide: ${yesNo(!problems?.includes("recipient"))})`,
        `- Fecha: ${x.date ?? "no se ve"}${x.time ? ` ${x.time}` : ""}`,
        `- Referencia: ${x.reference ?? "—"} · ${x.bank_or_app ?? "app no identificada"}`,
        `- Parece editado: ${x.looks_edited.value ? `SÍ (${x.looks_edited.reason})` : "no"}`,
        `- Confianza de la lectura: ${Math.round(x.confidence * 100)}%`,
        `- Verificación automática: ${problems?.length ? `falla (${problems.join(", ")})` : "pasa"}`,
      ]
    : ["No se pudo leer el comprobante automáticamente."];
  const body = [
    `Pago por revisar: ${o.code}`,
    `Cliente: ${o.name} (+${o.wa_id})`,
    `Pedido: ${o.qty} × ${CATALOG.options[o.option].label} · ${DELIVERY_LABEL[o.delivery]}`,
    `Total: ${formatCOP(o.total)}`,
    "",
    ...read,
    "",
    "Revisa tu Nequi o Bancolombia antes de confirmar.",
  ].join("\n");
  try {
    await ctx.wa.sendText(admin, body);
    if (image) await ctx.wa.sendImageBytes(admin, image.bytes, image.mime, o.code);
    await ctx.wa.sendButtons(admin, `¿Confirmas el pedido ${o.code}? También puedes escribir OK ${o.code} o NO ${o.code} y el motivo.`, [
      { id: `ok:${o.code}`, title: "Confirmar" },
      { id: `no:${o.code}`, title: "Rechazar" },
    ]);
  } catch (err) {
    console.error("could not send review to admin", err);
  }
}

export async function handleImage(ctx: Ctx, waId: string, msg: InboundMessage) {
  const db = ctx.env.DB;
  const now = ctx.now();
  const mediaId = msg.image?.id;
  const order = await latestOrderFor(db, waId, ["AWAITING_PAYMENT", "PENDING_REVIEW", "NEEDS_HUMAN"]);
  if (!order || !mediaId) return say(ctx, waId, `Recibimos tu imagen. Si es un comprobante de pago, primero haz tu pedido en ${siteLabel()}.`);
  if (order.status === "PENDING_REVIEW")
    return say(ctx, waId, `Ya recibimos tu comprobante. Tu pedido ${order.code} está pendiente de verificación; te confirmamos en cuanto lo revisemos.`, order.code);

  let image: { bytes: Uint8Array; mime: string };
  try {
    image = await ctx.wa.downloadMedia(mediaId);
  } catch (err) {
    console.error("download failed", err);
    return say(ctx, waId, "No pudimos abrir la imagen. ¿Nos la envías de nuevo?", order.code);
  }

  const hash = await imageHash(image.bytes);
  const duplicate = (await otherOrderHashes(db, order.code)).some((h) => hashDistance(h, hash) <= SAME_IMAGE_MAX_DISTANCE);
  const extracted = await ctx.ai.extractPayment(image.bytes, image.mime);

  // A person reviews every order anyway: if the screenshot couldn't be read automatically
  // (no vision, API trouble) it goes straight to Angelo rather than bouncing the customer.
  if (!extracted && !duplicate) {
    await saveProof(db, { orderCode: order.code, mediaId, hash, extracted: null, verdict: "fail", reasons: ["unreadable"] }, now);
    await setStatus(db, order.code, "PENDING_REVIEW", now);
    await say(ctx, waId, `Recibimos tu comprobante. Tu pedido ${order.code} está pendiente de verificación. Te confirmamos en cuanto lo revisemos.`, order.code);
    return sendReview(ctx, { ...order, status: "PENDING_REVIEW" }, null, null, image);
  }

  const problems = checkProof(
    extracted ?? { is_payment_receipt: false, amount: null, currency: null, recipient_name: null, recipient_account_last4: null, date: null, time: null, reference: null, bank_or_app: null, looks_edited: { value: false, reason: "" }, confidence: 0 },
    { total: order.total, holderName: ctx.env.PAYMENT_HOLDER_NAME, accounts: [ctx.env.PAYMENT_NEQUI, ctx.env.PAYMENT_BANCOLOMBIA].filter(Boolean), orderCreatedAt: new Date(order.created_at) },
    duplicate
  );
  await saveProof(db, { orderCode: order.code, mediaId, hash, extracted, verdict: problems.length ? "fail" : "pass", reasons: problems }, now);

  if (!problems.length) {
    await setStatus(db, order.code, "PENDING_REVIEW", now);
    await say(ctx, waId, `Recibimos tu comprobante. Tu pedido ${order.code} está pendiente de verificación. Te confirmamos en cuanto lo revisemos.`, order.code);
    return sendReview(ctx, { ...order, status: "PENDING_REVIEW" }, extracted, problems, image);
  }

  const fails = await bumpFailedAttempts(db, order.code, now);
  if (fails >= MAX_FAILED_ATTEMPTS || order.status === "NEEDS_HUMAN") {
    await setStatus(db, order.code, "NEEDS_HUMAN", now);
    await say(ctx, waId, `Gracias. Una persona del equipo va a revisar tu pago del pedido ${order.code} y te escribe pronto por este chat.`, order.code);
    return sendReview(ctx, { ...order, status: "NEEDS_HUMAN" }, extracted, problems, image);
  }
  const lines = [...new Set(problems.map((p) => problemText(p, extracted, order, ctx.env.PAYMENT_HOLDER_NAME)))];
  return say(ctx, waId, ["Gracias por enviarlo. Hay algo que no cuadra:", ...lines.map((l) => `- ${l}`), "", "¿Nos envías el pantallazo correcto?"].join("\n"), order.code);
}
