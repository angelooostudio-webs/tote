// Captures the hero at several points of the scroll-scrubbed turn.
//   node scripts/hero-frames.mjs [mobile|tablet|desktop] [progress,...]
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const SIZES = { mobile: [390, 844, 2, true], tablet: [820, 1180, 2, true], desktop: [1440, 900, 1, false] };
const which = (process.argv[2] ?? "mobile").split(",");
const steps = (process.argv[3] ?? "0,0.25,0.5,0.75,1").split(",").map(Number);
const out = fileURLToPath(new URL("../../.shots/", import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const name of which) {
  const [w, h, dpr, mobile] = SIZES[name];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("[data-hero-poster]")?.classList.contains("is-hidden"), null, { timeout: 30000 });
  for (const p of steps) {
    await page.evaluate((pp) => {
      const end = window.innerHeight * 1.0;
      window.scrollTo(0, Math.round(end * pp));
    }, p);
    await page.waitForTimeout(1600);
    const f = `${out}hero-${name}-${String(Math.round(p * 100)).padStart(3, "0")}.png`;
    await page.screenshot({ path: f, scale: "css" });
    console.log(f, await page.evaluate(() => { const s = window.__hero?.state; return s ? `turn=${s.turn.toFixed(3)}` : "no state"; }));
  }
  if (errs.length) console.log("errors:", errs.join(" | "));
  await ctx.close();
}
await browser.close();
