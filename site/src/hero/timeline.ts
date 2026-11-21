import { gsap, ScrollTrigger } from "../lib/scroll";
import type { HeroState } from "./state";

/**
 * Scroll choreography for the hero. Knows nothing about how the hero is drawn:
 * it only writes `state.turn`, which the renderer reads every frame.
 *
 *  ├─ TURN ──────────────────────────┤├─ TAIL ──────────┤
 *  pinned, scrubbed 180° turn          print facing you,
 *  (the product video, frame by frame) slogan fades in, then the pin releases
 */
// short on purpose: the whole turn takes about one screen of scrolling
const TURN_VH = 1.0;
const TAIL_VH = 0.5;

export function initHeroTimeline(state: HeroState) {
  const hero = document.querySelector<HTMLElement>("[data-hero]")!;
  const pin = document.querySelector<HTMLElement>("[data-hero-pin]")!;
  const hint = document.querySelector<HTMLElement>("[data-hero-hint]");
  const label = hero.querySelector<HTMLElement>(".hero__label");
  const slogan = document.querySelector<HTMLElement>("[data-hero-slogan]");

  gsap.set(slogan, { autoAlpha: 0, y: 18 });

  const tl = gsap.timeline({ defaults: { ease: "none" } });
  tl.to(state, { turn: 1, duration: TURN_VH, ease: "power1.inOut" }, 0)
    .to(hint, { autoAlpha: 0, duration: 0.15 }, 0)
    .to(label, { autoAlpha: 0, duration: 0.3 }, TURN_VH * 0.7)
    .to(slogan, { autoAlpha: 1, y: 0, duration: TAIL_VH * 0.55, ease: "power2.out" }, TURN_VH - 0.05)
    .to({}, { duration: TAIL_VH * 0.45 });

  const st = ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: () => `+=${Math.round(window.innerHeight * (TURN_VH + TAIL_VH))}`,
    pin,
    pinSpacing: true,
    scrub: 0.5,
    animation: tl,
    invalidateOnRefresh: true,
  });

  return { trigger: st, timeline: tl };
}
