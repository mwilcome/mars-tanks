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

/** Fuel tank size after leaks from damage. Full health is 100. */
export function fuelCap(hp) {
  const h = clamp(hp, 0, 100) / 100;
  return 100 * (0.45 + 0.55 * h);
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
