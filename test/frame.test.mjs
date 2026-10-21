import assert from "node:assert/strict";
import test from "node:test";
import { MAPS, generateTerrain } from "../js/maps.js";
import { frameView } from "../js/render.js";

function spanOf(map) {
  const terrain = generateTerrain(map);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < terrain.length; i++) {
    minY = Math.min(minY, terrain[i]);
    maxY = Math.max(maxY, terrain[i]);
  }
  return { minY, maxY };
}

test("a phone landscape frame keeps every map's ground in the clear band", () => {
  const cssW = 857;
  const cssH = 344;
  const insetTop = 42;
  const insetBottom = 96;
  const letterboxScale = (cssH * 9) / 16 / 1600;
  for (const map of MAPS) {
    const { minY, maxY } = spanOf(map);
    const view = frameView({ cssW, cssH, dpr: 1, insetTop, insetBottom, minY, maxY });
    const nameTop = view.originY + (minY - 96) * view.scale;
    const ground = view.originY + maxY * view.scale;
    assert.ok(nameTop >= insetTop - 1, `${map.id} name ${nameTop.toFixed(1)}`);
    assert.ok(ground <= cssH - insetBottom + 1, `${map.id} ground ${ground.toFixed(1)}`);
    assert.ok(view.scale > 0.4, `${map.id} scale ${view.scale.toFixed(3)} vs strip ${letterboxScale.toFixed(3)}`);
  }
});

test("desktop with no overlay still shows the whole world", () => {
  const view = frameView({ cssW: 1440, cssH: 700, dpr: 1, insetTop: 0, insetBottom: 0, minY: 500, maxY: 760 });
  const scale = Math.min(1440 / 1600, 700 / 900);
  assert.equal(view.scale, scale);
  assert.ok(Math.abs(view.originY) < 1);
});

test("a high shell is pulled into spare sky without burying the ground", () => {
  const base = {
    cssW: 857,
    cssH: 344,
    dpr: 1,
    insetTop: 42,
    insetBottom: 96,
    minY: 620,
    maxY: 700,
  };
  const parked = frameView(base);
  const view = frameView({ ...base, shellY: 340 });
  const ground = view.originY + 700 * view.scale;
  assert.ok(view.originY > parked.originY + 1, "camera lifts toward the shell");
  assert.ok(ground <= 344 - 96 + 1, `ground ${ground}`);
  assert.ok(view.originY + 340 * view.scale >= 42 - 1, "shell enters the clear band");
});
