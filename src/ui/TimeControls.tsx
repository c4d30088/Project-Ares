import { formatClock } from "./format";
import { hudActions, useHud } from "./store";

export function TimeControls() {
  const hud = useHud();
  return (
    <div className="time-controls">
      <button
        className={`hud-btn ${hud.paused ? "active warn" : ""}`}
        onClick={() => hudActions.togglePause()}
        title="Pause (Space)"
      >
        {hud.paused ? "PAUSED" : "PAUSE"}
      </button>
      <div className="btn-group" title="Time compression ([ and ])">
        {hud.compressionSteps.map((c, i) => (
          <button
            key={c}
            className={`hud-btn mono ${i === hud.compressionIndex ? "active" : ""}`}
            onClick={() => hudActions.setCompression(i)}
          >
            {c}x
          </button>
        ))}
      </div>
      <span className="clock mono">{formatClock(hud.simTime)}</span>
      <button className={`hud-btn ${hud.muted ? "warn" : ""}`} onClick={() => hudActions.toggleMute()} title="Sound on or off (N)">
        {hud.muted ? "SOUND OFF" : "SOUND"}
      </button>
    </div>
  );
}
