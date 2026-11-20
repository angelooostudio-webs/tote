import { createThreeRenderer } from "./renderer-three";
import { createState, type RendererFactory } from "./state";
import { initHeroTimeline } from "./timeline";

/** Swap this for an image-sequence renderer without touching the timeline. */
const makeRenderer: RendererFactory = createThreeRenderer;

export function initHero() {
  const stage = document.querySelector<HTMLElement>("[data-hero-stage]");
  const poster = document.querySelector<HTMLImageElement>("[data-hero-poster]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!stage || !hero) return;

  const state = createState();
  const r = makeRenderer(stage, state);
  initHeroTimeline(state);

  r.ready.then(() => poster?.classList.add("is-hidden"));

  // pause rendering whenever the hero (including its pin distance) is off screen
  new IntersectionObserver(([e]) => r.setActive(e.isIntersecting), { rootMargin: "100px 0px" }).observe(hero);

  return { state, renderer: r };
}
