// Responsive image pipeline. For every photo in public/assets/{people,totes}
// (and the magazine cover) writes AVIF + WebP + JPEG variants at several widths
// to public/assets/_r/, plus a manifest the site reads to build srcsets.
// Skips variants that are newer than their source, so it is fast on re-runs.
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "public/assets");
const outDir = join(assets, "_r");
const WIDTHS = [480, 800, 1200, 1600];
const FORMATS = [
  ["avif", (s) => s.avif({ quality: 52, effort: 4 })],
  ["webp", (s) => s.webp({ quality: 76 })],
  ["jpg", (s) => s.jpeg({ quality: 78, mozjpeg: true })],
];

const sources = [];
for (const dir of ["people", "totes"]) {
  const d = join(assets, dir);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) if (/\.(jpe?g|png)$/i.test(f)) sources.push(join(d, f));
}
if (existsSync(join(assets, "unbound-cover.jpg"))) sources.push(join(assets, "unbound-cover.jpg"));

const manifest = {};
let written = 0;
for (const src of sources) {
  const rel = relative(assets, src).replace(/\\/g, "/");
  const base = rel.replace(/\.[^.]+$/, "");
  const meta = await sharp(src).metadata();
  const widths = WIDTHS.filter((w) => w < meta.width);
  widths.push(Math.min(meta.width, WIDTHS[WIDTHS.length - 1]));
  const uniq = [...new Set(widths)].sort((a, b) => a - b);
  const srcTime = statSync(src).mtimeMs;
  for (const w of uniq) {
    for (const [ext, enc] of FORMATS) {
      const out = join(outDir, `${base}-${w}.${ext}`);
      if (existsSync(out) && statSync(out).mtimeMs > srcTime) continue;
      mkdirSync(dirname(out), { recursive: true });
      await enc(sharp(src).rotate().resize({ width: w, withoutEnlargement: true })).toFile(out);
      written++;
    }
  }
  manifest[rel] = { w: meta.width, h: meta.height, widths: uniq, base: `/assets/_r/${base}` };
}

writeFileSync(join(root, "src/data/images.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`images: ${sources.length} sources, ${written} variant(s) written`);
