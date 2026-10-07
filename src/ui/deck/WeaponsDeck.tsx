import { useRef } from "react";
import { hudActions, useHud, type RailgunInfo } from "../store";
import { DeckPanel, Gauge, Key, Keys, Station, Tile } from "./parts";

const SALVOS = [1, 2, 4, 6];
const MODES = ["auto", "manual", "hold"] as const;
const MODE_KEY = { auto: "AUTO", manual: "MAN", hold: "HOLD" } as const;
const LETTER = { auto: "A", manual: "M", hold: "H" } as const;
const NEXT = { auto: "manual", manual: "hold", hold: "auto" } as const;
const BURST_ROUNDS = [5, 10, 20, 40, 80];
const BURST_GAPS = [0.25, 0.5, 1, 2, 4];

/** The next value in a list after `now`, wrapping round. */
const cycle = (list: number[], now: number) => list[(list.findIndex((x) => x >= now - 1e-9) + 1) % list.length];
const group = (n: number) => n.toLocaleString("en-US");

/** Railgun state as a short label: READY, recharge seconds, EMPTY or DESTROYED. */
export function railgunState(rg: { rechargeS: number; slugs: number; health: number }): string {
  if (rg.health <= 0) return "DESTROYED";
  if (rg.slugs <= 0) return "EMPTY";
  return rg.rechargeS > 0 ? `${Math.ceil(rg.rechargeS)} S` : "READY";
}

/** The railgun's charge gauge: fills as the gun recharges after a shot. The full recharge time
 *  is the longest wait seen since it was last ready (a damaged gun recharges slower). */
function ChargeGauge({ rg }: { rg: RailgunInfo }) {
  const peak = useRef(0);
  if (rg.rechargeS <= 0) peak.current = 0;
  else peak.current = Math.max(peak.current, rg.rechargeS);
  const state = railgunState(rg);
  const charging = rg.rechargeS > 0 && rg.slugs > 0 && rg.health > 0;
  const frac = rg.health <= 0 || rg.slugs <= 0 ? 0 : charging ? 1 - rg.rechargeS / peak.current : 1;
  return (
    <Gauge
      label="Charge"
      right={charging ? `${Math.ceil(rg.rechargeS)} S` : undefined}
      frac={frac}
      value={charging ? "CHARGING" : state}
      tone={rg.health <= 0 || rg.slugs <= 0 ? "bad" : charging ? "charging" : undefined}
      title="The railgun's capacitors: they recharge after every shot."
    />
  );
}

