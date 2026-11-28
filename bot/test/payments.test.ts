import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { CATALOG } from "../../shared/catalog.ts";
import { buildOrderMessage, type Order } from "../../shared/order.ts";
import { processWebhook } from "../src/index.ts";
import { getOrder, remainingStock } from "../src/db.ts";
import { KeywordAssistant } from "../src/assistant.ts";
import { runExpiry } from "../src/expiry.ts";
import { ordersCsv } from "../src/admin.ts";
import { checkProof, hashDistance, imageHash, nameMatches, SAME_IMAGE_MAX_DISTANCE, type Extracted } from "../src/proofs.ts";
import { ADMIN, CUSTOMER, inbound, testCtx } from "./harness.ts";

// ---------- synthetic screenshots ----------
function screenshot(seed: number, w = 360, h = 720, quality = 85): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // drawn from relative position, so the same "screenshot" at another size is the same picture
      const cx = Math.floor((x / w) * 6);
      const cy = Math.floor((y / h) * 14);
      const v = (((cx * 73 + cy * 151 + seed * 997) * 2654435761) >>> 24) & 255;
      data[i] = v;
      data[i + 1] = (v + seed * 37) % 256;
      data[i + 2] = (v * 2 + seed) % 256;
      data[i + 3] = 255;
    }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, quality).data);
}

const good = (o: Partial<Extracted> = {}): Extracted => ({
  is_payment_receipt: true,
  amount: 55000,
  currency: "COP",
  recipient_name: "Angelo Studio",
  recipient_account_last4: null,
  date: "2026-11-28",
  time: "10:05",
  reference: "M1234567",
  bank_or_app: "Nequi",
  looks_edited: { value: false, reason: "" },
  confidence: 0.93,
  ...o,
});
const expected = { total: 55000, holderName: "Angelo Studio", accounts: ["300 000 4567", "Ahorros 000-000000-89"], orderCreatedAt: new Date("2026-11-28T09:59:00-05:00") };

describe("screenshot checks (code, not the model)", () => {
  it("passes a correct receipt", () => expect(checkProof(good(), expected, false)).toEqual([]));
  it("flags a different amount", () => expect(checkProof(good({ amount: 50000 }), expected, false)).toEqual(["amount"]));
  it("accepts the recipient by account digits when the name isn't shown", () =>
    expect(checkProof(good({ recipient_name: null, recipient_account_last4: "4567" }), expected, false)).toEqual([]));
  it("flags a payment to someone else", () =>
    expect(checkProof(good({ recipient_name: "Pedro Pérez", recipient_account_last4: "1111" }), expected, false)).toEqual(["recipient"]));
  it("flags a receipt dated before the order (Bogotá date)", () => expect(checkProof(good({ date: "2026-11-27" }), expected, false)).toEqual(["date"]));
  it("flags a missing date", () => expect(checkProof(good({ date: null }), expected, false)).toEqual(["date"]));
  it("flags a reused screenshot and a low-confidence read", () =>
    expect(checkProof(good({ confidence: 0.4 }), expected, true)).toEqual(["duplicate", "confidence"]));
  it("stops at 'not a receipt'", () => expect(checkProof(good({ is_payment_receipt: false }), expected, false)).toEqual(["not_receipt"]));
  it("matches abbreviated holder names", () => {
    expect(nameMatches("ANGELO STUDIO SAS", "Angelo Studio")).toBe(true);
    expect(nameMatches("Ang. Studio", "Angelo Studio")).toBe(true);
    expect(nameMatches("Angela Suárez", "Angelo Studio")).toBe(false);
  });
});

describe("screenshot fingerprint", () => {
  it("recognises the same screenshot re-compressed or resized", async () => {
    const a = await imageHash(screenshot(1));
    expect(hashDistance(a, await imageHash(screenshot(1, 360, 720, 50)))).toBeLessThanOrEqual(SAME_IMAGE_MAX_DISTANCE);
    expect(hashDistance(a, await imageHash(screenshot(1, 540, 1080, 70)))).toBeLessThanOrEqual(SAME_IMAGE_MAX_DISTANCE);
  });
  it("tells different screenshots apart", async () => {
    expect(hashDistance(await imageHash(screenshot(1)), await imageHash(screenshot(2)))).toBeGreaterThan(SAME_IMAGE_MAX_DISTANCE);
  });
  it("falls back to an exact hash for non-JPEG files", async () => {
    const h = await imageHash(new TextEncoder().encode("not an image"));
    expect(h.startsWith("s:")).toBe(true);
    expect(hashDistance(h, h)).toBe(0);
  });
});

