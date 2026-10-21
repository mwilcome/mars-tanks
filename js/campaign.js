/** Campaign depot. Ranks, purse, and purchases are pure so the math can be tested without a browser. */

export const UPGRADES = {
  fuel: {
    id: "fuel",
    name: "Fuel tank",
    blurb: "Flat-ground range at full health.",
    values: [34, 45, 56, 67, 78, 89, 100],
    costs: [40, 75, 120, 175, 240, 320],
  },
  climb: {
    id: "climb",
    name: "Traction",
    blurb: "How steep a full-health hull can climb.",
    values: [0.72, 0.79, 0.86, 0.93, 1],
    costs: [50, 95, 150, 220],
  },
  armor: {
    id: "armor",
    name: "Armor",
    blurb: "Hull points. A hurt tank is still slower.",
    values: [100, 120, 140, 160, 180],
    costs: [60, 110, 170, 250],
  },
  gun: {
    id: "gun",
    name: "Gun",
    blurb: "Extra shot power at full health.",
    values: [0, 8, 16, 24],
    costs: [45, 90, 150],
  },
};

/** `after` is maps already cleared before the gun is offered. Unlock price includes the first pack. */
export const SHOP_WEAPONS = [
  { id: "ap", unlock: 80, pack: 2, packCost: 30, after: 1 },
  { id: "ricochet", unlock: 110, pack: 2, packCost: 32, after: 2 },
  { id: "siege", unlock: 170, pack: 1, packCost: 28, after: 4 },
  { id: "cluster", unlock: 210, pack: 1, packCost: 26, after: 6 },
  { id: "ion", unlock: 250, pack: 1, packCost: 34, after: 8 },
  { id: "mole", unlock: 310, pack: 1, packCost: 36, after: 10 },
  { id: "plasma", unlock: 390, pack: 1, packCost: 32, after: 13 },
];

export const PURSE = {
  winBase: 55,
  winPerMap: 6,
  damageRate: 0.8,
  accuracyMax: 36,
  kill: 30,
  difficulty: { easy: 1, normal: 1.12, hard: 1.3 },
};

export const DEBUG_CREDITS = 4000;
export const DEBUG_AMMO = 12;

export function freshCareer(index = 0) {
  return {
    index: Math.max(0, index | 0),
    credits: 0,
    fuel: 0,
    climb: 0,
    armor: 0,
    gun: 0,
    weapons: {},
  };
}

function cloneCareer(career) {
  return {
    index: career.index | 0,
    credits: career.credits | 0,
    fuel: career.fuel | 0,
    climb: career.climb | 0,
    armor: career.armor | 0,
    gun: career.gun | 0,
    weapons: { ...career.weapons },
  };
}

function rankValue(spec, rank) {
  const i = Math.max(0, Math.min(spec.values.length - 1, rank | 0));
  return spec.values[i];
}

export function careerStats(career) {
  const c = career || freshCareer();
  return {
    fuelBase: rankValue(UPGRADES.fuel, c.fuel),
    climbMul: rankValue(UPGRADES.climb, c.climb),
    hpMax: rankValue(UPGRADES.armor, c.armor),
    gunBonus: rankValue(UPGRADES.gun, c.gun),
  };
}

export function loadoutFromCareer(career) {
  const load = { he: Infinity };
  const owned = career?.weapons || {};
  for (const spec of SHOP_WEAPONS) {
    if (Object.prototype.hasOwnProperty.call(owned, spec.id)) {
      load[spec.id] = Math.max(0, owned[spec.id] | 0);
    }
  }
  return load;
}

export function careerInProgress(career) {
  if (!career) return false;
  if ((career.index | 0) > 0 || (career.credits | 0) > 0) return true;
  if ((career.fuel | 0) || (career.climb | 0) || (career.armor | 0) || (career.gun | 0)) return true;
  return Object.keys(career.weapons || {}).length > 0;
}

/**
 * Pay for the map just cleared. `levelIndex` is 0-based.
 * Damage is hull damage dealt by the player. Accuracy is hits / shots, capped.
 */
