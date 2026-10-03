import { formatCountdown, formatDistance, formatSpeed } from "./format";
import { useHud } from "./store";

const ORDER_NAMES: Record<string, string> = {
  burnTo: "BURN TO POINT",
  intercept: "INTERCEPT",
  matchVelocity: "MATCH VELOCITY",
  stationKeep: "STATION-KEEP",
  orient: "ORIENT",
  orbit: "ORBIT",
  coast: "COAST",
};

function Row(props: { label: string; value: string; tone?: "warn" | "dim" }) {
  return (
    <div className={`data-row ${props.tone ?? ""}`}>
      <span className="data-label">{props.label}</span>
      <span className="data-value mono">{props.value}</span>
    </div>
  );
}

/** Left rail: the active ship's nav state. */
export function NavStatus() {
  const s = useHud().activeShip;
  if (!s) return <div className="panel-empty">No ship selected</div>;
  return (
    <div className="nav-status">
      <div className="ship-name">{s.name}</div>
      <div className="ship-class">{s.shipClass}-CLASS</div>
      <Row label="Order" value={ORDER_NAMES[s.order] ?? s.order} />
      <Row label="Drive" value={s.phase.toUpperCase()} tone={s.phase === "flip" || s.phase === "avoid" ? "warn" : undefined} />
      <Row label="Speed" value={formatSpeed(s.speed)} />
      <Row label="Accel" value={`${s.accelG.toFixed(2)} G`} />
      <Row label="G set" value={s.g.toUpperCase()} tone={s.g === "max" ? "warn" : undefined} />
      <Row label="Flip" value={s.flipIn !== null ? `T-${formatCountdown(s.flipIn)}` : "—"} tone={s.flipIn === null ? "dim" : undefined} />
      <Row label="ETA" value={s.eta !== null ? formatCountdown(s.eta) : "—"} tone={s.eta === null ? "dim" : undefined} />
      {s.orbitAlt !== null && <Row label="Orbit alt" value={formatDistance(s.orbitAlt)} />}
      {s.orbitPeriod !== null && <Row label="Period" value={formatCountdown(s.orbitPeriod)} />}
    </div>
  );
}
