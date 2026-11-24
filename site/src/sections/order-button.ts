import { CATALOG, formatCOP, lowestPrice, presalePhase, shortDate, type PresalePhase } from "../../../shared/catalog";
import { now } from "../lib/clock";
import { gsap } from "../lib/scroll";

/**
 * Both Order buttons. They read the date (America/Bogota, via the ISO offsets
 * in the catalog) and switch between:
 *   before → disabled look, "Disponible 28.11" + live countdown
 *   open   → "Ordenar", opens the order sheet
 *   closed → "Pre-venta cerrada", links to UNBOUND drop info on Instagram
 * Stock from the bot (GET /stock) can turn them into "Agotado".
 */

const pad = (n: number) => String(n).padStart(2, "0");

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 86400))}:${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

const instagramUrl = `https://instagram.com/${CATALOG.instagram}`;

interface Block {
  root: HTMLElement;
  btn: HTMLElement;
  label: HTMLElement;
  price: HTMLElement;
  stock: HTMLElement | null;
  count: HTMLElement | null;
  note: HTMLElement | null;
}

let soldOut = false;
let blocks: Block[] = [];

/** Turns the <button> into an <a> (or back) keeping its children. */
function swapTag(b: Block, tag: "a" | "button") {
  if (b.btn.tagName.toLowerCase() === tag) return;
  const el = document.createElement(tag);
  for (const a of [...b.btn.attributes]) if (a.name !== "type" && a.name !== "href") el.setAttribute(a.name, a.value);
  el.append(...b.btn.childNodes);
  b.btn.replaceWith(el);
  b.btn = el;
}

function render(phase: PresalePhase) {
  for (const b of blocks) {
    const state = soldOut && phase === "open" ? "soldout" : phase;
    b.root.dataset.state = state;
    if (state === "closed") {
      swapTag(b, "a");
      const a = b.btn as HTMLAnchorElement;
      a.href = instagramUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.removeAttribute("aria-disabled");
      b.label.textContent = "Pre-venta cerrada";
      b.price.textContent = "Instagram";
      if (b.note) {
        b.note.textContent = `UNBOUND sale el ${shortDate(CATALOG.magazineLaunch)}`;
        b.note.hidden = false;
      }

      continue;
    }
    swapTag(b, "button");
    (b.btn as HTMLButtonElement).type = "button";
    if (b.note) b.note.hidden = true;
    b.price.textContent = `Desde ${formatCOP(lowestPrice())}`;
    b.btn.removeAttribute("aria-label");
    if (state === "before") {
      b.btn.setAttribute("aria-disabled", "true");
      b.label.textContent = `Disponible ${shortDate(CATALOG.presaleOpens)}`;

    } else if (state === "soldout") {
      b.btn.setAttribute("aria-disabled", "true");
      b.label.textContent = "Agotado";
    } else {
      b.btn.removeAttribute("aria-disabled");
      b.label.textContent = "Ordenar";
    }
  }
}

function tick() {
  const t = now();
  const phase = presalePhase(t);
  const before = phase === "before";
  for (const b of blocks) {
    if (!b.count) continue;
    b.count.hidden = !before;
    if (before) {
      const d = b.count.querySelector("[data-countdown-digits]") ?? b.count;
      // Doto's own colon reads like "‡" at this size: draw the separators as two square dots
      d.innerHTML = countdown(Date.parse(CATALOG.presaleOpens) - t.getTime())
        .split(":")
        .join('<span class="sep" aria-hidden="true"></span>');
    }
  }
  if (phase !== current) {
    current = phase;
    render(phase);
    pillUpdate?.(phase);
  }
}

let current: PresalePhase | null = null;
let pillUpdate: ((p: PresalePhase) => void) | undefined;

/** Magnetic hover on fine pointers: the button leans a few px toward the cursor. */
function magnetic(b: Block) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const root = b.root.querySelector<HTMLElement>(".order__magnet") ?? b.root;
  const xTo = gsap.quickTo(root, "x", { duration: 0.5, ease: "expo.out" });
  const yTo = gsap.quickTo(root, "y", { duration: 0.5, ease: "expo.out" });
  root.addEventListener("pointermove", (e) => {
    if (b.btn.getAttribute("aria-disabled") === "true") return;
    const r = root.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    xTo(Math.max(-8, Math.min(8, dx * 0.12)));
    yTo(Math.max(-6, Math.min(6, dy * 0.25)));
  });
  root.addEventListener("pointerleave", () => {
    xTo(0);
    yTo(0);
  });
}

export function initOrderButtons(onPill?: (p: PresalePhase) => void) {
  pillUpdate = onPill;
  blocks = [...document.querySelectorAll<HTMLElement>("[data-order]")].map((root) => ({
    root,
    btn: root.querySelector<HTMLElement>("[data-order-btn]")!,
    label: root.querySelector<HTMLElement>("[data-order-label]")!,
    price: root.querySelector<HTMLElement>("[data-order-price]")!,
    stock: root.querySelector<HTMLElement>("[data-stock]"),
    count: root.querySelector<HTMLElement>("[data-countdown]"),
    note: root.querySelector<HTMLElement>("[data-order-note]"),
  }));
  for (const b of blocks) {
    b.count?.setAttribute("aria-hidden", "true"); // ticking digits are noise for screen readers; the label says when
    magnetic(b);
    // event delegation survives the <button>/<a> swap
    b.root.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-order-btn]");
      if (!btn || btn.tagName === "A") return;
      if (btn.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        return;
      }
      document.dispatchEvent(new CustomEvent("order:open", { detail: { from: btn } }));
    });
  }
  tick();
  setInterval(tick, 1000);
  loadStock();
}

// ---------- live stock from the bot (phase 8 wires the URL) ----------
const STOCK_KEY = "tote-stock";
async function loadStock() {
  const base = CATALOG.botBaseUrl;
  if (!base) return; // no bot yet: never show a number we don't have
  let remaining: number | null = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(STOCK_KEY) ?? "null");
    if (cached && Date.now() - cached.at < 60_000) remaining = cached.remaining;
  } catch {}
  if (remaining === null) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/stock`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (typeof data.remaining !== "number" || data.remaining < 0) throw new Error("bad");
      remaining = data.remaining;
      try {
        sessionStorage.setItem(STOCK_KEY, JSON.stringify({ at: Date.now(), remaining }));
      } catch {}
    } catch {
      return; // fetch failed: keep the counter hidden
    }
  }
  const r = remaining as number;
  for (const b of blocks) {
    if (!b.stock) continue;
    b.stock.textContent = `Quedan ${pad(r)} de ${CATALOG.stockTotal}`;
    b.stock.hidden = false;
  }
  soldOut = r <= 0;
  if (current) render(current);
}