// Weapons (left of the deck): torpedoes, railgun and point defense, each a station with its
// action tile, its settings, and a gauge. Every weapon fires only on the player's order;
// only PDCs have an automatic mode.
export function WeaponsDeck() {
  const hud = useHud();
  const w = hud.weapons;
  const rg = hud.railgun;
  const pdcs = hud.pdcs;
  const burst = hud.pdcBurst;
  const ship = hud.activeShip;
  if (!ship) {
    return (
      <DeckPanel side="left" title="Weapons control" code="NO SHIP">
        <div className="dk-note">NO SHIP SELECTED</div>
      </DeckPanel>
    );
  }
  const stations = (w && w.tubes > 0 ? 1 : 0) + (rg ? 1 : 0) + (pdcs?.length ? 1 : 0);

  const torpedoes = w && w.tubes > 0 && (() => {
    const tubesDown = (ship.health.tubes ?? 1) <= 0;
    const empty = w.magazine === 0;
    return (
      <Station title="Torpedoes" width={196}>
        <div className="stn-row">
          <Tile
            name="Launch"
            hotkey="L"
            sub={empty ? "EMPTY" : tubesDown ? "TUBES OFF" : `SALVO ${w.salvo}`}
            tone={empty || tubesDown ? "bad" : undefined}
            active={hud.orderMode === "launch"}
            disabled={empty || tubesDown}
            onClick={() => hudActions.startOrder("launch")}
            title="Launch a salvo (L), then click a ship or object, or place a point."
          />
          <div className="dk-col">
            <Keys cols={4}>
              {SALVOS.map((n) => (
                <Key key={n} on={w.salvo === n} onClick={() => hudActions.setSalvo(n)} title={`Salvo of ${n}`}>
                  {n}
                </Key>
              ))}
            </Keys>
            <Keys cols={2}>
              <Key on={w.mode === "hot"} onClick={() => hudActions.setLaunchMode("hot")} title="Hot: the drive lights at launch. Fast, but seen.">
                HOT
              </Key>
              <Key on={w.mode === "cold"} onClick={() => hudActions.setLaunchMode("cold")} title="Cold: coasts dark, lights near the target.">
                COLD
              </Key>
            </Keys>
            <span className={`dk-note mono ${tubesDown ? "bad" : ""}`}>{tubesDown ? "TUBES OFFLINE" : `TUBES ${w.tubesReady}/${w.tubes}`}</span>
          </div>
        </div>
        <Gauge
          label="Magazine"
          right={`${w.magazine} / ${w.magazineMax}`}
          frac={w.magazineMax ? w.magazine / w.magazineMax : 0}
          value={empty ? "EMPTY" : `${w.magazine} TORPEDOES${w.queued ? ` · ${w.queued} QUEUED` : ""}`}
          tone={empty ? "bad" : w.magazine < 0.25 * w.magazineMax ? "warn" : undefined}
          title="Torpedoes left in the magazine, and any ordered but not yet out of a tube."
        />
      </Station>
    );
  })();

  const railgun = rg && (() => {
    const state = railgunState(rg);
    const ready = state === "READY";
    return (
      <Station title={rg.spinal ? "Spinal gun" : "Railgun"} width={96}>
        <div className="stn-row">
          <Tile
            name="Fire"
            hotkey="G"
            sub={rg.health <= 0 ? "DESTROYED" : rg.slugs <= 0 ? "EMPTY" : `${rg.slugs} SLUGS`}
            tone={rg.health <= 0 || rg.slugs <= 0 ? "bad" : ready ? "ready" : rg.slugs < 0.25 * rg.slugsMax ? "warn" : undefined}
            active={hud.orderMode === "railgun"}
            disabled={rg.health <= 0 || rg.slugs <= 0}
            onClick={() => hudActions.startOrder("railgun")}
            title="Fire the railgun (G), then click a target: a ship is shot at its lead point."
          />
        </div>
        <ChargeGauge rg={rg} />
      </Station>
    );
  })();

  const pointDefense = pdcs && pdcs.length > 0 && burst && (() => {
    const allMode = pdcs.every((m) => m.mode === pdcs[0].mode) ? pdcs[0].mode : null;
    const total = pdcs.reduce((s, m) => s + m.rounds, 0);
    const totalMax = pdcs.reduce((s, m) => s + m.roundsMax, 0);
    const setBurst = (b: Partial<typeof burst>) => hudActions.setPdcBurst({ ...burst, ...b });
    return (
      <Station title="Point defense" width={206}>
        <div className="stn-row">
          <Tile
            name="Assign"
            hotkey="D"
            sub={allMode ? `ALL ${MODE_KEY[allMode]}` : "MIXED"}
            active={hud.orderMode === "pdcTarget"}
            onClick={() => hudActions.startOrder("pdcTarget")}
            title="Assign all PDCs to a target (D): sets them to Manual."
          />
          <div className="dk-col">
            <Keys cols={3}>
              {MODES.map((m) => (
                <Key key={m} on={allMode === m} onClick={() => hudActions.setPdcMode("all", m)} title={`All PDCs to ${m}`}>
                  {MODE_KEY[m]}
                </Key>
              ))}
            </Keys>
            <Keys cols={4}>
              {pdcs.map((m, i) => {
                const dead = m.health <= 0 || m.rounds === 0;
                return (
                  <Key
                    key={i}
                    tone={dead ? "bad" : m.firing ? "firing" : m.rounds < 0.25 * m.roundsMax ? "warn" : undefined}
                    disabled={m.health <= 0}
                    onClick={() => hudActions.setPdcMode(i, NEXT[m.mode])}
                    title={`PDC ${i + 1}: ${m.mode.toUpperCase()} · ${group(m.rounds)} rounds${m.health <= 0 ? " · DESTROYED" : ""}. Click to change its mode. Green while firing.`}
                  >
                    {i + 1}
                    {LETTER[m.mode]}
                  </Key>
                );
              })}
            </Keys>
            <Keys cols={3}>
              <Key on={burst.enabled} onClick={() => setBurst({ enabled: !burst.enabled })} title="Burst fire for PDCs on Auto: a burst, then a pause. Saves rounds; fewer kills.">
                BURST
              </Key>
              <Key onClick={() => setBurst({ rounds: cycle(BURST_ROUNDS, burst.rounds) })} title="Rounds per burst (click for the next setting).">
                {burst.rounds}R
              </Key>
              <Key onClick={() => setBurst({ intervalS: cycle(BURST_GAPS, burst.intervalS) })} title="Pause between bursts (click for the next setting).">
                {burst.intervalS}S
              </Key>
            </Keys>
          </div>
        </div>
        <Gauge
          label="Rounds"
          right={`${pdcs.length} MOUNTS`}
          frac={totalMax ? total / totalMax : 0}
          value={`${group(total)} / ${group(totalMax)}`}
          tone={total === 0 ? "bad" : total < 0.25 * totalMax ? "warn" : undefined}
          title="PDC rounds left across all mounts."
        />
      </Station>
    );
  })();

  return (
    <DeckPanel side="left" title="Weapons control" code={`WPN · ${stations} STATIONS`}>
      {torpedoes}
      {railgun}
      {pointDefense}
    </DeckPanel>
  );
}
