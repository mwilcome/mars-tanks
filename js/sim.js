import {
  FUSE_SECONDS,
  METERS_PER_PX,
  WORLD_H,
  WORLD_W,
  aimWobbleDeg,
  clamp,
  engineMul,
  fuelCap,
  gravityPx,
  maxPower,
  meters,
} from "./constants.js";
import { generateHazards, generateTerrain, placeCrate } from "./maps.js";
import { hashString, mulberry32 } from "./rng.js";
import { freshLoadout, getWeapon } from "./weapons.js";

export function terrainY(terrain, x) {
  const i = clamp(Math.round(x), 0, terrain.length - 1);
  return terrain[i];
}

export function slopeDydx(terrain, x) {
  return (terrainY(terrain, x + 8) - terrainY(terrain, x - 8)) / 16;
}

/** Upward-pointing normal in y-down space. Flat ground is (0, -1). */
export function groundNormal(terrain, x) {
  const dx = 10;
  const dy = terrainY(terrain, x + dx) - terrainY(terrain, x - dx);
  let nx = dy;
  let ny = -2 * dx;
  const len = Math.hypot(nx, ny) || 1;
  return { x: nx / len, y: ny / len };
}

export function maxPowerFor(tank) {
  return maxPower(tank.hp, tank.debuff?.powerCut || 0);
}

export function fuelCapFor(tank) {
  return fuelCap(tank.hp, tank.fuelBase ?? 100);
}

/** Tracks and hull, in world pixels. Origin is the ground under the tank. */
export const HULL_HALF_W = 36;
export const HULL_HEIGHT = 40;

/** Distance from a blast to the hull. 0 means the blast is on the tank. */
export function hullClearance(tankX, groundY, x, y) {
  const cx = clamp(x, tankX - HULL_HALF_W, tankX + HULL_HALF_W);
  const cy = clamp(y, groundY - HULL_HEIGHT, groundY);
  return Math.hypot(x - cx, y - cy);
}

const BLAST_FALLOFF = 1.45;

/**
 * Damage from one blast. Distance is measured from the hull surface, so a
 * shell sitting on the tank is a full hit. Falloff is gentler than a square
 * so a near miss inside the radius still counts.
 */
export function blastDamage(weapon, tankX, groundY, x, y, scale = 1) {
  const clearance = hullClearance(tankX, groundY, x, y);
  if (!(weapon.radius > 0) || clearance > weapon.radius) {
    return { damage: 0, direct: false, clearance };
  }
  const falloff = (1 - clearance / weapon.radius) ** BLAST_FALLOFF;
  const onHull = clearance <= 0.75;
  const centered = onHull && Math.abs(x - tankX) <= 18;
  let damage = weapon.damage * falloff;
  if (centered) damage *= weapon.direct || 1;
  damage *= scale;
  if (damage < 1) damage = 0;
  return { damage, direct: onHull, centered, clearance };
}

export function aimWobbleFor(tank) {
  const extra = tank.debuff ? 1.4 : 0;
  let w = aimWobbleDeg(tank.hp, extra);
  if (tank.inGeyser) w += 2.2;
  return w;
}

export function hazardAt(battle, x, type) {
  for (const h of battle.hazards) {
    if (h.type !== type) continue;
    if (type === "geyser") {
      if (Math.abs(x - h.x) <= h.r) return h;
    } else if (x >= h.x0 && x <= h.x1) return h;
  }
  return null;
}

function findSpawn(terrain, a, b) {
  let best = (a + b) / 2;
  let bestS = Infinity;
  for (let x = a; x <= b; x += 2) {
    const s = Math.abs(slopeDydx(terrain, x));
    if (s < bestS) {
      bestS = s;
      best = x;
    }
  }
  return best;
}

function makeTank(side, x, terrain, name, load = {}) {
  const fuelBase = load.fuelBase ?? 100;
  return {
    side,
    name,
    x,
    hp: 100,
    fuel: fuelBase,
    fuelBase,
    climbMul: load.climbMul ?? 1,
    aim: side === 0 ? 62 : 118,
    power: 45,
    weaponId: "he",
    loadout: freshLoadout(),
    distance: 0,
    tread: 0,
    slideV: 0,
    recoil: 0,
    debuff: null,
    lastY: terrainY(terrain, x),
    alive: true,
    shots: 0,
    hits: 0,
    dealt: 0,
    burning: false,
    inGeyser: false,
  };
}

