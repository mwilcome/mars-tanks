import assert from "node:assert/strict";
import { test } from "node:test";
import { planAiTurn, traceShot } from "../js/ai.js";
import { campaignClimbMul, campaignFuelBase, fuelCap, maxPower } from "../js/constants.js";
import { MAPS } from "../js/maps.js";
import {
  applyEnvironment,
  beginTurn,
  createBattle,
  driveTank,
  explode,
  groundNormal,
  launch,
  simulateFlight,
  slopeDydx,
  terrainY,
  updateWinner,
} from "../js/sim.js";
import { getWeapon } from "../js/weapons.js";

function flatBattle(overrides = {}) {
  const map = structuredClone(MAPS[0]);
  Object.assign(map, overrides);
  const battle = createBattle(map, { seed: 42, names: ["A", "B"] });
  battle.terrain.fill(640);
  battle.glass.fill(0);
  battle.scorch.fill(0);
  battle.hazards = [];
  battle.tanks[0].x = 220;
  battle.tanks[1].x = 1280;
  battle.tanks[0].lastY = 640;
  battle.tanks[1].lastY = 640;
  battle.wind = 0;
  battle.crate.alive = false;
  return battle;
}

function impactX(battle) {
  const owned = battle.impacts.filter((im) => im.owner === 0);
  if (!owned.length) return null;
  return owned[owned.length - 1].x;
}

function fireFlat(overrides, aim, power) {
  const battle = flatBattle(overrides);
  battle.tanks[0].aim = aim;
  battle.tanks[0].power = power;
  battle.tanks[0].weaponId = "he";
  const res = launch(battle, 0, { exact: true });
  assert.equal(res.ok, true);
  simulateFlight(battle);
  return battle;
}

test("thirty distinct worlds", () => {
  assert.ok(MAPS.length >= 30);
  const ids = new Set(MAPS.map((m) => m.id));
  assert.equal(ids.size, MAPS.length);
  for (const map of MAPS) {
    assert.ok(map.g > 0);
    assert.ok(map.name && map.body && map.blurb);
    assert.ok(map.palette.skyTop);
  }
});

test("every map spawns two tanks on finite shelves", () => {
  for (const map of MAPS) {
    const battle = createBattle(map, { seed: 1, names: ["A", "B"] });
    assert.equal(battle.terrain.length, 1600);
    for (let i = 0; i < battle.terrain.length; i++) {
      assert.ok(battle.terrain[i] >= 300 && battle.terrain[i] <= 864);
    }
    for (const tank of battle.tanks) {
      assert.ok(Number.isFinite(tank.x));
      assert.ok(tank.x > 40 && tank.x < 1560);
      assert.ok(Math.abs(slopeDydx(battle.terrain, tank.x)) < 0.45, `${map.id} spawn slope`);
      assert.equal(tank.hp, 100);
    }
    assert.ok(Math.abs(battle.tanks[0].x - battle.tanks[1].x) > 400);
  }
});

test("lower gravity carries a shell farther", () => {
  const mars = fireFlat({ g: 3.71, atmo: 0 }, 50, 62);
  const moon = fireFlat({ g: 1.62, atmo: 0 }, 50, 62);
  const mx = impactX(mars);
  const nx = impactX(moon);
  assert.ok(mx != null && nx != null, `impacts mars ${mx} moon ${nx}`);
  assert.ok(nx > mx + 80, `moon ${nx} should pass mars ${mx}`);
});

test("thick air shortens the shot", () => {
  const clear = fireFlat({ g: 1.35, atmo: 0 }, 46, 42);
  const thick = fireFlat({ g: 1.35, atmo: 1 }, 46, 42);
  const a = impactX(clear);
  const b = impactX(thick);
  assert.ok(a != null && b != null, `clear ${a} thick ${b}`);
  assert.ok(b < a - 40, `thick ${b} vs clear ${a}`);
});

