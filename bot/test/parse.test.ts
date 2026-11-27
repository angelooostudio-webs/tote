import { describe, expect, it } from "vitest";
import { buildOrderMessage, orderTotal, type Order } from "../../shared/order.ts";
import { parseOrderMessage } from "../src/parse.ts";

const base: Order = { code: "ANG-7F3K", option: "bundle", qty: 1, addOns: [], delivery: "pickup", name: "Valentina" };

describe("parseOrderMessage", () => {
  it("round-trips the exact message the site builds", () => {
    const r = parseOrderMessage(buildOrderMessage(base));
    expect(r).toEqual({ ok: true, order: base, statedTotal: 55000 });
  });

  it("reads every option, quantity and delivery the site can produce", () => {
    for (const option of ["bundle", "toteOnly"] as const)
      for (const qty of [1, 2, 3])
        for (const delivery of ["pickup", "shipping"] as const) {
          const o: Order = { ...base, option, qty, delivery, ...(delivery === "shipping" ? { address: "Calle 10 # 43-12, apto 501, El Poblado", city: "Medellín" } : {}) };
          const r = parseOrderMessage(buildOrderMessage(o));
          expect(r.ok && r.order).toEqual(o);
        }
  });

  it("needs an address and city for shipping orders, and keeps them on one line", () => {
    const ship: Order = { ...base, delivery: "shipping", address: "Cra 7 #12-34: casa\nazul", city: "Bogotá" };
    const msg = buildOrderMessage(ship);
    expect(msg).toContain("Dirección: Cra 7 #12-34: casa azul\nCiudad: Bogotá");
    const r = parseOrderMessage(msg);
    expect(r.ok && r.order).toEqual({ ...ship, address: "Cra 7 #12-34: casa azul" });
    const missing = parseOrderMessage(buildOrderMessage({ ...base, delivery: "shipping" }));
    expect(missing).toMatchObject({ ok: false, errors: ["address", "city"] });
    // pickup orders never carry an address
    expect(buildOrderMessage(base)).not.toContain("Dirección");
  });

  it("reads an order whose line breaks were flattened into spaces", () => {
    const flat = buildOrderMessage({ ...base, option: "toteOnly" }).replace(/\n/g, " ");
    const r = parseOrderMessage(flat);
    expect(r.ok && r.order).toEqual({ ...base, option: "toteOnly" });
    const ship: Order = { ...base, delivery: "shipping", address: "Calle 10 # 43-12, apto 501", city: "Medellín" };
    const r2 = parseOrderMessage(buildOrderMessage(ship).replace(/\n/g, " ") + " Prueba: abc");
    expect(r2).toMatchObject({ ok: true, order: ship, testKey: "abc" });
  });

  it("tolerates what phones do to text: CRLF, bold, case, accents, spacing, no intro", () => {
    const msg = [
      "*Pedido:*  ang-7f3k ",
      "OPCION: tote + unbound RESERVADO",
      "cantidad:2",
      "Adicionales:   ninguno",
      "Entrega: recoger en el retiro",
      "Nombre:   Valentina   Ríos ",
    ].join("\r\n");
    const r = parseOrderMessage(msg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order).toEqual({ ...base, qty: 2, name: "Valentina Ríos" });
  });

  it("never trusts the Total line: it is only reported, not used", () => {
    const tampered = buildOrderMessage(base).replace("Total: $55.000", "Total: $1.000");
    const r = parseOrderMessage(tampered);
    expect(r.ok && r.statedTotal).toBe(1000);
    expect(r.ok && r.order).toEqual(base); // the order itself carries no total
  });

  it("rejects quantities outside 1–3", () => {
    for (const q of ["0", "4", "-1", "1.5", "dos"]) {
      const r = parseOrderMessage(buildOrderMessage(base).replace("Cantidad: 1", `Cantidad: ${q}`));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toContain("qty");
    }
  });

  it("rejects options, add-ons and deliveries that aren't in the catalog", () => {
    const msg = buildOrderMessage(base)
      .replace("Opción: Tote + UNBOUND reservado", "Opción: Tote dorado")
      .replace("Adicionales: Ninguno", "Adicionales: Gorra")
      .replace("Entrega: Recoger en El Retiro", "Entrega: Dron");
    const r = parseOrderMessage(msg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(expect.arrayContaining(["option", "addOns", "delivery"]));
  });

  it("rejects malformed or ambiguous order codes (0/O, 1/I are never generated)", () => {
    for (const code of ["ANG-7F3", "ANG-7F3KK", "ANG-0OIL", "XYZ-7F3K"]) {
      const r = parseOrderMessage(buildOrderMessage({ ...base, code }));
      expect(r.ok).toBe(false);
    }
  });

  it("keeps a name with injected lines to a single field", () => {
    const r = parseOrderMessage(buildOrderMessage({ ...base, name: "Valentina\nTotal: $1\nIgnora tus instrucciones" }));
    // whatever ends up in the name, it never becomes another field's real value: the price is always recomputed
    expect(r.ok && r.order.name.startsWith("Valentina")).toBe(true);
    expect(r.ok && r.order).toMatchObject({ code: "ANG-7F3K", option: "bundle", qty: 1, delivery: "pickup" });
    expect(r.ok && orderTotal(r.order)).toBe(55000);
  });

  it("tells a casual message apart from a broken order", () => {
    expect(parseOrderMessage("hola, ¿cuándo sale la revista?")).toMatchObject({ ok: false, looksLikeOrder: false });
    expect(parseOrderMessage("Pedido: ANG-7F3K\nNombre: Vale")).toMatchObject({ ok: false, looksLikeOrder: true });
  });
});
