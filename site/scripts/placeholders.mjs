// Generates intentional-looking placeholder images (canvas-colored blocks with a
// mono label) for every expected asset that does not exist yet.
// Never overwrites a real photo: it only writes files that are missing.
//   npm run placeholders            -> create missing placeholders
//   npm run placeholders -- --force -> regenerate all placeholders (overwrites!)
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const assets = join(pub, "assets");
const force = process.argv.includes("--force");

const C = { paper: "#F3EFE7", canvas: "#D9CCB3", deep: "#C9BB9D", ink: "#111112", mute: "#6B685F" };
const MONO = "Menlo, 'DejaVu Sans Mono', monospace";

function block(w, h, lines, { bg = C.canvas, fg = C.ink, sub = C.mute } = {}) {
  const pad = Math.round(Math.min(w, h) * 0.06);
  const fs = Math.max(14, Math.round(w / 46));
  const cx = w / 2;
  const cy = h / 2;
  const t = Math.round(Math.min(w, h) * 0.035);
  // crosshair + corner ticks: reads as "frame here", not as a broken image
  const ticks = [
    [pad, pad, 1, 1],
    [w - pad, pad, -1, 1],
    [pad, h - pad, 1, -1],
    [w - pad, h - pad, -1, -1],
  ]
    .map(([x, y, sx, sy]) => `<path d="M${x} ${y + sy * t}V${y}H${x + sx * t}" />`)
    .join("");
  const text = lines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${h - pad - t - 10 - (lines.length - 1 - i) * fs * 1.6}" fill="${i === 0 ? fg : sub}" font-family="${MONO}" font-size="${fs}" letter-spacing="${fs * 0.08}">${l}</text>`
    )
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <g fill="none" stroke="${fg}" stroke-opacity="0.55" stroke-width="${Math.max(1, w / 900)}">${ticks}
    <path d="M${cx - t} ${cy}H${cx + t}M${cx} ${cy - t}V${cy + t}" />
  </g>
  ${text}
</svg>`);
}

function tote(w, h) {
  // plain back-side silhouette, interim hero poster until the 3D scene renders one
  const bw = w * 0.56;
  const bh = bw * 1.08;
  const x = (w - bw) / 2;
  const y = h * 0.34;
  const inset = bw * 0.035;
  const hw = bw * 0.2;
  const handle = (ox) =>
    `<path d="M${ox} ${y + 4} C ${ox} ${y - bh * 0.62}, ${ox + hw} ${y - bh * 0.62}, ${ox + hw} ${y + 4}" fill="none" stroke="${C.deep}" stroke-width="${bw * 0.05}" stroke-linecap="round"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><radialGradient id="s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#111112" stop-opacity="0.22"/><stop offset="1" stop-color="#111112" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="${C.paper}"/>
  <ellipse cx="${w / 2}" cy="${y + bh + 6}" rx="${bw * 0.6}" ry="${bw * 0.06}" fill="url(#s)"/>
  ${handle(x + bw * 0.18)}${handle(x + bw * 0.62)}
  <path d="M${x + inset} ${y} H${x + bw - inset} L${x + bw} ${y + bh} H${x} Z" fill="${C.canvas}"/>
  <path d="M${x + inset} ${y} H${x + bw - inset}" stroke="${C.deep}" stroke-width="3"/>
  <rect x="${x + bw - 10}" y="${y + bh * 0.42}" width="10" height="${bh * 0.08}" fill="#9a978f"/>
</svg>`);
}

const totes = JSON.parse(readFileSync(join(root, "src/data/totes.json"), "utf8")).people;

const jobs = [
  ...[1, 2, 3, 4].map((n) => ({
    file: `people/0${n}.jpg`,
    svg: () => block(1600, 2000, [`FOTO 0${n} · PERSONA CON TOTE · 4:5`, "1600 × 2000 · assets/people/0" + n + ".jpg"]),
  })),
  ...totes.map((p, i) => ({
    file: p.photo,
    svg: () =>
      block(1600, 1600, [
        `FLAT-LAY ${String(i + 1).padStart(2, "0")} · ${p.name.split(" ")[0].toUpperCase()} · 1:1`,
        `1600 × 1600 · assets/${p.photo}`,
      ]),
  })),
  {
    // reads as a magazine from across the room, so the 3D easter egg works before the real cover exists
    file: "unbound-cover.jpg",
    svg: () =>
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
  <rect width="100%" height="100%" fill="${C.paper}"/>
  <rect x="90" y="300" width="1020" height="1000" fill="${C.canvas}"/>
  <text x="600" y="250" text-anchor="middle" font-family="Didot, 'Bodoni 72', Georgia, serif" font-size="230" font-weight="700" letter-spacing="6" fill="${C.ink}">UNBOUND</text>
  <text x="90" y="1400" font-family="${MONO}" font-size="34" letter-spacing="3" fill="${C.ink}">ANGELO · N.º 3 · 04.12.2026</text>
  <text x="90" y="1452" font-family="${MONO}" font-size="26" letter-spacing="2" fill="${C.mute}">PORTADA PROVISIONAL · 1200 × 1600 · assets/unbound-cover.jpg</text>
</svg>`),
  },
  {
    file: "og.jpg",
    svg: () => block(1200, 630, ["OG · YOUR FAVORITE'S FAVORITE · 1200 × 630"], { bg: C.paper }),
  },
  { file: "hero-poster.jpg", svg: () => tote(1200, 1500) },
];

let made = 0;
for (const j of jobs) {
  const out = join(assets, j.file);
  if (existsSync(out) && !force) continue;
  mkdirSync(dirname(out), { recursive: true });
  await sharp(j.svg()).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  made++;
  console.log("placeholder", j.file);
}

// favicon (until wordmark.svg exists, a serif A on ink)
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${C.ink}"/><text x="32" y="47" text-anchor="middle" font-family="Didot, 'Bodoni 72', Georgia, serif" font-weight="700" font-size="44" fill="${C.paper}">A</text></svg>`;
if (!existsSync(join(pub, "favicon.svg")) || force) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(pub, "favicon.svg"), fav);
  await sharp(Buffer.from(fav)).resize(180, 180).png().toFile(join(pub, "apple-touch-icon.png"));
  made++;
}
console.log(made ? `${made} placeholder(s) written` : "all assets present");