test("wind pushes in air and does nothing in vacuum", () => {
  const still = fireFlat({ g: 3.71, atmo: 0.2 }, 52, 64);
  const blown = flatBattle({ g: 3.71, atmo: 0.2 });
  blown.wind = 36;
  blown.tanks[0].aim = 52;
  blown.tanks[0].power = 64;
  blown.tanks[0].weaponId = "he";
  launch(blown, 0, { exact: true });
  simulateFlight(blown);
  const a = impactX(still);
  const b = impactX(blown);
  assert.ok(Math.abs(a - b) > 15, `wind delta ${a} -> ${b}`);

  const v0 = fireFlat({ g: 3.71, atmo: 0 }, 52, 64);
  const v1 = flatBattle({ g: 3.71, atmo: 0 });
  v1.wind = 80;
  v1.tanks[0].aim = 52;
  v1.tanks[0].power = 64;
  v1.tanks[0].weaponId = "he";
  launch(v1, 0, { exact: true });
  simulateFlight(v1);
  assert.ok(Math.abs(impactX(v0) - impactX(v1)) < 1);
});

test("damage cuts range, speed authority, and fuel tank", () => {
  assert.ok(maxPower(100, 0) > maxPower(40, 0));
  assert.ok(maxPower(40, 20) < maxPower(40, 0));
  assert.ok(fuelCap(100) > fuelCap(30));
  const battle = flatBattle();
  battle.tanks[0].hp = 30;
  battle.tanks[0].fuel = 100;
  battle.tanks[0].power = 100;
  beginTurn(battle);
  assert.ok(battle.tanks[0].power <= maxPower(30, 0));
  assert.ok(battle.tanks[0].fuel <= fuelCap(30) + 0.01);
});

test("explosion hurts and digs", () => {
  const battle = flatBattle();
  const before = battle.terrain[1280];
  const weapon = getWeapon("he");
  explode(battle, 1280, 620, weapon, 0);
  assert.ok(battle.tanks[1].hp < 90);
  assert.ok(battle.terrain[1280] > before);
});

test("a centered hit outdamages a hull graze, and a near miss still counts", () => {
  const weapon = getWeapon("he");
  const ground = 640;
  const foeX = 1280;
  const strike = (x) => {
    const battle = flatBattle();
    battle.damageScale = 1;
    explode(battle, x, ground, weapon, 0);
    return 100 - battle.tanks[1].hp;
  };
  const center = strike(foeX);
  const tracks = strike(foeX + 30);
  const near = strike(foeX + 36 + 40);
  const outside = strike(foeX + 36 + weapon.radius + 8);
  assert.ok(center >= 95, `center ${center}`);
  assert.ok(tracks >= 55 && tracks < center, `tracks ${tracks} center ${center}`);
  assert.ok(near >= 15 && near < tracks, `near ${near} tracks ${tracks}`);
  assert.equal(outside, 0);

  const twice = flatBattle();
  explode(twice, foeX + 30, ground, weapon, 0);
  explode(twice, foeX + 30, ground, weapon, 0);
  assert.ok(twice.tanks[1].hp <= 0, `two track hits left ${twice.tanks[1].hp}`);
});

test("harder difficulties soak the same blast", () => {
  const weapon = getWeapon("he");
  const left = (scale) => {
    const battle = flatBattle();
    battle.damageScale = scale;
    explode(battle, 1280, 640, weapon, 0);
    return battle.tanks[1].hp;
  };
  const easy = left(1);
  const normal = left(0.62);
  const hard = left(0.42);
  assert.ok(easy < normal && normal < hard, `hp easy ${easy} normal ${normal} hard ${hard}`);
  assert.ok(easy <= 5, `easy center should kill or nearly kill, left ${easy}`);
  assert.ok(hard > 35, `hard center should survive one shell, left ${hard}`);
  assert.ok(normal > 15 && normal < 70, `normal center left ${normal}`);
});

