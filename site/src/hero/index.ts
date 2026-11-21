import { createSequenceRenderer } from "./renderer-sequence";
import { createState } from "./state";
import { initHeroTimeline } from "./timeline";

export function initHero() {
  const stage = document.querySelector<HTMLElement>("[data-hero-stage]");
  const poster = document.querySelector<HTMLElement>("[data-hero-poster]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!stage || !hero) return;

  const state = createState();
  const r = createSequenceRenderer(stage, state);
  initHeroTimeline(state);

  // the poster covers the first paint (LCP); hand over once the canvas has drawn frame 1
  r.ready.then(() => poster?.classList.add("is-hidden"));

  // stop drawing whenever the hero (including its pin distance) is off screen
  new IntersectionObserver(([e]) => r.setActive(e.isIntersecting), { rootMargin: "100px 0px" }).observe(hero);

  return { state, renderer: r };
}