export function rollWind(map, rng) {
  if (map.atmo <= 0.01) return 0;
  const span = Math.abs(map.windBase) + map.windJitter;
  return clamp(map.windBase + (rng() * 2 - 1) * map.windJitter, -span, span);
}

export function pushLog(battle, text) {
  battle.log.unshift(text);
  if (battle.log.length > 6) battle.log.length = 6;
}

export function createBattle(map, options = {}) {
  const seed = (options.seed ?? hashString(map.id)) >>> 0;
  const rng = mulberry32(seed);
  const terrain = options.terrain ? Float32Array.from(options.terrain) : generateTerrain(map);
  const hazards = options.hazards || generateHazards(map, terrain);
  const names = options.names || ["LANCER", "DRIFT"];
  const load = {
    fuelBase: options.fuelBase ?? 100,
    climbMul: options.climbMul ?? 1,
  };
  const tanks = [
    makeTank(0, findSpawn(terrain, 80, 250), terrain, names[0], load),
    makeTank(1, findSpawn(terrain, WORLD_W - 250, WORLD_W - 80), terrain, names[1], load),
  ];
  const battle = {
    map,
    seed,
    rng,
    terrain,
    glass: new Uint8Array(WORLD_W),
    scorch: new Float32Array(WORLD_W),
    hazards,
    crate: placeCrate(map, terrain, hazards),
    tanks,
    wind: 0,
    projectiles: [],
    impacts: [],
    log: [],
    phase: "move",
    turn: 0,
    settle: 0,
    winner: null,
    opening: true,
    terrainDirty: true,
    popups: [],
    damageScale: options.damageScale ?? 1,
  };
  battle.wind = rollWind(map, rng);
  if (battle.crate) battle.crate.fuel = Math.max(18, Math.round(load.fuelBase * 0.65));
  pushLog(battle, map.blurb);
  return battle;
}

function spendClamp(tank) {
  const cap = fuelCapFor(tank);
  if (tank.fuel > cap) tank.fuel = cap;
  const mp = maxPowerFor(tank);
  if (tank.power > mp) tank.power = mp;
}

export function hurt(battle, tank, amount, source) {
  if (!tank.alive || amount <= 0) return 0;
  const before = tank.hp;
  tank.hp = Math.max(0, tank.hp - amount);
  spendClamp(tank);
  const dealt = before - tank.hp;
  if (dealt >= 1) {
    battle.popups.push({
      x: tank.x,
      y: terrainY(battle.terrain, tank.x) - 52,
      text: String(Math.round(dealt)),
      age: 0,
      color: source === "fall" ? "#ffd27a" : source === "lava" ? "#ffb15a" : "#ff6a45",
    });
    if (battle.popups.length > 12) battle.popups.shift();
  }
  if (tank.hp <= 0) {
    tank.alive = false;
    tank.hp = 0;
    pushLog(battle, `${tank.name} is down`);
  }
  return dealt;
}

export function beginTurn(battle) {
  const tank = battle.tanks[battle.turn];
  if (!tank?.alive) return;
  if (tank.debuff?.fresh) {
    tank.debuff.fresh = false;
  } else if (tank.debuff) {
    tank.debuff.turnsLeft -= 1;
    if (tank.debuff.turnsLeft <= 0) {
      tank.debuff = null;
      pushLog(battle, `${tank.name} systems back online`);
    }
  }
  if (!battle.opening) {
    const leak = (1 - tank.hp / 100) * 4;
    tank.fuel = Math.max(0, tank.fuel - leak);
    if (battle.map.atmo > 0.01) {
      const span = Math.abs(battle.map.windBase) + battle.map.windJitter;
      const delta = (battle.rng() * 2 - 1) * Math.max(2, battle.map.windJitter * 0.35);
      battle.wind = clamp(battle.wind + delta, -span, span);
    } else {
      battle.wind = 0;
    }
  } else {
    battle.opening = false;
  }
  spendClamp(tank);
  battle.phase = "move";
}

