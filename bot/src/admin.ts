/**
 * Messages from ADMIN_NUMBER (Angelo). Only this number can confirm or reject.
 *   buttons  Confirmar / Rechazar (sent with every review request)
 *   OK ANG-7F3K            confirm
 *   NO ANG-7F3K <motivo>   reject, with the reason the customer will see
 *   RESUMEN                counts by status + confirmed revenue
 *   PENDIENTES             orders waiting for review
 *   PEDIDO ANG-7F3K        one order's details
 *   EXPORTAR               CSV of all orders, as a document
 */
import { CATALOG, formatCOP } from "../../shared/catalog.ts";
import { DELIVERY_LABEL } from "../../shared/order.ts";
import type { Ctx } from "./env.ts";
import type { InboundMessage } from "./whatsapp.ts";
import { say } from "./handlers.ts";
import { allOrders, countsByStatus, getOrder, lastInboundAt, latestProof, logOutbound, ordersInStatus, remainingStock, setStatus, type OrderRow } from "./db.ts";
import { norm } from "./parse.ts";
import { contactLabel } from "./messenger.ts";

export const CONFIRM_TEMPLATE = "pedido_confirmado";
const WINDOW_MS = 24 * 3600_000;

const launchDate = () =>
  new Date(CATALOG.magazineLaunch).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });

export const STATUS_ES: Record<string, string> = {
  AWAITING_PAYMENT: "esperando pago",
  PENDING_REVIEW: "por revisar",
  NEEDS_HUMAN: "necesita revisión manual",
  CONFIRMED: "confirmado",
  REJECTED: "rechazado",
  EXPIRED: "vencido",
};

const HELP = [
  "Comandos:",
  "OK ANG-XXXX — confirmar",
  "NO ANG-XXXX motivo — rechazar",
  "RESUMEN — totales",
  "PENDIENTES — por revisar",
  "PEDIDO ANG-XXXX — detalle",
  "EXPORTAR — CSV de todos los pedidos",
].join("\n");

/** Messages the customer, as free text inside WhatsApp's 24 h window, or via the approved template outside it. */
async function notifyCustomer(ctx: Ctx, o: OrderRow, text: string, template?: { name: string; params: string[] }): Promise<"text" | "template" | "failed"> {
  const last = await lastInboundAt(ctx.env.DB, o.wa_id);
  const inWindow = !!last && ctx.now().getTime() - last.getTime() < WINDOW_MS;
  try {
    if (inWindow || !template) {
      await ctx.wa.sendText(o.wa_id, text);
      await logOutbound(ctx.env.DB, o.wa_id, "text", text, o.code, ctx.now());
      return "text";
    }
    await ctx.wa.sendTemplate(o.wa_id, template.name, "es_CO", template.params);
    await logOutbound(ctx.env.DB, o.wa_id, "template", `${template.name}: ${template.params.join(" | ")}`, o.code, ctx.now());
    return "template";
  } catch (err) {
    console.error("could not notify customer", o.code, err);
    return "failed";
  }
}

export function confirmationText(o: OrderRow): string {
  const unbound = o.option === "bundle" ? ` UNBOUND sale el ${launchDate()}.` : "";
  const where =
    o.delivery === "pickup"
      ? CATALOG.pickup.place
        ? ` Recogida: ${CATALOG.pickup.place}${CATALOG.pickup.hours ? `, ${CATALOG.pickup.hours}` : ""}.`
        : " Te escribimos por aquí para coordinar la recogida en El Retiro."
      : ` Lo enviamos por ${CATALOG.shipping.carrier} a ${o.address ?? ""}, ${o.city ?? ""}.${CATALOG.shipping.price > 0 ? "" : " El costo del envío lo pagas al recibir (contra entrega)."} Te escribimos por aquí con el número de guía.`;
  return `Tu pedido ${o.code} está confirmado.${unbound}${where} Gracias por su compra.`;
}

