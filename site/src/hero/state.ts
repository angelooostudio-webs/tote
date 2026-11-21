/**
 * The contract between the scroll timeline (hero/timeline.ts) and whatever
 * draws the hero. The timeline only ever writes these numbers; a renderer only
 * ever reads them. Today the renderer is the image sequence from the product
 * video (renderer-sequence.ts); anything else that maps `turn` to pixels can
 * replace it without touching the scroll logic.
 */
export interface HeroState {
  /** 0 = plain back side facing the viewer, 1 = print facing the viewer (180°) */
  turn: number;
}

export interface HeroRenderer {
  /** resolves when the first real frame has been drawn */
  ready: Promise<void>;
  setActive(active: boolean): void;
  /** where the bottom of the tote sits on the last frame, in CSS px from the top of the stage */
  bagBottom(): number;
  dispose(): void;
}

export const createState = (): HeroState => ({ turn: 0 });