export function driveTank(battle, tankIndex, dir, dt) {
  const tank = battle.tanks[tankIndex];
  if (!tank.alive) return { moved: false, blocked: false, reason: "dead", fuelSpent: 0 };
  if (tank.fuel <= 0.05) return { moved: false, blocked: false, reason: "fuel", fuelSpent: 0 };
  const dydx = slopeDydx(battle.terrain, tank.x);
  const uphill = dir * dydx < 0;
  const grade = Math.abs(dydx);
  const gNorm = battle.map.g / 3.71;
  const cut = tank.debuff?.speedCut || 0;
  const climb = 0.95 * (0.5 + 0.5 * (tank.hp / 100)) * (1.15 - 0.28 * Math.min(gNorm, 1.5)) * (tank.climbMul ?? 1);
  if (uphill && grade > climb) {
    return { moved: false, blocked: true, reason: "steep", fuelSpent: 0 };
  }
  let speed = 96 * engineMul(tank.hp, cut);
  if (hazardAt(battle, tank.x, "slow")) speed *= 0.55;
  if (uphill) speed /= 1 + 2.15 * grade * Math.max(0.35, gNorm);
  else speed *= 1 + 0.8 * grade * Math.min(Math.max(gNorm, 0.15), 1.4);

  let next = tank.x + dir * speed * dt;
  next = clamp(next, 40, WORLD_W - 40);
  const other = battle.tanks[1 - tankIndex];
  if (other.alive && Math.abs(next - other.x) < 54 && Math.sign(other.x - tank.x) === dir) {
    return { moved: false, blocked: true, reason: "blocked", fuelSpent: 0 };
  }
  let costRate = 6.4;
  if (uphill) costRate *= 1 + 2.3 * grade * Math.max(0.4, gNorm);
  else if (grade > 0.04) costRate *= 0.45;
  if (hazardAt(battle, tank.x, "slow")) costRate *= 1.7;
  const cost = Math.min(tank.fuel, costRate * dt);
  tank.fuel -= cost;
  const applied = next - tank.x;
  tank.x = next;
  tank.distance += Math.abs(applied);
  tank.tread += Math.abs(applied);
  return { moved: Math.abs(applied) > 0.01, blocked: false, reason: "", fuelSpent: cost };
}

function separateTanks(battle) {
  const a = battle.tanks[0];
  const b = battle.tanks[1];
  if (!a.alive || !b.alive) return;
  if (Math.abs(a.x - b.x) >= 54) return;
  const mid = (a.x + b.x) / 2;
  if (a.x <= b.x) {
    a.x = clamp(mid - 27, 40, WORLD_W - 40);
    b.x = clamp(mid + 27, 40, WORLD_W - 40);
  } else {
    a.x = clamp(mid + 27, 40, WORLD_W - 40);
    b.x = clamp(mid - 27, 40, WORLD_W - 40);
  }
}

export function applyEnvironment(battle, dt) {
  const g = gravityPx(battle.map.g);
  for (const tank of battle.tanks) {
    if (!tank.alive) continue;
    tank.burning = !!hazardAt(battle, tank.x, "lava");
    tank.inGeyser = !!hazardAt(battle, tank.x, "geyser");
    if (tank.burning) hurt(battle, tank, 14 * dt, "lava");
    const xi = clamp(Math.round(tank.x), 0, WORLD_W - 1);
    const glassy = battle.glass[xi] > 0;
    const icy = battle.map.friction < 0.75 || glassy;
    const dydx = slopeDydx(battle.terrain, tank.x);
    const steep = Math.abs(dydx) > 1.15;
    if ((icy || steep) && tank.alive) {
      const ax = (g * dydx) / (1 + dydx * dydx);
      const scale = icy ? 0.28 : 0.07;
      tank.slideV += ax * scale * dt;
      const friction = (icy ? 0.32 : 1) * battle.map.friction * (glassy ? 0.45 : 1);
      tank.slideV *= Math.exp(-2.4 * friction * dt);
      if (Math.abs(tank.slideV) > 6) {
        tank.x = clamp(tank.x + tank.slideV * dt, 40, WORLD_W - 40);
        tank.tread += Math.abs(tank.slideV * dt);
      }
    } else {
      tank.slideV *= Math.exp(-8 * dt);
    }
    if (battle.crate?.alive && Math.abs(tank.x - battle.crate.x) < 24) {
      const cap = fuelCapFor(tank);
      tank.fuel = Math.min(cap, tank.fuel + battle.crate.fuel);
      battle.crate.alive = false;
      pushLog(battle, `${tank.name} recovered a fuel cache`);
    }
    const y = terrainY(battle.terrain, tank.x);
    const drop = y - tank.lastY;
    if (drop > 34) hurt(battle, tank, Math.min(44, (drop - 34) * 0.42), "fall");
    tank.lastY = y;
    if (tank.recoil > 0) tank.recoil = Math.max(0, tank.recoil - dt * 2.4);
  }
  separateTanks(battle);
  for (const p of battle.popups) p.age += dt;
  battle.popups = battle.popups.filter((p) => p.age < 1.1);
}