// ---------- the whole payment conversation ----------
const order = (o: Partial<Order> = {}): Order => ({ code: "ANG-7F3K", option: "bundle", qty: 1, addOns: [], delivery: "pickup", name: "Valentina", ...o });

function setup(read: (b: Uint8Array) => Extracted | null = () => good()) {
  const ai = new KeywordAssistant();
  ai.readPayment = read;
  const t = testCtx({ ai });
  t.ctx.env.PAYMENT_NEQUI = "300 000 4567";
  let media = 0;
  const sendShot = async (from: string, bytes = screenshot(1)) => {
    const id = `media.${++media}`;
    t.wa.media.set(id, { bytes, mime: "image/jpeg" });
    await processWebhook(t.ctx, inbound(from, { image: { id } }));
  };
  return { ...t, sendShot };
}

describe("payment flow", () => {
  it("good screenshot → pending review; customer told it's pending (never confirmed); Angelo gets summary, image and buttons", async () => {
    const { ctx, wa, sendShot } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER);
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!.status).toBe("PENDING_REVIEW");
    expect(wa.last(CUSTOMER)!.body).toBe("Recibimos tu comprobante. Tu pedido ANG-7F3K está pendiente de verificación. Te confirmamos en cuanto lo revisemos.");
    const admin = wa.to(ADMIN);
    expect(admin.map((m) => m.kind)).toEqual(["text", "image", "buttons"]);
    expect(admin[0].body).toContain("Verificación automática: pasa");
    expect(admin[2].buttons).toEqual([
      { id: "ok:ANG-7F3K", title: "Confirmar" },
      { id: "no:ANG-7F3K", title: "Rechazar" },
    ]);
  });

  it("Confirmar → confirmed, stock committed, customer gets the confirmation with the launch date", async () => {
    const { ctx, wa, sendShot } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER);
    await processWebhook(ctx, inbound(ADMIN, { button: { id: "ok:ANG-7F3K", title: "Confirmar" } }));
    const o = (await getOrder(ctx.env.DB, "ANG-7F3K"))!;
    expect(o.status).toBe("CONFIRMED");
    expect(wa.last(CUSTOMER)!.body).toBe("Listo, tu pedido ANG-7F3K está confirmado. Puedes recogerlo el 4 de diciembre de 2026. Gracias por su compra.");
    expect(wa.last(ADMIN)!.body).toContain("Confirmado ANG-7F3K");
    // a day later the stock is still held (it's confirmed, not a reservation)
    expect(await remainingStock(ctx.env.DB, new Date(ctx.now().getTime() + 3 * 86400_000))).toBe(CATALOG.stockTotal - 1);
  });

  it("confirms with the approved template when the customer's 24 h window has closed", async () => {
    const { ctx, wa, sendShot, advance } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER);
    advance(30 * 3600_000);
    await processWebhook(ctx, inbound(ADMIN, { text: "ok ang-7f3k" }));
    expect(wa.last(CUSTOMER)).toMatchObject({ kind: "template", body: "pedido_confirmado (es_CO): ANG-7F3K | 4 de diciembre de 2026" });
  });

  it("NO <code> <motivo> → rejected with the reason, stock released", async () => {
    const { ctx, wa, sendShot } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER);
    await processWebhook(ctx, inbound(ADMIN, { text: "NO ANG-7F3K el pago no ha llegado a la cuenta" }));
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!).toMatchObject({ status: "REJECTED", rejection_reason: "el pago no ha llegado a la cuenta" });
    expect(wa.last(CUSTOMER)!.body).toContain("No pudimos confirmar tu pedido ANG-7F3K: el pago no ha llegado a la cuenta.");
    expect(await remainingStock(ctx.env.DB, ctx.now())).toBe(CATALOG.stockTotal);
  });

  it("explains a wrong amount, then hands off to a person after two failed screenshots", async () => {
    const { ctx, wa, sendShot } = setup(() => good({ amount: 50000 }));
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER, screenshot(1));
    expect(wa.last(CUSTOMER)!.body).toContain("En el comprobante vemos $50.000, y el total de tu pedido es $55.000");
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!.status).toBe("AWAITING_PAYMENT");
    await sendShot(CUSTOMER, screenshot(3));
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!.status).toBe("NEEDS_HUMAN");
    expect(wa.last(CUSTOMER)!.body).toContain("Una persona del equipo va a revisar tu pago");
    expect(wa.last(ADMIN)!.kind).toBe("buttons");
  });

  it("catches a screenshot already used for another order", async () => {
    const { ctx, wa, sendShot } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER, screenshot(5));
    const other = "573009998877";
    await processWebhook(ctx, inbound(other, { text: buildOrderMessage(order({ code: "ANG-9QWE", name: "Otra" })) }));
    await sendShot(other, screenshot(5, 360, 720, 60)); // same image, re-compressed
    expect(wa.last(other)!.body).toContain("Este comprobante ya se usó para otro pedido.");
  });

  it("an unreadable screenshot goes to Angelo instead of bouncing the customer", async () => {
    const { ctx, wa, sendShot } = setup(() => null);
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER);
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!.status).toBe("PENDING_REVIEW");
    expect(wa.to(ADMIN)[0].body).toContain("No se pudo leer el comprobante automáticamente");
  });

  it("only the admin number can confirm", async () => {
    const { ctx, sendShot } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    await sendShot(CUSTOMER);
    await processWebhook(ctx, inbound(CUSTOMER, { text: "OK ANG-7F3K" }));
    await processWebhook(ctx, inbound(CUSTOMER, { button: { id: "ok:ANG-7F3K", title: "Confirmar" } }));
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!.status).toBe("PENDING_REVIEW");
  });
});

