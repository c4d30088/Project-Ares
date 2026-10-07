// Building blocks of the bottom deck (M6, owner's pick "D: console deck"), after the UX
// references: a title band and tick ruler on every panel, stations bracketed like the airlock
// panels, big square action tiles beside small key grids, gauges as a tick ruler over a filled
// bar, order tiles with a status line, slanted tabs.

import type { ReactNode } from "react";

/** A deck panel: title band, tick ruler, then the contents. */
export function DeckPanel(props: { side: "left" | "right" | "mid"; title: string; code?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`dk ${props.side} ${props.className ?? ""}`}>
      <div className="dk-band">
        <span>{props.title}</span>
        {props.code !== undefined && <span className="dk-code mono">{props.code}</span>}
      </div>
      <div className="dk-ruler" />
      <div className="dk-body">{props.children}</div>
    </div>
  );
}

/** A group of controls inside angled side brackets. */
export function Station(props: { title: string; width?: number; children: ReactNode }) {
  return (
    <div className="stn" style={props.width ? { width: props.width } : undefined}>
      <div className="stn-title">{props.title}</div>
      {props.children}
    </div>
  );
}

/** A big square action tile: name, its key, and a line of state underneath. */
export function Tile(props: {
  name: string;
  hotkey?: string;
  sub?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  tone?: "ready" | "warn" | "bad";
  wide?: boolean;
  short?: boolean;
  title: string;
  onClick(): void;
}) {
  return (
    <button
      className={`tile ${props.active ? "on" : ""} ${props.tone ?? ""} ${props.wide ? "wide" : ""} ${props.short ? "short" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
    >
      {props.hotkey && <span className="t-key">{props.hotkey}</span>}
      <span className="t-name">{props.name}</span>
      {props.sub !== undefined && <span className="t-sub mono">{props.sub}</span>}
    </button>
  );
}

/** A grid of small square keys. */
export function Keys(props: { cols: number; children: ReactNode }) {
  return (
    <div className="keys" style={{ gridTemplateColumns: `repeat(${props.cols}, auto)` }}>
      {props.children}
    </div>
  );
}

export function Key(props: { on?: boolean; tone?: "firing" | "warn" | "bad"; disabled?: boolean; title?: string; onClick(): void; children: ReactNode }) {
  return (
    <button className={`k mono ${props.on ? "on" : ""} ${props.tone ?? ""}`} disabled={props.disabled} title={props.title} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

/** A gauge: label and figure above a tick ruler over a filled bar with the value inside. */
export function Gauge(props: { label: string; right?: ReactNode; frac: number; value: ReactNode; tone?: "charging" | "warn" | "bad"; title?: string }) {
  const f = Math.max(0, Math.min(1, props.frac));
  return (
    <div className={`gauge ${props.tone ?? ""}`} title={props.title}>
      <div className="g-lab">
        <span>{props.label}</span>
        {props.right !== undefined && <span className="mono">{props.right}</span>}
      </div>
      <div className="g-ticks" />
      <div className="g-bar">
        <span className="g-fill" style={{ width: `calc(${f * 100}% - 2px)` }} />
        <span className="g-val mono">{props.value}</span>
      </div>
    </div>
  );
}

/** An order tile: label, key, and a status line that lights while the order runs. */
export function OrderTile(props: { label: string; hotkey: string; running?: boolean; placing?: boolean; warn?: boolean; disabled?: boolean; title: string; onClick(): void }) {
  return (
    <button
      className={`ot ${props.running ? "running" : ""} ${props.placing ? "on" : ""} ${props.warn ? "warn" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
    >
      <span className="o-key mono">{props.hotkey}</span>
      {props.label}
      <span className="o-line" />
    </button>
  );
}

/** One of a stack of slanted tabs (a setting: one tab lit). */
export function Tab(props: { label: string; hotkey?: string; on?: boolean; warn?: boolean; disabled?: boolean; title?: string; onClick(): void }) {
  return (
    <button className={`tab ${props.on ? "on" : ""} ${props.warn ? "warn" : ""}`} disabled={props.disabled} title={props.title} onClick={props.onClick}>
      {props.label}
      {props.hotkey && <span className="key">{props.hotkey}</span>}
    </button>
  );
}
