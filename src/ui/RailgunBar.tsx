import { hudActions, useHud } from "./store";

/** Railgun state as a short label: READY, recharge seconds, EMPTY or DESTROYED. */
export function railgunState(rg: { rechargeS: number; slugs: number; health: number }): string {
  if (rg.health <= 0) return "DESTROYED";
  if (rg.slugs <= 0) return "EMPTY";
  return rg.rechargeS > 0 ? `${Math.ceil(rg.rechargeS)} S` : "READY";
}

// Railgun: its state, slugs left, and Fire (then pick the target, as for any order). Only
// ever fires on the player's order.
export function RailgunBar() {
  const hud = useHud();
  const rg = hud.railgun;
  if (!rg) return null;
  const state = railgunState(rg);
  const ready = state === "READY";
  return (
    <div className="railgun-bar">
      <span className={`weapons-label mono ${ready ? "" : "dim"}`} title="Railgun: state · slugs left">
        RG {state} · {rg.slugs}
      </span>
      <button
        disabled={rg.health <= 0 || rg.slugs <= 0}
        className={`hud-btn ${hud.orderMode === "railgun" ? "active" : ""}`}
        onClick={() => hudActions.startOrder("railgun")}
        title="Fire the railgun (G), then pick a target: a ship is shot at its lead point"
      >
        Fire RG <span className="key">G</span>
      </button>
    </div>
  );
}
