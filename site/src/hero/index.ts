import { createSequenceRenderer } from "./renderer-sequence";
import { createState } from "./state";
import { initHeroTimeline } from "./timeline";

export function initHero() {
  const stage = document.querySelector<HTMLElement>("[data-hero-stage]");
  const poster = document.querySelector<HTMLElement>("[data-hero-poster]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!stage || !hero) return;

  const state = createState();
  const slogan = document.querySelector<HTMLElement>("[data-hero-slogan]");
  const contigo = document.querySelector<HTMLElement>("#contigo");
  // the slogan sits halfway between the bottom of the tote and the hairline that opens the next section
  const placeSlogan = () => {
    if (!slogan || !contigo) return;
    const bag = r.bagBottom();
    const line = stage.clientHeight + parseFloat(getComputedStyle(contigo).paddingTop || "0");
    const top = bag + (line - bag - slogan.offsetHeight) / 2;
    slogan.style.top = `${Math.round(top)}px`;
    slogan.style.bottom = "auto";
  };
  const r = createSequenceRenderer(stage, state, () => requestAnimationFrame(placeSlogan));
  initHeroTimeline(state);

  // the poster covers the first paint (LCP); hand over once the canvas has drawn frame 1
  r.ready.then(() => {
    poster?.classList.add("is-hidden");
    placeSlogan();
  });
  document.fonts.ready.then(placeSlogan);

  // stop drawing whenever the hero (including its pin distance) is off screen
  new IntersectionObserver(([e]) => r.setActive(e.isIntersecting), { rootMargin: "100px 0px" }).observe(hero);

  return { state, renderer: r };
}
