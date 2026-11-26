import { CATALOG } from "../../../shared/catalog";
/**
 * "Now" for everything date-dependent (button states, countdown, header pill).
 * In development, /?now=2026-11-28T10:00:00-05:00 freezes the start time so
 * each pre-sale state can be checked; the clock still ticks from there.
 * Production always uses the real time.
 */
let offset = 0;
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search).get("now");
  const t = q ? Date.parse(q) : NaN;
  if (!Number.isNaN(t)) offset = t - Date.now();
}

/** test link: /?prueba=<key> shows the site as if the pre-sale were open (the bot checks the key) */
export const testKey = new URLSearchParams(location.search).get("prueba")?.trim() || "";
if (testKey && Date.now() + offset < Date.parse(CATALOG.presaleOpens)) offset = Date.parse(CATALOG.presaleOpens) + 3600_000 - Date.now();

export const now = () => new Date(Date.now() + offset);