export async function confirmOrder(ctx: Ctx, code: string) {
  const db = ctx.env.DB;
  const o = await getOrder(db, code);
  if (!o) return say(ctx, ctx.env.ADMIN_NUMBER, `No encuentro el pedido ${code}.`);
  if (o.status === "CONFIRMED") return say(ctx, ctx.env.ADMIN_NUMBER, `${code} ya estaba confirmado.`);
  const holdsStock =
    ["PENDING_REVIEW", "NEEDS_HUMAN"].includes(o.status) || (o.status === "AWAITING_PAYMENT" && !!o.reserved_until && new Date(o.reserved_until) > ctx.now());
  if (!holdsStock) {
    // its stock may have gone to someone else: only confirm if there's still room
    const left = await remainingStock(db, ctx.now());
    if (left < o.qty) return say(ctx, ctx.env.ADMIN_NUMBER, `${code} está ${STATUS_ES[o.status]} y ya no hay stock para confirmarlo.`);
  }
  const now = ctx.now();
  await setStatus(db, code, "CONFIRMED", now, { confirmed_at: now.toISOString() });
  const how = await notifyCustomer(ctx, o, confirmationText(o), { name: CONFIRM_TEMPLATE, params: [o.code, launchDate()] });
  const note = how === "template" ? " (le llegó la plantilla: pasaron más de 24 h)" : how === "failed" ? " — OJO: no le pudimos avisar al cliente, escríbele tú." : "";
  return say(ctx, ctx.env.ADMIN_NUMBER, `Confirmado ${code} · ${o.name} · ${formatCOP(o.total)}${note}`, code);
}

export async function rejectOrder(ctx: Ctx, code: string, reason: string) {
  const db = ctx.env.DB;
  const o = await getOrder(db, code);
  if (!o) return say(ctx, ctx.env.ADMIN_NUMBER, `No encuentro el pedido ${code}.`);
  if (o.status === "CONFIRMED") return say(ctx, ctx.env.ADMIN_NUMBER, `${code} ya está confirmado. Si hay que anularlo, escríbele al cliente directamente.`);
  if (!reason) return say(ctx, ctx.env.ADMIN_NUMBER, `Escribe el motivo para el cliente: NO ${code} el pago no ha llegado a la cuenta`);
  await setStatus(db, code, "REJECTED", ctx.now(), { rejection_reason: reason });
  const text = `No pudimos confirmar tu pedido ${code}: ${reason}. Si crees que es un error, respóndenos por aquí y lo revisamos.`;
  const how = await notifyCustomer(ctx, o, text);
  return say(ctx, ctx.env.ADMIN_NUMBER, `Rechazado ${code}. El tote volvió al stock.${how === "failed" ? " OJO: no le pudimos avisar al cliente (fuera de la ventana de 24 h); escríbele tú." : ""}`, code);
}

async function summary(ctx: Ctx) {
  const rows = await countsByStatus(ctx.env.DB);
  const by = new Map(rows.map((r) => [r.status, r]));
  const confirmed = by.get("CONFIRMED");
  const left = await remainingStock(ctx.env.DB, ctx.now());
  const lines = Object.keys(STATUS_ES).map((s) => `${STATUS_ES[s]}: ${by.get(s as OrderRow["status"])?.n ?? 0}`);
  return say(
    ctx,
    ctx.env.ADMIN_NUMBER,
    [
      "Resumen de la pre-venta",
      ...lines,
      "",
      `Totes confirmados: ${confirmed?.q ?? 0}`,
      `Recaudo confirmado: ${formatCOP(confirmed?.t ?? 0)}`,
      `Totes disponibles: ${left} de ${CATALOG.stockTotal}`,
    ].join("\n")
  );
}

async function pending(ctx: Ctx) {
  const rows = await ordersInStatus(ctx.env.DB, ["PENDING_REVIEW", "NEEDS_HUMAN"]);
  if (!rows.length) return say(ctx, ctx.env.ADMIN_NUMBER, "No hay pedidos por revisar.");
  return say(
    ctx,
    ctx.env.ADMIN_NUMBER,
    [`Por revisar (${rows.length}):`, ...rows.map((o) => `${o.code} · ${o.name} · ${formatCOP(o.total)} · ${STATUS_ES[o.status]}`), "", "Responde OK ANG-XXXX o NO ANG-XXXX motivo."].join("\n")
  );
}

