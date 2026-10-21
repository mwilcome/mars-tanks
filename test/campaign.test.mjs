import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyDebugGrant,
  buyAmmo,
  buyUpgrade,
  buyWeapon,
  careerStats,
  DEBUG_AMMO,
  DEBUG_CREDITS,
  freshCareer,
  loadoutFromCareer,
  purseFor,
  SHOP_WEAPONS,
  UPGRADES,
} from "../js/campaign.js";
import { maxPower } from "../js/constants.js";
import { Game } from "../js/game.js";
import { MAPS } from "../js/maps.js";
import { createBattle, explode } from "../js/sim.js";
import { getWeapon } from "../js/weapons.js";

test("depot prices and ranks stay on the published table", () => {
  assert.deepEqual(UPGRADES.fuel.values, [34, 45, 56, 67, 78, 89, 100]);
  assert.deepEqual(UPGRADES.fuel.costs, [40, 75, 120, 175, 240, 320]);
  assert.deepEqual(UPGRADES.climb.values, [0.72, 0.79, 0.86, 0.93, 1]);
  assert.deepEqual(UPGRADES.climb.costs, [50, 95, 150, 220]);
  assert.deepEqual(UPGRADES.armor.values, [100, 120, 140, 160, 180]);
  assert.deepEqual(UPGRADES.armor.costs, [60, 110, 170, 250]);
  assert.deepEqual(UPGRADES.gun.values, [0, 8, 16, 24]);
  assert.deepEqual(UPGRADES.gun.costs, [45, 90, 150]);
  assert.deepEqual(
    SHOP_WEAPONS.map((item) => [item.id, item.unlock, item.pack, item.packCost, item.after]),
    [
      ["ap", 80, 2, 30, 1],
      ["ricochet", 110, 2, 32, 2],
      ["siege", 170, 1, 28, 4],
      ["cluster", 210, 1, 26, 6],
      ["ion", 250, 1, 34, 8],
      ["mole", 310, 1, 36, 10],
      ["plasma", 390, 1, 32, 13],
    ],
  );
});

test("a first easy win pays win, damage, accuracy, and the kill", () => {
  const easy = purseFor({ levelIndex: 0, dealt: 100, shots: 3, hits: 2, killed: true, difficulty: "easy" });
  assert.deepEqual(easy, { win: 55, damage: 80, accuracy: 24, kill: 30, mult: 1, total: 189 });
  const normal = purseFor({ levelIndex: 0, dealt: 100, shots: 3, hits: 2, killed: true, difficulty: "normal" });
  assert.equal(normal.total, 212);
  const hard = purseFor({ levelIndex: 0, dealt: 100, shots: 3, hits: 2, killed: true, difficulty: "hard" });
  assert.equal(hard.total, 246);
  const quiet = purseFor({ levelIndex: 4, dealt: 0, shots: 0, hits: 0, killed: false, difficulty: "easy" });
  assert.equal(quiet.win, 79);
  assert.equal(quiet.accuracy, 0);
  assert.equal(quiet.kill, 0);
  assert.equal(quiet.total, 79);
});

test("upgrades spend credits, cap out, and do not mutate the save you passed in", () => {
  const start = freshCareer();
  start.credits = 40;
  const snap = JSON.stringify(start);
  const bought = buyUpgrade(start, "fuel");
  assert.equal(JSON.stringify(start), snap);
  assert.equal(bought.ok, true);
  assert.equal(bought.career.credits, 0);
  assert.equal(bought.career.fuel, 1);
  assert.equal(careerStats(bought.career).fuelBase, 45);
  assert.equal(buyUpgrade(bought.career, "fuel").reason, "credits");

  let ranked = freshCareer();
  ranked.credits = 100000;
  for (let i = 0; i < UPGRADES.armor.values.length - 1; i++) {
    const step = buyUpgrade(ranked, "armor");
    assert.equal(step.ok, true);
    ranked = step.career;
  }
  assert.equal(careerStats(ranked).hpMax, 180);
  assert.equal(buyUpgrade(ranked, "armor").reason, "max");
  assert.equal(buyUpgrade(ranked, "wings").reason, "unknown");
});

test("weapons unlock on map milestones and ammo is a separate purchase", () => {
  const broke = freshCareer(1);
  broke.credits = 10;
  assert.equal(buyWeapon(broke, "ap").reason, "credits");

  const early = freshCareer(0);
  early.credits = 500;
  assert.equal(buyWeapon(early, "ap").reason, "locked");

  const ready = freshCareer(1);
  ready.credits = 80;
  const unlocked = buyWeapon(ready, "ap");
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.career.weapons.ap, 2);
  assert.equal(unlocked.career.credits, 0);
  assert.equal(buyWeapon(unlocked.career, "ap").reason, "owned");
  assert.equal(buyAmmo(unlocked.career, "ap").reason, "credits");

  const stocked = unlocked.career;
  stocked.credits = 30;
  const pack = buyAmmo(stocked, "ap");
  assert.equal(pack.ok, true);
  assert.equal(pack.career.weapons.ap, 4);
  assert.equal(loadoutFromCareer(freshCareer()).ap, undefined);
  assert.equal(loadoutFromCareer(pack.career).ap, 4);
  assert.equal(loadoutFromCareer(pack.career).he, Infinity);
  assert.equal(buyAmmo(freshCareer(), "siege").reason, "locked");
});

