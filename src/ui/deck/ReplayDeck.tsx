import { useRef, useState } from "react";
import { formatClock } from "../format";
import { hudActions, useHud, type ReplayInfo } from "../store";
import { hotkey } from "../../game/settings";
import { DeckPanel } from "./parts";

const VIEWS: { id: ReplayInfo["view"]; label: string; tip: string }[] = [
  { id: "ours", label: "Our view", tip: "What our side knew at each moment, as you saw it in the fight." },
  { id: "theirs", label: "Their view", tip: "What the enemy knew: where they thought you were (orange LAST SEEN markers), in our colors." },
  { id: "all", label: "All", tip: "Where everything really was (God view)." },
];

/** Smallest real-time gap between two jumps while dragging the playhead, ms. */
const DRAG_SEEK_MS = 70;

// The after-action replay (M6), in place of the deck: a timeline with the fight's launches,
// hits, kills and losses marked on it (click or drag to jump), play and pause, speed, whose
// picture to show, and Exit.
export function ReplayDeck() {
  const hud = useHud();
  const r = hud.replay!;
  const track = useRef<HTMLDivElement>(null);
  const [dragT, setDragT] = useState<number | null>(null);
  const lastSeek = useRef(0);
  const t = dragT ?? r.t;
  const frac = r.endS > 0 ? Math.min(1, t / r.endS) : 0;
  const steps = hud.compressionSteps;
  const i = hud.compressionIndex;
  const atEnd = r.t >= r.endS - 0.05;

  const timeAt = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * r.endS;
  };
  const seek = (clientX: number, force = false) => {
    const s = timeAt(clientX);
    setDragT(s);
    const now = performance.now();
    if (force || now - lastSeek.current > DRAG_SEEK_MS) {
      lastSeek.current = now;
      hudActions.replaySeek(s);
    }
  };

  return (
    <DeckPanel side="mid" className="replay-deck" title="After-action replay" code={<button onClick={() => hudActions.exitReplay()}>EXIT REPLAY · ESC</button>}>
      <div className="rp-top">
        <div className="rp-controls">
          <button className="sk" style={{ width: 46 }} onClick={() => hudActions.replaySeek(0)} title="Back to the start">
            <span className="chevs">|«</span>
          </button>
          <button
            className={`sk ${hud.paused ? "on" : ""}`}
            style={{ width: 96 }}
            onClick={() => (atEnd ? hudActions.replaySeek(0) : hudActions.togglePause())}
            title={`Play or pause (${hotkey("pause")})`}
          >
            {atEnd ? "AGAIN" : hud.paused ? "PLAY" : "PAUSE"}
          </button>
          <button className="sk" style={{ width: 40 }} disabled={i <= 0} onClick={() => hudActions.setCompression(i - 1)} title={`Slower (${hotkey("slower")})`}>
            <span className="chevs">«‹</span>
          </button>
          <span className="rp-speed mono">{steps[i]}×</span>
          <button className="sk" style={{ width: 40 }} disabled={i >= steps.length - 1} onClick={() => hudActions.setCompression(i + 1)} title={`Faster (${hotkey("faster")})`}>
            <span className="chevs">›»</span>
          </button>
        </div>
        <div className="rp-clock mono">
          <span className="rp-now">{formatClock(t)}</span>
          <span className="dim"> / {formatClock(r.endS)}</span>
        </div>
        <div className="tabs rp-views">
          {VIEWS.map((v) => (
            <button key={v.id} className={`tab ${r.view === v.id ? "on" : ""}`} onClick={() => hudActions.replaySetView(v.id)} title={v.tip}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={track}
        className="rp-track"
        title="Click or drag to jump to a moment"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX, true);
        }}
        onPointerMove={(e) => {
          if (dragT !== null) seek(e.clientX);
        }}
        onPointerUp={(e) => {
          seek(e.clientX, true);
          setDragT(null);
        }}
      >
        <div className="rp-ticks" />
        <div className="rp-fill" style={{ width: `${frac * 100}%` }} />
        {r.marks.map((m, k) => (
          <span key={k} className={`rp-mark ${m.tone}`} style={{ left: `${(m.t / Math.max(1e-9, r.endS)) * 100}%` }} title={`${formatClock(m.t)}  ${m.text}`} />
        ))}
        <div className="rp-head" style={{ left: `${frac * 100}%` }} />
      </div>
    </DeckPanel>
  );
}
