import { gsap, ScrollTrigger } from "../lib/scroll";
import type { HeroState } from "./state";

/**
 * Scroll choreography for the hero. Knows nothing about three.js: it only
 * writes numbers into `state`, which the active renderer reads every frame.
 *
 * Phase 2: pin + scrubbed 180° turn with a light dolly.
 * Phase 3 adds the tip-over/spill hold at the end of this trigger.
 */
export function initHeroTimeline(state: HeroState) {
  const hero = document.querySelector<HTMLElement>("[data-hero]")!;
  const pin = document.querySelector<HTMLElement>("[data-hero-pin]")!;
  const hint = document.querySelector<HTMLElement>("[data-hero-hint]");
  const label = hero.querySelector<HTMLElement>(".hero__label");

  const tl = gsap.timeline({ defaults: { ease: "none" } });
  tl.to(state, { turn: 1, duration: 1, ease: "power2.inOut" }, 0)
    .to(state, { dolly: 1, duration: 1, ease: "power1.inOut" }, 0)
    .to(hint, { autoAlpha: 0, duration: 0.12 }, 0)
    .to(label, { autoAlpha: 0.0, duration: 0.2 }, 0.75);

  const st = ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: () => `+=${Math.round(window.innerHeight * 1.6)}`,
    pin,
    pinSpacing: true,
    scrub: 0.6,
    animation: tl,
    invalidateOnRefresh: true,
  });

  return { trigger: st, timeline: tl };
}
