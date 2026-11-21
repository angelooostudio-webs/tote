/**
 * CSV feeds for a Google Sheet (=IMPORTDATA), protected by SHEET_KEY.
 *   /sheet/entrega.csv  confirmed orders only — the printable pickup list (phone shortened to the last 4 digits)
 *   /sheet/pagos.csv    every order with what the bot read from the payment screenshot — for checking payments
 */
import { CATALOG, formatCOP } from "../../shared/catalog.ts";
import { STATUS_ES } from "./admin.ts";
import type { OrderRow } from "./db.ts";

interface Row extends OrderRow {
  proof_json: string | null;
  proof_verdict: string | null;
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // never let customer text become a formula
  return `"${safe.replace(/"/g, '""')}"`;
};
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

const bogota = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "";
const product = (r: OrderRow) => CATALOG.options[r.option as keyof typeof CATALOG.options]?.label ?? r.option;
const delivery = (r: OrderRow) => (r.delivery === "shipping" ? "Envío" : "Recogida");

async function rows(db: D1Database, onlyConfirmed: boolean): Promise<Row[]> {
  // latest payment screenshot per order
  const sql = `
    SELECT o.*, p.extracted_json AS proof_json, p.verdict AS proof_verdict
    FROM orders o
    LEFT JOIN payment_proofs p ON p.id = (SELECT MAX(id) FROM payment_proofs WHERE order_code = o.code)
    ${onlyConfirmed ? "WHERE o.status = 'CONFIRMED' ORDER BY o.confirmed_at, o.id" : "ORDER BY o.created_at, o.id"}`;
  return (await db.prepare(sql).all<Row>()).results ?? [];
}

export async function pickupCsv(db: D1Database): Promise<string> {
  const list = await rows(db, true);
  return csv(
    ["#", "Código", "Nombre", "Tel. (últimos 4)", "Producto", "Cant.", "Entrega", "Entregado ✓", "Firma / nota"],
    list.map((r, i) => [i + 1, r.code, r.name, `…${r.wa_id.slice(-4)}`, product(r), r.qty, delivery(r), "", ""])
  );
}

export async function paymentsCsv(db: D1Database): Promise<string> {
  const list = await rows(db, false);
  return csv(
    ["Código", "Estado", "Nombre", "WhatsApp", "Producto", "Cant.", "Entrega", "Total", "Monto en pantallazo", "Referencia", "Banco / app", "Revisión automática", "Pedido", "Confirmado"],
    list.map((r) => {
      let p: Record<string, any> = {};
      try {
        p = r.proof_json ? JSON.parse(r.proof_json) : {};
      } catch {}
      const check = r.proof_verdict == null ? "" : r.proof_verdict === "pass" ? "ok" : p.is_payment_receipt === false ? "no es comprobante" : "revisar";
      return [
        r.code,
        STATUS_ES[r.status] ?? r.status,
        r.name,
        `wa.me/${r.wa_id}`, // opens the chat
        product(r),
        r.qty,
        delivery(r),
        formatCOP(r.total),
        typeof p.amount === "number" ? formatCOP(p.amount) : "",
        p.reference ?? "",
        p.bank_or_app ?? "",
        check,
        bogota(r.created_at),
        bogota(r.confirmed_at),
      ];
    })
  );
}
