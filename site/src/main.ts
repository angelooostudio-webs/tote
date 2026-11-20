import { CATALOG, presalePhase, shortDate } from "../../shared/catalog";
import { initScroll } from "./lib/scroll";
import { initContigo } from "./sections/contigo";
import { initLlevan } from "./sections/llevan";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.classList.toggle("reduced-motion", reduced);

// ---- presale pill in the header ----
const pill = document.querySelector<HTMLElement>("[data-presale-pill]");
if (pill) {
  const phase = presalePhase();
  pill.dataset.state = phase;
  pill.textContent =
    phase === "before" ? `Pre-venta ${shortDate(CATALOG.presaleOpens)}` : phase === "open" ? "Pre-venta abierta" : "Pre-venta cerrada";
}

initScroll(reduced);
initContigo();
initLlevan();

// three.js is loaded on demand so it never blocks the first paint (the poster covers it)
if (!reduced) {
  import("./hero").then(({ initHero }) => {
    const h = initHero();
    if (import.meta.env.DEV) (window as unknown as { __hero: unknown }).__hero = h;
  });
}

// ---- header: hidden while the hero is on screen (phase 3 replaces this with the GSAP entrance) ----
const header = document.querySelector<HTMLElement>("[data-header]");
const hero = document.querySelector<HTMLElement>("[data-hero]");
if (header && hero && !reduced) {
  new IntersectionObserver(([e]) => header.classList.toggle("is-visible", !e.isIntersecting)).observe(hero);
}
