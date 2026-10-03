import "@fontsource/oxanium/400.css";
import "@fontsource/oxanium/600.css";
import "@fontsource/share-tech-mono/400.css";
import "./hud.css";
import { palette } from "../render/palette";
import { Panel } from "./Panel";

// HUD shell. Panels are empty frames in M1; later milestones fill them.
export function Hud() {
  return (
    <div className="hud">
      <Panel className="alert-strip">
        <span className="mono" style={{ color: palette.textDim }}>NO ALERTS</span>
      </Panel>
      <Panel className="rail-left" title="Own ship">
        <div className="panel-empty">Status systems offline</div>
      </Panel>
      <Panel className="rail-right" title="Contacts">
        <div className="panel-empty">Contact list offline</div>
      </Panel>
      <Panel className="bottom-bar" title="Orders" />
    </div>
  );
}