function reflect(vx, vy, nx, ny) {
  const dot = vx * nx + vy * ny;
  return { vx: vx - 2 * dot * nx, vy: vy - 2 * dot * ny };
}

function craterColumn(battle, i, x, y, r) {
  const dx = i - x;
  const inside = r * r - dx * dx;
  if (inside <= 0) {
    const ad = Math.abs(dx);
    if (ad > r && ad < r + 10) {
      const lip = 4 * (1 - (ad - r) / 10);
      battle.terrain[i] = Math.max(300, battle.terrain[i] - lip);
    }
    return;
  }
  const dig = Math.sqrt(inside);
  const surf = battle.terrain[i];
  let prox;
  if (y >= surf - 8) prox = 1;
  else prox = Math.max(0, 1 - (surf - y) / (r * 1.25));
  battle.terrain[i] = Math.min(WORLD_H - 32, surf + dig * prox);
  battle.scorch[i] = Math.min(1, battle.scorch[i] + 0.65 * prox);
}

export function explode(battle, x, y, weapon, owner) {
  const r = weapon.crater || weapon.radius * 0.6;
  const i0 = Math.max(0, Math.floor(x - r - 12));
  const i1 = Math.min(WORLD_W - 1, Math.ceil(x + r + 12));
  for (let i = i0; i <= i1; i++) craterColumn(battle, i, x, y, r);
  if (weapon.glass) {
    const g0 = Math.max(0, Math.floor(x - r));
    const g1 = Math.min(WORLD_W - 1, Math.ceil(x + r));
    for (let i = g0; i <= g1; i++) battle.glass[i] = 1;
  }
  battle.terrainDirty = true;
  const damaged = [];
  const scale = battle.damageScale ?? 1;
  for (let i = 0; i < battle.tanks.length; i++) {
    const tank = battle.tanks[i];
    if (!tank.alive) continue;
    const groundY = tank.lastY;
    const hit = blastDamage(weapon, tank.x, groundY, x, y, scale);
    if (hit.clearance > weapon.radius) continue;
    if (weapon.emp) {
      tank.debuff = { powerCut: weapon.emp.powerCut, speedCut: weapon.emp.speedCut, turnsLeft: weapon.emp.turns, fresh: true };
      spendClamp(tank);
    }
    if (hit.damage <= 0) continue;
    const direct = hit.direct;
    const dealt = hurt(battle, tank, hit.damage, "blast");
    damaged.push({ index: i, amount: dealt, direct });
    if (i !== owner && dealt > 0) {
      const shooter = battle.tanks[owner];
      if (shooter) {
        shooter.hits += 1;
        shooter.dealt += dealt;
      }
    }
  }
  battle.impacts.push({ x, y, weaponId: weapon.id, owner });
  const foe = battle.tanks[1 - owner];
  const hitFoe = damaged.find((d) => d.index === 1 - owner && d.amount > 0);
  const hitSelf = damaged.find((d) => d.index === owner && d.amount > 0);
  if (foe && hitFoe?.direct) pushLog(battle, `Direct hit on ${foe.name}`);
  else if (foe && hitFoe) pushLog(battle, `Splash on ${foe.name}`);
  else if (foe) {
    const dir = Math.sign(foe.x - battle.tanks[owner].x) || 1;
    const miss = (x - foe.x) * dir;
    const word = miss < 0 ? "SHORT" : "OVER";
    pushLog(battle, `${word} ${meters(miss)} m`);
  }
  if (hitSelf && hitSelf.amount >= 4) pushLog(battle, "Caught in your own blast");
  if (weapon.emp && damaged.length) pushLog(battle, "Ion scramble");
  return { damaged, x, y };
}

