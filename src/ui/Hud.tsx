import "@fontsource/oxanium/400.css";
import "@fontsource/oxanium/600.css";
import "@fontsource/share-tech-mono/400.css";
import "./hud.css";
import "./deck/deck.css";
import { palette } from "../render/palette";
import { Panel } from "./Panel";
import { NavStatus } from "./NavStatus";
import { ShipStatus } from "./ShipStatus";
import { AlertLog } from "./AlertLog";
import { ResultBanner } from "./ResultBanner";
import { WeaponsDeck } from "./deck/WeaponsDeck";
import { HelmDeck } from "./deck/HelmDeck";
import { TimeDeck } from "./deck/TimeDeck";
import { ReplayDeck } from "./deck/ReplayDeck";
import { useDeckFit } from "./deck/fit";
import { formatCountdown } from "./format";
import { hudActions, useHud } from "./store";
import { SettingsScreen } from "./SettingsScreen";
import { FeedbackButton, FeedbackForm } from "./playtest/FeedbackForm";
import { noteContext } from "../feedback/context";
import { waitingCount } from "../feedback/send";
import { useRef } from "react";

/** Alerts shown at once in the top strip (most urgent first). */
const MAX_ALERTS = 3;

// HUD shell. Panels are empty frames in M1; later milestones fill them.
export function Hud() {
  const hud = useHud();
  useDeckFit(!!hud.replay);
  // The strip flashes red once when a danger alert appears that was not there before.
  const seenThreats = useRef(new Set<string>());
  const flash = useRef(0);
  const threats = hud.alerts.filter((a) => a.tone === "threat").map((a) => a.text);
  if (threats.some((t) => !seenThreats.current.has(t))) flash.current++;
  seenThreats.current = new Set(threats);
  return (
    <div className="hud">
      <Panel className="alert-strip">
        {flash.current > 0 && <div key={flash.current} className="strip-flash" />}
        {hud.alerts.slice(0, MAX_ALERTS).map((a) => (
          <span key={a.text} className={`mono alert ${a.tone} ${a.blink ? "blink" : ""} ${a.countdown !== undefined && a.countdown < 10 ? "urgent" : ""}`}>
            {a.text}
            {a.countdown !== undefined ? ` T-${formatCountdown(a.countdown)}` : ""}
          </span>
        ))}
        {hud.alerts.length > MAX_ALERTS && <span className="mono alert warn">+{hud.alerts.length - MAX_ALERTS}</span>}
        {hud.notice && <span className="mono alert" style={{ color: palette.uncertain }}>{hud.notice}</span>}
        {hud.alerts.length === 0 && !hud.notice && <span className="mono" style={{ color: palette.textDim }}>NO ALERTS</span>}
      </Panel>
      <Panel className="rail-left" title="Own ship">
        <NavStatus />
        <ShipStatus />
      </Panel>
      <Panel className="rail-right" title="Alert log">
        <AlertLog />
      </Panel>
      {hud.hint && <div className="order-hint mono">{hud.hint}</div>}
      {hud.outcome && !hud.replay && <ResultBanner outcome={hud.outcome} />}
      {hud.settingsOpen && <SettingsScreen inFight onClose={() => hudActions.closeSettings()} />}
      {!hud.feedback && !hud.settingsOpen && <FeedbackButton onClick={() => hudActions.openFeedback(false)} waiting={waitingCount()} />}
      {hud.feedback && (
        <FeedbackForm
          prompted={hud.feedback.prompted}
          context={noteContext({ simTime: hud.simTime, result: hud.outcome?.title ?? null, replay: !!hud.replay })}
          onClose={() => hudActions.closeFeedback()}
        />
      )}
      {/* The bottom deck: weapons, time, helm; during a replay, the replay controls. */}
      {hud.replay ? (
        <ReplayDeck />
      ) : (
        <>
          <WeaponsDeck />
          <TimeDeck />
          <HelmDeck />
        </>
      )}
    </div>
  );
}
