import { CATALOG, formatCOP, shortDate, type OptionId } from "../../../shared/catalog";
import { SHIPPING_NOTE, buildOrderMessage, cleanLine, cleanName, makeOrderCode, orderLines, whatsappLink, type Delivery, type Order } from "../../../shared/order";
import { gsap, getLenis } from "../lib/scroll";

/**
 * The order sheet. Opened by the Order buttons (event "order:open").
 * Builds the order on the client and hands it to the WhatsApp bot through a
 * wa.me link with a fixed, machine-readable message (shared/order.ts).
 */
const CODE_KEY = "tote-order-code";

const DESC: Record<OptionId, string> = {
  bundle: `El tote y tu copia de UNBOUND apartada. La revista sale el ${shortDate(CATALOG.magazineLaunch)}.`,
  toteOnly: "Solo el tote de lona.",
};

export function initSheet(reduced: boolean) {
  const root = document.querySelector<HTMLElement>("[data-sheet]");
  if (!root) return;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const panel = $("[data-sheet-panel]");
  const backdrop = $("[data-sheet-backdrop]");
  const head = $("[data-sheet-drag]");
  const form = $<HTMLFormElement>("[data-sheet-form]");
  const optsEl = $("[data-sheet-options]");
  const addonsEl = $("[data-sheet-addons]");
  const addonsGroup = $("[data-sheet-addons-group]");
  const qtyVal = $("[data-qty-val]");
  const qtyBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-qty]")];
  const nameInput = $<HTMLInputElement>("#order-name");
  const nameErr = $("[data-name-err]");
  const totalEl = $("[data-sheet-total]");
  const cta = $<HTMLAnchorElement>("[data-sheet-cta]");
  const codeEl = $("[data-sheet-code]");
  const hint = $("[data-delivery-hint]");
  const shipOpt = $("[data-shipping-opt]");
  const shipGroup = $("[data-ship-group]");
  const addrInput = $<HTMLInputElement>("#order-address");
  const cityInput = $<HTMLInputElement>("#order-city");
  const shipErr = $("[data-ship-err]");
  const optionErr = $("[data-option-err]");
  const deliveryErr = $("[data-delivery-err]");
  const scroller = panel; // the whole window scrolls as one page

  const order: Order = { code: "", option: "bundle", qty: 1, addOns: [], delivery: "pickup", name: "" };

  // ---------- build from the catalog ----------
  (Object.keys(CATALOG.options) as OptionId[]).forEach((id) => {
    const o = CATALOG.options[id];
    const label = document.createElement("label");
    label.className = "opt";
    label.innerHTML = `<input type="radio" name="option" value="${id}" />
      <span class="opt__mark" aria-hidden="true"></span><span class="opt__name"></span>
      <span class="opt__price">${formatCOP(o.price)}</span><span class="opt__desc"></span>`;
    label.querySelector(".opt__name")!.textContent = o.label;
    label.querySelector(".opt__desc")!.textContent = DESC[id] ?? "";
    optsEl.append(label);
  });

  addonsGroup.hidden = CATALOG.addOns.length === 0;
  for (const a of CATALOG.addOns) {
    const label = document.createElement("label");
    label.className = "addon";
    label.innerHTML = `<span class="addon__label"></span><span class="addon__price">${a.price ? "+" + formatCOP(a.price) : "Incluido"}</span>
      <input type="checkbox" role="switch" name="addon" value="${a.id}" /><span class="switch" aria-hidden="true"></span>`;
    label.querySelector(".addon__label")!.textContent = a.label;
    addonsEl.append(label);
  }

  shipOpt.hidden = !CATALOG.shipping.enabled;
  $("[data-shipping-label]").textContent = CATALOG.shipping.label;

  // ---------- steps: 01 option · 02 quantity + delivery · 03 your details ----------
  // One step open at a time. Answered steps fold into a one-line summary ("Cambiar" reopens them);
  // steps not reached yet show only their greyed title.
  type State = "open" | "done" | "locked";
  const steps = [...form.querySelectorAll<HTMLElement>(".step")];
  const stepHead = (i: number) => steps[i].querySelector<HTMLButtonElement>("[data-step-head]")!;
  const stateOf = (i: number) => steps[i].dataset.state as State;
  const setState = (i: number, st: State) => {
    steps[i].dataset.state = st;
    const h = stepHead(i);
    h.disabled = st === "locked";
    h.setAttribute("aria-expanded", String(st === "open"));
  };
  /** open step i; every other reachable step folds to its summary */
  const openStep = (i: number, scroll: boolean) => {
    steps.forEach((_, j) => {
      if (j === i) setState(j, "open");
      else if (stateOf(j) === "open") setState(j, "done"); // a step once reached never locks again
    });
    const body = steps[i].querySelector<HTMLElement>(".step__body")!;
    if (!reduced) gsap.fromTo(body, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "expo.out", clearProps: "transform,opacity,visibility" });
    if (scroll)
      requestAnimationFrame(() => {
        const top = steps[i].getBoundingClientRect().top - scroller.getBoundingClientRect().top - head.offsetHeight - 8;
        scroller.scrollTo({ top: scroller.scrollTop + top, behavior: reduced ? "auto" : "smooth" });
      });
  };
  const complete = (i: number) => (i === 0 ? !!chosen("option") : i === 1 ? !!chosen("delivery") : false);
  /** after answering step i: fold it and move on to the first unanswered step */
  const advance = (i: number) => {
    const next = steps.findIndex((_, j) => j > i && !complete(j));
    if (next === -1) return;
    setState(i, "done");
    openStep(next, true);
  };
  steps.forEach((_, i) => stepHead(i).addEventListener("click", () => stateOf(i) === "done" && openStep(i, false)));

  const chosen = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;

  // ---------- live state ----------
  const update = () => {
    const hasOption = !!chosen("option");
    const hasDelivery = !!chosen("delivery");
    order.option = (chosen("option") ?? "bundle") as OptionId;
    order.addOns = [...form.querySelectorAll<HTMLInputElement>('input[name="addon"]:checked')].map((i) => i.value);
    order.delivery = (chosen("delivery") ?? "pickup") as Delivery;
    order.name = cleanName(nameInput.value);
    const shipping = hasDelivery && order.delivery === "shipping";
    if (shipping) {
      order.address = cleanLine(addrInput.value);
      order.city = cleanLine(cityInput.value, 60);
    } else {
      delete order.address;
      delete order.city;
    }
    shipGroup.hidden = !shipping;

    qtyVal.textContent = String(order.qty);
    qtyBtns[0].disabled = order.qty <= 1;
    qtyBtns[1].disabled = order.qty >= CATALOG.maxQtyPerOrder;

    const { total } = orderLines(order);
    if (hasOption) {
      totalEl.innerHTML = formatCOP(total).replace(/\./g, '<span class="pt" aria-hidden="true"></span>');
      totalEl.setAttribute("aria-label", `Total ${formatCOP(total)}`);
    } else {
      totalEl.textContent = "";
      totalEl.removeAttribute("aria-label");
    }

    // the one-line answers shown when a step is folded
    const val = (i: number, text: string) => (steps[i].querySelector<HTMLElement>("[data-step-value]")!.textContent = text);
    val(0, hasOption ? `${CATALOG.options[order.option].label} · ${formatCOP(CATALOG.options[order.option].price)}` : "");
    val(1, hasDelivery ? `${order.qty} × · ${order.delivery === "shipping" ? CATALOG.shipping.label : "Recoger"}` : "");
    val(2, [order.name, shipping ? order.city : ""].filter(Boolean).join(" · "));

    if (hasOption) optionErr.hidden = true;
    if (hasDelivery) deliveryErr.hidden = true;
    if (!hasDelivery) {
      hint.textContent = "";
    } else if (order.delivery === "pickup") {
      const { place, hours } = CATALOG.pickup;
      hint.textContent = place ? `${place}${hours ? ` · ${hours}` : ""}` : "Te contamos el lugar y el horario de recogida por WhatsApp.";
    } else {
      const area = CATALOG.shipping.area ? `Envíos a ${CATALOG.shipping.area}. ` : "";
      hint.textContent = `${area}${SHIPPING_NOTE}`;
    }

    cta.href = whatsappLink(buildOrderMessage(order));
  };

  form.addEventListener("change", (e) => {
    update();
    const name = (e.target as HTMLInputElement).name;
    if (name === "option") advance(0);
    if (name === "delivery") {
      // a shipping order still needs an address in step 3; a pickup one is ready for a name
      advance(1);
    }
  });
  nameInput.addEventListener("input", () => {
    if (nameInput.value.trim()) setNameError(false);
    update();
  });
  const shipOk = () => cleanLine(addrInput.value).length >= 5 && cleanLine(cityInput.value).length >= 2;
  for (const el of [addrInput, cityInput])
    el.addEventListener("input", () => {
      if (shipOk()) setShipError(false);
      update();
    });
  form.addEventListener("submit", (e) => e.preventDefault());
  qtyBtns.forEach((b) =>
    b.addEventListener("click", () => {
      order.qty = Math.min(CATALOG.maxQtyPerOrder, Math.max(1, order.qty + Number(b.dataset.qty)));
      update();
    })
  );

  const setNameError = (on: boolean) => {
    nameErr.hidden = !on;
    nameInput.setAttribute("aria-invalid", String(on));
  };
  const setShipError = (on: boolean) => {
    shipErr.hidden = !on;
    addrInput.setAttribute("aria-invalid", String(on && cleanLine(addrInput.value).length < 5));
    cityInput.setAttribute("aria-invalid", String(on && cleanLine(cityInput.value).length < 2));
  };

  const stop = (e: Event, step: number, err: HTMLElement, focusEl: HTMLElement) => {
    e.preventDefault();
    if (stateOf(step) !== "open") openStep(step, true);
    err.hidden = false;
    focusEl.focus({ preventScroll: true });
  };
  const openDetails = () => stateOf(2) !== "open" && openStep(2, true);
  cta.addEventListener("click", (e) => {
    update();
    if (!chosen("option")) return stop(e, 0, optionErr, form.querySelector<HTMLInputElement>('input[name="option"]')!);
    if (!chosen("delivery")) return stop(e, 1, deliveryErr, form.querySelector<HTMLInputElement>('input[name="delivery"]')!);
    if (!order.name || (order.delivery === "shipping" && !shipOk())) openDetails();
    if (!order.name) {
      e.preventDefault();
      setNameError(true);
      nameInput.focus();
      nameInput.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      return;
    }
    if (order.delivery === "shipping" && !shipOk()) {
      e.preventDefault();
      setShipError(true);
      const first = cleanLine(addrInput.value).length < 5 ? addrInput : cityInput;
      first.focus();
      first.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      return;
    }
    // the link opens WhatsApp; the next order gets a fresh code
    try {
      sessionStorage.removeItem(CODE_KEY);
    } catch {}
    setTimeout(() => close(), 400);
  });

  // ---------- open / close ----------
  let opener: HTMLElement | null = null;
  let isOpen = false;
  const outside = () => [...document.body.children].filter((el) => el !== root && el.tagName !== "SCRIPT") as HTMLElement[];
  const mobile = () => !matchMedia("(min-width: 768px)").matches;

  const open = (from?: HTMLElement | null) => {
    if (isOpen) return;
    isOpen = true;
    opener = from ?? (document.activeElement as HTMLElement);

    let code = "";
    try {
      code = sessionStorage.getItem(CODE_KEY) ?? "";
    } catch {}
    if (!code) {
      code = makeOrderCode();
      try {
        sessionStorage.setItem(CODE_KEY, code);
      } catch {}
    }
    order.code = code;
    codeEl.textContent = code;
    update();

    root.hidden = false;
    outside().forEach((el) => (el.inert = true));
    getLenis()?.stop();
    document.documentElement.classList.add("sheet-open");

    gsap.killTweensOf([panel, backdrop]);
    if (reduced) {
      gsap.set(panel, { clearProps: "transform", opacity: 1 });
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    } else {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });
      if (mobile()) gsap.fromTo(panel, { yPercent: 100, opacity: 1 }, { yPercent: 0, duration: 0.55, ease: "expo.out" });
      else gsap.fromTo(panel, { y: 24, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "expo.out" });
    }
    panel.focus({ preventScroll: true });
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    const done = () => {
      root.hidden = true;
      outside().forEach((el) => (el.inert = false));
      document.documentElement.classList.remove("sheet-open");
      getLenis()?.start();
      gsap.set(panel, { clearProps: "transform,opacity" });
      opener?.focus({ preventScroll: true });
    };
    gsap.killTweensOf([panel, backdrop]);
    if (reduced) return gsap.to(backdrop, { opacity: 0, duration: 0.15, onComplete: done });
    gsap.to(backdrop, { opacity: 0, duration: 0.3, ease: "power2.in" });
    if (mobile()) gsap.to(panel, { yPercent: 100, y: 0, duration: 0.38, ease: "power3.in", onComplete: done });
    else gsap.to(panel, { y: 16, scale: 0.98, opacity: 0, duration: 0.25, ease: "power2.in", onComplete: done });
  };

  document.addEventListener("order:open", (e) => open((e as CustomEvent).detail?.from));
  $("[data-sheet-close]").addEventListener("click", close);
  backdrop.addEventListener("click", close);

  // Esc + focus trap
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const f = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null
    );
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // swipe down on the head to close (phones)
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let v = 0;
  let dragging = false;
  head.addEventListener("pointerdown", (e) => {
    if (!mobile() || (e.target as HTMLElement).closest("button")) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    v = 0;
    head.setPointerCapture(e.pointerId);
    gsap.killTweensOf(panel);
  });
  head.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - startY);
    v = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY;
    lastT = e.timeStamp;
    gsap.set(panel, { y: dy });
    gsap.set(backdrop, { opacity: 1 - Math.min(1, dy / panel.offsetHeight) });
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    const dy = Number(gsap.getProperty(panel, "y"));
    if (dy > 110 || v > 0.6) close();
    else {
      gsap.to(panel, { y: 0, duration: 0.45, ease: "expo.out" });
      gsap.to(backdrop, { opacity: 1, duration: 0.3 });
    }
  };
  head.addEventListener("pointerup", endDrag);
  head.addEventListener("pointercancel", endDrag);

  if (import.meta.env.DEV) (window as unknown as { __sheet: unknown }).__sheet = { open, close, order };
}
