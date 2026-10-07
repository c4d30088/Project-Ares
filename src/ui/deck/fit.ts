// Fits the bottom deck to the window. The three panels sit together as one group, centered at
// the bottom: weapons on the left of the time panel, helm on its right (owner, M6). Wide
// windows: full size. A little narrower: all three scale down together (never below
// MIN_SCALE, to keep the text readable). Narrower still: the time panel lifts above the gap
// between the other two, so weapons and helm keep a usable size. When the group fits between
// the side rails, the rails run down to the bottom of the screen. The results go into CSS
// variables that deck.css and hud.css read. Widths are in HUD pixels (after the UI scale).

import { useEffect } from "react";
import { settings } from "../../game/settings";

/** Smallest scale before the time panel lifts out of the row. */
const MIN_SCALE = 0.85;
/** Window edge margin and the gap between panels, px (unscaled). */
const EDGE = 16;
const GAP = 12;
/** Space between the lifted time panel and the panels below it, px. */
const LIFT_GAP = 10;
/** The least height of the weapons and helm panels, px. */
const MIN_DECK_H = 172;
/** The side rails' widths (hud.css), and the space kept between a rail and the deck. */
const RAIL_LEFT_W = 260;
const RAIL_RIGHT_W = 300;
const RAIL_CLEAR = 12;

export interface DeckFit {
  scale: number;
  /** The time panel sits above the row instead of in it. */
  lifted: boolean;
  /** Left edges of the weapons and helm panels, and the time panel's center, px. */
  leftX: number;
  rightX: number;
  midCenterX: number;
  /** The deck fits between the side rails, so they can run to the bottom. */
  railsClear: boolean;
}

/** Pure layout rule (testable): the width and the panels' natural widths in, placement out. */
export function fitDeck(width: number, left: number, mid: number, right: number): DeckFit {
  const room = width - 2 * EDGE;
  const inRow = (room - 2 * GAP) / (left + mid + right);
  const lifted = inRow < MIN_SCALE;
  const scale = Math.min(1, lifted ? (room - GAP) / (left + right) : inRow);
  // The group, centered: weapons, (time,) helm.
  const total = lifted ? (left + right) * scale + GAP : (left + mid + right) * scale + 2 * GAP;
  const start = Math.max(EDGE, (width - total) / 2);
  const leftX = start;
  const rightX = lifted ? start + left * scale + GAP : start + (left + mid) * scale + 2 * GAP;
  // The time panel sits in the group (equal gaps either side), or above the gap when lifted.
  const midCenterX = lifted ? start + left * scale + GAP / 2 : start + left * scale + GAP + (mid * scale) / 2;
  const railsClear = leftX >= EDGE + RAIL_LEFT_W + RAIL_CLEAR && rightX + right * scale <= width - EDGE - RAIL_RIGHT_W - RAIL_CLEAR;
  return { scale, lifted, leftX, rightX, midCenterX, railsClear };
}

/** Whether a centered panel of this width fits between the side rails (the replay panel). */
export function fitsBetweenRails(width: number, panel: number): boolean {
  return panel <= width - 2 * (EDGE + RAIL_CLEAR) - RAIL_LEFT_W - RAIL_RIGHT_W;
}

/** Measures the deck panels and keeps the CSS variables up to date. */
export function useDeckFit(layoutKey: unknown): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const width = window.innerWidth / settings.uiScale;
      const panel = (side: string) => document.querySelector<HTMLElement>(`.dk.${side}`);
      const l = panel("left");
      const m = panel("mid");
      const r = panel("right");
      if (!l || !r) {
        // The replay panel alone: the rails clear it if it fits between them.
        const clear = !!m && fitsBetweenRails(width, m.offsetWidth);
        root.style.setProperty("--rail-bottom", clear ? `${EDGE}px` : `${(m?.offsetHeight ?? MIN_DECK_H) + EDGE + 14}px`);
        return;
      }
      if (!m) return;
      // Weapons and helm are always the same height: the taller one's natural height (a ship
      // with many PDC mounts needs more rows), never less than MIN_DECK_H. Measured with the
      // shared height lifted for a moment; nothing paints in between.
      root.style.setProperty("--deck-h", "0px");
      const deckH = Math.max(MIN_DECK_H, l.offsetHeight, r.offsetHeight);
      root.style.setProperty("--deck-h", `${deckH}px`);
      // offsetWidth and offsetHeight ignore transforms: these are the natural sizes.
      const fit = fitDeck(width, l.offsetWidth, m.offsetWidth, r.offsetWidth);
      const lift = fit.lifted ? deckH * fit.scale + LIFT_GAP : 0;
      root.style.setProperty("--deck-scale", String(fit.scale));
      root.style.setProperty("--deck-mid-lift", `${lift}px`);
      root.style.setProperty("--deck-left-x", `${fit.leftX}px`);
      root.style.setProperty("--deck-right-x", `${fit.rightX}px`);
      root.style.setProperty("--deck-mid-cx", `${fit.midCenterX}px`);
      root.style.setProperty("--rail-bottom", fit.railsClear ? `${EDGE}px` : `${deckH * fit.scale + EDGE + 14}px`);
      // The top of whatever sits in the middle of the deck, for the order hint and scale readout.
      root.style.setProperty("--deck-center-h", `${(fit.lifted ? deckH * fit.scale + LIFT_GAP + m.offsetHeight * fit.scale : deckH * fit.scale)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    document.querySelectorAll(".dk").forEach((d) => ro.observe(d));
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [layoutKey]); // re-attach when the deck's panels are swapped (the replay replaces them)
}
