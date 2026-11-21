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

interface Table {
  head: string[];
  rows: unknown[][];
}

async function pickupTable(db: D1Database): Promise<Table> {
  const list = await rows(db, true);
  return {
    head: ["#", "Código", "Nombre", "Tel. (últimos 4)", "Producto", "Cant.", "Entrega", "Entregado ✓", "Firma / nota"],
    rows: list.map((r, i) => [i + 1, r.code, r.name, `…${r.wa_id.slice(-4)}`, product(r), r.qty, delivery(r), "", ""]),
  };
}

export async function pickupCsv(db: D1Database): Promise<string> {
  const t = await pickupTable(db);
  return csv(t.head, t.rows);
}

export async function paymentsCsv(db: D1Database): Promise<string> {
  const t = await paymentsTable(db);
  return csv(t.head, t.rows);
}

async function paymentsTable(db: D1Database): Promise<Table> {
  const list = await rows(db, false);
  return {
    head: ["Código", "Estado", "Nombre", "WhatsApp", "Producto", "Cant.", "Entrega", "Total", "Monto en pantallazo", "Referencia", "Banco / app", "Revisión automática", "Pedido", "Confirmado"],
    rows: list.map((r) => {
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
    }),
  };
}

const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Printable page: /panel?key=…&v=entrega|pagos */
export async function panelHtml(db: D1Database, view: string, key: string, now: Date): Promise<string> {
  const pickup = view !== "pagos";
  const t = pickup ? await pickupTable(db) : await paymentsTable(db);
  const k = encodeURIComponent(key);
  const title = pickup ? "Lista de entrega" : "Pagos";
  const stamp = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" }).format(now);
  const cell = (v: unknown, i: number) => {
    const s = String(v ?? "");
    if (!pickup && t.head[i] === "WhatsApp" && s) return `<a href="https://${h(s)}">${h(s.replace("wa.me/", "+"))}</a>`;
    if (pickup && (t.head[i] === "Entregado ✓")) return `<span class="box"></span>`;
    return h(s);
  };
  const body = t.rows.length
    ? t.rows.map((r) => `<tr>${r.map((v, i) => `<td class="c${i}">${cell(v, i)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${t.head.length}" class="empty">${pickup ? "Todavía no hay pedidos confirmados." : "Todavía no hay pedidos."}</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · Tote Angelo Studio</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:24px 16px;font:15px/1.4 -apple-system,system-ui,sans-serif;color:#111;background:#f3efe7}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px}
h1{font-size:22px;margin:0}.meta{color:#6b685f;font-size:13px}
nav{display:flex;gap:8px;flex-wrap:wrap}nav a,button{font:inherit;padding:8px 14px;border-radius:999px;border:1px solid #111;background:none;color:#111;text-decoration:none;cursor:pointer}
nav a.on,button{background:#111;color:#f3efe7}
.wrap{overflow-x:auto;background:#fff;border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:640px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid rgba(17,17,18,.12);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b685f;white-space:nowrap}td.c1{font-family:ui-monospace,Menlo,monospace;font-weight:600;white-space:nowrap}
.box{display:inline-block;width:18px;height:18px;border:1.5px solid #111;border-radius:3px}.empty{color:#6b685f;text-align:center;padding:32px}
.c8{min-width:140px}
@media print{body{background:#fff;padding:0;font-size:12px}nav,button{display:none}.wrap{overflow:visible;border-radius:0}table{min-width:0}th,td{padding:6px 8px}tr{break-inside:avoid}}
</style></head><body>
<header><div><h1>${title}</h1><div class="meta">Tote Angelo Studio · ${t.rows.length} ${t.rows.length === 1 ? (pickup ? "pedido confirmado" : "pedido") : pickup ? "pedidos confirmados" : "pedidos"} · actualizado ${h(stamp)}</div></div>
<nav><a href="?key=${k}&v=entrega"${pickup ? ' class="on"' : ""}>Entrega</a><a href="?key=${k}&v=pagos"${pickup ? "" : ' class="on"'}>Pagos</a>
<a href="/sheet/${pickup ? "entrega" : "pagos"}.csv?key=${k}">Descargar (Excel/Sheets)</a><button onclick="print()">Imprimir</button></nav></header>
<div class="wrap"><table><thead><tr>${t.head.map((x) => `<th>${h(x)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
</body></html>`;
}
