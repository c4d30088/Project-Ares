import { useEffect, useState } from "react";
import { saveSettings, settings, type PaletteName } from "../game/settings";
import { paletteNames, palettes, type PaletteToken } from "../render/palette";
import { Panel } from "./Panel";
import { hudActions } from "./store";

/** The colors that carry meaning, shown on each palette card. */
const SWATCHES: { token: PaletteToken; label: string }[] = [
  { token: "friendly", label: "Ours" },
  { token: "hostile", label: "Hostile" },
  { token: "fireFriendly", label: "Our fire" },
  { token: "fireHostile", label: "Their fire" },
  { token: "uncertainMap", label: "Lost / warning" },
  { token: "neutral", label: "Neutral" },
];

const PALETTE_BLURB: Record<PaletteName, string> = {
  standard: "The game's own colors.",
  redGreen: "For red-green color blindness (the most common kind): hostile leans pink, enemy fire is pure yellow, and lost contacts a deeper orange.",
  blueYellow: "For blue-yellow color blindness: our ships a deeper blue, enemy fire a softer gold.",
};

/** The player's Settings (M6 accessibility): color palette, reduce effects, sound. Opened from
 *  SET in the Time panel or from the setup screen; the game pauses while it is open. */
export function SettingsScreen(props: { onClose(): void; inFight: boolean }) {
  const [pick, setPick] = useState<PaletteName>(settings.palette);
  const [reduce, setReduce] = useState(settings.reduceEffects);
  const [volume, setVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(settings.muted);
  const paletteChanged = pick !== settings.palette;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div className="settings-scrim" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <Panel className="settings-panel" title="Settings">
        <div className="settings-body">
          <section>
            <div className="settings-head">Colors</div>
            <div className="palette-cards">
              {(Object.keys(palettes) as PaletteName[]).map((name) => (
                <button key={name} className={`palette-card ${pick === name ? "active" : ""}`} onClick={() => setPick(name)}>
                  <span className="palette-name">
                    {paletteNames[name]}
                    {settings.palette === name && <span className="palette-now"> · in use</span>}
                  </span>
                  <span className="swatches">
                    {SWATCHES.map((s) => (
                      <span key={s.token} className="swatch">
                        <span className="chip" style={{ background: palettes[name][s.token], boxShadow: `0 0 8px ${palettes[name][s.token]}` }} />
                        <span className="chip-label">{s.label}</span>
                      </span>
                    ))}
                  </span>
                  <span className="palette-blurb">{PALETTE_BLURB[name]}</span>
                </button>
              ))}
            </div>
            {paletteChanged && (
              <div className="settings-apply">
                <span className="settings-note">
                  {props.inFight ? "Changing colors reloads the game: this fight restarts from the beginning." : "Changing colors reloads the game."}
                </span>
                <button
                  className="hud-btn active"
                  onClick={() => {
                    saveSettings({ palette: pick });
                    location.reload();
                  }}
                >
                  Apply colors
                </button>
              </div>
            )}
          </section>

          <section>
            <div className="settings-head">Effects</div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                aria-label="Reduce effects"
                checked={reduce}
                onChange={(e) => {
                  setReduce(e.target.checked);
                  saveSettings({ reduceEffects: e.target.checked });
                }}
              />
              <span>
                <span className="toggle-name">Reduce effects</span>
                <span className="settings-note">
                  No hit flicker, color split or dust; half the glow; alerts, torpedoes and log lines stop pulsing and flashing. Shapes, text and colors stay the same.
                </span>
              </span>
            </label>
          </section>

          <section>
            <div className="settings-head">Sound</div>
            <div className="settings-row">
              <button
                className={`hud-btn ${muted ? "" : "active"}`}
                onClick={() => {
                  hudActions.toggleMute();
                  setMuted(settings.muted);
                }}
              >
                Sound {muted ? "off" : "on"} <span className="key">N</span>
              </button>
              <span className="settings-note">Volume</span>
              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  saveSettings({ volume: v });
                  hudActions.applyVolume();
                }}
              />
              <span className="mono settings-value">{Math.round(volume * 100)}%</span>
            </div>
          </section>

          <section>
            <div className="settings-head">Controls</div>
            <div className="settings-note">Rebinding keys comes next (M6 step 5).</div>
          </section>
        </div>
        <div className="settings-foot">
          <span className="settings-note">Saved in this browser.</span>
          <button className="hud-btn" onClick={props.onClose}>
            Close <span className="key">Esc</span>
          </button>
        </div>
      </Panel>
    </div>
  );
}
