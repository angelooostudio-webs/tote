/**
 * Everything the bot says, in one place. Spanish, "tú", short, warm,
 * professional, no emojis. It should sound like the magazine, not a sales bot.
 * Prices, totals and payment details are always filled in by code.
 */
import { CATALOG, formatCOP, siteLabel } from "../../shared/catalog.ts";
import { DELIVERY_LABEL, SHIPPING_NOTE, orderLines, type Order } from "../../shared/order.ts";

export const PRIVACY_URL = `${CATALOG.siteUrl}privacidad/`;

const launchDate = () =>
  new Date(CATALOG.magazineLaunch).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });

export function orderSummary(o: Order): string {
  const { lines, total } = orderLines(o);
  return [
    ...lines.map((l) => `- ${l.label}: ${formatCOP(l.amount)}`),
    `- Entrega: ${DELIVERY_LABEL[o.delivery]}`,
    ...(o.delivery === "shipping" ? [`- Dirección: ${o.address ?? ""}, ${o.city ?? ""}`] : []),
    `Total: ${formatCOP(total)}`,
  ].join("\n");
}

export interface PaymentDetails {
  nequi: string;
  bancolombia: string;
  holder: string;
}

export function paymentInstructions(o: Order, pay: PaymentDetails, firstContact: boolean): string {
  const total = formatCOP(orderLines(o).total);
  const accounts = [
    pay.nequi && `Nequi: ${pay.nequi}`,
    pay.bancolombia && `Bancolombia: ${pay.bancolombia}`,
    `Titular: ${pay.holder}`,
  ].filter(Boolean);
  return [
    `Hola, ${o.name}. Recibimos tu pedido ${o.code}:`,
    "",
    orderSummary(o),
    "",
    ...(o.delivery === "shipping" ? [SHIPPING_NOTE, ""] : []),
    "Para pagar, transfiere el valor exacto a:",
    ...accounts,
    "",
    `Envía el pantallazo del pago por el valor exacto de ${total} a este chat. Incluye tu código de pedido ${o.code} en la descripción de la transferencia si tu banco lo permite.`,
    "",
    "Apartamos tu tote durante 24 horas.",
    ...(firstContact ? ["", `Cómo tratamos tus datos: ${PRIVACY_URL}`] : []),
  ].join("\n");
}

export const T = {
  privacyLine: `Cómo tratamos tus datos: ${PRIVACY_URL}`,

  presaleNotOpen: () =>
    `La pre-venta abre el ${new Date(CATALOG.presaleOpens).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long" })} a la medianoche. Te esperamos.`,
  presaleClosed: () => `La pre-venta ya cerró. UNBOUND sale el ${launchDate()}; síguenos en Instagram @${CATALOG.instagram} para las novedades.`,
  soldOut: "Lo sentimos, ya no quedan totes para la pre-venta. Gracias por tu interés.",
  notEnoughStock: (left: number) =>
    `No quedan suficientes totes para esa cantidad${left > 0 ? "; prueba con una cantidad menor en la página" : ""}.`,

  badOrder: (problems: string[]) =>
    [
      "No pude leer bien tu pedido. Revisa estos datos:",
      ...problems.map((p) => `- ${p}`),
      "",
      `Lo más fácil es volver a hacerlo desde la página: ${siteLabel()}`,
    ].join("\n"),
  fieldNames: {
    code: "el código del pedido (ANG-…)",
    option: "la opción",
    qty: `la cantidad (de 1 a ${CATALOG.maxQtyPerOrder})`,
    addOns: "los adicionales",
    delivery: "la forma de entrega",
    name: "tu nombre",
    address: "la dirección de envío",
    city: "la ciudad de envío",
  } as Record<string, string>,

  get codeTakenByOther() {
    return `Ese código de pedido ya está en uso. Haz tu pedido de nuevo desde la página para obtener uno nuevo: ${siteLabel()}`;
  },
  alreadyHaveOrder: (code: string, status: string) =>
    status === "CONFIRMED"
      ? `Tu pedido ${code} ya está confirmado.`
      : status === "PENDING_REVIEW"
        ? `Tu pedido ${code} está pendiente de verificación. Te confirmamos en cuanto lo revisemos.`
        : `Tu pedido ${code} ya está registrado. Te repito los datos de pago:`,

  handoff: "Gracias por escribirnos. Una persona del equipo te responde pronto por este chat.",
  greeting: (firstContact: boolean) =>
    [
      "Hola. Aquí puedes pedir el tote de Angelo Studio de la pre-venta.",
      `Haz tu pedido en ${siteLabel()} y toca «Continuar en WhatsApp»: el mensaje llega listo a este chat.`,
      ...(firstContact ? ["", `Cómo tratamos tus datos: ${PRIVACY_URL}`] : []),
    ].join("\n"),

  priceInfo: () =>
    [
      "Precios de la pre-venta:",
      ...Object.values(CATALOG.options).map((o) => `- ${o.label}: ${formatCOP(o.price)}`),
      ...(CATALOG.shipping.enabled ? [`- ${CATALOG.shipping.label}: ${CATALOG.shipping.price > 0 ? formatCOP(CATALOG.shipping.price) : `por ${CATALOG.shipping.carrier}, lo pagas al recibir (contra entrega)`}`] : []),
      "",
      `Haz tu pedido en ${siteLabel()}.`,
    ].join("\n"),

  get statusNone() {
    return `No encuentro un pedido a tu nombre en este número. Puedes hacerlo en ${siteLabel()}.`;
  },
  status: (code: string, status: string) =>
    ({
      AWAITING_PAYMENT: `Tu pedido ${code} está esperando el pago. Cuando transfieras, envía el pantallazo a este chat.`,
      PENDING_REVIEW: `Tu pedido ${code} está pendiente de verificación. Te confirmamos en cuanto lo revisemos.`,
      CONFIRMED: `Tu pedido ${code} está confirmado. UNBOUND sale el ${launchDate()}.`,
      REJECTED: `Tu pedido ${code} no se pudo confirmar. Escríbenos si quieres revisarlo.`,
      EXPIRED: `La reserva de tu pedido ${code} venció porque no recibimos el pago a tiempo. Puedes hacer un pedido nuevo en ${siteLabel()}.`,
      NEEDS_HUMAN: `Tu pedido ${code} lo está revisando una persona del equipo. Te escribimos pronto.`,
    })[status] ?? `Tu pedido ${code} está en revisión.`,

  deleteData: "Recibimos tu solicitud para borrar tus datos. Una persona del equipo te confirma por aquí cuando estén borrados.",
};
