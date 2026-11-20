import { picture } from "../lib/picture";

const PEOPLE = [
  { src: "people/01.jpg", alt: "Persona sosteniendo el tote de Angelo Studio" },
  { src: "people/02.jpg", alt: "Persona con el tote al hombro" },
  { src: "people/03.jpg", alt: "Persona caminando con el tote" },
  { src: "people/04.jpg", alt: "Persona mostrando la impresión del tote" },
];
// tiny rotation differences, like a fanned deck of prints (back → front)
const ROT = [-2.4, 1.2, -1.1, 1.6];

export function initContigo(): HTMLElement[] {
  const stack = document.querySelector<HTMLButtonElement>("[data-stack]");
  if (!stack) return [];
  const cards = PEOPLE.map((p, i) => {
    const fig = document.createElement("figure");
    fig.className = "stack__card";
    fig.style.setProperty("--i", String(i));
    fig.style.setProperty("--r", `${ROT[i]}deg`);
    fig.append(picture(p.src, p.alt, "(min-width: 1024px) 40vw, 80vw"));
    stack.append(fig);
    return fig;
  });
  return cards;
}
