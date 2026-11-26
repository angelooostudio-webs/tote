// Renders the share image (og.jpg, 1200×630) and the icons in real Spalla (Adobe kit),
// using the dev server's origin so the kit loads. Needs `npm run dev` running.
//   node scripts/brand-images.mjs [http://localhost:5173]
import { chromium } from "playwright";
import sharp from "sharp";
import { CATALOG, shortDate, siteLabel } from "../../shared/catalog.ts";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:5173";
const pub = fileURLToPath(new URL("../public/", import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.goto(`${base}/privacidad/`, { waitUntil: "networkidle" }); // same origin as the site, so the Adobe kit is allowed

const shell = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://use.typekit.net/dzr8yxn.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=block">
<style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#f3efe7;color:#111112}
  .spalla{font-family:spalla,serif}
  .mono{font-family:"Geist Mono",monospace;text-transform:uppercase;letter-spacing:.08em}
</style></head><body>${body}</body></html>`;

async function shoot(w, h, body, file, fmt) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(shell(w, h, body), { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.load('700 100px "spalla"');
    await document.fonts.load('400 100px "spalla"');
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  const png = await page.screenshot({ type: "png", omitBackground: fmt === "png-alpha" });
  return png;
}

// ---- share image: the tote, print facing you, with the line from the hero ----
const og = await shoot(
  1200,
  630,
  `<div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 470px;align-items:center">
     <div style="padding:0 0 0 84px">
       <div class="mono" style="font-size:18px;color:#6b685f;margin-bottom:34px">Angelo Studio · Pre-venta ${shortDate(CATALOG.presaleOpens)} → ${shortDate(CATALOG.presaleCloses)}</div>
       <div class="spalla" style="font-size:92px;line-height:.95;font-weight:400">Your new<br><b style="font-weight:700">FAVORITE</b><br>Tote</div>
       <div class="mono" style="font-size:18px;color:#111112;margin-top:40px">${siteLabel()}</div>
     </div>
     <img src="${base}/assets/hero-poster-print.webp" style="height:560px;justify-self:center">
   </div>`
);
await sharp(og).jpeg({ quality: 84, mozjpeg: true }).toFile(pub + "assets/og.jpg");

// ---- icons: the last frame of the tote turn (print facing you) ----
// favicon: cut-out on transparent, so it sits on light and dark tabs;
// home-screen icons: on paper, because iOS/Android fill transparency with black.
const lastFrame = pub + "assets/turn/lg/28.webp";
const tote = (h) => sharp(lastFrame).resize({ height: h, fit: "inside" }).png().toBuffer();
const square = async (size, pad, bg) =>
  sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await tote(Math.round(size * (1 - pad * 2))), gravity: "center" }])
    .png()
    .toBuffer();
const clear = { r: 0, g: 0, b: 0, alpha: 0 };
const paper = { r: 243, g: 239, b: 231, alpha: 1 };
await sharp(await square(32, 0, clear)).toFile(pub + "favicon-32.png");
await sharp(await square(180, 0.08, paper)).toFile(pub + "apple-touch-icon.png");
await sharp(await square(192, 0.08, paper)).toFile(pub + "icon-192.png");
await browser.close();
console.log("og.jpg, apple-touch-icon.png, favicon-32.png, icon-192.png written");
