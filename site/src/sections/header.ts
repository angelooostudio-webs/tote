import { gsap, ScrollTrigger } from "../lib/scroll";

/**
 * The ANGELO STUDIO header. Absent while the hero plays; once the hero (pin
 * included) has fully left the screen it slides down and the wordmark types
 * in letter by letter, as if the tote's print handed the name to the page.
 * Scrolling back into the hero reverses it.
 */
export function initHeader(reduced: boolean) {
  const header = document.querySelector<HTMLElement>("[data-header]");
  const word = header?.querySelector<HTMLElement>("[data-split]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!header || !word || !hero) return;

  if (reduced) {
    header.classList.add("is-visible");
    return;
  }

  // split into letters (the link keeps an aria-label, the letters are decorative)
  const text = word.textContent ?? "";
  word.setAttribute("aria-hidden", "true");
  word.textContent = "";
  const chars = [...text].map((c) => {
    const s = document.createElement("span");
    s.className = "ch";
    s.textContent = c;
    word.append(s);
    return s;
  });

  gsap.set(header, { y: 0, yPercent: -100, autoAlpha: 0 }); // y: 0 clears the CSS translate GSAP would otherwise keep as an offset
  gsap.set(chars, { yPercent: 110, opacity: 0 });
  const tl = gsap.timeline({ paused: true });
  tl.to(header, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: "expo.out" }, 0).to(
    chars,
    { yPercent: 0, opacity: 1, duration: 0.5, ease: "expo.out", stagger: 0.028 },
    0.08
  );

  ScrollTrigger.create({
    trigger: hero,
    start: "bottom top",
    animation: tl,
    toggleActions: "play none none reverse",
    // measured after the hero's pin spacer exists (the hero is created later, lazily)
    refreshPriority: -1,
  });
}
