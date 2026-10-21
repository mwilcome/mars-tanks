/** Shared scale for the 1600×900 battlefield. Y grows downward. */

export const WORLD_W = 1600;
export const WORLD_H = 900;
export const METERS_PER_PX = 0.5;
export const FUSE_SECONDS = 9;
/** Mars gravity (3.71 m/s²) maps to this many pixels per second². */
export const MARS_GRAVITY_PX = 220;

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function gravityPx(gMs2) {
  return Math.max(2, MARS_GRAVITY_PX * (gMs2 / 3.71));
}

export function gLabel(gMs2) {
  const ge = gMs2 / 9.80665;
  if (ge < 0.02) return `${gMs2.toFixed(3)} m/s²`;
  return `${ge.toFixed(2)} g`;
}

export function airLabel(atmo) {
  if (atmo <= 0.01) return "VACUUM";
  if (atmo < 0.35) return "THIN AIR";
  if (atmo < 0.7) return "AIR";
  return "THICK AIR";
}

/** Max shot power after hull and ion damage. Full health is 100. */
export function maxPower(hp, powerCut = 0) {
  const h = clamp(hp, 0, 100) / 100;
  return Math.max(28, Math.round(50 + 50 * h - powerCut));
}

/** Share of listed weapon damage that actually lands. Both tanks use the same scale. */
export const DIFFICULTY_DAMAGE = {
  easy: 1,
  normal: 0.62,
  hard: 0.42,
};

export function damageScaleFor(difficulty) {
  return DIFFICULTY_DAMAGE[difficulty] ?? DIFFICULTY_DAMAGE.normal;
}

/**
 * Campaign fuel tank at full health. Map 1 is a short reposition;
 * the last map is a full 100, same as skirmish.
 */
export function campaignFuelBase(levelIndex, mapCount = 30) {
  const last = Math.max(1, mapCount - 1);
  const t = clamp(levelIndex, 0, last) / last;
  return Math.round(34 + t * 66);
}

/**
 * Hill-climbing authority. Map 1 is 0.72× today's full-health limit.
 * The last map is 1, which is the limit skirmish already uses.
 */
export function campaignClimbMul(levelIndex, mapCount = 30) {
  const last = Math.max(1, mapCount - 1);
  const t = clamp(levelIndex, 0, last) / last;
  return 0.72 + 0.28 * t;
}

/** Fuel tank size after leaks from damage. `base` is the full-health tank. */
export function fuelCap(hp, base = 100) {
  const h = clamp(hp, 0, 100) / 100;
  return base * (0.45 + 0.55 * h);
}

/** Fraction of healthy top speed. */
export function engineMul(hp, speedCut = 0) {
  const h = clamp(hp, 0, 100) / 100;
  return (0.38 + 0.62 * h) * (1 - speedCut);
}

/** Degrees of random error when a damaged gun fires. */
export function aimWobbleDeg(hp, extra = 0) {
  const missing = 1 - clamp(hp, 0, 100) / 100;
  return missing * 5.5 + extra;
}

export function meters(px) {
  return Math.round(Math.abs(px) * METERS_PER_PX);
}
