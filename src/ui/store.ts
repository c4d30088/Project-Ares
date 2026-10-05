// A tiny store the game loop publishes HUD state into (a few times per second), and the
// actions the HUD can call back into the game. main.ts wires the actions.

import { useSyncExternalStore } from "react";
import type { LogEntry } from "../game/alertLog";

export interface ActiveShipInfo {
  name: string;
  shipClass: string;
  order: string;
  phase: string;
  speed: number; // m/s
  accelG: number;
  g: string;
  flipIn: number | null; // seconds
  eta: number | null; // seconds
  orbitAlt: number | null; // meters above the surface
  orbitPeriod: number | null; // seconds
  strain: number; // 0..1
  efficiency: number; // 0..1
  /** Subsystem health, 1 = intact. */
  health: Record<string, number>;
}

export interface AlertInfo {
  text: string;
  tone: "threat" | "warn" | "good";
  blink?: boolean;
  countdown?: number;
}

export interface WeaponsInfo {
  /** Torpedoes left, and ordered but not yet out of a tube. */
  magazine: number;
  queued: number;
  tubes: number;
  tubesReady: number;
  /** Salvo settings for the next launch. */
  salvo: number;
  mode: "hot" | "cold";
}

export interface PdcInfo {
  mode: "auto" | "manual" | "hold";
  firing: boolean;
  rounds: number;
  roundsMax: number;
  health: number;
}

export interface BurstInfo {
  enabled: boolean;
  rounds: number;
  intervalS: number;
}

export interface RailgunInfo {
  rechargeS: number;
  slugs: number;
  slugsMax: number;
  health: number;
  spinal: boolean;
}

/** How the fight ended, for the result banner. */
export interface OutcomeInfo {
  result: "win" | "loss" | "draw";
  title: string;
  detail: string;
  /** Sim seconds at the end. */
  timeS: number;
}

export interface HudState {
  activeShip: ActiveShipInfo | null;
  alerts: AlertInfo[];
  /** The alert log, oldest first. */
  alertLog: LogEntry[];
  railgun: RailgunInfo | null;
  railgunDetected: boolean;
  slugImpactIn: number | null;
  pdcs: PdcInfo[] | null;
  pdcBurst: BurstInfo | null;
  weapons: WeaponsInfo | null;
  /** Top strip: a hostile launch was just detected; seconds to the soonest hostile impact. */
  launchDetected: boolean;
  impactIn: number | null;
  /** Order being placed, or null. */
  orderMode: string | null;
  hint: string | null;
  simTime: number;
  paused: boolean;
  compressionIndex: number;
  compressionSteps: number[];
  notice: string | null;
  /** Set when the fight is over (win, loss or draw). */
  outcome: OutcomeInfo | null;
}

let state: HudState = {
  activeShip: null,
  alerts: [],
  alertLog: [],
  railgun: null,
  railgunDetected: false,
  slugImpactIn: null,
  pdcs: null,
  pdcBurst: null,
  weapons: null,
  launchDetected: false,
  impactIn: null,
  orderMode: null,
  hint: null,
  simTime: 0,
  paused: false,
  compressionIndex: 0,
  compressionSteps: [1],
  notice: null,
  outcome: null,
};
const listeners = new Set<() => void>();

export const hudStore = {
  get: () => state,
  /** Publishes new values; listeners run only if something changed. */
  set(next: Partial<HudState>) {
    const merged = { ...state, ...next };
    const same = (a: unknown, b: unknown) => a === b || (typeof a === "object" && a !== null && JSON.stringify(a) === JSON.stringify(b));
    const changed = (Object.keys(merged) as (keyof HudState)[]).some((k) => !same(merged[k], state[k]));
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
  startOrder(kind: string): void;
  setG(g: "cruise" | "combat" | "max"): void;
  setSalvo(n: number): void;
  setLaunchMode(mode: "hot" | "cold"): void;
  /** PDC mode for one mount (0-based) or all. */
  setPdcMode(mount: number | "all", mode: "auto" | "manual" | "hold"): void;
  setPdcBurst(burst: BurstInfo): void;
  /** Starts the scenario again from the beginning. */
  restart(): void;
}

export const hudActions: HudActions = {
  togglePause() {},
  setCompression() {},
  startOrder() {},
  setG() {},
  setSalvo() {},
  setLaunchMode() {},
  setPdcMode() {},
  setPdcBurst() {},
  restart() {},
};