async function detail(ctx: Ctx, code: string) {
  const o = await getOrder(ctx.env.DB, code);
  if (!o) return say(ctx, ctx.env.ADMIN_NUMBER, `No encuentro el pedido ${code}.`);
  const proof = await latestProof(ctx.env.DB, code);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—");
  return say(
    ctx,
    ctx.env.ADMIN_NUMBER,
    [
      `${o.code} · ${STATUS_ES[o.status]}`,
      `${o.name} · ${contactLabel(o.wa_id)}`,
      `${o.qty} × ${CATALOG.options[o.option].label} · ${DELIVERY_LABEL[o.delivery]}${o.delivery === "shipping" ? ` a ${o.address}, ${o.city}` : ""}`,
      `Total: ${formatCOP(o.total)}`,
      `Creado: ${when(o.created_at)}`,
      o.confirmed_at ? `Confirmado: ${when(o.confirmed_at)}` : "",
      o.rejection_reason ? `Motivo de rechazo: ${o.rejection_reason}` : "",
      proof ? `Último comprobante: ${proof.verdict === "pass" ? "pasó la verificación" : `no pasó (${JSON.parse(proof.reasons).join(", ")})`}` : "Sin comprobante",
    ]
      .filter(Boolean)
      .join("\n"),
    code
  );
}

export function ordersCsv(rows: OrderRow[]): string {
  const cols = ["code", "status", "name", "wa_id", "option", "qty", "add_ons", "delivery", "total", "created_at", "confirmed_at", "rejection_reason"] as const;
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // quote, and defuse spreadsheet formulas (=, +, -, @) in customer-supplied text
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n") + "\r\n";
}

async function exportCsv(ctx: Ctx) {
  const rows = await allOrders(ctx.env.DB);
  const csv = "﻿" + ordersCsv(rows); // BOM so Excel reads the accents
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ctx.now());
  await ctx.wa.sendDocument(ctx.env.ADMIN_NUMBER, new TextEncoder().encode(csv), `pedidos-tote-${date}.csv`, "text/csv", `${rows.length} pedidos`);
  await logOutbound(ctx.env.DB, ctx.env.ADMIN_NUMBER, "document", `pedidos-tote-${date}.csv`, null, ctx.now());
}

/** True when an admin message is a command (OK/NO/RESUMEN/…) rather than a customer-style message. */
export function isAdminCommand(msg: InboundMessage): boolean {
  if (msg.interactive?.button_reply?.id ?? msg.button?.payload) return true;
  const text = (msg.text?.body ?? "").trim();
  const hasCode = /ANG-[A-Z0-9]{4}/.test(text.toUpperCase());
  const cmd = norm(text).split(" ")[0];
  return ((cmd === "ok" || cmd === "no" || cmd === "pedido") && hasCode) || ["resumen", "pendientes", "exportar", "ayuda", "comandos"].includes(cmd);
}

export async function handleAdmin(ctx: Ctx, msg: InboundMessage) {
  // buttons from a review request
  const buttonId = msg.interactive?.button_reply?.id ?? msg.button?.payload;
  if (buttonId) {
    const [action, code] = buttonId.split(":");
    if (action === "ok" && code) return confirmOrder(ctx, code);
    if (action === "no" && code) return say(ctx, ctx.env.ADMIN_NUMBER, `Escribe el motivo para el cliente así:\nNO ${code} el pago no ha llegado a la cuenta`);
  }
  const text = (msg.text?.body ?? "").trim();
  const code = text.toUpperCase().match(/ANG-[A-Z0-9]{4}/)?.[0];
  const cmd = norm(text).split(" ")[0];
  if (cmd === "ok" && code) return confirmOrder(ctx, code);
  if (cmd === "no" && code) return rejectOrder(ctx, code, text.slice(text.toUpperCase().indexOf(code) + code.length).trim());
  if (cmd === "resumen") return summary(ctx);
  if (cmd === "pendientes") return pending(ctx);
  if (cmd === "pedido" && code) return detail(ctx, code);
  if (cmd === "exportar") return exportCsv(ctx);
  // "ayuda" / "comandos", or anything else that reached here, gets the list of commands
  return say(ctx, ctx.env.ADMIN_NUMBER, HELP);
}
