/**
 * Payment screenshots: the image fingerprint and the checks. Pure functions,
 * no I/O, so they are unit tested. Claude only *reads* the screenshot; every
 * decision here is made by code.
 */
import jpeg from "jpeg-js";
import { norm } from "./parse.ts";

// ---------- perceptual hash ----------

/**
 * dHash: the image shrunk to 9×8 grey pixels, one bit per "is the next pixel
 * brighter". Survives re-compression, resizing and small crops, so the same
 * screenshot sent twice (or forwarded) is recognised. JPEG only — which is what
 * WhatsApp delivers for images; anything else falls back to an exact SHA-256.
 */
export async function imageHash(bytes: Uint8Array): Promise<string> {
  try {
    const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256, formatAsRGBA: true });
    return "d:" + dHash(img.data, img.width, img.height);
  } catch {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return "s:" + [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export function dHash(rgba: Uint8Array, w: number, h: number): string {
  const W = 9;
  const H = 8;
  const grey = new Float64Array(W * H);
  // area-average each cell of a 9×8 grid
  for (let gy = 0; gy < H; gy++) {
    const y0 = Math.floor((gy * h) / H);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / H));
    for (let gx = 0; gx < W; gx++) {
      const x0 = Math.floor((gx * w) / W);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / W));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          n++;
        }
      grey[gy * W + gx] = sum / n;
    }
  }
  let bits = 0n;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits = (bits << 1n) | (grey[y * W + x] > grey[y * W + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}

/** Hamming distance between two dHashes; Infinity when they can't be compared. */
export function hashDistance(a: string, b: string): number {
  if (a.startsWith("s:") || b.startsWith("s:")) return a === b ? 0 : Infinity;
  let x = BigInt("0x" + a.slice(2)) ^ BigInt("0x" + b.slice(2));
  let d = 0;
  while (x) {
    d += Number(x & 1n);
    x >>= 1n;
  }
  return d;
}

export const SAME_IMAGE_MAX_DISTANCE = 6;

// ---------- what Claude reads off the screenshot ----------

export interface Extracted {
  is_payment_receipt: boolean;
  amount: number | null; // pesos, integer
  currency: string | null;
  recipient_name: string | null;
  recipient_account_last4: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  reference: string | null;
  bank_or_app: string | null;
  looks_edited: { value: boolean; reason: string };
  confidence: number; // 0–1
}

export interface Expected {
  total: number;
  holderName: string;
  accounts: string[]; // Nequi / Bancolombia, any format
  orderCreatedAt: Date;
}

export type Problem = "not_receipt" | "amount" | "recipient" | "date" | "duplicate" | "confidence";

export const MIN_CONFIDENCE = 0.7;

const digits = (s: string) => s.replace(/\D/g, "");
const bogotaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d); // YYYY-MM-DD

/** The holder's name matches if every word of the shorter name appears in the other (banks abbreviate). */
export function nameMatches(seen: string | null, holder: string): boolean {
  if (!seen) return false;
  const words = (x: string) => norm(x).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 1);
  const a = words(seen);
  const b = words(holder);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((w) => long.some((v) => v === w || (w.length >= 3 && v.startsWith(w)) || (v.length >= 3 && w.startsWith(v))));
}

export function checkProof(x: Extracted, exp: Expected, isDuplicate: boolean): Problem[] {
  if (!x.is_payment_receipt) return ["not_receipt"];
  const problems: Problem[] = [];
  if (x.amount === null || Math.round(x.amount) !== exp.total || (x.currency && !/^(cop|\$|pesos?)$/i.test(x.currency.trim()))) problems.push("amount");
  const last4 = x.recipient_account_last4 ? digits(x.recipient_account_last4).slice(-4) : "";
  const accountOk = last4.length === 4 && exp.accounts.some((a) => digits(a).endsWith(last4));
  if (!accountOk && !nameMatches(x.recipient_name, exp.holderName)) problems.push("recipient");
  if (!x.date || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || x.date < bogotaDate(exp.orderCreatedAt)) problems.push("date");
  if (isDuplicate) problems.push("duplicate");
  if (!(x.confidence >= MIN_CONFIDENCE)) problems.push("confidence");
  return problems;
}
