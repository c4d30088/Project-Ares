import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, cleanGamerTag, LIMITS, type Category, type NoteContext } from "../../feedback/note";
import { sendNote } from "../../feedback/send";
import { saveSettings, settings } from "../../game/settings";
import { formatClock } from "../format";
import { Panel } from "../Panel";

/** Playtest feedback (owner, M6): quick tags, a few words, and the game details attached
 *  automatically. Opened from FEEDBACK (any time) or after a fight ("How did that fight go?").
 *  The game is paused while it is open. */
export function FeedbackForm(props: { prompted: boolean; context: NoteContext; onClose(): void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [text, setText] = useState("");
  const [tag, setTag] = useState(settings.gamerTag ?? "");
  const [editTag, setEditTag] = useState(!settings.gamerTag);
  const [status, setStatus] = useState<null | "sending" | "sent" | "queued" | { refused: string }>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const cleanTag = cleanGamerTag(tag);
  const canSend = !!cleanTag && (text.trim().length > 0 || cats.length > 0) && status !== "sending";

  useEffect(() => {
    if (!editTag) area.current?.focus();
  }, [editTag]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const send = async () => {
    if (!canSend || !cleanTag) return;
    if (cleanTag !== settings.gamerTag) saveSettings({ gamerTag: cleanTag });
    setStatus("sending");
    const r = await sendNote({ gamerTag: cleanTag, categories: cats, text: text.trim(), context: props.context, writtenAt: new Date().toISOString(), prompted: props.prompted });
    setStatus(r);
    if (r === "sent" || r === "queued") setTimeout(props.onClose, r === "sent" ? 1100 : 2600);
  };

  const c = props.context;
  const details = [c.where, c.fightTimeS !== undefined ? `${formatClock(c.fightTimeS)} in` : null, c.result, c.replay ? "watching the replay" : null, `build ${c.build}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="settings-scrim" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <Panel className="feedback-panel" title={props.prompted ? "How did that fight go?" : "Playtest feedback"}>
        <div className="feedback-body">
          <div className="settings-note">
            {props.prompted
              ? "Anything that confused you, felt good or felt wrong. A sentence is plenty."
              : "What's on your mind? Something confusing, a bug, a moment that felt great or wrong, an idea."}
          </div>
          <div className="feedback-chips">
            {CATEGORIES.map((k) => (
              <button
                key={k}
                className={`palette-card feedback-chip ${cats.includes(k) ? "active" : ""}`}
                onClick={() => setCats(cats.includes(k) ? cats.filter((x) => x !== k) : [...cats, k])}
              >
                {CATEGORY_LABELS[k]}
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            className="text-field feedback-text"
            aria-label="Your feedback"
            maxLength={LIMITS.text}
            placeholder="Write as much or as little as you like."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
          />
          <div className="feedback-meta">
            <span className="settings-note">
              From{" "}
              {editTag ? (
                <input className="text-field mono feedback-tag" aria-label="Gamer tag" maxLength={LIMITS.gamerTag} value={tag} placeholder="your gamer tag" onChange={(e) => setTag(e.target.value)} />
              ) : (
                <>
                  <b className="mono">{tag}</b>{" "}
                  <button className="link-btn" onClick={() => setEditTag(true)}>
                    change
                  </button>
                </>
              )}
            </span>
            <span className="settings-note mono">
              {text.length} / {LIMITS.text}
            </span>
          </div>
          <div className="settings-note feedback-details">Sent with: {details}</div>
        </div>
        <div className="settings-foot">
          <span className={`settings-note ${typeof status === "object" && status ? "warn-text" : status === "sent" ? "good-text" : ""}`}>
            {status === "sending"
              ? "Sending…"
              : status === "sent"
                ? "Sent. Thank you!"
                : status === "queued"
                  ? "Saved. It will be sent when the connection is back."
                  : status && typeof status === "object"
                    ? `Not sent: ${status.refused}`
                    : "Cmd/Ctrl + Enter sends."}
          </span>
          <span className="feedback-buttons">
            <button className="hud-btn" onClick={props.onClose}>
              Cancel <span className="key">ESC</span>
            </button>
            <button className="hud-btn active" disabled={!canSend} onClick={() => void send()}>
              Send
            </button>
          </span>
        </div>
      </Panel>
    </div>
  );
}

/** The always-there FEEDBACK button (top right). Shows how many notes wait to be sent. */
export function FeedbackButton(props: { onClick(): void; waiting: number }) {
  return (
    <button className="hud-btn feedback-btn" onClick={props.onClick} title="Tell us what you think: the game pauses while you write">
      Feedback{props.waiting > 0 ? ` · ${props.waiting} waiting` : ""}
    </button>
  );
}
