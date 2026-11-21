import { gsap, ScrollTrigger, getLenis } from "../lib/scroll";
import type { HeroState } from "./state";

/**
 * Scroll choreography for the hero. Knows nothing about three.js: it only
 * writes numbers into `state`, which the active renderer reads every frame.
 *
 *  ├─ TURN ───────────────────────┤├─ TAIL ─────┤
 *  scrubbed 180° turn + dolly       pinned still life, slogan, then release
 *                                ▲
 *                     scroll is held here (≤ 1.6 s) while the bag tips
 *                     over and the groceries spill, as a time-based timeline
 */
const TURN_VH = 1.6;
const TAIL_VH = 0.7;
const HOLD_MS = 1400; // must stay under 1.6 s

export function initHeroTimeline(state: HeroState) {
  const hero = document.querySelector<HTMLElement>("[data-hero]")!;
  const pin = document.querySelector<HTMLElement>("[data-hero-pin]")!;
  const hint = document.querySelector<HTMLElement>("[data-hero-hint]");
  const label = hero.querySelector<HTMLElement>(".hero__label");
  const slogan = document.querySelector<HTMLElement>("[data-hero-slogan]");

  gsap.set(slogan, { autoAlpha: 0, y: 18 });

  // ---- scrubbed part: the turn, then an empty tail so the still life stays pinned a moment
  const total = TURN_VH + TAIL_VH;
  const tl = gsap.timeline({ defaults: { ease: "none" } });
  tl.to(state, { turn: 1, duration: TURN_VH, ease: "power2.inOut" }, 0)
    .to(state, { dolly: 1, duration: TURN_VH, ease: "power1.inOut" }, 0)
    .to(hint, { autoAlpha: 0, duration: 0.15 }, 0)
    .to(label, { autoAlpha: 0, duration: 0.3 }, TURN_VH * 0.75)
    .to({}, { duration: TAIL_VH }, TURN_VH);
  const threshold = (TURN_VH / total) * 0.985;

  // ---- time-based part: tip + spill (+ the slogan)
  const spill = gsap.timeline({ paused: true });
  spill
    .to(state, { tip: 1, duration: 0.55, ease: "power2.in" }, 0)
    .to(state, { spill: 1, duration: 0.95, ease: "none" }, 0.42)
    .to(slogan, { autoAlpha: 1, y: 0, duration: 0.7, ease: "expo.out" }, 1.05);

  let spilled = false;
  let release: gsap.core.Tween | null = null;
  const born = performance.now();

  const playSpill = (hold: boolean) => {
    spilled = true;
    if (!hold) {
      spill.progress(1).pause();
      return;
    }
    const lenis = getLenis();
    lenis?.stop();
    spill.restart();
    release?.kill();
    release = gsap.delayedCall(HOLD_MS / 1000, () => lenis?.start());
  };

  const resetSpill = () => {
    spilled = false;
    spill.pause();
    release?.kill();
    getLenis()?.start();
    gsap.to(state, { tip: 0, spill: 0, duration: 0.7, ease: "power2.inOut", overwrite: "auto" });
    gsap.to(slogan, { autoAlpha: 0, y: 18, duration: 0.3, ease: "power2.out", overwrite: "auto" });
  };

  const st = ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: () => `+=${Math.round(window.innerHeight * total)}`,
    pin,
    pinSpacing: true,
    scrub: 0.6,
    animation: tl,
    invalidateOnRefresh: true,
    onUpdate(self) {
      const p = self.progress;
      if (!spilled && p >= threshold) {
        // arriving from a restored scroll position or a jump past the hero: no hold, just the end state
        const instant = performance.now() - born < 900 || p >= 1 || !self.isActive;
        playSpill(!instant);
      } else if (spilled && p < threshold - 0.03) {
        resetSpill();
      }
    },
  });

  return { trigger: st, timeline: tl, spill };
}
