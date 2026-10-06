import { crewTuning } from "../data/crew";
import { sensorTuning } from "../data/sensors";
import { useHud } from "./store";

// Subsystems in the order a captain reads them; PDC mounts are added after.
const SUBSYSTEMS: [string, string][] = [
  ["hull", "Hull"],
  ["drive", "Drive"],
  ["reactor", "Reactor"],
  ["sensors", "Sensors"],
  ["radiators", "Radiators"],
  ["crew", "Crew"],
  ["tubes", "Tubes"],
  ["railgun", "Railgun"],
];

/** Left rail: G-strain, heat, crew efficiency and the health of every subsystem. */
export function ShipStatus() {
  const s = useHud().activeShip;
  if (!s) return null;
  const strainTone = s.strain >= 1 ? "bad" : s.strain > crewTuning.strainWarn ? "warn" : "";
  const heatTone = s.heat >= 1 ? "bad" : s.heat > sensorTuning.heatWarn ? "warn" : "";
  const pdcs = Object.keys(s.health).filter((k) => k.startsWith("pdc")).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  const cells: [string, string][] = [...SUBSYSTEMS.filter(([k]) => k in s.health), ...pdcs.map((k): [string, string] => [k, `PDC ${k.slice(3)}`])];
  return (
    <div className="ship-status">
      <div className="section-title">Status</div>
      <div className={`data-row ${strainTone}`}>
        <span className="data-label">G-strain</span>
        <span className="data-value mono">{Math.round(s.strain * 100)}%</span>
      </div>
      <div className={`strain-bar ${strainTone}`} title="Builds above Cruise G, drains at or below it. Full strain: crew casualties.">
        <div className="strain-fill" style={{ width: `${Math.round(s.strain * 100)}%` }} />
      </div>
      <div className={`data-row ${heatTone}`}>
        <span className="data-label">Heat</span>
        <span className="data-value mono">{Math.round(s.heat * 100)}%</span>
      </div>
      <div className={`strain-bar ${heatTone}`} title="Builds while running dark (coasting, Sensors off, not firing). Cools only while you are visible. Full heat: crew and radiators damaged.">
        <div className="strain-fill" style={{ width: `${Math.round(s.heat * 100)}%` }} />
      </div>
      <div className={`data-row ${s.efficiency < 0.75 ? "warn" : ""}`}>
        <span className="data-label">Crew eff.</span>
        <span className="data-value mono">{Math.round(s.efficiency * 100)}%</span>
      </div>
      <div className="subsystem-grid">
        {cells.map(([k, label]) => {
          const h = s.health[k];
          const tone = h <= 0 ? "bad" : h < 1 ? "warn" : "";
          return (
            <div key={k} className={`subsystem ${tone}`}>
              <span className="data-label">{label}</span>
              <span className="data-value mono">{h <= 0 ? "OFF" : h < 1 ? `${Math.round(h * 100)}%` : "OK"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
