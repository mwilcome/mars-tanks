import { clamp, gravityPx } from "./constants.js";
import {
  applyEnvironment,
  launch,
  maxPowerFor,
  simulateFlight,
  terrainY,
} from "./sim.js";
import { getWeapon } from "./weapons.js";

function cloneBattle(battle, fromX, me) {
  const terrain = Float32Array.from(battle.terrain);
  const tanks = battle.tanks.map((t, i) => ({
    ...t,
    x: i === me ? fromX : t.x,
    loadout: { ...t.loadout },
    debuff: t.debuff ? { ...t.debuff } : null,
    alive: t.hp > 0,
  }));
  tanks[me].lastY = terrainY(terrain, tanks[me].x);
  tanks[1 - me].lastY = terrainY(terrain, tanks[1 - me].x);
  return {
    map: battle.map,
    terrain,
    glass: Uint8Array.from(battle.glass),
    scorch: Float32Array.from(battle.scorch),
    hazards: battle.hazards,
    crate: null,
    tanks,
    wind: battle.wind,
    projectiles: [],
    impacts: [],
    log: [],
    popups: [],
    phase: "fly",
    turn: me,
    rng: battle.rng,
    opening: false,
    terrainDirty: false,
  };
}

export function traceShot(battle, me, fromX, weaponId, aim, power) {
  const b = cloneBattle(battle, fromX, me);
  const tank = b.tanks[me];
  tank.aim = aim;
  tank.power = power;
  tank.weaponId = weaponId;
  const launched = launch(b, me, { exact: true });
  if (!launched.ok) return { foeHp: b.tanks[1 - me].hp, selfHp: tank.hp, impacts: [], ok: false };
  simulateFlight(b);
  applyEnvironment(b, 1 / 30);
  return {
    ok: true,
    foeHp: b.tanks[1 - me].hp,
    selfHp: b.tanks[me].hp,
    impacts: b.impacts.map((im) => ({ x: im.x, y: im.y })),
  };
}

function weaponChoices(battle, me, fromX, difficulty) {
  const tank = battle.tanks[me];
  const foe = battle.tanks[1 - me];
  const dist = Math.abs(foe.x - fromX);
  const have = (id) => {
    const w = getWeapon(id);
    if (w.unlimited) return true;
    return (tank.loadout[id] || 0) > 0;
  };
  const ids = ["he"];
  if (have("ap") && (dist > 520 || battle.map.g < 0.4)) ids.push("ap");
  if (have("siege") && dist < 640 && battle.map.g > 0.8) ids.push("siege");
  if (have("cluster") && dist > 360 && dist < 1100 && difficulty !== "easy") ids.push("cluster");
  if (have("mole") && difficulty !== "easy") ids.push("mole");
  if (have("ricochet") && battle.map.g > 1 && difficulty === "hard") ids.push("ricochet");
  if (have("ion") && foe.hp > 50 && difficulty !== "easy") ids.push("ion");
  if (have("plasma") && difficulty === "hard") ids.push("plasma");
  return ids.slice(0, difficulty === "easy" ? 2 : 4).map(getWeapon);
}

function angleSet(me, g) {
  const low = g < 0.25;
  const base = low ? [3, 7, 12, 18, 28, 40] : g < 1 ? [12, 24, 36, 48, 60, 72, 84] : [20, 32, 44, 55, 66, 76, 86];
  if (me === 0) return base;
  return base.map((a) => 180 - a);
}

function powerSet(g, maxP) {
  const raw = g < 0.25 ? [10, 18, 28, 40, 55, 72] : g < 1 ? [22, 34, 46, 58, 70, 82, 96] : [30, 42, 54, 66, 78, 90, 100];
  return raw.map((p) => clamp(p, 8, maxP));
}

function scoreTrace(result, battle, me, foe) {
  if (!result.ok) return -1e9;
  const dmg = foe.hp - result.foeHp;
  const selfDmg = battle.tanks[me].hp - result.selfHp;
  let score = dmg * 5 - selfDmg * 6.5;
  if (result.foeHp <= 0 && result.selfHp > 0) score += 80;
  if (result.impacts.length) {
    let best = Infinity;
    for (const im of result.impacts) best = Math.min(best, Math.abs(im.x - foe.x));
    score += Math.max(0, 220 - best) * 0.12;
  } else score -= 25;
  return score;
}

function chooseDest(battle, me) {
  const tank = battle.tanks[me];
  const foe = battle.tanks[1 - me];
  const reach = Math.min(300, tank.fuel * 7);
  let bestX = tank.x;
  let best = -Infinity;
  for (let x = tank.x - reach; x <= tank.x + reach; x += 28) {
    if (x < 60 || x > 1540) continue;
    if (Math.abs(x - foe.x) < 90) continue;
    const lava = battle.hazards.some((h) => h.type === "lava" && x >= h.x0 && x <= h.x1);
    if (lava) continue;
    const y = battle.terrain[clamp(Math.round(x), 0, battle.terrain.length - 1)];
    const score = -y * 1.2 - Math.abs(x - tank.x) * 0.08;
    if (score > best) {
      best = score;
      bestX = x;
    }
  }
  const here = battle.terrain[clamp(Math.round(tank.x), 0, battle.terrain.length - 1)];
  const there = battle.terrain[clamp(Math.round(bestX), 0, battle.terrain.length - 1)];
  if (here - there < 16) return tank.x;
  return bestX;
}

export function planAiTurn(battle, difficulty = "normal") {
  const me = battle.turn;
  const foe = battle.tanks[1 - me];
  const dest = chooseDest(battle, me);
  const weapons = weaponChoices(battle, me, dest, difficulty);
  const angles = angleSet(me, battle.map.g);
  const maxP = maxPowerFor(battle.tanks[me]);
  const powers = [...new Set(powerSet(battle.map.g, maxP))];
  // A direct line helps on microgravity worlds, where lobbing is a waste of fuse.
  if (gravityPx(battle.map.g) < 40) {
    const y0 = terrainY(battle.terrain, dest) - 20;
    const y1 = terrainY(battle.terrain, foe.x) - 16;
    const direct = (Math.atan2(-(y1 - y0), foe.x - dest) * 180) / Math.PI;
    angles.push(clamp(direct, 1, 179), clamp(direct + (me === 0 ? 6 : -6), 1, 179));
  }
  let best = null;
  for (const weapon of weapons) {
    for (const aim of angles) {
      for (const power of powers) {
        const result = traceShot(battle, me, dest, weapon.id, aim, power);
        const score = scoreTrace(result, battle, me, foe);
        if (!best || score > best.score) best = { score, weaponId: weapon.id, aim, power, result };
      }
    }
  }
  if (!best) best = { weaponId: "he", aim: me === 0 ? 60 : 120, power: Math.min(50, maxP), score: 0 };
  const errA = difficulty === "easy" ? 8 : difficulty === "hard" ? 2.2 : 4.2;
  const errP = difficulty === "easy" ? 10 : difficulty === "hard" ? 2.5 : 5;
  const rollA = battle.rng();
  const rollP = battle.rng();
  return {
    dest,
    weaponId: best.weaponId,
    aim: clamp(best.aim + (rollA * 2 - 1) * errA, 0, 180),
    power: clamp(best.power + (rollP * 2 - 1) * errP, 8, maxP),
  };
}