describe("admin commands", () => {
  it("RESUMEN, PENDIENTES, PEDIDO and EXPORTAR", async () => {
    const { ctx, wa, sendShot } = setup(() => good({ amount: 110000 }));
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order({ qty: 2 })) }));
    await sendShot(CUSTOMER);
    await processWebhook(ctx, inbound(ADMIN, { text: "PENDIENTES" }));
    expect(wa.last(ADMIN)!.body).toContain("ANG-7F3K · Valentina · $110.000 · por revisar");
    await processWebhook(ctx, inbound(ADMIN, { text: "ok ANG-7F3K" }));
    await processWebhook(ctx, inbound(ADMIN, { text: "resumen" }));
    expect(wa.last(ADMIN)!.body).toContain("Totes confirmados: 2");
    expect(wa.last(ADMIN)!.body).toContain("Recaudo confirmado: $110.000");
    expect(wa.last(ADMIN)!.body).toContain(`Totes disponibles: ${CATALOG.stockTotal - 2} de ${CATALOG.stockTotal}`);
    await processWebhook(ctx, inbound(ADMIN, { text: "Pedido ANG-7F3K" }));
    expect(wa.last(ADMIN)!.body).toContain("pasó la verificación");
    await processWebhook(ctx, inbound(ADMIN, { text: "EXPORTAR" }));
    const doc = wa.last(ADMIN)!;
    expect(doc.kind).toBe("document");
    expect((doc.extra as { text: string }).text).toContain('"ANG-7F3K","CONFIRMED","Valentina"');
  });

  it("CSV defuses spreadsheet formulas in customer names", () => {
    const csv = ordersCsv([{ code: "ANG-AAAA", name: "=HYPERLINK(\"x\")" } as never]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("expiry cron", () => {
  it("reminds once at 20 h and releases the reservation at 24 h", async () => {
    const { ctx, wa, advance } = setup();
    await processWebhook(ctx, inbound(CUSTOMER, { text: buildOrderMessage(order()) }));
    advance(19 * 3600_000);
    expect(await runExpiry(ctx)).toEqual({ reminded: 0, expired: 0 });
    advance(1.5 * 3600_000);
    expect(await runExpiry(ctx)).toEqual({ reminded: 1, expired: 0 });
    expect(wa.last(CUSTOMER)!.body).toContain("sigue apartado");
    expect(await runExpiry(ctx)).toEqual({ reminded: 0, expired: 0 }); // only once
    advance(4 * 3600_000);
    expect(await runExpiry(ctx)).toEqual({ reminded: 0, expired: 1 });
    expect((await getOrder(ctx.env.DB, "ANG-7F3K"))!.status).toBe("EXPIRED");
    expect(wa.last(CUSTOMER)!.body).toContain("venció");
    expect(await remainingStock(ctx.env.DB, ctx.now())).toBe(CATALOG.stockTotal);
  });
});
