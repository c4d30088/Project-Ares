// A tiny store the game loop publishes HUD state into (a few times per second), and the
// actions the HUD can call back into the game. main.ts wires the actions.

import { useSyncExternalStore } from "react";

export interface HudState {
  simTime: number;
  paused: boolean;
  compressionIndex: number;
  compressionSteps: number[];
  notice: string | null;
}

let state: HudState = {
  simTime: 0,
  paused: false,
  compressionIndex: 0,
  compressionSteps: [1],
  notice: null,
};
const listeners = new Set<() => void>();

export const hudStore = {
  get: () => state,
  /** Publishes new values; listeners run only if something changed. */
  set(next: Partial<HudState>) {
    const merged = { ...state, ...next };
    const changed = (Object.keys(merged) as (keyof HudState)[]).some((k) => merged[k] !== state[k]);
    if (!changed) return;
    state = merged;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useHud(): HudState {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get);
}

export interface HudActions {
  togglePause(): void;
  setCompression(index: number): void;
}

export const hudActions: HudActions = {
  togglePause() {},
  setCompression() {},
};
