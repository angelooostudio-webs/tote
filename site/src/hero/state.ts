/**
 * The contract between the scroll timeline (hero/timeline.ts) and whatever
 * draws the hero. The timeline only ever writes these numbers; a renderer only
 * ever reads them. To swap three.js for an Apple-style image sequence, write a
 * new renderer that maps `turn` (and later `tip`/`spill`) to frames.
 */
export interface HeroState {
  /** 0 = plain back side facing the viewer, 1 = print facing the viewer (180°) */
  turn: number;
  /** 0..1 subtle camera dolly-in that accompanies the turn */
  dolly: number;
  /** 0..1 tote tipping over (phase 3) */
  tip: number;
  /** 0..1 groceries spilling (phase 3) */
  spill: number;
}

export interface HeroRenderer {
  /** resolves when the first real frame has been drawn */
  ready: Promise<void>;
  setActive(active: boolean): void;
  dispose(): void;
}

export type RendererFactory = (stage: HTMLElement, state: HeroState) => HeroRenderer;

export const createState = (): HeroState => ({ turn: 0, dolly: 0, tip: 0, spill: 0 });