export function purseFor({
  levelIndex = 0,
  dealt = 0,
  shots = 0,
  hits = 0,
  killed = false,
  difficulty = "easy",
} = {}) {
  const win = PURSE.winBase + Math.max(0, levelIndex) * PURSE.winPerMap;
  const damage = Math.round(Math.max(0, dealt) * PURSE.damageRate);
  const accuracy = shots > 0 ? Math.round(PURSE.accuracyMax * Math.min(1, hits / shots)) : 0;
  const kill = killed ? PURSE.kill : 0;
  const mult = PURSE.difficulty[difficulty] ?? PURSE.difficulty.easy;
  const total = Math.round((win + damage + accuracy + kill) * mult);
  return { win, damage, accuracy, kill, mult, total };
}

function decline(career, reason) {
  return { ok: false, reason, career: cloneCareer(career) };
}

export function buyUpgrade(career, id) {
  const spec = UPGRADES[id];
  if (!spec) return decline(career, "unknown");
  const rank = career[id] | 0;
  if (rank >= spec.values.length - 1) return decline(career, "max");
  const cost = spec.costs[rank];
  if ((career.credits | 0) < cost) return decline(career, "credits");
  const next = cloneCareer(career);
  next.credits -= cost;
  next[id] = rank + 1;
  return { ok: true, reason: "", career: next, cost };
}

export function buyWeapon(career, id) {
  const spec = SHOP_WEAPONS.find((item) => item.id === id);
  if (!spec) return decline(career, "unknown");
  if (Object.prototype.hasOwnProperty.call(career.weapons, id)) return decline(career, "owned");
  if ((career.index | 0) < spec.after) return decline(career, "locked");
  if ((career.credits | 0) < spec.unlock) return decline(career, "credits");
  const next = cloneCareer(career);
  next.credits -= spec.unlock;
  next.weapons[id] = spec.pack;
  return { ok: true, reason: "", career: next, cost: spec.unlock };
}

export function buyAmmo(career, id) {
  const spec = SHOP_WEAPONS.find((item) => item.id === id);
  if (!spec) return decline(career, "unknown");
  if (!Object.prototype.hasOwnProperty.call(career.weapons, id)) return decline(career, "locked");
  if ((career.credits | 0) < spec.packCost) return decline(career, "credits");
  const next = cloneCareer(career);
  next.credits -= spec.packCost;
  next.weapons[id] = (next.weapons[id] | 0) + spec.pack;
  return { ok: true, reason: "", career: next, cost: spec.packCost };
}

/** Phone testing. Fuel and traction jump to the cap. Armor and gun stay, so the depot still sells those. */
export function applyDebugGrant(career) {
  const next = cloneCareer(career || freshCareer());
  next.credits = Math.max(next.credits, DEBUG_CREDITS);
  next.fuel = UPGRADES.fuel.values.length - 1;
  next.climb = UPGRADES.climb.values.length - 1;
  for (const spec of SHOP_WEAPONS) {
    next.weapons[spec.id] = Math.max(next.weapons[spec.id] ?? 0, DEBUG_AMMO);
  }
  return next;
}

export function syncAmmo(career, loadout) {
  const next = cloneCareer(career);
  for (const spec of SHOP_WEAPONS) {
    if (!Object.prototype.hasOwnProperty.call(next.weapons, spec.id)) continue;
    const left = loadout?.[spec.id];
    if (Number.isFinite(left)) next.weapons[spec.id] = Math.max(0, Math.round(left));
  }
  return next;
}

export function shopCatalog(career) {
  const stats = careerStats(career);
  const upgrades = Object.values(UPGRADES).map((spec) => {
    const rank = career[spec.id] | 0;
    const maxed = rank >= spec.values.length - 1;
    const cost = maxed ? 0 : spec.costs[rank];
    return {
      id: spec.id,
      name: spec.name,
      blurb: spec.blurb,
      rank,
      maxRank: spec.values.length - 1,
      value: spec.values[rank],
      next: maxed ? null : spec.values[rank + 1],
      cost,
      maxed,
    };
  });
  const weapons = SHOP_WEAPONS.map((spec) => {
    const owned = Object.prototype.hasOwnProperty.call(career.weapons, spec.id);
    const locked = !owned && (career.index | 0) < spec.after;
    return {
      ...spec,
      owned,
      locked,
      ammo: owned ? career.weapons[spec.id] | 0 : 0,
    };
  });
  return { credits: career.credits | 0, index: career.index | 0, stats, upgrades, weapons };
}
