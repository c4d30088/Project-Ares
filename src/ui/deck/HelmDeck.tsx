import { formatCountdown } from "../format";
import { hudActions, useHud, type ActiveShipInfo } from "../store";
import { DeckPanel, OrderTile, Station, Tab, Tile } from "./parts";
import { hotkey } from "../../game/settings";
import type { ActionId } from "../../game/keymap";

interface OrderDef {
  kind: ActionId;
  label: string;
  tip: string;
  warn?: boolean;
  /** Whether this order is the one the ship is flying now. */
  running(s: ActiveShipInfo): boolean;
}

// Two rows: travel on top, holding and dodging below.
const ORDERS: OrderDef[] = [
  { kind: "burnTo", label: "Burn to", tip: "Burn to a point you place (click the plane, drag for height).", running: (s) => s.order === "burnTo" },
  { kind: "rendezvous", label: "Intercept", tip: "Rendezvous: arrive alongside a target, at its speed.", running: (s) => s.order === "intercept" && s.interceptMode === "rendezvous" },
  { kind: "fastPass", label: "Fast pass", tip: "Fly past a target at speed, without braking.", running: (s) => s.order === "intercept" && s.interceptMode === "fastPass" },
  { kind: "orbit", label: "Orbit", tip: "Orbit a body (click a moon or asteroid).", running: (s) => s.order === "orbit" },
  { kind: "match", label: "Match vel", tip: "Match a target's velocity.", running: (s) => s.order === "matchVelocity" },
  { kind: "stationKeep", label: "Station", tip: "Hold position here, or at a point you place.", running: (s) => s.order === "stationKeep" },
  { kind: "orient", label: "Orient", tip: "Turn to face a point or target, to bring guns and the railgun arc to bear.", running: (s) => s.order === "orient" },
  { kind: "coast", label: "Coast", tip: "Cut the drive and drift.", running: (s) => s.order === "coast" },
  { kind: "evade", label: "Evade", tip: "Bend the current route slightly for a while. You still arrive where you were going.", running: (s) => s.evading },
  { kind: "evasive", label: "Evasive", warn: true, tip: "Corkscrew at your G setting. Cancels the route. Spoils railgun shots; sweeps your PDC arcs.", running: (s) => s.order === "evasive" },
];

const ORDER_NAMES: Record<string, string> = {
  burnTo: "BURN TO",
  intercept: "INTERCEPT",
  matchVelocity: "MATCH VEL",
  stationKeep: "STATION",
  orient: "ORIENT",
  orbit: "ORBIT",
  coast: "COAST",
  evasive: "EVASIVE",
};

const GS: { g: "cruise" | "combat" | "max"; label: string; action: ActionId }[] = [
  { g: "cruise", label: "Cruise", action: "gCruise" },
  { g: "combat", label: "Combat", action: "gCombat" },
  { g: "max", label: "Max", action: "gMax" },
];

/** What gives the ship away right now, for the Sensors tile. */
function sensorsLine(s: ActiveShipInfo): { text: string; tone: "ready" | "warn" } {
  if (s.sensorsOn) return { text: "ON · SEEN", tone: "warn" };
  if (s.emissions === "DARK") return { text: "OFF · DARK", tone: "ready" };
  return { text: s.emissions === "DRIVE" ? "OFF · DRIVE" : "OFF · SEEN", tone: "warn" };
}

// The helm (right of the deck): every movement order as a tile whose status line lights while
// it runs, thrust as slanted tabs, and the Sensors switch.
export function HelmDeck() {
  const hud = useHud();
  const s = hud.activeShip;
  const order = s ? `${s.order === "intercept" && s.interceptMode === "fastPass" ? "FAST PASS" : ORDER_NAMES[s.order] ?? s.order.toUpperCase()}${s.evading ? " · EVADE" : ""}` : "--";
  const sens = s ? sensorsLine(s) : null;
  return (
    <DeckPanel side="right" title="Helm" code="NAV · ORDERS">
      <Station title="Orders">
        <div className="otiles">
          {ORDERS.map((o) => (
            <OrderTile
              key={o.kind}
              label={o.label}
              hotkey={hotkey(o.kind)}
              warn={o.warn}
              disabled={!s}
              running={!!s && o.running(s)}
              placing={hud.orderMode === o.kind}
              onClick={() => hudActions.startOrder(o.kind)}
              title={`${o.tip} (${hotkey(o.kind)})`}
            />
          ))}
        </div>
        <div className="readout-line mono">
          <span className="dim">ORDER</span> {order} · <span className="dim">ETA</span> {s?.eta != null ? formatCountdown(s.eta) : "--"} ·{" "}
          <span className="dim">FLIP</span> {s?.flipIn != null ? `T-${formatCountdown(s.flipIn)}` : "--"}
        </div>
      </Station>
      <Station title="Thrust">
        <div className="tabs">
          {GS.map((g) => (
            <Tab key={g.g} label={g.label} hotkey={hotkey(g.action)} on={s?.g === g.g} warn={g.g === "max"} disabled={!s} onClick={() => hudActions.setG(g.g)} title={`G setting: ${g.label} (${hotkey(g.action)})`} />
          ))}
        </div>
        <Tile
          name="Sensors"
          hotkey={hotkey("sensors")}
          wide
          short
          sub={sens?.text ?? "--"}
          tone={sens?.tone}
          active={!!s?.sensorsOn}
          disabled={!s}
          onClick={() => hudActions.toggleSensors()}
          title={`Sensors on or off (${hotkey("sensors")}). On finds dark ships and cold torpedoes nearby, but you can be seen at any range. The line shows what gives you away now.`}
        />
      </Station>
    </DeckPanel>
  );
}
