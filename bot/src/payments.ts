/**
 * Payment screenshots. Phase 8 replaces this with the full flow (download,
 * Claude vision extraction, code checks, admin review). For now a person is
 * told about the screenshot and the customer is acknowledged.
 */
import type { Ctx } from "./env.ts";
import type { InboundMessage } from "./whatsapp.ts";
import { forwardToAdmin, say } from "./handlers.ts";
import { latestOrderFor } from "./db.ts";

export async function handleImage(ctx: Ctx, waId: string, _msg: InboundMessage) {
  const order = await latestOrderFor(ctx.env.DB, waId, ["AWAITING_PAYMENT"]);
  if (!order) return say(ctx, waId, "Recibimos tu imagen. Si es un comprobante de pago, primero haz tu pedido en tote.angelostudio.art.");
  await say(ctx, waId, `Recibimos tu comprobante. Tu pedido ${order.code} está pendiente de verificación. Te confirmamos en cuanto lo revisemos.`, order.code);
  await forwardToAdmin(ctx, waId, `comprobante de pago para ${order.code}`, order.name);
}
