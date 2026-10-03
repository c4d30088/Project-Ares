import { hudActions, useHud } from "./store";

const MODES = ["auto", "manual", "hold"] as const;
const LETTER = { auto: "A", manual: "M", hold: "H" } as const;
const NEXT = { auto: "manual", manual: "hold", hold: "auto" } as const;

// Point defense controls: a mode for all mounts at once, a chip per mount (click to cycle
// its mode; lit while it fires; amber when low on ammo, dim when destroyed), and D to
// assign every mount to a target.
export function PdcBar() {
  const hud = useHud();
  const pdcs = hud.pdcs;
  const disabled = !pdcs || pdcs.length === 0;
  const allMode = pdcs && pdcs.every((m) => m.mode === pdcs[0].mode) ? pdcs[0].mode : null;
  return (
    <div className="pdc-bar">
      <span className="weapons-label mono">PDC</span>
      <div className="btn-group" title="Mode for all PDCs">
        {MODES.map((m) => (
          <button key={m} disabled={disabled} className={`hud-btn ${allMode === m ? "active" : ""}`} onClick={() => hudActions.setPdcMode("all", m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="btn-group">
        {(pdcs ?? []).map((m, i) => (
          <button
            key={i}
            className={`hud-btn mono pdc-chip ${m.firing ? "firing" : ""} ${m.ammoFraction < 0.25 ? "low" : ""} ${m.health <= 0 ? "dead" : ""}`}
            disabled={m.health <= 0}
            onClick={() => hudActions.setPdcMode(i, NEXT[m.mode])}
            title={`PDC ${i + 1}: ${m.mode.toUpperCase()} · AMMO ${Math.round(m.ammoFraction * 100)}%${m.health <= 0 ? " · DESTROYED" : ""} (click to change mode)`}
          >
            {i + 1}
            {LETTER[m.mode]}
          </button>
        ))}
      </div>
      <button
        disabled={disabled}
        className={`hud-btn ${hud.orderMode === "pdcTarget" ? "active" : ""}`}
        onClick={() => hudActions.startOrder("pdcTarget")}
        title="Assign all PDCs to a target (D)"
      >
        Assign <span className="key">D</span>
      </button>
    </div>
  );
}
