import { createThreeRenderer } from "./renderer-three";
import { createState, type HeroRenderer, type HeroState } from "./state";
import { initHeroTimeline } from "./timeline";

/** Swap this for an image-sequence renderer without touching the timeline. */
const makeRenderer = (stage: HTMLElement, state: HeroState, still = false): HeroRenderer =>
  createThreeRenderer(stage, state, { still });

export function initHero() {
  const stage = document.querySelector<HTMLElement>("[data-hero-stage]");
  const poster = document.querySelector<HTMLElement>("[data-hero-poster]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!stage || !hero) return;

  const state = createState();

  // Dev only: /?poster=back|print renders a still of the scene to bake the poster images
  // (scripts/posters.mjs). Never active in production builds.
  const posterMode = import.meta.env.DEV ? new URLSearchParams(location.search).get("poster") : null;
  if (posterMode) {
    document.documentElement.classList.add("poster-mode");
    if (posterMode === "print") Object.assign(state, { turn: 1, dolly: 1 });
    const r = makeRenderer(stage, state, true);
    r.ready.then(() => setTimeout(() => document.documentElement.setAttribute("data-poster-ready", ""), 300));
    return { state, renderer: r };
  }

  const r = makeRenderer(stage, state);
  initHeroTimeline(state);

  r.ready.then(() => poster?.classList.add("is-hidden"));

  // pause rendering whenever the hero (including its pin distance) is off screen
  new IntersectionObserver(([e]) => r.setActive(e.isIntersecting), { rootMargin: "100px 0px" }).observe(hero);

  return { state, renderer: r };
}
