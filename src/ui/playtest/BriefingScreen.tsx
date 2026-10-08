import { useState } from "react";
import { cleanGamerTag, LIMITS } from "../../feedback/note";
import { saveSettings, settings } from "../../game/settings";
import { Panel } from "../Panel";

/** The playtest briefing (owner, M6): what the playtest is and how to send feedback, and the
 *  tester's gamer tag. Deliberately no controls: where a new player gets stuck is what the
 *  playtest measures (ROADMAP M6 checkpoint). */
export function BriefingScreen(props: { onDone(): void; onSettings(): void }) {
  const [tag, setTag] = useState(settings.gamerTag ?? "");
  const clean = cleanGamerTag(tag);
  const done = () => {
    if (!clean) return;
    saveSettings({ gamerTag: clean, briefed: true });
    props.onDone();
  };
  return (
    <div className="setup-scrim">
      <Panel className="briefing-panel" title="Playtest briefing">
        <div className="briefing-body">
          <p className="briefing-lead">
            Thanks for testing Project Ares. This is an early build of a tactical space game: you command a warship from a holographic table.
            Nothing is finished, and that is the point.
          </p>

          <section>
            <div className="section-title">What we're asking</div>
            <ul className="briefing-list">
              <li>
                <b>We won't explain how to play.</b> Working it out is part of the test: where you get stuck tells us what to fix. If you can't find
                something, that's useful, not your fault.
              </li>
              <li>
                <b>Play a few skirmishes.</b> Try anything. Losing is fine. A fight can take a while; there are ways to speed up time.
              </li>
              <li>
                <b>Tell us things as they happen.</b> Press <span className="briefing-key">FEEDBACK</span> (top right, any time). The game pauses while
                you write. Short notes are perfect: "couldn't find how to fire", "that was intense", "what does the orange marker mean?"
              </li>
              <li>
                <b>After each fight</b> you'll be asked how it went. A sentence is plenty.
              </li>
            </ul>
          </section>

          <section>
            <div className="section-title">Your gamer tag</div>
            <div className="briefing-tag">
              <input
                className="text-field mono"
                aria-label="Gamer tag"
                autoFocus
                maxLength={LIMITS.gamerTag}
                placeholder="e.g. Nova_7"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") done();
                }}
              />
              <span className={`settings-note ${tag && !clean ? "warn-text" : ""}`}>
                {tag && !clean ? "2 to 24 letters, numbers, spaces, _ - or ." : "Any name you like. Please don't use your real name."}
              </span>
            </div>
          </section>

          <section className="briefing-privacy">
            <div className="section-title">What gets sent</div>
            <div className="settings-note">
              Only when you send feedback: your gamer tag, what you write, and game details (which map, the result and length of the fight, the
              build, your screen size and display settings). No name, no email, nothing else. Your gamer tag and settings stay in this browser.
            </div>
          </section>
        </div>
        <div className="settings-foot">
          <button className="hud-btn" onClick={props.onSettings}>
            Settings
          </button>
          <button className="hud-btn active setup-go" disabled={!clean} onClick={done}>
            Begin <span className="key">ENTER</span>
          </button>
        </div>
      </Panel>
    </div>
  );
}
