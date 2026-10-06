// Which weapon range rings to draw (owner, 2026-10-05): one flat ring per weapon under each
// of our ships (torpedo, railgun, PDC), and the same for an enemy ship while it is selected.
// Read from the sensor picture only (CLAUDE.md rule 6): our own ships' weapon state, and an
// enemy's class, whose loadout tells us what it carries. A weapon that is destroyed or empty
// on our side loses its ring; for an enemy we cannot see its magazine, so its rings stay.

import { loadouts } from "../data/combat";
import { pathTuning as T } from "../data/paths";
import { pdcTuning, railgunTuning, torpedoTuning } from "../data/weapons";
import type { Allegiance, SensorPicture } from "../sim/sensors/picture";
import type { Vec3 } from "../sim/vec3";

export type RingWeapon = "torpedo" | "railgun" | "pdc";

export interface WeaponRing {
  /** Stable key for the renderer's pool: `<ship id>:<weapon>`. */
  key: string;
  shipId: string;
  weapon: RingWeapon;
  /** Center on the plane (sim coordinates; z is ignored by the renderer). */
  center: Vec3;
  radius: number;
  allegiance: Allegiance;
  opacity: number;
  dashed: boolean;
  label: string;
}

const SHORT: Record<RingWeapon, string> = { torpedo: "TORP", railgun: "RAIL", pdc: "PDC" };

export interface RingOptions {
  /** The selected object (an enemy track gets rings). */
  selectedId: string | null;
  /** The ship aiming torpedoes right now, if any: its torpedo ring is brighter. */
  aimingTorpedoesFrom: string | null;
  formatDistance: (m: number) => string;
  /** Smooth (interpolated) position of a ship, if the caller has one. */
  positionOf?: (id: string) => Vec3 | null;
}

export function weaponRings(pic: SensorPicture, opts: RingOptions): WeaponRing[] {
  const rings: WeaponRing[] = [];
  const add = (shipId: string, center: Vec3, weapon: RingWeapon, radius: number, allegiance: Allegiance) => {
    const aiming = weapon === "torpedo" && opts.aimingTorpedoesFrom === shipId;
    rings.push({
      key: `${shipId}:${weapon}`,
      shipId,
      weapon,
      center: opts.positionOf?.(shipId) ?? center,
      radius,
      allegiance,
      opacity: aiming ? T.rangeRingAimOpacity : T.rangeRingOpacity,
      dashed: weapon === "railgun",
      label: `${SHORT[weapon]} ${opts.formatDistance(radius)}`,
    });
  };

  for (const s of pic.ownShips) {
    const aiming = opts.aimingTorpedoesFrom === s.id;
    if (!T.showOwnRings && !aiming) continue;
    const tubesOk = (s.health.tubes ?? 1) > 0;
    if (s.torpedoes.magazine > 0 && s.torpedoes.tubes > 0 && tubesOk) add(s.id, s.position, "torpedo", torpedoTuning.effectiveRange, "friendly");
    if (!T.showOwnRings) continue;
    const rg = s.railgun;
    if (rg && rg.health > 0 && rg.slugs > 0) add(s.id, s.position, "railgun", railgunTuning[rg.spinal ? "spinal" : "light"].effectiveRange, "friendly");
    if (s.pdcs.some((m) => m.health > 0 && m.rounds > 0)) add(s.id, s.position, "pdc", pdcTuning.effectiveRange, "friendly");
  }

  if (T.showEnemyRings && opts.selectedId) {
    const t = pic.tracks.find((tr) => tr.id === opts.selectedId);
    if (t && t.kind === "ship" && t.allegiance === "hostile" && t.identified && t.shipClass) {
      const lo = loadouts[t.shipClass];
      if (lo.magazine > 0 && lo.tubes > 0) add(t.id, t.position, "torpedo", torpedoTuning.effectiveRange, "hostile");
      if (lo.railgun !== "none") add(t.id, t.position, "railgun", railgunTuning[lo.railgun].effectiveRange, "hostile");
      if (lo.pdcCount > 0) add(t.id, t.position, "pdc", pdcTuning.effectiveRange, "hostile");
    }
  }
  return rings;
}
