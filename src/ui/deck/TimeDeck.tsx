import { formatClock } from "../format";
import { hudActions, useHud } from "../store";
import { DeckPanel } from "./parts";

// Time (middle of the deck): a tick ruler with a pointer at the current compression (click a
// mark to jump there), the clock, and slower / pause / faster. Sound on or off sits in the band.
export function TimeDeck() {
  const hud = useHud();
  const steps = hud.compressionSteps;
  const i = hud.compressionIndex;
  const last = steps.length - 1;
  const sound = (
    <>
      <button onClick={() => hudActions.toggleMute()} title="Sound on or off (N)">
        SND <span className={hud.muted ? "off" : "on"}>{hud.muted ? "OFF" : "ON"}</span> · N
      </button>
      <span className="dk-sep"> │ </span>
      <button className="dk-set" onClick={() => hudActions.openSettings()} title="Settings: colors, reduce effects, sound">
        SET
      </button>
    </>
  );
  return (
    <DeckPanel side="mid" title="Time" code={sound}>
      <div className="t-wrap">
        <div className="t-ruler" title="Time compression ([ and ]). Click a mark to jump to it.">
          {/* Each speed's click zone is the whole slot around its tick, not just the number. */}
          <div className="marks" style={{ left: `${-50 / Math.max(1, last)}%`, right: `${-50 / Math.max(1, last)}%` }}>
            {steps.map((c, k) => (
              <button key={c} className={`mark ${k === i ? "on" : ""}`} onClick={() => hudActions.setCompression(k)} title={`${c}× time`}>
                {c}
              </button>
            ))}
          </div>
          <div className="ticks" />
          <div className="ptr" style={{ left: `${last > 0 ? (i / last) * 100 : 0}%` }} />
        </div>
        <div className="t-clock mono">
          <span className={`x ${hud.paused ? "paused" : ""}`}>{hud.paused ? "PAUSED" : `${steps[i]}×`}</span>
          <span>{formatClock(hud.simTime)}</span>
        </div>
        <div className="t-ctrl">
          <button className="sk" style={{ width: 58 }} disabled={i <= 0} onClick={() => hudActions.setCompression(i - 1)} title="Slower ([)">
            <span className="chevs">«‹</span>
          </button>
          <button className={`sk ${hud.paused ? "on" : ""}`} style={{ width: 104 }} onClick={() => hudActions.togglePause()} title="Pause and resume (Space). Orders still work while paused.">
            {hud.paused ? "RESUME" : "PAUSE"} <span className="key">␣</span>
          </button>
          <button className="sk" style={{ width: 58 }} disabled={i >= last} onClick={() => hudActions.setCompression(i + 1)} title="Faster (])">
            <span className="chevs">›»</span>
          </button>
        </div>
      </div>
    </DeckPanel>
  );
}
