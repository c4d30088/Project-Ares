// Impact effect tunables: explosions, sparks and hit text. Sizes are in screen pixels, because
// a real blast would be far smaller than one pixel at table zoom; the bloom grows toward its
// real size only when you zoom right in. All of it runs on real time, not sim time, so at
// high time compression it shows as quick flashes.

export const impactTuning = {
  /** Master switch for explosions and sparks. */
  enabled: true,
  /** Floating hit text above a struck ship. */
  showHitText: true,
  /** Show hit text on our own ships too (otherwise only above enemy ships). */
  hitTextOnOwn: true,

  /** Torpedo explosion: the smallest size (px across) at normal table zoom. */
  bloomMinPx: 70,
  /** Largest size when zoomed in close. */
  bloomMaxPx: 220,
  /** The stylized blast radius in meters; sets how big it gets once zoomed in. */
  bloomRadiusM: 300,
  bloomDurationS: 2,
  /** A destroyed ship's explosion is this many times bigger. */
  bloomShipKillScale: 4,
  /** How white the hot center is, 0 to 1. */
  bloomCoreHeat: 0.85,
  /** Brightness of the expanding shock ring, 0 to 1. */
  bloomRingOpacity: 0.7,

  /** Sparks per burst at scale 1. */
  sparkCount: 14,
  /** How fast sparks fly outward, px per second. */
  sparkSpeedPx: 150,
  sparkLengthPx: 14,
  sparkDurationS: 0.5,
  /** Burst size by cause (1 = the numbers above). */
  sparkScale: { pdcKill: 0.7, pdcHit: 0.6, slugHit: 1.3 },

  /** Hit text rises this far (px) over its life. */
  textRisePx: 38,
  textDurationS: 2,
  /** Hits on the same ship within this time add into one label. */
  textMergeS: 0.4,

  /** Limits so a huge exchange at high time compression cannot flood the screen. */
  maxBlooms: 40,
  maxSparks: 600,
  maxTexts: 14,
};
