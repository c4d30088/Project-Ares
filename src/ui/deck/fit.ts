// Fits the bottom deck to the window. Wide windows: weapons, time and helm side by side, at
// full size. A little narrower: all three scale down together (never below MIN_SCALE, to keep
// the text readable). Narrower still: the time panel lifts above the gap between the other two,
// so weapons and helm keep a usable size. The result goes into CSS variables that deck.css
// (and everything that must clear the deck) reads.

import { useEffect } from "react";

/** Smallest scale before the time panel lifts out of the row. */
const MIN_SCALE = 0.85;
/** Window edge margin and the gap between panels, px (unscaled). */
const EDGE = 16;
const GAP = 12;
/** Space between the lifted time panel and the panels below it, px. */
const LIFT_GAP = 10;
/** The least height of the weapons and helm panels, px. */
const MIN_DECK_H = 172;

export interface DeckFit {
  scale: number;
  /** The time panel sits above the row instead of in it. */
  lifted: boolean;
}

/** Pure layout rule (testable): natural panel widths in, scale and placement out. */
export function fitDeck(windowWidth: number, left: number, mid: number, right: number): DeckFit {
  const room = windowWidth - 2 * EDGE;
  const inRow = (room - 2 * GAP) / (left + mid + right);
  if (inRow >= MIN_SCALE) return { scale: Math.min(1, inRow), lifted: false };
  return { scale: Math.min(1, (room - GAP) / (left + right)), lifted: true };
}

/** Measures the deck panels and keeps the CSS variables up to date. */
export function useDeckFit(): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const panel = (side: string) => document.querySelector<HTMLElement>(`.dk.${side}`);
      const l = panel("left");
      const m = panel("mid");
      const r = panel("right");
      if (!l || !m || !r) return;
      // Weapons and helm are always the same height: the taller one's natural height (a ship
      // with many PDC mounts needs more rows), never less than MIN_DECK_H. Measured with the
      // shared height lifted for a moment; nothing paints in between.
      root.style.setProperty("--deck-h", "0px");
      const deckH = Math.max(MIN_DECK_H, l.offsetHeight, r.offsetHeight);
      root.style.setProperty("--deck-h", `${deckH}px`);
      // offsetWidth and offsetHeight ignore transforms: these are the natural sizes.
      const fit = fitDeck(window.innerWidth, l.offsetWidth, m.offsetWidth, r.offsetWidth);
      const lift = fit.lifted ? deckH * fit.scale + LIFT_GAP : 0;
      root.style.setProperty("--deck-scale", String(fit.scale));
      root.style.setProperty("--deck-mid-lift", `${lift}px`);
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
  }, []);
}
