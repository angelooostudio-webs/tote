// Turns the product video's frames into the hero image sequence.
//
//   swift scripts/extract-frames.swift "<video.mp4>" <pngDir>
//   node scripts/encode-frames.mjs <pngDir> [step=4]
//
// - keeps every `step`-th frame (+ the last one, print facing the camera)
// - keys out the black studio background: black connected to the frame edges is
//   flood-filled as background (so the black print ink, enclosed by canvas, stays),
//   edges get soft alpha and the black fringe is removed (un-premultiplied)
// - crops every frame to the same box around the tote
// - writes transparent WebP in two sizes to public/assets/turn/{sm,lg}/NN.webp,
//   per-frame contact-shadow data to src/data/turn.json,
//   and the two posters (first/last frame, transparent, shadow baked in) to public/assets/.
import sharp from "sharp";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
const step = Number(process.argv[3] ?? 4);
if (!src) throw new Error("usage: node scripts/encode-frames.mjs <pngDir> [step]");
const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}public/assets/turn/`;
const PAPER = { r: 0xf3, g: 0xef, b: 0xe7 };
const BG_MAX = 26; // luma at or below this, connected to the edge, is background
const SIZES = { sm: 440, lg: 760 }; // output width of the cropped box
const Q = { sm: 56, lg: 60 };

const files = readdirSync(src).filter((f) => f.endsWith(".png")).sort();
const pick = files.filter((_, i) => i % step === 0);
if (pick.at(-1) !== files.at(-1)) pick.push(files.at(-1));

/** keys one frame: returns RGBA buffer + alpha bbox + contact info */
async function key(file) {
  const { data, info } = await sharp(`${src}/${file}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const N = W * H;
  const L = new Uint8Array(N);
  for (let i = 0; i < N; i++) L[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);

  // 1. background = dark regions that touch the frame edge, or that are almost entirely
  //    largely pure black (gaps enclosed by the straps). The print ink is dark too, but
  //    its regions are textured: only ~1% of their pixels are exactly 0, so they stay.
  const bg = new Uint8Array(N);
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const comp = new Int32Array(N);
  const pockets = [];
  const enclosed = []; // enclosed regions keyed as background (for the print-safety report)
  for (let start = 0; start < N; start++) {
    if (seen[start] || L[start] > BG_MAX) continue;
    let sp = 0;
    let n = 0;
    let zeros = 0; // truly pure black (0–1): the studio background, never the ink
    let nearZeros = 0; // near-black (≤5): slits blurred by video compression — and also thin ink cores
    let edge = false;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp) {
      const i = stack[--sp];
      comp[n++] = i;
      if (L[i] <= 1) zeros++;
      if (L[i] <= 5) nearZeros++;
      const x = i % W;
      const y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      const visit = (j) => {
        if (!seen[j] && L[j] <= BG_MAX) {
          seen[j] = 1;
          stack[sp++] = j;
        }
      };
      // 8-connected: thin diagonal slits between strap layers stay one region
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) visit(yy * W + xx);
        }
    }
    // thin pockets between overlapping straps are small and partly antialiased: a quarter
    // of pure-black pixels is plenty (the ink never gets close: ~1%)
    if (edge || (n >= 12 && zeros / n > 0.25)) {
      for (let k = 0; k < n; k++) bg[comp[k]] = 1;
      if (!edge) enclosed.push(comp.slice(0, n));
    } else if (n < 3000 && nearZeros / n > 0.25) pockets.push(comp.slice(0, n));
  }
  // slivers where strap layers fold over each other: small, mostly near-black, and touching
  // the background already found. Print letters sit inside the bag, ringed by canvas, so
  // they never touch the background — that is what keeps them safe.
  const touchesBg = (i) => {
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H && bg[yy * W + xx]) return true;
      }
    return false;
  };
  for (const pk of pockets)
    if (pk.some(touchesBg)) {
      for (const i of pk) bg[i] = 1;
      enclosed.push(pk);
    }
  // safety report: enclosed areas keyed inside the print zone (rows 48–85%, cols 15–85%) must be none
  let printZoneKeyed = 0;
  for (const pk of enclosed)
    for (const i of pk) {
      const x = i % W;
      const y = (i / W) | 0;
      if (y > H * 0.48 && y < H * 0.85 && x > W * 0.15 && x < W * 0.85) printZoneKeyed++;
    }

  // 2. alpha: 0 in the background, soft on a 3px band at the edge, 1 inside
  const alpha = new Float32Array(N).fill(1);
  const near = (i, r) => {
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H && bg[yy * W + xx]) return true;
      }
    return false;
  };
  const localMax = (i, r) => {
    const x = i % W;
    const y = (i / W) | 0;
    let m = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H) m = Math.max(m, L[yy * W + xx]);
      }
    return m;
  };
  for (let i = 0; i < N; i++) {
    if (bg[i]) {
      alpha[i] = L[i] <= 3 ? 0 : Math.min(1, L[i] / Math.max(60, localMax(i, 3)));
    } else if (near(i, 3)) {
      alpha[i] = Math.min(1, L[i] / Math.max(60, localMax(i, 3)));
    }
  }

  // 3. RGBA, un-premultiplied against black so edges don't keep a dark fringe
  const rgba = Buffer.alloc(N * 4);
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let i = 0; i < N; i++) {
    const a = alpha[i];
    if (a <= 0.02) {
      // fully transparent: store the paper colour underneath, so no encoder can leave a visible box
      rgba[i * 4] = PAPER.r;
      rgba[i * 4 + 1] = PAPER.g;
      rgba[i * 4 + 2] = PAPER.b;
      rgba[i * 4 + 3] = 0;
    } else {
      const k = 1 / a;
      rgba[i * 4] = Math.min(255, data[i * 3] * k);
      rgba[i * 4 + 1] = Math.min(255, data[i * 3 + 1] * k);
      rgba[i * 4 + 2] = Math.min(255, data[i * 3 + 2] * k);
      rgba[i * 4 + 3] = Math.round(a * 255);
    }
    if (a > 0.5) {
      const x = i % W;
      const y = (i / W) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // contact: horizontal extent of the bottom 2% of the tote, where it would touch the floor
  let cMin = W;
  let cMax = 0;
  for (let y = Math.round(maxY - (maxY - minY) * 0.02); y <= maxY; y++)
    for (let x = 0; x < W; x++)
      if (alpha[y * W + x] > 0.5) {
        if (x < cMin) cMin = x;
        if (x > cMax) cMax = x;
      }
  return { rgba, W, H, box: { minX, maxX, minY, maxY }, contact: { left: cMin, right: cMax, bottom: maxY }, printZoneKeyed };
}

const tmp = `${root}.frames-tmp/`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const keyed = [];
for (const [n, f] of pick.entries()) {
  const k = await key(f);
  await sharp(k.rgba, { raw: { width: k.W, height: k.H, channels: 4 } }).png({ compressionLevel: 1 }).toFile(`${tmp}${n}.png`);
  keyed.push({ W: k.W, H: k.H, box: k.box, contact: k.contact });
  if (k.printZoneKeyed) console.log(`\n  ⚠ frame ${n}: ${k.printZoneKeyed} px keyed inside the print zone`);
  process.stdout.write(`\rkeyed ${n + 1}/${pick.length}`);
}
process.stdout.write("\n");

// one crop box for all frames (union of the tote's bounds + margin), so frames line up
const W0 = keyed[0].W;
const H0 = keyed[0].H;
const u = keyed.reduce(
  (a, k) => ({ minX: Math.min(a.minX, k.box.minX), maxX: Math.max(a.maxX, k.box.maxX), minY: Math.min(a.minY, k.box.minY), maxY: Math.max(a.maxY, k.box.maxY) }),
  { minX: W0, maxX: 0, minY: H0, maxY: 0 }
);
const m = 16;
const crop = { left: Math.max(0, u.minX - m), top: Math.max(0, u.minY - m) };
crop.width = Math.min(W0, u.maxX + m) - crop.left;
crop.height = Math.min(H0, u.maxY + m) - crop.top;

rmSync(out, { recursive: true, force: true });
const bytes = { sm: 0, lg: 0 };
for (const [k, w] of Object.entries(SIZES)) {
  mkdirSync(out + k, { recursive: true });
  for (let n = 0; n < pick.length; n++) {
    const file = `${out}${k}/${String(n).padStart(2, "0")}.webp`;
    await sharp(`${tmp}${n}.png`).extract(crop).resize(w).webp({ quality: Q[k], alphaQuality: 80, effort: 6 }).toFile(file);
    bytes[k] += statSync(file).size;
  }
}

// contact shadow per frame, as fractions of the crop box
const frames = keyed.map((k) => ({
  cx: +(((k.contact.left + k.contact.right) / 2 - crop.left) / crop.width).toFixed(4),
  w: +((k.contact.right - k.contact.left) / crop.width).toFixed(4),
  y: +((k.contact.bottom - crop.top) / crop.height).toFixed(4),
}));
const meta = { count: pick.length, aspect: +(crop.width / crop.height).toFixed(5), sizes: SIZES, bytes, frames };
writeFileSync(`${root}src/data/turn.json`, JSON.stringify(meta, null, 2) + "\n");

// posters: first frame (plain side, first paint) and last frame (print, reduced motion), on paper with the shadow
const shadowSvg = (fw, fh, f) => {
  const cx = f.cx * fw;
  const cy = f.y * fh;
  const rx = (f.w * fw) / 2 * 1.12;
  const ry = rx * 0.07;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}">
    <defs><radialGradient id="g"><stop offset="0" stop-color="#111112" stop-opacity=".30"/><stop offset=".55" stop-color="#111112" stop-opacity=".12"/><stop offset="1" stop-color="#111112" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#g)"/></svg>`);
};
for (const [n, name] of [[0, "hero-poster.webp"], [pick.length - 1, "hero-poster-print.webp"]]) {
  const fw = 1000;
  const fh = Math.round(fw / meta.aspect);
  const tote = await sharp(`${tmp}${n}.png`).extract(crop).resize(fw, fh).png().toBuffer();
  await sharp({ create: { width: fw, height: fh, channels: 4, background: { ...PAPER, alpha: 0 } } })
    .composite([{ input: shadowSvg(fw, fh, frames[n]) }, { input: tote }])
    .webp({ quality: 74, alphaQuality: 100, effort: 5 })
    .toFile(`${root}public/assets/${name}`);
  await sharp(`${root}public/assets/${name}`).resize(600).webp({ quality: 72, alphaQuality: 100 }).toFile(`${root}public/assets/${name.replace(".webp", "-600.webp")}`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${pick.length} frames, crop ${crop.width}×${crop.height} @${crop.left},${crop.top}  sm ${(bytes.sm / 1024).toFixed(0)} kB  lg ${(bytes.lg / 1024).toFixed(0)} kB`);
