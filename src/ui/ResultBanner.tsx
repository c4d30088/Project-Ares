import { formatClock } from "./format";
import { hudActions, type OutcomeInfo } from "./store";
import { Panel } from "./Panel";

/** Shown over the table when the fight is over. Time has stopped; the table stays visible behind it. */
export function ResultBanner(props: { outcome: OutcomeInfo }) {
  const o = props.outcome;
  return (
    <Panel className="result-banner">
      <div className={`result-title ${o.result}`}>{o.title}</div>
      <div className="result-detail mono">{o.detail}</div>
      <div className="result-time mono">AFTER {formatClock(o.timeS)}</div>
      <button className="result-ask" onClick={() => hudActions.openFeedback(true)}>
        How did that fight go? <span className="result-ask-cta">Tell us</span>
      </button>
      <div className="result-buttons">
        <button className="hud-btn active" onClick={() => hudActions.startReplay()} title="Watch the fight again, from either side's picture">
          REPLAY
        </button>
        <button className="hud-btn" onClick={() => hudActions.restart()}>
          RESTART
        </button>
        <button className="hud-btn" onClick={() => hudActions.backToSetup()}>
          BACK TO SETUP
        </button>
      </div>
    </Panel>
  );
}
