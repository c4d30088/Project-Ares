import { hudActions, useHud } from "./store";

const ORDERS: { kind: string; label: string; key: string }[] = [
  { kind: "burnTo", label: "Burn to", key: "B" },
  { kind: "rendezvous", label: "Intercept", key: "I" },
  { kind: "fastPass", label: "Fast pass", key: "P" },
  { kind: "match", label: "Match vel", key: "M" },
  { kind: "stationKeep", label: "Station", key: "K" },
  { kind: "orient", label: "Orient", key: "O" },
  { kind: "coast", label: "Coast", key: "C" },
];

const GS: { g: "cruise" | "combat" | "max"; label: string; key: string }[] = [
  { g: "cruise", label: "Cruise", key: "1" },
  { g: "combat", label: "Combat", key: "2" },
  { g: "max", label: "Max", key: "3" },
];

export function OrderBar() {
  const hud = useHud();
  const disabled = !hud.activeShip;
  return (
    <div className="order-bar">
      <div className="btn-group">
        {ORDERS.map((o) => (
          <button
            key={o.kind}
            disabled={disabled}
            className={`hud-btn ${hud.orderMode === o.kind ? "active" : ""}`}
            onClick={() => hudActions.startOrder(o.kind)}
            title={`${o.label} (${o.key})`}
          >
            {o.label} <span className="key">{o.key}</span>
          </button>
        ))}
      </div>
      <div className="btn-group" title="G setting (1, 2, 3)">
        {GS.map((g) => (
          <button
            key={g.g}
            disabled={disabled}
            className={`hud-btn ${hud.activeShip?.g === g.g ? "active" : ""} ${g.g === "max" && hud.activeShip?.g === "max" ? "warn" : ""}`}
            onClick={() => hudActions.setG(g.g)}
          >
            {g.label} <span className="key">{g.key}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
