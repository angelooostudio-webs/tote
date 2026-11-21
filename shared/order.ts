/**
 * The order as the site builds it and the bot reads it. The WhatsApp message
 * format lives here so the site (which writes it) and the bot (which parses
 * it) can never drift apart.
 *
 * The bot NEVER trusts the "Total" line of a message: the customer can edit
 * the text before sending. It recomputes with `orderTotal` from its own copy
 * of the catalog.
 */
import { CATALOG, formatCOP, type OptionId } from "./catalog.ts";

export type Delivery = "pickup" | "shipping";

export interface Order {
  code: string;
  option: OptionId;
  qty: number;
  addOns: string[]; // add-on ids
  delivery: Delivery;
  name: string;
  /** shipping only: street address (with barrio, apto…) and city */
  address?: string;
  city?: string;
}

export const DELIVERY_LABEL: Record<Delivery, string> = {
  pickup: "Recoger en El Retiro",
  shipping: "Envío",
};

/** Said on the site and by the bot, word for word, for every shipping order. */
export const SHIPPING_NOTE =
  CATALOG.shipping.price > 0
    ? `Se envía por ${CATALOG.shipping.carrier}.`
    : `Se envía por ${CATALOG.shipping.carrier}. El costo del envío lo pagas al recibir (contra entrega).`;

// ---------- order code: ANG-7F3K ----------
// No 0/O or 1/I (and no L), so it can be read aloud and typed in a bank note.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_RE = new RegExp(`^ANG-[${CODE_ALPHABET}]{4}$`);

export function makeOrderCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(4);
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `ANG-${s}`;
}

// ---------- totals (COP) ----------
export interface Line {
  label: string;
  amount: number;
}

/**
 * Lines and total. Option price × quantity; add-ons and shipping are per order.
 * Throws on anything not in the catalog.
 */
export function orderLines(o: Pick<Order, "option" | "qty" | "addOns" | "delivery">): { lines: Line[]; total: number } {
  const opt = CATALOG.options[o.option];
  if (!opt) throw new Error(`unknown option ${o.option}`);
  if (!Number.isInteger(o.qty) || o.qty < 1 || o.qty > CATALOG.maxQtyPerOrder) throw new Error(`bad quantity ${o.qty}`);
  const lines: Line[] = [{ label: `${o.qty} × ${opt.label}`, amount: opt.price * o.qty }];
  for (const id of o.addOns) {
    const a = CATALOG.addOns.find((x) => x.id === id);
    if (!a) throw new Error(`unknown add-on ${id}`);
    lines.push({ label: a.label, amount: a.price });
  }
  if (o.delivery === "shipping") {
    if (!CATALOG.shipping.enabled) throw new Error("shipping disabled");
    // contra entrega: the carrier charges the customer, so nothing is added here
    if (CATALOG.shipping.price > 0) lines.push({ label: CATALOG.shipping.label, amount: CATALOG.shipping.price });
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

export const orderTotal = (o: Parameters<typeof orderLines>[0]) => orderLines(o).total;

// ---------- the WhatsApp message ----------
/** One line, no control characters, max 60 chars: a name can't smuggle in extra fields. */
export const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/** One line, no control characters, max 120 chars (addresses). */
export const cleanLine = (s: string, max = 120) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const MESSAGE_INTRO = "Hola, quiero hacer este pedido de la pre-venta:";

export function buildOrderMessage(o: Order): string {
  const addOnLabels = o.addOns.map((id) => CATALOG.addOns.find((a) => a.id === id)?.label ?? id);
  return [
    MESSAGE_INTRO,
    `Pedido: ${o.code}`,
    `Opción: ${CATALOG.options[o.option].label}`,
    `Cantidad: ${o.qty}`,
    `Adicionales: ${addOnLabels.length ? addOnLabels.join(", ") : "Ninguno"}`,
    `Entrega: ${DELIVERY_LABEL[o.delivery]}`,
    `Nombre: ${cleanName(o.name)}`,
    ...(o.delivery === "shipping" ? [`Dirección: ${cleanLine(o.address ?? "")}`, `Ciudad: ${cleanLine(o.city ?? "", 60)}`] : []),
    `Total: ${formatCOP(orderTotal(o))}`,
  ].join("\n");
}

export function whatsappLink(message: string, number = CATALOG.botNumber): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
