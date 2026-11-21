import { describe, expect, it } from "vitest";
import { CATALOG, formatCOP, presalePhase } from "../../shared/catalog.ts";
import { CODE_ALPHABET, CODE_RE, makeOrderCode, orderLines, orderTotal } from "../../shared/order.ts";
import { verifySignature } from "../src/whatsapp.ts";
import { sign } from "./harness.ts";

describe("totals (computed by code from the shared catalog)", () => {
  it("option × quantity", () => {
    expect(orderTotal({ option: "bundle", qty: 1, addOns: [], delivery: "pickup" })).toBe(CATALOG.options.bundle.price);
    expect(orderTotal({ option: "toteOnly", qty: 3, addOns: [], delivery: "pickup" })).toBe(CATALOG.options.toteOnly.price * 3);
  });
  it("shipping is paid to the carrier on delivery: nothing added to the total", () => {
    const { lines, total } = orderLines({ option: "toteOnly", qty: 2, addOns: [], delivery: "shipping" });
    expect(CATALOG.shipping.price).toBe(0);
    expect(lines).toHaveLength(1);
    expect(total).toBe(CATALOG.options.toteOnly.price * 2);
  });
  it("refuses anything outside the catalog", () => {
    expect(() => orderTotal({ option: "toteOnly", qty: 4, addOns: [], delivery: "pickup" })).toThrow();
    expect(() => orderTotal({ option: "toteOnly", qty: 1, addOns: ["nope"], delivery: "pickup" })).toThrow();
    expect(() => orderTotal({ option: "gold" as never, qty: 1, addOns: [], delivery: "pickup" })).toThrow();
  });
  it("formats Colombian pesos with a dot separator", () => {
    expect(formatCOP(45000)).toBe("$45.000");
    expect(formatCOP(1250000)).toBe("$1.250.000");
    expect(formatCOP(0)).toBe("$0");
  });
});

describe("order codes", () => {
  it("are ANG- plus 4 characters from an alphabet without 0/O/1/I/L", () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 2000; i++) expect(makeOrderCode()).toMatch(CODE_RE);
  });
});

describe("pre-sale window (America/Bogota)", () => {
  it("opens at 00:00 on 27.11 and closes after 23:59:59 on 02.12, Bogotá time", () => {
    expect(presalePhase(new Date("2026-11-26T23:59:59-05:00"))).toBe("before");
    expect(presalePhase(new Date("2026-11-27T00:00:00-05:00"))).toBe("open");
    expect(presalePhase(new Date("2026-12-02T23:59:59-05:00"))).toBe("open");
    expect(presalePhase(new Date("2026-12-03T00:00:00-05:00"))).toBe("closed");
  });
});

describe("webhook signature (X-Hub-Signature-256)", () => {
  const body = JSON.stringify({ hello: "world" });
  it("accepts Meta's signature", async () => {
    expect(await verifySignature(new TextEncoder().encode(body), await sign(body, "s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong secret, a tampered body, or a missing header", async () => {
    const good = await sign(body, "s3cret");
    expect(await verifySignature(new TextEncoder().encode(body), await sign(body, "other"), "s3cret")).toBe(false);
    expect(await verifySignature(new TextEncoder().encode(body + " "), good, "s3cret")).toBe(false);
    expect(await verifySignature(new TextEncoder().encode(body), null, "s3cret")).toBe(false);
    expect(await verifySignature(new TextEncoder().encode(body), "sha1=abc", "s3cret")).toBe(false);
  });
});
