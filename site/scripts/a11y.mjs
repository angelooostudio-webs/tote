// axe-core accessibility audit: the page in each pre-sale state, and the order sheet open.
//   node scripts/a11y.mjs [baseUrl]
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch();
let total = 0;
const report = async (page, label) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  total += r.violations.length;
  console.log(`${label}: ${r.violations.length ? "✗" : "✓"} ${r.violations.length} violation(s)`);
  for (const v of r.violations) console.log(`   ${v.impact} ${v.id}: ${v.help}\n     ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n     ")}`);
};
for (const [name, w, h] of [["mobile", 390, 844], ["desktop", 1440, 900]]) {
  for (const [st, q] of [["before", ""], ["open", "?now=2026-11-28T10:00:00-05:00"], ["closed", "?now=2026-12-03T09:00:00-05:00"]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await page.goto(base + "/" + q, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) (scrollTo(0, y), await new Promise((r) => setTimeout(r, 30)));
    });
    await page.waitForTimeout(600);
    await report(page, `${name} · ${st}`);
    if (st === "open") {
      await page.evaluate(() => document.querySelector("[data-order-btn]").scrollIntoView({ block: "center" }));
      await page.click("[data-order-btn]");
      await page.waitForTimeout(800);
      await report(page, `${name} · order sheet`);
    }
    await page.close();
  }
}
const page = await (await browser.newContext()).newPage();
await page.goto(base + "/privacidad/", { waitUntil: "networkidle" });
await report(page, "privacidad");
await browser.close();
process.exit(total ? 1 : 0);