function geyserAccel(battle, x, y) {
  let boost = 0;
  for (const h of battle.hazards) {
    if (h.type !== "geyser") continue;
    const dx = Math.abs(x - h.x);
    if (dx > h.r) continue;
    const surf = terrainY(battle.terrain, x);
    if (y > surf - 260 && y < surf + 20) boost += h.power * (1 - dx / h.r);
  }
  return boost;
}

export function launch(battle, tankIndex, opts = {}) {
  const tank = battle.tanks[tankIndex];
  if (!tank?.alive) return { ok: false, reason: "dead" };
  const weapon = getWeapon(tank.weaponId || "he");
  if (!weapon.unlimited && !weapon.hidden) {
    const left = tank.loadout[weapon.id] || 0;
    if (left <= 0) return { ok: false, reason: "ammo" };
    tank.loadout[weapon.id] = left - 1;
  }
  let aim = tank.aim;
  let power = clamp(tank.power, 5, maxPowerFor(tank));
  tank.power = power;
  if (!opts.exact) {
    const wobble = aimWobbleFor(tank);
    if (wobble > 0.15) {
      const roll = opts.rng ? opts.rng() : Math.random();
      aim += (roll * 2 - 1) * wobble;
    }
  }
  const rad = (aim * Math.PI) / 180;
  const v = (power / 100) * weapon.vMax;
  const y = terrainY(battle.terrain, tank.x);
  const mx = tank.x + Math.cos(rad) * 52;
  const my = y - 22 - Math.sin(rad) * 52;
  battle.projectiles.push({
    x: mx,
    y: Math.min(my, y - 8),
    vx: Math.cos(rad) * v,
    vy: -Math.sin(rad) * v,
    weaponId: weapon.id,
    owner: tankIndex,
    age: 0,
    grace: 0.1,
    bounces: weapon.bounces || 0,
    burrowLeft: 0,
    mode: "fly",
    split: weapon.split || 0,
    alive: true,
    trail: [],
  });
  tank.shots += 1;
  tank.recoil = 1;
  battle.impacts = [];
  pushLog(battle, `${tank.name} fires ${weapon.name}`);
  return { ok: true, x: mx, y: my, color: weapon.color, weapon };
}

