import { hudActions, useHud } from "./store";
import { railgunState } from "./RailgunBar";

const group = (n: number) => n.toLocaleString("en-US");
const BURST_ROUNDS = [5, 10, 20, 40, 80];
const BURST_GAPS = [0.25, 0.5, 1, 2, 4];

const step = (list: number[], now: number, dir: 1 | -1) => {
  const i = list.findIndex((x) => x >= now - 1e-9);
  const at = i < 0 ? list.length - 1 : i;
  return list[Math.max(0, Math.min(list.length - 1, at + dir))];
};

/** Left rail: the railgun, rounds left in every PDC, and burst fire for mounts on Auto. */
export function PdcStatus() {
  const hud = useHud();
  const rg = hud.railgun;
  const pdcs = hud.pdcs;
  const burst = hud.pdcBurst;
  if (!pdcs || !pdcs.length || !burst) return null;
  const total = pdcs.reduce((s, m) => s + m.rounds, 0);
  const totalMax = pdcs.reduce((s, m) => s + m.roundsMax, 0);
  const set = (b: Partial<typeof burst>) => hudActions.setPdcBurst({ ...burst, ...b });
  return (
    <div className="pdc-status">
      {rg && (
        <>
          <div className="section-title">{rg.spinal ? "Spinal railgun" : "Railgun"}</div>
          <div className={`data-row ${rg.health <= 0 || rg.slugs === 0 ? "bad" : rg.rechargeS > 0 ? "dim" : "live"}`}>
            <span className="data-label">State</span>
            <span className="data-value mono">{railgunState(rg)}</span>
          </div>
          <div className={`data-row ${rg.slugs < 0.25 * rg.slugsMax ? "warn" : ""}`}>
            <span className="data-label">Slugs</span>
            <span className="data-value mono">
              {rg.slugs} / {rg.slugsMax}
            </span>
          </div>
          <div style={{ height: 12 }} />
        </>
      )}
      <div className="section-title">PDC</div>
      {pdcs.map((m, i) => {
        const tone = m.health <= 0 || m.rounds === 0 ? "bad" : m.rounds < 0.25 * m.roundsMax ? "warn" : m.firing ? "live" : "";
        const state = m.health <= 0 ? "DESTROYED" : m.rounds === 0 ? "EMPTY" : m.mode.toUpperCase();
        return (
          <div key={i} className={`data-row ${tone}`}>
            <span className="data-label">PDC {i + 1}</span>
            <span className="data-value mono">
              {state} · {group(m.rounds)}
            </span>
          </div>
        );
      })}
      <div className={`data-row ${total < 0.25 * totalMax ? "warn" : ""}`}>
        <span className="data-label">Rounds</span>
        <span className="data-value mono">
          {group(total)} / {group(totalMax)}
        </span>
      </div>
      <div className="burst-row" title="Burst fire for PDCs on Auto: rounds per burst, then a pause. Saves ammo; fewer kills.">
        <button className={`hud-btn ${burst.enabled ? "active" : ""}`} onClick={() => set({ enabled: !burst.enabled })}>
          Burst {burst.enabled ? "on" : "off"}
        </button>
        <span className="burst-field mono">
          <button className="hud-btn mono tiny" onClick={() => set({ rounds: step(BURST_ROUNDS, burst.rounds, -1) })}>−</button>
          {burst.rounds} RDS
          <button className="hud-btn mono tiny" onClick={() => set({ rounds: step(BURST_ROUNDS, burst.rounds, 1) })}>+</button>
        </span>
        <span className="burst-field mono">
          <button className="hud-btn mono tiny" onClick={() => set({ intervalS: step(BURST_GAPS, burst.intervalS, -1) })}>−</button>
          {burst.intervalS} S
          <button className="hud-btn mono tiny" onClick={() => set({ intervalS: step(BURST_GAPS, burst.intervalS, 1) })}>+</button>
        </span>
      </div>
    </div>
  );
}
