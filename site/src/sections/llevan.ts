import data from "../data/totes.json";
import { asset } from "../lib/base";
import { picture } from "../lib/picture";

type Item = { label: string; x?: number; y?: number; sticker?: string }; // x/y: optional hotspot on the photo, 0–1
type Person = { slug: string; name: string; role: string; instagram: string; photo: string; items: Item[] };

const pad = (n: number) => String(n).padStart(2, "0");

export function initLlevan() {
  const track = document.querySelector<HTMLElement>("[data-llevan-track]");
  const counter = document.querySelector<HTMLElement>("[data-llevan-counter]");
  if (!track) return;
  const people = (data as { people: Person[] }).people;

  people.forEach((p, idx) => {
    const art = document.createElement("article");
    art.className = "person";
    art.setAttribute("aria-label", `${idx + 1} de ${people.length}: ${p.name}`);

    const photo = document.createElement("div");
    photo.className = "person__photo";
    photo.append(picture(p.photo, `${p.name.split(" ")[0]} con el tote de Angelo Studio`, "(min-width: 1200px) 400px, (min-width: 768px) 45vw, 80vw"));
    const spots = p.items.map((it) => {
      if (it.x == null || it.y == null) return null;
      const s = document.createElement("span");
      s.className = "person__spot";
      s.style.left = `${it.x * 100}%`;
      s.style.top = `${it.y * 100}%`;
      photo.append(s);
      return s;
    });

    const name = document.createElement("h3");
    name.className = "person__name";
    name.textContent = p.name;

    const role = document.createElement("p");
    role.className = "person__role";
    role.textContent = p.role;

    const ig = document.createElement(p.instagram ? "a" : "span") as HTMLAnchorElement;
    ig.className = "person__ig mono";
    if (p.instagram) {
      ig.href = `https://instagram.com/${p.instagram}`;
      ig.target = "_blank";
      ig.rel = "noopener";
      ig.textContent = `@${p.instagram}`;
    } else {
      ig.textContent = "@instagram pendiente";
      ig.dataset.pending = "";
    }

    const list = document.createElement("ol");
    list.className = "person__items";
    p.items.forEach((it, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${pad(i + 1)}</span><span></span>`;
      li.lastElementChild!.textContent = it.label;
      if (it.sticker) {
        // a little cut-out of the thing itself, tilted, for personality
        const img = document.createElement("img");
        img.className = "person__sticker";
        img.src = asset(`assets/${it.sticker}`);
        img.alt = "";
        // landscape cut-outs (an envelope) sit a little smaller than standing ones (a figure, a tube)
        img.addEventListener("load", () => img.classList.toggle("is-wide", img.naturalWidth > img.naturalHeight), { once: true });
        img.loading = "lazy";
        img.decoding = "async";
        li.lastElementChild!.append(img);
      }
      const on = (v: boolean) => {
        li.classList.toggle("is-on", v);
        spots[i]?.classList.toggle("is-on", v);
      };
      li.addEventListener("pointerenter", () => on(true));
      li.addEventListener("pointerleave", () => on(false));
      list.append(li);
    });

    art.append(photo, name);
    if (p.role) art.append(role);
    art.append(ig);
    if (p.items.length) art.append(list);
    track.append(art);
  });

  // "01/06" counter while swiping on mobile
  if (counter) {
    const cards = [...track.children] as HTMLElement[];
    let raf = 0;
    const update = () => {
      raf = 0;
      const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 1;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      const i = atEnd ? cards.length - 1 : Math.round(track.scrollLeft / step);
      counter.textContent = `${pad(Math.min(i, cards.length - 1) + 1)}/${pad(cards.length)}`;
    };
    track.addEventListener("scroll", () => (raf ||= requestAnimationFrame(update)), { passive: true });
    update();
  }
}
