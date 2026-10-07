import { useEffect, useState } from "react";
import { saveSettings, settings, UI_SCALE_MAX, UI_SCALE_MIN, type PaletteName } from "../game/settings";
import { setUiScale, UI_SCALE_STEP } from "./uiScale";
import { ACTIONS, bindable, defaultKeys, keyLabel, rebind, type ActionId, type KeyMap } from "../game/keymap";
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
  const [uiScale, setUiScaleState] = useState(settings.uiScale);
  // Cmd/Ctrl + and − also work while Settings is open; keep the slider in step.
  useEffect(() => {
    const sync = () => setUiScaleState(settings.uiScale);
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  const paletteChanged = pick !== settings.palette;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    // (While a key is being rebound, ControlsSection takes every key press first.)
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
            <div className="settings-head">Display</div>
            <div className="settings-row">
              <span className="settings-note">UI scale</span>
              <input
                type="range"
                aria-label="UI scale"
                min={UI_SCALE_MIN}
                max={UI_SCALE_MAX}
                step={UI_SCALE_STEP}
                value={uiScale}
                onChange={(e) => {
                  setUiScale(Number(e.target.value));
                  setUiScaleState(settings.uiScale);
                }}
              />
              <span className="mono settings-value">{Math.round(uiScale * 100)}%</span>
              <button
                className="hud-btn"
                disabled={uiScale === 1}
                onClick={() => {
                  setUiScale(1);
                  setUiScaleState(1);
                }}
              >
                100%
              </button>
            </div>
            <div className="settings-note">The size of the panels, not the table. Cmd + and Cmd − (Ctrl on Windows) change it anywhere; Cmd 0 puts it back.</div>
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
                Sound {muted ? "off" : "on"} <span className="key">{keyLabel(settings.keys.mute)}</span>
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

          <ControlsSection />
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

const GROUPS = [...new Set(ACTIONS.map((a) => a.group))];

/** Controls: every rebindable action with its key. Click one, press the new key. A key already
 *  in use swaps with it, so nothing is ever left without a key. Esc cancels; Esc, ` and Enter
 *  keep their fixed jobs. */
function ControlsSection() {
  const [keys, setKeys] = useState<KeyMap>({ ...settings.keys });
  const [listening, setListening] = useState<ActionId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const label = (id: ActionId) => ACTIONS.find((a) => a.id === id)!.label;

  const apply = (next: KeyMap) => {
    setKeys(next);
    saveSettings({ keys: next });
    hudActions.keysChanged();
  };

  useEffect(() => {
    if (!listening) return;
    // Capture phase: this runs before the Settings screen's Esc and the game's own keys.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(null);
        setMessage(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        setMessage("Keys with Cmd, Ctrl or Alt held stay with the browser. Pick a single key.");
        return;
      }
      if (!bindable(e.key)) {
        setMessage(`${keyLabel(e.key.toLowerCase())} keeps its fixed job. Pick another key.`);
        return;
      }
      const { map, swappedWith } = rebind(keys, listening, e.key);
      apply(map);
      setMessage(
        swappedWith
          ? `${label(listening)} is now ${keyLabel(map[listening])}. ${label(swappedWith)} had that key, so it moved to ${keyLabel(map[swappedWith])}.`
          : `${label(listening)} is now ${keyLabel(map[listening])}.`,
      );
      setListening(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });

  const changed = ACTIONS.some((a) => keys[a.id] !== defaultKeys[a.id]);
  return (
    <section>
      <div className="settings-head">Controls</div>
      <div className="settings-note" style={{ marginBottom: 8 }}>
        Click an action, then press its new key. Esc, ` (debug panel) and Enter keep their fixed jobs.
      </div>
      <div className="controls-grid">
        {GROUPS.map((g) => (
          <div key={g} className="controls-group">
            <div className="controls-group-name">{g}</div>
            {ACTIONS.filter((a) => a.group === g).map((a) => (
              <button
                key={a.id}
                className={`control-row ${listening === a.id ? "listening" : ""} ${keys[a.id] !== defaultKeys[a.id] ? "changed" : ""}`}
                onClick={() => {
                  setListening(listening === a.id ? null : a.id);
                  setMessage(null);
                }}
              >
                <span className="control-name">{a.label}</span>
                <span className="control-key mono">{listening === a.id ? "PRESS A KEY" : keyLabel(keys[a.id])}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="settings-row" style={{ marginTop: 10 }}>
        <span className="settings-note controls-message">{message ?? (listening ? `Press the new key for ${label(listening)}, or Esc to cancel.` : "")}</span>
        <button
          className="hud-btn"
          disabled={!changed}
          onClick={() => {
            apply({ ...defaultKeys });
            setMessage("All keys back to their defaults.");
          }}
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
}
