import { hudActions, useHud } from "./store";

// Sensors (M4 Sensors Lite): one switch. On finds dark ships and cold torpedoes nearby, but
// makes the ship visible at any range in line of sight.
export function SensorBar() {
  const s = useHud().activeShip;
  if (!s) return null;
  return (
    <div className="sensor-bar">
      <button
        className={`hud-btn ${s.sensorsOn ? "active" : ""}`}
        onClick={() => hudActions.toggleSensors()}
        title="Sensors on or off (S). On: find dark ships and cold torpedoes nearby, but you can be seen at any range."
      >
        Sensors {s.sensorsOn ? "on" : "off"} <span className="key">S</span>
      </button>
    </div>
  );
}
