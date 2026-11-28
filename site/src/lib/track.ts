import { CATALOG } from "../../../shared/catalog";
import { testKey } from "./clock";

/**
 * Anonymous visit funnel: tells the bot "a visitor reached this step", once per step per browser
 * session. Only the step name is sent — no cookies, no ids, nothing personal. Skipped in development
 * and on the test link, so tests don't count as visitors.
 */
export type Step = "visit" | "sheet_open" | "option" | "delivery" | "whatsapp";

export function track(step: Step) {
  if (import.meta.env.DEV || testKey || !CATALOG.botBaseUrl) return;
  try {
    const key = `tote-ev-${step}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  try {
    navigator.sendBeacon(`${CATALOG.botBaseUrl.replace(/\/$/, "")}/event?e=${step}`);
  } catch {}
}
