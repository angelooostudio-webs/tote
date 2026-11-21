// Order-button date states + stack cycling at a given viewport.
//   node scripts/states.mjs [mobile|tablet|desktop]
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const SIZES = { mobile: [390, 844, 2, true], tablet: [820, 1180, 2, true], desktop: [1440, 900, 1, false] };
const out = fileURLToPath(new URL("../../.shots/", import.meta.url));
const STATES = { before: "", open: "?now=2026-11-28T10:00:00-05:00", closed: "?now=2026-12-03T09:00:00-05:00" };
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const name of (process.argv[2] ?? "mobile").split(",")) {
  const [w, h, dpr, mobile] = SIZES[name];
  for (const [st, q] of Object.entries(STATES)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`http://localhost:5173/${q}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const y = await page.evaluate(() => document.querySelector("#contigo").getBoundingClientRect().top + scrollY);
    // scroll in steps so the scrubbed entrance plays like it would for a person
    for (let k = 1; k <= 6; k++) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y - h + (k * (h * 0.9)) / 6);
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => document.querySelector("[data-order]").scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}order-${st}-${name}.png`, scale: "css" });
    const info = await page.evaluate(() => {
      const b = document.querySelector("[data-order]");
      return `${b.dataset.state} | ${b.querySelector("[data-order-btn]").tagName} "${b.querySelector("[data-order-label]").textContent}" / "${b.querySelector("[data-order-price]").textContent}" | countdown ${b.querySelector("[data-countdown]").hidden ? "hidden" : b.querySelector("[data-countdown-digits]").textContent} | pill "${document.querySelector("[data-presale-pill]").textContent}"`;
    });
    console.log(name, st, info, errs.length ? "ERR " + errs.join("|") : "");
    if (st === "before") {
      await page.waitForTimeout(1100);
      console.log("  ticks:", await page.evaluate(() => document.querySelector("[data-countdown-digits]").textContent));
      await page.evaluate(() => document.querySelector("[data-stack]").scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.click("[data-stack]");
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}stack-cycled-${name}.png`, scale: "css" });
      console.log("  after tap:", await page.evaluate(() => document.querySelector("[data-stack-count]").textContent));
    }
    await ctx.close();
  }
}
await browser.close();
