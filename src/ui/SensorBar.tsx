import { hudActions, useHud } from "./store";

// Staying alive (M4 Sensors Lite): the Sensors switch (on finds dark ships and cold torpedoes
// nearby, but makes the ship visible at any range in line of sight), Evade (one slight bend
// in the route) and Evasive maneuvers (a corkscrew that cancels the route).
export function SensorBar() {
  const s = useHud().activeShip;
  if (!s) return null;
  return (
    <div className="sensor-bar btn-group">
      <button
        className={`hud-btn ${s.sensorsOn ? "active" : ""}`}
        onClick={() => hudActions.toggleSensors()}
        title="Sensors on or off (S). On: find dark ships and cold torpedoes nearby, but you can be seen at any range."
      >
        Sensors {s.sensorsOn ? "on" : "off"} <span className="key">S</span>
      </button>
      <button
        className={`hud-btn ${s.evading ? "active" : ""}`}
        onClick={() => hudActions.startOrder("evade")}
        title="Evade (E): bend the current route slightly for a while; you still arrive where you were going"
      >
        Evade <span className="key">E</span>
      </button>
      <button
        className={`hud-btn ${s.order === "evasive" ? "active" : ""}`}
        onClick={() => hudActions.startOrder("evasive")}
        title="Evasive maneuvers (V): cancel the route and corkscrew at your G setting. Spoils railgun shots; sweeps your PDC arcs."
      >
        Evasive <span className="key">V</span>
      </button>
    </div>
  );
}
