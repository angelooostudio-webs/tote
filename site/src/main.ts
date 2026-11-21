import { CATALOG, presalePhase, shortDate } from "../../shared/catalog";
import { initScroll, ScrollTrigger } from "./lib/scroll";
import { initHeader } from "./sections/header";
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
initHeader(reduced);
initContigo();
initLlevan();

// three.js is loaded on demand so it never blocks the first paint (the poster covers it)
if (!reduced) {
  import("./hero").then(({ initHero }) => {
    const h = initHero();
    // the hero pin changes the page length: recompute every trigger created before it
    ScrollTrigger.refresh();
    if (import.meta.env.DEV) (window as unknown as { __hero: unknown }).__hero = h;
  });
}

// ---- reduced motion: no pin, no spill; sections simply fade in ----
if (reduced) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) (e.target.classList.add("is-in"), io.unobserve(e.target));
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll<HTMLElement>("main > section:not(.hero), .site-footer").forEach((el) => {
    el.classList.add("reveal");
    io.observe(el);
  });
}
