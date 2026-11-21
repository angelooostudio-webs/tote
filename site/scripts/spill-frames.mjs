// Captures the tip-over + spill as it plays, and checks the scroll hold.
//   node scripts/spill-frames.mjs [mobile|tablet|desktop]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIZES = { mobile: [390, 844, 2, true], tablet: [820, 1180, 2, true], desktop: [1440, 900, 1, false] };
const which = (process.argv[2] ?? "mobile").split(",");
const out = fileURLToPath(new URL("../../.shots/", import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const name of which) {
  const [w, h, dpr, mobile] = SIZES[name];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("[data-hero-poster]")?.classList.contains("is-hidden"), null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  // scroll in steps to the end of the turn, like a person would
  for (let p = 0.2; p <= 1.001; p += 0.2) {
    await page.evaluate((pp) => window.scrollTo(0, Math.round(innerHeight * 1.6 * pp)), p);
    await page.waitForTimeout(250);
  }
  const t0 = Date.now();
  const log = [];
  for (const ms of [250, 700, 1150, 2200]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    const f = `${out}spill-${name}-${String(ms).padStart(4, "0")}.png`;
    await page.screenshot({ path: f, scale: "css" });
    log.push(await page.evaluate(() => {
      const s = window.__hero?.state;
      return `tip=${s?.tip.toFixed(2)} spill=${s?.spill.toFixed(2)} locked=${document.documentElement.classList.contains("lenis-stopped")}`;
    }));
  }
  console.log(name, log.map((l, i) => `[${[250, 700, 1150, 2200][i]}ms ${l}]`).join(" "));
  // scroll on past the hero: header should appear
  await page.evaluate(() => window.scrollTo(0, Math.round(innerHeight * 3.4)));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}after-hero-${name}.png`, scale: "css" });
  // and back up into the turn: scene resets
  await page.evaluate(() => window.scrollTo(0, Math.round(innerHeight * 0.8)));
  await page.waitForTimeout(1500);
  console.log(name, "after scrolling back up:", await page.evaluate(() => {
    const s = window.__hero?.state;
    return `turn=${s?.turn.toFixed(2)} tip=${s?.tip.toFixed(2)} spill=${s?.spill.toFixed(2)} header=${getComputedStyle(document.querySelector("[data-header]")).visibility}`;
  }));
  if (errs.length) console.log("errors:", errs.join(" | "));
  await ctx.close();
}
await browser.close();
