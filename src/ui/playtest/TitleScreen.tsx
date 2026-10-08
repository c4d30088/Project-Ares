import { useEffect } from "react";

/** The first thing a tester sees: the name, the build, and "press any key". The paused table
 *  glows behind it. Any key or click goes on (the browser also needs that first touch before
 *  it allows sound). */
export function TitleScreen(props: { onContinue(): void }) {
  useEffect(() => {
    const go = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "`") return; // browser shortcuts, the debug panel
      e.preventDefault();
      props.onContinue();
    };
    window.addEventListener("keydown", go);
    return () => window.removeEventListener("keydown", go);
  }, [props]);
  return (
    <div className="title-scrim" onClick={props.onContinue}>
      <div className="title-block">
        <div className="title-over">Playtest build</div>
        <h1 className="title-name">Project Ares</h1>
        <div className="title-rule" />
        <div className="title-tag">Command a warship from the holotable</div>
      </div>
      <div className="title-press">Press any key or click to begin</div>
      <div className="build-stamp mono">BUILD {__BUILD__}</div>
    </div>
  );
}
