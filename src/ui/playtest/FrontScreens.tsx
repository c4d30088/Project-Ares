import { useState } from "react";
import { settings } from "../../game/settings";
import { SettingsScreen } from "../SettingsScreen";
import { SetupScreen } from "../SetupScreen";
import { BriefingScreen } from "./BriefingScreen";
import { TitleScreen } from "./TitleScreen";

/** What the bare address shows (playtest, M6): the title, then the playtest briefing on a
 *  first visit (or until a gamer tag is set), then the skirmish setup. Direct ?skirmish= and
 *  ?scenario= links skip all of it. */
export function FrontScreens() {
  const [stage, setStage] = useState<"title" | "briefing" | "setup">("title");
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (stage === "title") return <TitleScreen onContinue={() => setStage(settings.briefed && settings.gamerTag ? "setup" : "briefing")} />;
  if (stage === "briefing") {
    return (
      <>
        <BriefingScreen onDone={() => setStage("setup")} onSettings={() => setSettingsOpen(true)} />
        {settingsOpen && <SettingsScreen inFight={false} onClose={() => setSettingsOpen(false)} />}
      </>
    );
  }
  return <SetupScreen onBriefing={() => setStage("briefing")} />;
}