test("campaign fuel and climb grow, and map 1 cannot cross the field", () => {
  const early = campaignFuelBase(0, 30);
  const mid = campaignFuelBase(14, 30);
  const late = campaignFuelBase(29, 30);
  assert.ok(early < mid && mid < late, `${early} ${mid} ${late}`);
  assert.ok(early <= 40 && late >= 95);
  assert.ok(campaignClimbMul(0, 30) < campaignClimbMul(29, 30));
  assert.ok(fuelCap(100, early) === early);
  assert.ok(fuelCap(30, early) < early);

  const battle = createBattle(MAPS[0], { seed: 1, fuelBase: early, climbMul: campaignClimbMul(0, 30) });
  battle.terrain.fill(640);
  battle.hazards = [];
  battle.tanks[0].x = 200;
  battle.tanks[0].lastY = 640;
  battle.crate.alive = false;
  let guard = 0;
  while (battle.tanks[0].fuel > 0.05 && guard < 8000) {
    driveTank(battle, 0, 1, 0.05);
    guard += 1;
  }
  const traveled = battle.tanks[0].x - 200;
  assert.ok(traveled > 250 && traveled < 700, `early flat range ${traveled}`);

  const steep = (mul) => {
    const hill = createBattle(MAPS[0], { seed: 2, fuelBase: 40, climbMul: mul });
    for (let x = 0; x < hill.terrain.length; x++) hill.terrain[x] = 800 - 0.85 * x;
    hill.tanks[0].x = 400;
    hill.tanks[0].lastY = hill.terrain[400];
    hill.hazards = [];
    return driveTank(hill, 0, 1, 0.2);
  };
  assert.equal(steep(campaignClimbMul(0, 30)).blocked, true);
  assert.equal(steep(campaignClimbMul(29, 30)).moved, true);
});

test("special ammo is scarce and HE is not", () => {
  const battle = flatBattle();
  battle.tanks[0].weaponId = "ap";
  const start = battle.tanks[0].loadout.ap;
  launch(battle, 0, { exact: true });
  assert.equal(battle.tanks[0].loadout.ap, start - 1);
  battle.projectiles = [];
  battle.tanks[0].weaponId = "he";
  launch(battle, 0, { exact: true });
  launch(battle, 0, { exact: true });
  assert.equal(battle.tanks[0].loadout.he, Infinity);
});

test("uphill costs more fuel and a wall stops the tracks", () => {
  const flat = flatBattle();
  const up = flatBattle();
  for (let x = 0; x < up.terrain.length; x++) up.terrain[x] = 640 - 0.3 * (x - 200);
  up.tanks[0].lastY = terrainY(up.terrain, up.tanks[0].x);
  const a = driveTank(flat, 0, 1, 0.5);
  const b = driveTank(up, 0, 1, 0.5);
  assert.equal(a.moved, true);
  assert.equal(b.moved, true);
  assert.ok(b.fuelSpent > a.fuelSpent);

  const wall = flatBattle();
  for (let x = 0; x < wall.terrain.length; x++) {
    if (x > wall.tanks[0].x) wall.terrain[x] = 640 - (x - wall.tanks[0].x) * 3;
  }
  const blocked = driveTank(wall, 0, 1, 0.3);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.fuelSpent, 0);
});

test("flat ground normal points up and a collapse causes fall damage", () => {
  const battle = flatBattle();
  const n = groundNormal(battle.terrain, 400);
  assert.ok(Math.abs(n.x) < 0.01);
  assert.ok(n.y < -0.9);
  battle.tanks[0].lastY = 640 - 90;
  applyEnvironment(battle, 0.016);
  assert.ok(battle.tanks[0].hp < 100);
});

test("tracing a shot does not chew the live map or the magazine", () => {
  const battle = flatBattle();
  const snap = battle.terrain[400];
  const ammo = battle.tanks[0].loadout.ap;
  const result = traceShot(battle, 0, 220, "ap", 55, 60);
  assert.equal(result.ok, true);
  assert.equal(battle.terrain[400], snap);
  assert.equal(battle.tanks[0].loadout.ap, ammo);
  assert.equal(battle.projectiles.length, 0);
});

test("the cpu picks a finite shot", () => {
  const battle = flatBattle({ g: 3.71, atmo: 0 });
  battle.turn = 1;
  const plan = planAiTurn(battle, "normal");
  assert.ok(plan.aim >= 0 && plan.aim <= 180);
  assert.ok(plan.power >= 8 && plan.power <= 100);
  assert.ok(plan.weaponId);
});

test("a killing blast ends the match", () => {
  const battle = flatBattle();
  battle.tanks[1].hp = 5;
  explode(battle, battle.tanks[1].x, 624, getWeapon("he"), 0);
  assert.equal(updateWinner(battle), 0);
});
