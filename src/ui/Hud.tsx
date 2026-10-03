import "@fontsource/oxanium/400.css";
import "@fontsource/oxanium/600.css";
import "@fontsource/share-tech-mono/400.css";
import "./hud.css";
import { palette } from "../render/palette";
import { Panel } from "./Panel";
import { TimeControls } from "./TimeControls";
import { OrderBar } from "./OrderBar";
import { NavStatus } from "./NavStatus";
import { WeaponsBar } from "./WeaponsBar";
import { PdcBar } from "./PdcBar";
import { formatCountdown } from "./format";
import { useHud } from "./store";

// HUD shell. Panels are empty frames in M1; later milestones fill them.
export function Hud() {
  const hud = useHud();
  return (
    <div className="hud">
      <Panel className="alert-strip">
        {hud.impactIn !== null && (
          <span className="mono alert threat">IMPACT T-{formatCountdown(hud.impactIn)}</span>
        )}
        {hud.launchDetected && <span className="mono alert threat blink">LAUNCH DETECTED</span>}
        {hud.notice && <span className="mono alert" style={{ color: palette.uncertain }}>{hud.notice}</span>}
        {hud.impactIn === null && !hud.launchDetected && !hud.notice && (
          <span className="mono" style={{ color: palette.textDim }}>NO ALERTS</span>
        )}
      </Panel>
      <Panel className="rail-left" title="Own ship">
        <NavStatus />
      </Panel>
      <Panel className="rail-right" title="Contacts">
        <div className="panel-empty">Contact list offline</div>
      </Panel>
      {hud.hint && <div className="order-hint mono">{hud.hint}</div>}
      <Panel className="bottom-bar">
        <OrderBar />
        <TimeControls />
        <div className="bottom-row">
          <WeaponsBar />
          <PdcBar />
        </div>
      </Panel>
    </div>
  );
}
