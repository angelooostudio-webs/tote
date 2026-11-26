// node scripts/cutout.mjs <photo on white> <out.webp> <height px>
// Cut a product shot off its white background: flood-fill from the edges through near-white pixels,
// soft alpha on the boundary, trim, resize.
import sharp from "sharp";
const [src, out, height] = process.argv.slice(2);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const white = (i) => { const r = data[i], g = data[i + 1], b = data[i + 2]; return Math.min(r, g, b) > 232 && Math.max(r, g, b) - Math.min(r, g, b) < 14; };
const bg = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
while (stack.length) {
  const p = stack.pop();
  if (bg[p] || !white(p * 4)) continue;
  bg[p] = 1;
  const x = p % W, y = (p / W) | 0;
  if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - W); if (y < H - 1) stack.push(p + W);
}
for (let p = 0; p < W * H; p++) {
  if (bg[p]) { data[p * 4 + 3] = 0; continue; }
  // soft edge: a foreground pixel touching background fades by how light it is
  const x = p % W, y = (p / W) | 0;
  const touches = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
  if (touches) { const i = p * 4; const l = Math.min(data[i], data[i + 1], data[i + 2]); data[i + 3] = Math.max(60, Math.min(255, Math.round((255 - l) * 6))); }
}
await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  .then((b) => sharp(b).trim({ threshold: 1 }).resize({ height: Number(height) }).webp({ quality: 90, alphaQuality: 90 }).toFile(out));
console.log("written", out);
