/**
 * D1 access. Stock is never stored as a counter: it is computed from the
 * orders that hold it (confirmed, under review, waiting for a human, or
 * awaiting payment with a reservation that hasn't expired), so it can't drift.
 */
import { CATALOG } from "../../shared/catalog.ts";
import type { Order } from "../../shared/order.ts";

export type Status = "AWAITING_PAYMENT" | "PENDING_REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED" | "NEEDS_HUMAN";

export interface OrderRow {
  id: number;
  code: string;
  wa_id: string;
  name: string;
  option: Order["option"];
  qty: number;
  add_ons: string;
  delivery: Order["delivery"];
  total: number;
  status: Status;
  failed_attempts: number;
  reserved_until: string | null;
  reminder_sent: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export const RESERVATION_HOURS = 24;

export const rowToOrder = (r: OrderRow): Order => ({
  code: r.code,
  option: r.option,
  qty: r.qty,
  addOns: JSON.parse(r.add_ons || "[]"),
  delivery: r.delivery,
  name: r.name,
});

// orders that currently hold stock
const HOLDING = `(status IN ('PENDING_REVIEW','CONFIRMED','NEEDS_HUMAN') OR (status = 'AWAITING_PAYMENT' AND reserved_until > ?1))`;

export async function remainingStock(db: D1Database, now: Date): Promise<number> {
  const r = await db.prepare(`SELECT COALESCE(SUM(qty), 0) AS held FROM orders WHERE ${HOLDING}`).bind(now.toISOString()).first<{ held: number }>();
  return Math.max(0, CATALOG.stockTotal - (r?.held ?? 0));
}

/**
 * Creates the order and reserves its stock in one statement: the INSERT only
 * happens if enough stock is free at that moment, so two customers can't both
 * get the last tote.
 */
export async function createOrderIfStock(db: D1Database, o: Order, waId: string, total: number, now: Date): Promise<boolean> {
  const iso = now.toISOString();
  const until = new Date(now.getTime() + RESERVATION_HOURS * 3600_000).toISOString();
  const res = await db
    .prepare(
      `INSERT INTO orders (code, wa_id, name, option, qty, add_ons, delivery, total, status, reserved_until, created_at, updated_at)
       SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'AWAITING_PAYMENT', ?10, ?1, ?1
       WHERE (SELECT COALESCE(SUM(qty), 0) FROM orders WHERE ${HOLDING}) + ?6 <= ?11`
    )
    .bind(iso, o.code, waId, o.name, o.option, o.qty, JSON.stringify(o.addOns), o.delivery, total, until, CATALOG.stockTotal)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export const getOrder = (db: D1Database, code: string) => db.prepare(`SELECT * FROM orders WHERE code = ?`).bind(code).first<OrderRow>();

/** the customer's most recent order, optionally only in some statuses */
export async function latestOrderFor(db: D1Database, waId: string, statuses?: Status[]) {
  const where = statuses?.length ? `AND status IN (${statuses.map((s) => `'${s}'`).join(",")})` : "";
  return db.prepare(`SELECT * FROM orders WHERE wa_id = ? ${where} ORDER BY created_at DESC, id DESC LIMIT 1`).bind(waId).first<OrderRow>();
}

export async function setStatus(db: D1Database, code: string, status: Status, now: Date, extra: Partial<Pick<OrderRow, "rejection_reason" | "confirmed_at" | "failed_attempts" | "reserved_until">> = {}) {
  const sets = ["status = ?", "updated_at = ?", ...Object.keys(extra).map((k) => `${k} = ?`)];
  await db
    .prepare(`UPDATE orders SET ${sets.join(", ")} WHERE code = ?`)
    .bind(status, now.toISOString(), ...Object.values(extra), code)
    .run();
}

// ---------- message log ----------

/** Logs an inbound message. Returns false if this wamid was already seen (Meta retries): skip it. */
export async function logInbound(db: D1Database, waMessageId: string, waId: string, kind: string, body: string | null, now: Date): Promise<boolean> {
  const res = await db
    .prepare(`INSERT OR IGNORE INTO messages (wa_message_id, wa_id, direction, kind, body, created_at) VALUES (?, ?, 'in', ?, ?, ?)`)
    .bind(waMessageId, waId, kind, body, now.toISOString())
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function logOutbound(db: D1Database, waId: string, kind: string, body: string, orderCode: string | null, now: Date) {
  await db
    .prepare(`INSERT INTO messages (wa_id, direction, kind, body, order_code, created_at) VALUES (?, 'out', ?, ?, ?, ?)`)
    .bind(waId, kind, body, orderCode, now.toISOString())
    .run();
}

/** true until the bot has ever written to this number (the first reply carries the privacy line) */
export async function isFirstContact(db: D1Database, waId: string) {
  const r = await db.prepare(`SELECT 1 AS x FROM messages WHERE wa_id = ? AND direction = 'out' LIMIT 1`).bind(waId).first();
  return !r;
}

/** when the customer last wrote: free-form replies are only allowed within 24 h of it */
export async function lastInboundAt(db: D1Database, waId: string): Promise<Date | null> {
  const r = await db.prepare(`SELECT MAX(created_at) AS t FROM messages WHERE wa_id = ? AND direction = 'in'`).bind(waId).first<{ t: string | null }>();
  return r?.t ? new Date(r.t) : null;
}

export async function recentConversation(db: D1Database, waId: string, limit = 12) {
  const r = await db
    .prepare(`SELECT direction, kind, body, created_at FROM messages WHERE wa_id = ? ORDER BY id DESC LIMIT ?`)
    .bind(waId, limit)
    .all<{ direction: string; kind: string; body: string | null; created_at: string }>();
  return (r.results ?? []).reverse();
}
