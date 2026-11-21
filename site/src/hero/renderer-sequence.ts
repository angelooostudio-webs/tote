import meta from "../data/turn.json";
import type { HeroRenderer, HeroState } from "./state";
import { asset } from "../lib/base";

/**
 * Apple-style image sequence: the product video's frames (background keyed out,
 * cropped to the tote) drawn on the page's paper, scrubbed by `state.turn`.
 * A soft contact shadow is drawn under the tote for every frame, from
 * per-frame measurements made by scripts/encode-frames.mjs.
 *
 * Layout (mirrored in CSS for the poster, see .hero__poster img):
 * the tote is contained in a box 96% of the stage wide and 70% tall,
 * centred horizontally, with its middle at 45% of the stage height.
 */
export const BOX = { w: 0.96, h: 0.7, cy: 0.45 };
const PAPER = "#f3efe7";

type Img = ImageBitmap | HTMLImageElement;

export function createSequenceRenderer(stage: HTMLElement, state: HeroState, onLayout?: () => void): HeroRenderer {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "hero__canvas";
  stage.append(canvas);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  let dirty = true;
  let lastFrame = -1;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  // the small set is for small, low-density screens; phones at 2× get the sharp one
  const size = stage.clientWidth * dpr() > 560 ? "lg" : "sm";
  const N = meta.count;
  const frames: (Img | null)[] = new Array(N).fill(null);
  const url = (i: number) => asset(`assets/turn/${size}/${String(i).padStart(2, "0")}.webp`);

  async function load(i: number) {
    if (frames[i]) return;
    try {
      const blob = await (await fetch(url(i), { priority: i === 0 ? "high" : "low" } as RequestInit)).blob();
      frames[i] = "createImageBitmap" in window ? await createImageBitmap(blob) : await decodeImg(URL.createObjectURL(blob));
      dirty = true;
    } catch {
      /* a missing frame just means its neighbour is shown */
    }
  }
  function decodeImg(src: string) {
    const img = new Image();
    img.src = src;
    return img.decode().then(() => img);
  }

  // load order: first, last, then coarse-to-fine, so scrubbing works before everything is in
  const order: number[] = [0, N - 1];
  for (const stride of [8, 4, 2, 1]) for (let i = 0; i < N; i += stride) if (!order.includes(i)) order.push(i);
  let readyResolve!: () => void;
  const ready = new Promise<void>((r) => (readyResolve = r));
  // The poster (an identical first frame) covers the page until the visitor scrolls, so the
  // sequence waits: it starts after the page has loaded and gone idle, or on the first scroll,
  // whichever comes first. This keeps the frames out of the way of the first paint on slow phones.
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    removeEventListener("scroll", onScroll);
    await load(0);
    draw(true);
    readyResolve();
    const queue = order.slice(1);
    const worker = async () => {
      while (queue.length) await load(queue.shift()!);
    };
    await Promise.all([worker(), worker(), worker()]);
  };
  const onScroll = () => void start();
  addEventListener("scroll", onScroll, { passive: true });
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 400));
  if (document.readyState === "complete") idle(() => void start());
  else addEventListener("load", () => idle(() => void start()), { once: true });

  const nearest = (i: number): number => {
    for (let d = 0; d < N; d++) {
      if (frames[i - d]) return i - d;
      if (frames[i + d]) return i + d;
    }
    return -1;
  };

  // ---------- layout ----------
  let W = 0;
  let H = 0;
  let rect = { x: 0, y: 0, w: 0, h: 0 };
  const fit = () => {
    const r = dpr();
    W = Math.round(stage.clientWidth * r);
    H = Math.round(stage.clientHeight * r);
    canvas.width = W;
    canvas.height = H;
    const w = Math.min(W * BOX.w, H * BOX.h * meta.aspect);
    const h = w / meta.aspect;
    rect = { x: (W - w) / 2, y: H * BOX.cy - h / 2, w, h };
    dirty = true;
    onFit?.();
  };
  const onFit = onLayout;
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  const shadow = (i: number) => {
    const f = meta.frames[i];
    const cx = rect.x + f.cx * rect.w;
    const cy = rect.y + f.y * rect.h;
    const rx = ((f.w * rect.w) / 2) * 1.12;
    const ry = rx * 0.07;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "rgba(17,17,18,0.30)");
    g.addColorStop(0.55, "rgba(17,17,18,0.12)");
    g.addColorStop(1, "rgba(17,17,18,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  function draw(force = false) {
    // snap to the nearest frame (the scroll scrub's smoothing keeps it fluid)
    const t = Math.min(1, Math.max(0, state.turn));
    const i = nearest(Math.round(t * (N - 1)));
    if (i < 0 || (!force && !dirty && i === lastFrame)) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    shadow(i);
    ctx.drawImage(frames[i]!, rect.x, rect.y, rect.w, rect.h);
    lastFrame = i;
    dirty = false;
  }

  let active = true;
  let raf = 0;
  const loop = () => {
    raf = active ? requestAnimationFrame(loop) : 0;
    draw();
  };
  raf = requestAnimationFrame(loop);

  return {
    ready,
    bagBottom: () => (rect.y + meta.frames[N - 1].y * rect.h) / dpr(),
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on && !raf) raf = requestAnimationFrame(loop);
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.remove();
      frames.forEach((f) => f && "close" in f && f.close());
    },
  };
}
