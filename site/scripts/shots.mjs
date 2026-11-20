// Screenshots at the three target viewports.
//   node scripts/shots.mjs [url] [outDir] [--full]
// Default: http://localhost:5173/ -> ../.shots/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const url = args[0] ?? "http://localhost:5173/";
const out = args[1] ?? new URL("../../.shots/", import.meta.url).pathname;
const full = process.argv.includes("--full");
const reduced = process.argv.includes("--reduced");
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "tablet", width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

const browser = await chromium.launch();
for (const v of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    deviceScaleFactor: v.deviceScaleFactor,
    reducedMotion: reduced ? "reduce" : "no-preference",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // walk the page so lazy images and scroll-triggered states load
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += v.height / 2) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const file = `${out}${v.name}${reduced ? "-reduced" : ""}${full ? "-full" : ""}.png`;
  await page.screenshot({ path: file, fullPage: full, scale: "css" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(`${v.name}: ${file}${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ""}${errors.length ? `\n  errors: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}
await browser.close();
