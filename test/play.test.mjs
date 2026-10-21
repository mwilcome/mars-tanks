import assert from "node:assert/strict";
import { test } from "node:test";
import { traceShot } from "../js/ai.js";
import { Game } from "../js/game.js";
import { MAPS } from "../js/maps.js";

test("a match can be driven, aimed, and fired without throwing", () => {
  const game = new Game();
  assert.equal(game.mode, "title");
  assert.equal(MAPS.length, 30);
  game.setDifficulty("easy");
  game.startMatch("tranquility", { versus: "cpu", seed: 5 });
  assert.equal(game.mode, "battle");
  const battle = game.battle;
  const fuel = battle.tanks[0].fuel;
  for (let i = 0; i < 20; i++) game.update(1 / 30, { left: false, right: true });
  assert.ok(battle.tanks[0].fuel < fuel);
  assert.ok(battle.tanks[0].x > 80);

  let best = { aim: 55, power: 60, dmg: -1 };
  for (const aim of [35, 48, 60, 72]) {
    for (const power of [45, 60, 78]) {
      const result = traceShot(battle, 0, battle.tanks[0].x, "he", aim, power);
      const dmg = battle.tanks[1].hp - result.foeHp;
      if (dmg > best.dmg) best = { aim, power, dmg };
    }
  }
  battle.tanks[0].aim = best.aim;
  battle.tanks[0].power = best.power;
  game.pressAim();
  assert.equal(battle.phase, "aim");
  game.pressFire();
  assert.equal(battle.phase, "fly");

  let guard = 0;
  while (game.mode === "battle" && battle.turn === 0 && guard < 800) {
    game.update(1 / 50, { left: false, right: false });
    guard += 1;
  }
  assert.ok(battle.impacts.length > 0 || battle.log.some((line) => /SHORT|OVER|hit|horizon|Fuse/i.test(line)));
  assert.ok(guard < 800);
});
