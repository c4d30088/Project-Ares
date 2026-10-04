import { formatCountdown } from "./format";
import { useHud } from "./store";

/** Right rail: everything that has happened, newest first, each line with the time it
 *  happened. Similar lines that follow each other are merged (see game/alertLog.ts). */
export function AlertLog() {
  const log = useHud().alertLog;
  if (!log.length) return <div className="panel-empty">Nothing yet</div>;
  return (
    <div className="alert-log">
      {[...log].reverse().map((e) => (
        <div key={e.id} className={`log-row ${e.tone}`}>
          <span className="log-time mono">{formatCountdown(Math.floor(e.t))}</span>
          <span className="log-text">{e.text}</span>
        </div>
      ))}
    </div>
  );
}
