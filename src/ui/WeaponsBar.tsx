import { hudActions, useHud } from "./store";

const SALVOS = [1, 2, 4, 6];

// Torpedo controls: salvo size, hot or cold launch, and Launch (then pick the target the
// same way as a nav order). Torpedoes only ever fire on the player's order.
export function WeaponsBar() {
  const hud = useHud();
  const w = hud.weapons;
  const disabled = !w || w.tubes === 0;
  const empty = !!w && w.magazine === 0;
  return (
    <div className="weapons-bar">
      <span className="weapons-label mono" title="Torpedoes in the magazine · tubes ready">
        TORP {w ? w.magazine : "--"}
        {w && w.queued > 0 ? ` +${w.queued} QUEUED` : ""} · TUBES {w ? `${w.tubesReady}/${w.tubes}` : "--"}
      </span>
      <div className="btn-group" title="Salvo size">
        {SALVOS.map((n) => (
          <button key={n} disabled={disabled} className={`hud-btn mono ${w?.salvo === n ? "active" : ""}`} onClick={() => hudActions.setSalvo(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="btn-group" title="Hot: drive lights at launch. Cold: coasts dark, lights near the target.">
        {(["hot", "cold"] as const).map((m) => (
          <button key={m} disabled={disabled} className={`hud-btn ${w?.mode === m ? "active" : ""}`} onClick={() => hudActions.setLaunchMode(m)}>
            {m}
          </button>
        ))}
      </div>
      <button
        disabled={disabled || empty}
        className={`hud-btn ${hud.orderMode === "launch" ? "active" : ""}`}
        onClick={() => hudActions.startOrder("launch")}
        title="Launch torpedoes (L), then pick a target"
      >
        Launch <span className="key">L</span>
      </button>
    </div>
  );
}
