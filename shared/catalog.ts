/**
 * Single source of truth for everything that can change and is not secret.
 * Imported by both the site (/site) and the WhatsApp bot (/bot), so prices,
 * dates and limits can never disagree between them.
 *
 * NEVER put secrets here: this repo is public. Bank/Nequi details, API keys
 * and the admin phone number live in Cloudflare Worker secrets.
 */

export type OptionId = "bundle" | "toteOnly";

export interface AddOn {
  id: string;
  label: string;
  price: number; // COP
}

export const CATALOG = {
  presaleOpens: "2026-11-27T00:00:00-05:00",
  presaleCloses: "2026-12-02T23:59:59-05:00",
  magazineLaunch: "2026-12-04T00:00:00-05:00", // the "fecha de lanzamiento" the bot sends
  options: {
    bundle: { label: "Tote + UNBOUND reservado", price: 55000 }, // COP, placeholder
    toteOnly: { label: "Solo tote", price: 45000 }, // COP, placeholder
  } as Record<OptionId, { label: string; price: number }>,
  addOns: [
    // placeholders until Angelo confirms the real add-ons, e.g.
    // { id: "extra-unbound", label: "Copia adicional de UNBOUND", price: 0 },
  ] as AddOn[],
  // price 0 = the customer pays the carrier on delivery (contra entrega); nothing is added to the total
  shipping: { enabled: true, label: "Envío", carrier: "Coordinadora", price: 0, area: "" },
  pickup: { place: "", hours: "" }, // placeholder
  /** the product sheet, shown in the order window and known by the bot */
  specs: [
    ["Tipo", "Tote bag"],
    ["Marca", "Angelo Studio"],
    ["Medidas", "50 × 33 cm (ancho × alto)"],
    ["Peso", "82 g"],
    ["Material", "Algodón reciclado"],
    ["Composición", "70% algodón reciclado, 30% poliéster reciclado"],
  ] as [string, string][],
  maxQtyPerOrder: 3,
  stockTotal: 75,
  botNumber: "573116955922", // the bot's WhatsApp number
  instagram: "angelostudio_official",
  studioSite: "https://angelostudio.art",
  /** where the site lives, with a trailing slash. Switch to "https://tote.angelostudio.art/" (and add site/public/CNAME) once the domain is set up. */
  siteUrl: "https://angelooostudio-webs.github.io/tote/",
  /** Public URL of the bot Worker, used by the site for GET /stock. Empty = hide the counter. */
  botBaseUrl: "https://tote-bot.angelo-tote-bot.workers.dev",
  ADOBE_FONTS_KIT_ID: "dzr8yxn",
};

export const TIMEZONE = "America/Bogota";

/** the site address as people read it in a message: "angelooostudio-webs.github.io/tote" */
export const siteLabel = () => CATALOG.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** "$45.000" — Colombian pesos, dot as thousands separator, no decimals. */
export function formatCOP(value: number): string {
  const n = Math.round(value);
  const sign = n < 0 ? "-" : "";
  const digits = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${digits}`;
}

export type PresalePhase = "before" | "open" | "closed";

export function presalePhase(now: Date = new Date()): PresalePhase {
  const t = now.getTime();
  if (t < Date.parse(CATALOG.presaleOpens)) return "before";
  if (t <= Date.parse(CATALOG.presaleCloses)) return "open";
  return "closed";
}

/** Lowest option price, for "DESDE $45.000". */
export function lowestPrice(): number {
  return Math.min(...Object.values(CATALOG.options).map((o) => o.price));
}

/** "27.11" in Bogotá time. */
export function shortDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date(iso));
  // Intl may drop the leading zero for es-CO, so pad explicitly: "04.12"
  const d = parts.find((p) => p.type === "day")!.value.padStart(2, "0");
  const m = parts.find((p) => p.type === "month")!.value.padStart(2, "0");
  return `${d}.${m}`;
}
