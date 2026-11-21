/**
 * Messages from ADMIN_NUMBER. Phase 8 adds the commands (RESUMEN, PENDIENTES,
 * PEDIDO, EXPORTAR) and the Confirmar / Rechazar buttons.
 */
import type { Ctx } from "./env.ts";
import type { InboundMessage } from "./whatsapp.ts";
import { say } from "./handlers.ts";

export async function handleAdmin(ctx: Ctx, msg: InboundMessage) {
  await say(ctx, msg.from, "Hola, Angelo. Los comandos de administración llegan en la siguiente versión del bot.");
}
