import "@fontsource/oxanium/400.css";
import "@fontsource/oxanium/600.css";
import "@fontsource/share-tech-mono/400.css";
import "./hud.css";
import { useEffect, useState } from "react";
import { personalityLabels, personalityPresets, type PersonalityName } from "../data/ai";
import { rangePhaseLabels, skirmishMaps, skirmishQuery } from "../data/skirmish";
import { scenarios } from "../data/scenarios";
import { Panel } from "./Panel";
import { SettingsScreen } from "./SettingsScreen";

const PERSONALITIES = Object.keys(personalityPresets) as PersonalityName[];

const personalityBlurbs: Record<PersonalityName, string> = {
  hunter: "Presses in close, fires big salvos often, and fights on through damage.",
  duelist: "Holds mid-range and trades fairly. Evades when torpedoes are about to land.",
  skulker: "Stands off, hides behind rocks, evades early, and breaks off when hurt.",
};

const bars: { key: keyof (typeof personalityPresets)["hunter"]; label: string }[] = [
  { key: "aggression", label: "AGGRESSION" },
  { key: "caution", label: "CAUTION" },
  { key: "emissionsDiscipline", label: "QUIET" },
];

/** The first screen: pick a map, how many enemies, and how they fly. Start reloads the page
 *  with the choice in its address, which is also how a skirmish can be linked to. */
export function SetupScreen() {
  const [mapId, setMapId] = useState(skirmishMaps[0].id);
  const [enemies, setEnemies] = useState<1 | 2>(1);
  const [personality, setPersonality] = useState<PersonalityName>("duelist");
  const [showSettings, setShowSettings] = useState(false);
  const map = skirmishMaps.find((m) => m.id === mapId)!;
  const start = () => {
    location.search = skirmishQuery({ map: mapId, enemies, personality });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !showSettings) start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="setup-scrim">
      <Panel className="setup-panel" title="Skirmish setup">
        <div className="setup-body">
          <section>
            <div className="section-title">MAP</div>
            <div className="setup-cards">
              {skirmishMaps.map((m) => (
                <button key={m.id} className={`setup-card ${m.id === mapId ? "active" : ""}`} onClick={() => setMapId(m.id)}>
                  <span className="setup-card-name">{m.name}</span>
                  <span className="setup-card-phase mono">{rangePhaseLabels[m.phase]}</span>
                </button>
              ))}
            </div>
            <div className="setup-blurb">{map.blurb}</div>
          </section>

          <section>
            <div className="section-title">ENEMY SHIPS</div>
            <div className="btn-group">
              {([1, 2] as const).map((n) => (
                <button key={n} className={`hud-btn mono ${n === enemies ? "active" : ""}`} onClick={() => setEnemies(n)}>
                  1 v {n}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="section-title">AI CAPTAIN</div>
            <div className="btn-group">
              {PERSONALITIES.map((p) => (
                <button key={p} className={`hud-btn ${p === personality ? "active" : ""}`} onClick={() => setPersonality(p)}>
                  {personalityLabels[p]}
                </button>
              ))}
            </div>
            <div className="setup-blurb">{personalityBlurbs[personality]}</div>
            <div className="setup-bars">
              {bars.map((b) => (
                <div key={b.key} className="setup-bar mono">
                  <span>{b.label}</span>
                  <span className="meter">
                    <span style={{ width: `${Math.round(personalityPresets[personality][b.key] * 100)}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="setup-start">
            <button className="hud-btn active setup-go" onClick={start}>
              START <span className="key">ENTER</span>
            </button>
            <button className="hud-btn setup-settings" onClick={() => setShowSettings(true)}>
              Settings
            </button>
          </div>

          <section className="setup-other">
            <div className="section-title">OTHER SCENARIOS</div>
            <div className="setup-others">
              {Object.keys(scenarios).map((name) => (
                <button key={name} className="hud-btn mono" onClick={() => (location.search = `?scenario=${name}`)}>
                  {name}
                </button>
              ))}
            </div>
          </section>
        </div>
      </Panel>
      <div className="build-stamp mono" title="Which build this is: name it in a playtest report">
        BUILD {__BUILD__}
      </div>
      {showSettings && <SettingsScreen inFight={false} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
