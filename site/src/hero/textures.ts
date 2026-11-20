import * as THREE from "three";

/**
 * Procedural canvas weave: a tileable height field (plain weave + slubs),
 * turned into albedo, normal and roughness maps. Generated once at startup.
 */
export const CANVAS_RGB = [0xd9, 0xcc, 0xb3];

export interface Weave {
  color: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  rough: HTMLCanvasElement;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function makeWeave(size = 512, cell = 8): Weave {
  const r = rng(7);
  const n = size / cell;
  // slubs: some threads are thicker/lighter, which is what reads as "canvas" from afar
  const slubW = Array.from({ length: n }, () => (r() < 0.18 ? r() * 0.9 : r() * 0.15));
  const slubF = Array.from({ length: n }, () => (r() < 0.18 ? r() * 0.9 : r() * 0.15));
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const cv = Math.floor(y / cell);
    const fv = (y % cell) / cell;
    for (let x = 0; x < size; x++) {
      const cu = Math.floor(x / cell);
      const fu = (x % cell) / cell;
      const over = (cu + cv) & 1;
      const warp = Math.sqrt(Math.sin(Math.PI * fu)) * (over ? 1 : 0.55);
      const weft = Math.sqrt(Math.sin(Math.PI * fv)) * (over ? 0.55 : 1);
      h[y * size + x] = Math.max(warp, weft) + slubW[cu] * 0.12 + slubF[cv] * 0.12 + (r() - 0.5) * 0.08;
    }
  }

  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  };
  const color = mk();
  const normal = mk();
  const rough = mk();
  const ci = color.getContext("2d")!.createImageData(size, size);
  const ni = normal.getContext("2d")!.createImageData(size, size);
  const ri = rough.getContext("2d")!.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = at(x, y);
      // albedo: canvas color, valleys a touch darker, slubs a touch lighter
      const k = 0.955 + 0.06 * Math.min(1, v);
      ci.data[i] = Math.min(255, CANVAS_RGB[0] * k + 4);
      ci.data[i + 1] = Math.min(255, CANVAS_RGB[1] * k + 3);
      ci.data[i + 2] = Math.min(255, CANVAS_RGB[2] * k);
      ci.data[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      ni.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      ni.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255; // canvas y is down, GL v is up
      ni.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
      const rv = (0.82 + 0.14 * (1 - Math.min(1, v))) * 255;
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rv;
      ri.data[i + 3] = 255;
    }
  }
  color.getContext("2d")!.putImageData(ci, 0, 0);
  normal.getContext("2d")!.putImageData(ni, 0, 0);
  rough.getContext("2d")!.putImageData(ri, 0, 0);
  return { color, normal, rough };
}

export function tileTexture(src: HTMLCanvasElement, repeat: [number, number], srgb: boolean, anisotropy: number) {
  const t = new THREE.CanvasTexture(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/**
 * The printed face: weave albedo + "YOUR FAVORITE'S FAVORITE / ANGELO / STUDIO"
 * in ink, laid out like the real tote (block starts ~14% from the left edge,
 * wordmark ~57% of the face width, small line set to the wordmark's width).
 * Uses public/assets/wordmark.svg when it exists, otherwise Spalla.
 */
export async function drawPrint(
  canvas: HTMLCanvasElement,
  weaveColor: HTMLCanvasElement,
  faceAspect: number, // height / width
  weaveRepeat: [number, number],
  wordmark: HTMLImageElement | null
) {
  const W = canvas.width;
  const H = Math.round(W * faceAspect);
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // base: the same weave the other panels use, at the same scale
  const tileW = W / weaveRepeat[0];
  const tileH = H / weaveRepeat[1];
  for (let y = 0; y < H; y += tileH) for (let x = 0; x < W; x += tileW) ctx.drawImage(weaveColor, x, y, tileW, tileH);

  const left = W * 0.14;
  const markW = W * 0.57;
  const ink = "#1a1a1b";

  // ink layer drawn separately, then multiplied so the weave shows through like a screen print
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const l = layer.getContext("2d")!;
  l.fillStyle = ink;
  l.textBaseline = "alphabetic";

  if (wordmark) {
    const aspect = wordmark.naturalHeight / wordmark.naturalWidth || 0.6;
    const h = markW * aspect;
    l.drawImage(wordmark, left, H * 0.52 - h / 2, markW, h);
  } else {
    const fam = `"spalla", "Spalla Fallback", Georgia, serif`;
    l.font = `400 100px ${fam}`;
    const wA = l.measureText("ANGELO").width;
    const wS = l.measureText("STUDIO").width;
    const size = (markW / Math.max(wA, wS)) * 100;
    const lineGap = size * 0.84;

    const small = "YOUR FAVORITE'S FAVORITE";
    l.font = `400 100px ${fam}`;
    const smallSize = (markW / l.measureText(small).width) * 100;

    // block: small line, then ANGELO, STUDIO. Cap height of Spalla = 0.7em.
    const capBig = size * 0.7;
    const capSmall = smallSize * 0.7;
    const gap = size * 0.14;
    const blockH = capSmall + gap + capBig + lineGap;
    const top = H * 0.52 - blockH / 2;

    l.font = `400 ${smallSize}px ${fam}`;
    l.fillText(small, left, top + capSmall);
    l.font = `400 ${size}px ${fam}`;
    const k = size / 100; // wA/wS were measured at 100px
    const yA = top + capSmall + gap + capBig;
    // ANGELO and STUDIO each set to the same measure, like the print
    l.save();
    l.translate(left, yA);
    l.scale(markW / (wA * k), 1);
    l.fillText("ANGELO", 0, 0);
    l.restore();
    l.save();
    l.translate(left, yA + lineGap);
    l.scale(markW / (wS * k), 1);
    l.fillText("STUDIO", 0, 0);
    l.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.94;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/** Soft elliptical contact shadow. */
export function shadowCanvas(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, "rgba(17,17,18,0.55)");
  grd.addColorStop(0.35, "rgba(17,17,18,0.32)");
  grd.addColorStop(0.7, "rgba(17,17,18,0.08)");
  grd.addColorStop(1, "rgba(17,17,18,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}
