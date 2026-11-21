/**
 * Deterministic parser for the order message the site prefills
 * (format defined in shared/order.ts). No LLM involved.
 *
 *   Hola, quiero hacer este pedido de la pre-venta:
 *   Pedido: ANG-7F3K
 *   Opción: Tote + UNBOUND reservado
 *   Cantidad: 1
 *   Adicionales: Ninguno
 *   Entrega: Recoger en El Retiro
 *   Nombre: Valentina
 *   Total: $55.000
 *
 * Tolerant of what people (and phones) do to text: case, accents, extra
 * spaces, CRLF, "*bold*" markers, a missing intro line. Strict about content:
 * every value must map to something in the catalog.
 */
import { CATALOG, type OptionId } from "../../shared/catalog.ts";
import { CODE_RE, DELIVERY_LABEL, cleanName, type Delivery, type Order } from "../../shared/order.ts";

export type ParseResult =
  | { ok: true; order: Order; statedTotal: number | null }
  | { ok: false; looksLikeOrder: boolean; errors: string[] };

/** lowercase, no accents, no WhatsApp formatting marks, single spaces */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const KEYS: Record<string, keyof Fields> = {
  pedido: "code",
  codigo: "code",
  opcion: "option",
  cantidad: "qty",
  adicionales: "addOns",
  entrega: "delivery",
  nombre: "name",
  total: "total",
};
type Fields = { code: string; option: string; qty: string; addOns: string; delivery: string; name: string; total: string };

export function parseOrderMessage(text: string): ParseResult {
  const fields: Partial<Fields> = {};
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = raw.match(/^\s*[*_]*([^:]{3,20}?)[*_]*\s*:\s*(.*)$/);
    if (!m) continue;
    const key = KEYS[norm(m[1])];
    if (key && !(key in fields)) fields[key] = m[2].replace(/[*_~]/g, "").trim();
  }

  // it's an order attempt if it has an order code or at least 3 of the known fields
  const looksLikeOrder = !!fields.code || Object.keys(fields).length >= 3;
  const errors: string[] = [];

  const code = (fields.code ?? "").toUpperCase().replace(/\s+/g, "");
  if (!CODE_RE.test(code)) errors.push("code");

  const option = (Object.keys(CATALOG.options) as OptionId[]).find((id) => norm(CATALOG.options[id].label) === norm(fields.option ?? ""));
  if (!option) errors.push("option");

  const qty = /^\d+$/.test(fields.qty ?? "") ? Number(fields.qty) : NaN;
  if (!Number.isInteger(qty) || qty < 1 || qty > CATALOG.maxQtyPerOrder) errors.push("qty");

  const addOns: string[] = [];
  const rawAddOns = norm(fields.addOns ?? "ninguno");
  if (rawAddOns && rawAddOns !== "ninguno" && rawAddOns !== "ninguna") {
    for (const part of (fields.addOns ?? "").split(",")) {
      const a = CATALOG.addOns.find((x) => norm(x.label) === norm(part));
      if (!a) {
        errors.push("addOns");
        break;
      }
      if (!addOns.includes(a.id)) addOns.push(a.id);
    }
  }

  const delivery = (Object.keys(DELIVERY_LABEL) as Delivery[]).find((d) => norm(DELIVERY_LABEL[d]) === norm(fields.delivery ?? ""));
  if (!delivery) errors.push("delivery");
  if (delivery === "shipping" && !CATALOG.shipping.enabled) errors.push("delivery");

  const name = cleanName(fields.name ?? "");
  if (!name) errors.push("name");

  // the stated total is only informational: the bot always recomputes it
  const totalDigits = (fields.total ?? "").replace(/[^\d]/g, "");
  const statedTotal = totalDigits ? Number(totalDigits) : null;

  if (errors.length) return { ok: false, looksLikeOrder, errors: [...new Set(errors)] };
  return {
    ok: true,
    statedTotal,
    order: { code, option: option!, qty, addOns, delivery: delivery!, name },
  };
}
