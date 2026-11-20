import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

// iOS Safari: don't refresh every time the address bar shows/hides.
ScrollTrigger.config({ ignoreMobileResize: true });

let lenis: Lenis | null = null;

/** Lenis smooth scroll driven by GSAP's ticker, synced to ScrollTrigger. */
export function initScroll(reduced: boolean): Lenis | null {
  if (reduced) return null;
  lenis = new Lenis({
    autoRaf: false,
    lerp: 0.12,
    // native momentum on touch: feels right on iPhone/Android and avoids fighting the OS
    syncTouch: false,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function getLenis() {
  return lenis;
}

export { gsap, ScrollTrigger };