export function stepProjectiles(battle, dt) {
  const events = [];
  const born = [];
  for (const p of battle.projectiles) {
    if (!p.alive) continue;
    const weapon = getWeapon(p.weaponId);
    p.age += dt;
    if (p.mode === "burrow") {
      p.y += 120 * dt;
      p.burrowLeft -= 120 * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) p.trail.shift();
      if (p.burrowLeft <= 0 || p.age > FUSE_SECONDS) {
        p.alive = false;
        const boom = explode(battle, p.x, p.y, weapon, p.owner);
        events.push({ type: "explode", ...boom, color: weapon.color, radius: weapon.radius });
      }
      continue;
    }
    if (p.grace > 0) p.grace -= dt;
    if (p.split > 0 && p.age >= (weapon.splitTime || 0.75)) {
      p.alive = false;
      const base = Math.atan2(p.vy, p.vx);
      const speed = Math.hypot(p.vx, p.vy) * 0.86;
      const n = p.split;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.24;
        born.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(base + off) * speed,
          vy: Math.sin(base + off) * speed,
          weaponId: "cluster-bit",
          owner: p.owner,
          age: 0,
          grace: 0.06,
          bounces: 0,
          burrowLeft: 0,
          mode: "fly",
          split: 0,
          alive: true,
          trail: [],
        });
      }
      events.push({ type: "split", x: p.x, y: p.y, color: weapon.color });
      continue;
    }
    if (p.age > FUSE_SECONDS) {
      p.alive = false;
      const boom = explode(battle, p.x, p.y, weapon, p.owner);
      events.push({ type: "fuse", ...boom, color: weapon.color, radius: weapon.radius * 0.7 });
      pushLog(battle, "Fuse expired");
      continue;
    }

    const g = gravityPx(battle.map.g) * (weapon.grav || 1);
    const dragK = battle.map.atmo * (0.14 + battle.map.atmo * 0.2) * (weapon.drag || 1);
    const windAx = battle.map.atmo > 0.01 ? battle.wind * (0.35 + battle.map.atmo) * 1.15 : 0;
    const lift = geyserAccel(battle, p.x, p.y);
    p.vx += (windAx - p.vx * dragK) * dt;
    p.vy += (g - lift - p.vy * dragK) * dt;
    const x0 = p.x;
    const y0 = p.y;
    const x1 = p.x + p.vx * dt;
    const y1 = p.y + p.vy * dt;
    p.trail.push({ x: x0, y: y0 });
    if (p.trail.length > 18) p.trail.shift();

    if (p.grace > 0) {
      p.x = x1;
      p.y = y1;
      continue;
    }

    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 5));
    let hit = null;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (x < -30 || x > WORLD_W + 30) {
        hit = { kind: "out", x, y };
        break;
      }
      for (let i = 0; i < battle.tanks.length; i++) {
        const tank = battle.tanks[i];
        if (!tank.alive) continue;
        const groundY = terrainY(battle.terrain, tank.x);
        if (hullClearance(tank.x, groundY, x, y) <= 0) {
          hit = { kind: "tank", x, y, index: i };
          break;
        }
      }
      if (hit) break;
      if (y > WORLD_H + 10) {
        hit = { kind: "out", x, y };
        break;
      }
      const xi = clamp(Math.round(x), 0, WORLD_W - 1);
      if (y >= battle.terrain[xi]) {
        hit = { kind: "ground", x, y: battle.terrain[xi] };
        break;
      }
    }

    if (!hit) {
      p.x = x1;
      p.y = y1;
      continue;
    }
    p.x = hit.x;
    p.y = hit.y;
    if (hit.kind === "out") {
      p.alive = false;
      pushLog(battle, "Lost over the horizon");
      events.push({ type: "miss", x: hit.x, y: hit.y });
      continue;
    }
    if (hit.kind === "ground" && weapon.burrow > 0 && p.burrowLeft === 0 && p.mode === "fly") {
      p.mode = "burrow";
      p.burrowLeft = weapon.burrow;
      p.vx *= 0.1;
      p.vy = 0;
      events.push({ type: "burrow", x: p.x, y: p.y, color: weapon.color });
      continue;
    }
    if (hit.kind === "ground" && p.bounces > 0) {
      const speed = Math.hypot(p.vx, p.vy);
      const shallow = Math.abs(p.vx) > Math.abs(p.vy) * 0.75;
      if (shallow && speed > 110) {
        const n = groundNormal(battle.terrain, p.x);
        const r = reflect(p.vx, p.vy, n.x, n.y);
        p.vx = r.vx * 0.74;
        p.vy = r.vy * 0.74;
        p.bounces -= 1;
        p.grace = 0.12;
        p.y = terrainY(battle.terrain, p.x) - 3;
        events.push({ type: "ricochet", x: p.x, y: p.y, color: weapon.color });
        pushLog(battle, "Ricochet");
        continue;
      }
    }
    p.alive = false;
    const boom = explode(battle, p.x, p.y, weapon, p.owner);
    events.push({ type: "explode", ...boom, color: weapon.color, radius: weapon.radius });
  }
  if (born.length) battle.projectiles.push(...born);
  battle.projectiles = battle.projectiles.filter((p) => p.alive);
  return events;
}

export function simulateFlight(battle, dt = 1 / 60) {
  let t = 0;
  const all = [];
  while (battle.projectiles.some((p) => p.alive) && t < FUSE_SECONDS + 0.5) {
    all.push(...stepProjectiles(battle, dt));
    t += dt;
  }
  return all;
}

export function updateWinner(battle) {
  const a = battle.tanks[0].alive && battle.tanks[0].hp > 0;
  const b = battle.tanks[1].alive && battle.tanks[1].hp > 0;
  if (a && b) return null;
  if (!a && !b) return -1;
  return a ? 0 : 1;
}

export { METERS_PER_PX };