test("debug grant fills the depot without maxing armor or the gun", () => {
  const granted = applyDebugGrant(freshCareer(4));
  assert.ok(granted.credits >= DEBUG_CREDITS);
  assert.equal(granted.index, 4);
  assert.equal(careerStats(granted).fuelBase, 100);
  assert.equal(careerStats(granted).climbMul, 1);
  assert.equal(granted.armor, 0);
  assert.equal(granted.gun, 0);
  for (const spec of SHOP_WEAPONS) {
    assert.ok(granted.weapons[spec.id] >= DEBUG_AMMO, spec.id);
  }
  const richer = applyDebugGrant({ ...granted, credits: 9000, armor: 2, gun: 1 });
  assert.equal(richer.credits, 9000);
  assert.equal(richer.armor, 2);
  assert.equal(richer.gun, 1);
});

test("purchased gun power and armor change the hull, and a stock hull still dies to easy HE", () => {
  assert.equal(maxPower(100, 0, 100, 8), 108);
  assert.equal(maxPower(100, 0), 100);
  const stock = createBattle(MAPS[0], { seed: 3 });
  stock.terrain.fill(640);
  stock.tanks[1].x = 1280;
  stock.tanks[1].lastY = 640;
  explode(stock, 1280, 640, getWeapon("he"), 0);
  assert.equal(stock.tanks[1].alive, false);

  const plated = createBattle(MAPS[0], {
    seed: 3,
    loads: [{ hpMax: 120 }, { hpMax: 120 }],
  });
  plated.terrain.fill(640);
  plated.damageScale = 1;
  plated.tanks[1].x = 1280;
  plated.tanks[1].lastY = 640;
  explode(plated, 1280, 640, getWeapon("he"), 0);
  assert.equal(plated.tanks[1].alive, true);
  assert.ok(plated.tanks[1].hp < 120);
  assert.ok(plated.tanks[1].hp > 0);
});

test("campaign wins open the depot, losses keep the map, and skirmish ignores the career", () => {
  const game = new Game();
  game.setDifficulty("easy");
  game.careers.easy = freshCareer();
  game.careers.easy.weapons.ap = 2;
  game.campaignIndex = 0;
  game.startCampaign();
  assert.equal(game.battle.map.id, MAPS[0].id);
  assert.equal(game.battle.tanks[0].fuelBase, 34);
  assert.equal(game.battle.tanks[0].climbMul, 0.72);
  assert.equal(game.battle.tanks[0].hpMax, 100);
  assert.equal(game.battle.tanks[0].loadout.ap, 2);
  assert.equal(game.battle.tanks[0].loadout.siege, undefined);
  assert.equal(game.battle.tanks[1].fuelBase, 34);
  assert.equal(game.battle.tanks[1].loadout.he, Infinity);
  assert.equal(game.battle.tanks[1].loadout.ap, undefined);

  game.battle.tanks[0].weaponId = "ap";
  game.pressFire();
  assert.equal(game.battle.tanks[0].loadout.ap, 1);
  game.battle.tanks[0].dealt = 100;
  game.battle.tanks[0].shots = 3;
  game.battle.tanks[0].hits = 2;
  game.battle.tanks[1].hp = 0;
  game.battle.tanks[1].alive = false;
  game.finishMatch();
  assert.equal(game.mode, "shop");
  assert.equal(game.career.credits, 189);
  assert.equal(game.career.index, 1);
  assert.equal(game.campaignIndex, 1);
  assert.equal(game.career.weapons.ap, 1);
  game.finishMatch();
  assert.equal(game.career.credits, 189);
  assert.equal(game.career.index, 1);

  const fuel = game.purchase("upgrade", "fuel");
  assert.equal(fuel.ok, true);
  assert.equal(game.career.fuel, 1);
  assert.equal(game.career.credits, 149);
  assert.equal(game.purchase("weapon", "plasma").reason, "locked");

  const next = new Game();
  next.setDifficulty("easy");
  next.careers.easy = freshCareer(2);
  next.careers.easy.credits = 10;
  next.careers.easy.weapons.ap = 3;
  next.campaignIndex = 2;
  next.startCampaign();
  next.battle.tanks[0].loadout.ap = 1;
  next.battle.tanks[0].hp = 0;
  next.battle.tanks[0].alive = false;
  next.finishMatch();
  assert.equal(next.mode, "victory");
  assert.equal(next.career.index, 2);
  assert.equal(next.career.credits, 10);
  assert.equal(next.career.weapons.ap, 1);

  const skirmish = new Game();
  skirmish.setDifficulty("normal");
  skirmish.careers.normal.credits = 40;
  skirmish.startMatch("tranquility", { versus: "cpu", seed: 9 });
  assert.equal(skirmish.battle.tanks[0].fuelBase, 100);
  assert.equal(skirmish.battle.tanks[0].loadout.ap, 5);
  assert.equal(skirmish.battle.tanks[1].loadout.plasma, 3);
  skirmish.battle.tanks[1].hp = 0;
  skirmish.battle.tanks[1].alive = false;
  skirmish.finishMatch();
  assert.equal(skirmish.mode, "victory");
  assert.equal(skirmish.career.credits, 40);

  const replay = new Game();
  replay.setDifficulty("hard");
  replay.careers.hard = freshCareer(30);
  replay.careers.hard.credits = 50;
  replay.careers.hard.fuel = 2;
  replay.campaignIndex = 30;
  replay.startCampaign();
  assert.equal(replay.campaignIndex, 0);
  assert.equal(replay.career.index, 0);
  assert.equal(replay.career.credits, 50);
  assert.equal(replay.career.fuel, 2);
  assert.equal(replay.battle.map.id, MAPS[0].id);
  assert.equal(replay.battle.tanks[0].fuelBase, 56);
});
