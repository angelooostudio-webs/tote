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
    file: "og.jpg",
    svg: () => block(1200, 630, ["OG · YOUR FAVORITE'S FAVORITE · 1200 × 630"], { bg: C.paper }),
  },
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

console.log(made ? `${made} placeholder(s) written` : "all assets present");
