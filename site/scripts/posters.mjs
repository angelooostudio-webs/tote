// Bakes the hero poster images from the live three.js scene (dev server must be running).
//   hero-poster.jpg        plain back side, first paint before three.js is ready
//   hero-poster-print.jpg  printed side, used with prefers-reduced-motion
// Run after changing the tote: node scripts/posters.mjs [http://localhost:5173]
import { chromium } from "playwright";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:5173";
const out = fileURLToPath(new URL("../public/assets/", import.meta.url));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [mode, file] of [["back", "hero-poster.jpg"], ["print", "hero-poster-print.jpg"]]) {
  const page = await browser.newPage({ viewport: { width: 600, height: 750 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/?poster=${mode}`, { waitUntil: "networkidle" });
  await page.waitForSelector("html[data-poster-ready]", { timeout: 60000 });
  const png = await page.screenshot({ type: "png" });
  const info = await sharp(png).jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(out + file);
  console.log(file, `${info.width}×${info.height}`, `${Math.round(info.size / 1024)} kB`);
  await page.close();
}
await browser.close();
