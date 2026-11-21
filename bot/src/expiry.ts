/**
 * Cron (every 15 min): one reminder 20 h after an unpaid order, then at 24 h
 * the reservation is released (status EXPIRED) and the customer is told.
 * Stock frees itself the moment reserved_until passes (see db.ts); this just
 * makes the status explicit and keeps the customer informed.
 */
import { formatCOP, siteLabel } from "../../shared/catalog.ts";
import type { Ctx } from "./env.ts";
import { logOutbound, setStatus, type OrderRow } from "./db.ts";

export const REMINDER_AFTER_HOURS = 20;

async function tell(ctx: Ctx, o: OrderRow, text: string) {
  try {
    await ctx.wa.sendText(o.wa_id, text);
    await logOutbound(ctx.env.DB, o.wa_id, "text", text, o.code, ctx.now());
  } catch (err) {
    // the 24 h window may have just closed: nothing else to do, the status change is what matters
    console.error("expiry message not delivered", o.code, err);
  }
}

export async function runExpiry(ctx: Ctx) {
  const db = ctx.env.DB;
  const now = ctx.now();
  const iso = now.toISOString();

  const due = await db
    .prepare(`SELECT * FROM orders WHERE status = 'AWAITING_PAYMENT' AND reminder_sent = 0 AND created_at <= ? AND reserved_until > ?`)
    .bind(new Date(now.getTime() - REMINDER_AFTER_HOURS * 3600_000).toISOString(), iso)
    .all<OrderRow>();
  for (const o of due.results ?? []) {
    await db.prepare(`UPDATE orders SET reminder_sent = 1, updated_at = ? WHERE code = ?`).bind(iso, o.code).run();
    await tell(
      ctx,
      o,
      `Te recordamos que tu pedido ${o.code} sigue apartado unas horas más. Para no perderlo, transfiere ${formatCOP(o.total)} y envía el pantallazo a este chat.`
    );
  }

  const expired = await db.prepare(`SELECT * FROM orders WHERE status = 'AWAITING_PAYMENT' AND reserved_until <= ?`).bind(iso).all<OrderRow>();
  for (const o of expired.results ?? []) {
    await setStatus(db, o.code, "EXPIRED", now);
    await tell(ctx, o, `La reserva de tu pedido ${o.code} venció porque no recibimos el pago a tiempo. Si todavía lo quieres, haz un pedido nuevo en ${siteLabel()}.`);
  }
  return { reminded: due.results?.length ?? 0, expired: expired.results?.length ?? 0 };
}
