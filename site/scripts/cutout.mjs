// Cut a product shot off its white background.
//   node scripts/cutout.mjs <photo on white> <out.webp> <height px> [gap px] [holes]
// "holes" also clears white areas the product encloses (the gaps between a trumpet's tubes).
// The background is flood-filled from the image edges through near-white pixels. With a gap > 0
// (for white products: a white tube on white) the fill may not pass within <gap> px of anything
// off-white, so it can't leak through hairline gaps in the product's outline; afterwards the
// background grows back by <gap> px over plain white, so the edge lands on the real outline.
import sharp from "sharp";

const [src, out, height, gapArg, holesArg] = process.argv.slice(2);
const gap = Number(gapArg ?? 0);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;
const minc = (p) => Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
const spread = (p) => Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) - minc(p);
const white = new Uint8Array(N);
for (let p = 0; p < N; p++) white[p] = gap ? +(minc(p) >= 246 && spread(p) < 10) : +(minc(p) > 232 && spread(p) < 14);

// barrier: within <gap> px of a non-white pixel
let open = white;
if (gap) {
  open = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let ok = 1;
      for (let dy = -gap; dy <= gap && ok; dy++)
        for (let dx = -gap; dx <= gap; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (!white[yy * W + xx]) { ok = 0; break; }
        }
      open[y * W + x] = ok;
    }
}

const bg = new Uint8Array(N);
const flood = (seeds, pass) => {
  const stack = [...seeds];
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !pass(p)) continue;
    bg[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < N - W) stack.push(p + W);
  }
};
const edges = [];
for (let x = 0; x < W; x++) edges.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) edges.push(y * W, y * W + W - 1);
flood(edges, (p) => open[p]);
// grow back over plain white, at most <gap> steps
for (let i = 0; i < gap; i++) {
  const add = [];
  for (let p = 0; p < N; p++) {
    if (bg[p] || !white[p]) continue;
    const x = p % W;
    if ((x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (p >= W && bg[p - W]) || (p < N - W && bg[p + W])) add.push(p);
  }
  for (const p of add) bg[p] = 1;
}

// enclosed white areas: any connected run of plain white bigger than 0.05% of the image
if (holesArg === "holes") {
  const seen = new Uint8Array(N);
  const minArea = N * 0.0005;
  for (let p0 = 0; p0 < N; p0++) {
    if (seen[p0] || bg[p0] || !white[p0]) continue;
    const region = [];
    const stack = [p0];
    seen[p0] = 1;
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q < 0 || q >= N || seen[q] || bg[q] || !white[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (region.length >= minArea) for (const p of region) bg[p] = 1;
  }
}

for (let p = 0; p < N; p++) {
  if (bg[p]) { data[p * 4 + 3] = 0; continue; }
  const x = p % W;
  const touches = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (p >= W && bg[p - W]) || (p < N - W && bg[p + W]);
  if (touches) data[p * 4 + 3] = Math.max(60, Math.min(255, Math.round((255 - minc(p)) * 6)));
}
const png = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
await sharp(png).trim({ threshold: 1 }).resize({ height: Number(height) }).webp({ quality: 90, alphaQuality: 90 }).toFile(out);
console.log("written", out);
