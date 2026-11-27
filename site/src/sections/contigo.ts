import { picture } from "../lib/picture";
import { gsap, ScrollTrigger } from "../lib/scroll";

const PEOPLE = [
  { src: "people/sol-v2.jpg", alt: "Hombre a pleno sol con el tote de Angelo Studio al hombro, visto de cerca" },
  { src: "people/plaza.jpg", alt: "Mujer de espaldas con el tote de Angelo Studio al hombro, en la plaza de El Retiro" },
  { src: "people/atardecer.jpg", alt: "Mujer al atardecer con el tote de Angelo Studio al hombro y el libro Steal Like an Artist asomando" },
  { src: "people/04.jpg", alt: "Persona mostrando la impresión del tote" },
];
// slot 0 = back of the deck, slot 3 = front. Tiny rotation differences, like fanned prints.
const ROT = [-2.4, 1.2, -1.1, 1.6];

/**
 * A fanned deck of four prints. Each card has two layers:
 *  - .stack__card  → its slot in the deck (x, y, rotation), changed when cycling
 *  - .stack__inner → entrance from the lower right + scroll parallax
 * so the scroll-driven and tap-driven motions never fight over one transform.
 */
export function initContigo(reduced: boolean) {
  const stack = document.querySelector<HTMLButtonElement>("[data-stack]");
  const counter = document.querySelector<HTMLElement>("[data-stack-count]");
  const live = document.querySelector<HTMLElement>("[data-stack-live]");
  if (!stack) return;

  const cards = PEOPLE.map((p, i) => {
    const fig = document.createElement("figure");
    fig.className = "stack__card";
    const inner = document.createElement("div");
    inner.className = "stack__inner";
    inner.append(picture(p.src, p.alt, "(min-width: 1024px) 40vw, 80vw", { eager: i === 0 }));
    fig.append(inner);
    stack.append(fig);
    return { fig, inner, person: i };
  });

  // order[slot] = card index; the last slot is the card on top, so photo 01 starts in front
  const order = cards.map((_, i) => cards.length - 1 - i);
  const step = () => stack.clientWidth * 0.055;
  const slotVars = (slot: number) => ({ x: slot * step(), y: slot * step() * 1.25, rotation: ROT[slot], zIndex: slot + 1 });

  const place = () => order.forEach((c, slot) => gsap.set(cards[c].fig, slotVars(slot)));
  place();
  // ScrollTrigger refreshes on resize; re-place the deck with the new step
  ScrollTrigger.addEventListener("refreshInit", place);

  const front = () => cards[order[order.length - 1]].person + 1; // 1-based photo number on top
  const updateCount = () => {
    if (counter) counter.textContent = `${front()} / ${cards.length}`;
    if (live) live.textContent = `Foto ${front()} de ${cards.length}`;
  };
  updateCount();

  // ---- tap / click / Enter: top card goes to the back of the deck ----
  let busy = false;
  stack.addEventListener("click", () => {
    if (busy) return;
    const top = order.pop()!;
    order.unshift(top);
    updateCount();
    if (reduced) {
      place();
      return;
    }
    busy = true;
    const el = cards[top].fig;
    const tl = gsap.timeline({ onComplete: () => void (busy = false) });
    // the top print slides off to the lower right…
    tl.to(el, { x: `+=${stack.clientWidth * 0.42}`, y: `+=${stack.clientWidth * 0.12}`, rotation: 9, duration: 0.32, ease: "power2.in" })
      // …drops behind the others…
      .set(el, { zIndex: 0 })
      // …and slides back in at the back of the deck while the rest move up
      .to(el, { ...slotVars(0), zIndex: 1, duration: 0.6, ease: "expo.out" });
    order.slice(1).forEach((c, k) => {
      tl.to(cards[c].fig, { ...slotVars(k + 1), duration: 0.55, ease: "expo.out" }, 0.22 + k * 0.04);
    });
  });

  if (reduced) return;

  // the "next" arrow arrives with the front print
  const next = stack.querySelector<HTMLElement>("[data-stack-next]");
  if (next)
    gsap.from(next, {
      autoAlpha: 0,
      scale: 0.6,
      ease: "power3.out",
      scrollTrigger: { trigger: stack, start: "top 55%", end: "top 35%", scrub: 0.8 },
    });

  // ---- entrance: prints slide in from the lower right, one by one, lightly scrubbed ----
  const inners = order.map((c) => cards[c].inner); // back to front
  gsap.from(inners, {
    xPercent: 70,
    yPercent: 38,
    rotation: 8,
    autoAlpha: 0,
    ease: "power3.out",
    stagger: 0.22,
    scrollTrigger: { trigger: stack, start: "top 92%", end: "top 30%", scrub: 0.8 },
  });

  // ---- parallax: deeper prints drift a little less than the top one ----
  inners.forEach((el, depth) => {
    gsap.fromTo(
      el,
      { y: 0 },
      {
        y: -(depth + 1) * 7,
        ease: "none",
        scrollTrigger: { trigger: stack, start: "top 30%", end: "bottom top", scrub: true },
      }
    );
  });
}
