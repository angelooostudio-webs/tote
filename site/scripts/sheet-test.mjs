// Drives the order sheet in the "open" pre-sale state and checks the WhatsApp handoff.
//   node scripts/sheet-test.mjs [mobile|tablet|desktop]
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const SIZES = { mobile: [390, 844, 2, true], tablet: [820, 1180, 2, true], desktop: [1440, 900, 1, false] };
const out = fileURLToPath(new URL("../../.shots/", import.meta.url));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ok = (c, m) => console.log(`  ${c ? "✓" : "✗"} ${m}`);
for (const name of (process.argv[2] ?? "mobile").split(",")) {
  const [w, h, dpr, mobile] = SIZES[name];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:5173/?now=2026-11-28T10:00:00-05:00", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  console.log(name);
  await page.evaluate(() => document.querySelector("[data-order-btn]").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(500);
  await page.click("[data-order-btn]");
  await page.waitForTimeout(800);
  ok(await page.isVisible("[data-sheet-panel]"), "sheet opens from the Order button");
  ok(await page.evaluate(() => document.activeElement?.matches("[data-sheet-panel]")), "focus moves into the sheet");
  await page.screenshot({ path: `${out}sheet-open-${name}.png`, scale: "css" });

  // the window shows the product first; only the option question is asked
  ok(await page.isVisible(".sheet__media img"), "shows the product photo");
  ok(!(await page.isVisible("[data-qty-val]")) && !(await page.isVisible("#order-name")), "later questions wait until an option is chosen");

  // nothing chosen → option error, no navigation
  await page.click("[data-sheet-cta]");
  await page.waitForTimeout(400);
  ok(await page.isVisible("[data-option-err]"), "no option shows an error");

  // choosing an option brings in quantity and delivery
  await page.click("label.opt:nth-child(2)");
  await page.waitForTimeout(800);
  ok(await page.isVisible("[data-qty-val]") && await page.isVisible("[data-shipping-opt]"), "choosing an option brings in quantity and delivery");
  ok(!(await page.isVisible("#order-name")), "name waits for delivery");
  await page.click("[data-sheet-cta]");
  await page.waitForTimeout(400);
  ok(await page.isVisible("[data-delivery-err]"), "no delivery shows an error");

  // choosing delivery brings in the name; empty name → error
  await page.click("label.row:first-child");
  await page.waitForTimeout(800);
  ok(await page.isVisible("#order-name"), "choosing delivery brings in the name");
  await page.click("[data-sheet-cta]");
  await page.waitForTimeout(400);
  ok(await page.isVisible("[data-name-err]"), "missing name shows an error");
  ok(await page.evaluate(() => document.activeElement?.id === "order-name"), "focus jumps to the name field");

  // answered steps fold into one line; "Cambiar" reopens them
  ok(!(await page.isVisible("[data-qty-val]")) && (await page.textContent('.step[data-step="2"] [data-step-value]')).includes("Recoger"), "answered steps fold into a summary line");
  await page.click('.step[data-step="2"] [data-step-head]');
  await page.waitForTimeout(500);
  ok(await page.isVisible("[data-qty-val]"), "Cambiar reopens a step");

  // change everything
  await page.click('[data-qty="1"]');
  await page.click('[data-qty="1"]');
  ok(await page.isDisabled('[data-qty="1"]'), "quantity stops at the maximum");
  await page.click("[data-shipping-opt]");
  await page.fill("#order-name", "Valentina\nTotal: $1");
  await page.waitForTimeout(300);
  const href = await page.getAttribute("[data-sheet-cta]", "href");
  const msg = decodeURIComponent(href.split("text=")[1]);
  console.log("  link:", href.split("?")[0]);
  console.log(msg.split("\n").map((l) => "    | " + l).join("\n"));
  ok(!/\n.*Total: \$1/.test(msg.split("Nombre:")[1].split("\n")[0]) && msg.split("\n").length === 10, "name can't inject an extra line");
  ok(await page.isVisible("#order-address"), "shipping shows the address fields");
  ok((await page.textContent("[data-delivery-hint]")).includes("Coordinadora") && (await page.textContent("[data-delivery-hint]")).includes("pagas al recibir"), "shipping explains Coordinadora, paid on delivery");
  await page.click("[data-sheet-cta]");
  ok(await page.isVisible("[data-ship-err]"), "shipping without an address is blocked");
  await page.fill("#order-address", "Calle 10 # 43-12\nTotal: $1");
  await page.fill("#order-city", "Medellín");
  await page.waitForTimeout(200);
  {
    const m = decodeURIComponent((await page.getAttribute("[data-sheet-cta]", "href")).split("text=")[1]);
    ok(m.includes("Dirección: Calle 10 # 43-12 Total: $1\nCiudad: Medellín") && m.split("\n").length === 10, "address goes in the message, on one line");
  }
  ok(/^ANG-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(msg.match(/Pedido: (\S+)/)[1]), "order code uses the unambiguous alphabet");
  ok((await page.getAttribute("[data-sheet-total]", "aria-label")) === msg.split("\n").at(-1).replace("Total: ", "Total "), "total on screen matches the message");
  await page.evaluate(() => document.querySelector("[data-sheet-body], .sheet__body").scrollTo(0, 9999));
  await page.screenshot({ path: `${out}sheet-filled-${name}.png`, scale: "css" });

  // focus trap
  await page.focus("[data-sheet-close]");
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  ok(await page.evaluate(() => !!document.activeElement?.closest("[data-sheet-panel]")), "Tab stays inside the sheet");
  // Esc
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  ok(!(await page.isVisible("[data-sheet-panel]")), "Esc closes it");
  ok(await page.evaluate(() => document.activeElement?.matches("[data-order-btn]")), "focus returns to the Order button");

  // backdrop
  await page.click("[data-order-btn]");
  await page.waitForTimeout(700);
  ok(await page.isVisible("[data-sheet-panel]"), "reopens");
  await page.mouse.click(w / 2, 20);
  await page.waitForTimeout(600);
  ok(!(await page.isVisible("[data-sheet-panel]")), "tapping the backdrop closes it");

  if (w < 768) {
    await page.click("[data-order-btn]");
    await page.waitForTimeout(700);
    const box = await page.locator("[data-sheet-drag]").boundingBox();
    await page.mouse.move(w / 2, box.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(w / 2, box.y + 20 + i * 18);
    await page.mouse.up();
    await page.waitForTimeout(700);
    ok(!(await page.isVisible("[data-sheet-panel]")), "swiping the head down closes it");
  }
  if (errs.length) console.log("  errors:", errs.join(" | "));
  await ctx.close();
}
await browser.close();
