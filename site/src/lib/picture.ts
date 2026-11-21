import manifest from "../data/images.json";
import { asset } from "./base";

type Entry = { w: number; h: number; widths: number[]; base: string };
const M = manifest as Record<string, Entry>;

/**
 * <picture> with AVIF/WebP/JPEG srcsets from the build-time manifest.
 * `path` is relative to public/assets (e.g. "people/01.jpg").
 */
export function picture(path: string, alt: string, sizes: string, opts: { eager?: boolean } = {}): HTMLPictureElement {
  const pic = document.createElement("picture");
  const e = M[path];
  const img = document.createElement("img");
  img.alt = alt;
  img.decoding = "async";
  img.loading = opts.eager ? "eager" : "lazy";
  if (!e) {
    img.src = asset(`assets/${path}`);
    pic.append(img);
    return pic;
  }
  const base = asset(e.base);
  const set = (ext: string) => e.widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
  for (const [ext, type] of [
    ["avif", "image/avif"],
    ["webp", "image/webp"],
  ]) {
    const s = document.createElement("source");
    s.type = type;
    s.srcset = set(ext);
    s.sizes = sizes;
    pic.append(s);
  }
  img.srcset = set("jpg");
  img.sizes = sizes;
  img.src = `${base}-${e.widths[Math.min(1, e.widths.length - 1)]}.jpg`;
  img.width = e.w;
  img.height = e.h;
  pic.append(img);
  return pic;
}
