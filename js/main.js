import { shopCatalog } from "./campaign.js";
import { airLabel, gLabel } from "./constants.js";
import { createAudio } from "./audio.js";
import { Game, MAPS } from "./game.js";
import { render } from "./render.js";
import { aimWobbleFor, maxPowerFor } from "./sim.js";
import { arsenal, getWeapon } from "./weapons.js";

const audio = createAudio();
const game = new Game();
game.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
const hud = document.getElementById("hud");
const controls = document.getElementById("controls");
const banner = document.getElementById("banner");
const ticker = document.getElementById("ticker");
const screens = {
  title: document.getElementById("screen-title"),
  help: document.getElementById("screen-help"),
  maps: document.getElementById("screen-maps"),
  pass: document.getElementById("screen-pass"),
  victory: document.getElementById("screen-victory"),
  shop: document.getElementById("screen-shop"),
};

const held = { left: false, right: false };
const keys = new Set();
let sliding = null;
let abortArmed = 0;
let resetArmed = 0;
let shopSig = "";

const angleSlider = document.getElementById("angle-slider");
const powerSlider = document.getElementById("power-slider");
const weaponsEl = document.getElementById("weapons");

function bindHold(button, which) {
  const start = (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held[which] = true;
    button.classList.add("held");
    audio.unlock();
  };
  const stop = () => {
    held[which] = false;
    button.classList.remove("held");
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
}

function bindRepeat(button, fn) {
  let timer = 0;
  let delay = 0;
  const stop = () => {
    window.clearInterval(timer);
    window.clearTimeout(delay);
    timer = 0;
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    audio.unlock();
    fn();
    delay = window.setTimeout(() => {
      timer = window.setInterval(fn, 42);
    }, 200);
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
}

bindHold(document.getElementById("btn-left"), "left");
bindHold(document.getElementById("btn-right"), "right");
bindRepeat(document.getElementById("btn-angle-down"), () => game.nudgeAim(-1));
bindRepeat(document.getElementById("btn-angle-up"), () => game.nudgeAim(1));
bindRepeat(document.getElementById("btn-power-down"), () => game.nudgePower(-1));
bindRepeat(document.getElementById("btn-power-up"), () => game.nudgePower(1));

document.getElementById("btn-fire").addEventListener("click", () => {
  audio.unlock();
  game.pressFire();
});

document.getElementById("btn-campaign").addEventListener("click", () => {
  audio.unlock();
  game.startCampaign();
});
document.getElementById("btn-depot").addEventListener("click", () => {
  audio.unlock();
  game.openDepot();
});
document.getElementById("btn-new-campaign").addEventListener("click", () => {
  const button = document.getElementById("btn-new-campaign");
  const now = performance.now();
  if (button.dataset.armed === "1" && now - resetArmed < 2200) {
    button.dataset.armed = "0";
    button.textContent = "NEW CAMPAIGN";
    audio.unlock();
    game.resetCampaign();
    return;
  }
  button.dataset.armed = "1";
  button.textContent = "SURE?";
  resetArmed = now;
});
document.getElementById("btn-shop-next").addEventListener("click", () => {
  audio.unlock();
  game.continueFromShop();
});
document.getElementById("btn-shop-title").addEventListener("click", () => game.enterTitle());
document.getElementById("shop-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-buy]");
  if (!button) return;
  audio.unlock();
  game.purchase(button.dataset.buy, button.dataset.id);
});
document.getElementById("btn-skirmish").addEventListener("click", () => {
  audio.unlock();
  game.showMaps();
});
document.getElementById("btn-help").addEventListener("click", () => game.showHelp());
document.getElementById("btn-help-back").addEventListener("click", () => game.showTitle());
document.getElementById("btn-maps-back").addEventListener("click", () => game.showTitle());
document.getElementById("btn-cpu").addEventListener("click", () => {
  audio.unlock();
  if (!game.selectedMapId) return;
  game.startMatch(game.selectedMapId, { versus: "cpu" });
});
document.getElementById("btn-p2").addEventListener("click", () => {
  audio.unlock();
  if (!game.selectedMapId) return;
  game.startMatch(game.selectedMapId, { versus: "p2" });
});
document.getElementById("btn-ready").addEventListener("click", () => {
  audio.unlock();
  game.acknowledgePass();
});
document.getElementById("btn-rematch").addEventListener("click", () => game.rematch());
document.getElementById("btn-next").addEventListener("click", () => game.nextCampaign());
document.getElementById("btn-victory-maps").addEventListener("click", () => game.showMaps());
document.getElementById("btn-victory-title").addEventListener("click", () => game.enterTitle());

document.getElementById("btn-mute").addEventListener("click", () => {
  audio.unlock();
  audio.toggle();
  syncChrome();
});

document.getElementById("btn-abort").addEventListener("click", () => {
  const button = document.getElementById("btn-abort");
  const now = performance.now();
  if (button.dataset.armed === "1" && now - abortArmed < 2200) {
    button.dataset.armed = "0";
    button.textContent = "ABORT";
    game.abort();
    return;
  }
  button.dataset.armed = "1";
  button.textContent = "SURE?";
  abortArmed = now;
});

document.getElementById("diff").addEventListener("click", (event) => {
  const level = event.target?.dataset?.diff;
  if (!level) return;
  document.getElementById("btn-new-campaign").dataset.armed = "0";
  game.setDifficulty(level);
  syncChrome();
});

function bindSlider(slider, which) {
  slider.addEventListener("pointerdown", () => {
    sliding = which;
    audio.unlock();
  });
  const release = () => {
    if (sliding === which) sliding = null;
  };
  slider.addEventListener("pointerup", release);
  slider.addEventListener("pointercancel", release);
  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    if (which === "aim") game.setAim(value);
    else game.setPower(value);
  });
}

bindSlider(angleSlider, "aim");
bindSlider(powerSlider, "power");

for (const weapon of arsenal()) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wpn";
  button.dataset.id = weapon.id;
  button.title = weapon.blurb;
  button.addEventListener("click", () => {
    audio.unlock();
    game.selectWeapon(weapon.id);
  });
  weaponsEl.appendChild(button);
}

const grid = document.getElementById("map-grid");
for (const map of MAPS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "map-card";
  button.dataset.id = map.id;
  button.style.background = `linear-gradient(180deg, ${map.palette.skyTop} 0%, ${map.palette.skyMid} 48%, ${map.palette.dirt} 100%)`;
  button.innerHTML = `<span class="clear" hidden>CLEAR</span><span class="body"></span><span class="foot"></span>`;
  button.querySelector(".body").textContent = map.name;
  button.querySelector(".foot").textContent = `${map.body} · ${gLabel(map.g)} · ${airLabel(map.atmo)}`;
  button.addEventListener("click", () => {
    audio.unlock();
    game.selectedMapId = map.id;
    syncChrome();
  });
  grid.appendChild(button);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
  if (event.repeat && (event.code === "Space" || event.code === "Enter" || event.code === "KeyF")) return;
  keys.add(event.code);
  audio.unlock();
  if (event.code === "Space" || event.code === "Enter" || event.code === "KeyF") {
    if (game.mode === "pass") game.acknowledgePass();
    else game.pressFire();
  } else if (event.code === "KeyM") {
    audio.toggle();
  } else if (event.code.startsWith("Digit")) {
    const index = Number(event.code.slice(5)) - 1;
    const weapon = arsenal()[index];
    if (weapon) game.selectWeapon(weapon.id);
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

window.addEventListener("pointerup", () => {
  held.left = false;
  held.right = false;
});
window.addEventListener("pointercancel", () => {
  held.left = false;
  held.right = false;
});
window.addEventListener("blur", () => keys.clear());

document.getElementById("board").addEventListener("touchmove", (event) => {
  if (event.target.closest(".screen, button, input, a")) return;
  event.preventDefault();
}, { passive: false });

function readout(tank, enemy) {
  const info = game.tankReadout(tank);
  const low = info.hp / Math.max(1, info.hpMax) <= 0.35;
  const hpWidth = Math.min(100, (info.hp / Math.max(1, info.hpMax)) * 100);
  return `<div class="name ${enemy ? "" : "on"}"><span><i class="swatch"></i>${tank.name}</span><span>${tank.alive ? "" : "DOWN"}</span></div>
    <div class="bar hp ${low ? "low" : ""}"><span style="width:${hpWidth}%"></span></div>
    <div class="stat"><span>HP ${info.hp}</span><span>SPD ${info.speed}%</span></div>
    <div class="bar fuel"><span style="width:${Math.min(100, (info.fuel / Math.max(1, info.fuelCap)) * 100)}%"></span></div>
    <div class="stat"><span>FUEL ${info.fuel}</span><span>RANGE ${info.range}%</span></div>`;
}

function syncChrome() {
  const mode = game.mode;
  screens.title.hidden = mode !== "title";
  screens.help.hidden = mode !== "help";
  screens.maps.hidden = mode !== "maps";
  screens.pass.hidden = mode !== "pass";
  screens.victory.hidden = mode !== "victory";
  screens.shop.hidden = mode !== "shop";
  const inMatch = mode === "battle" || mode === "victory" || mode === "pass";
  hud.hidden = !inMatch;
  controls.hidden = mode !== "battle";
  ticker.hidden = mode !== "battle";
  banner.hidden = mode !== "battle" || game.bannerT <= 0;
  banner.textContent = game.banner;

  const campBtn = document.getElementById("btn-campaign");
  if (game.campaignIndex >= MAPS.length) campBtn.textContent = "REPLAY TOUR";
  else if (game.campaignIndex > 0) campBtn.textContent = `CONTINUE · ${game.campaignIndex + 1}/${MAPS.length}`;
  else campBtn.textContent = "CAMPAIGN";
  const depotBtn = document.getElementById("btn-depot");
  const resetBtn = document.getElementById("btn-new-campaign");
  const showCareer = mode === "title" && game.showDepotOnTitle();
  depotBtn.hidden = !showCareer;
  resetBtn.hidden = !showCareer;
  if (!showCareer || resetBtn.dataset.armed !== "1") {
    resetBtn.dataset.armed = "0";
    resetBtn.textContent = "NEW CAMPAIGN";
  }

  for (const button of document.querySelectorAll("#diff button")) {
    button.setAttribute("aria-pressed", button.dataset.diff === game.difficulty ? "true" : "false");
  }
  document.getElementById("btn-mute").textContent = audio.muted ? "MUTED" : "SOUND";

  for (const card of grid.children) {
    card.classList.toggle("selected", card.dataset.id === game.selectedMapId && mode === "maps");
    const index = MAPS.findIndex((map) => map.id === card.dataset.id);
    card.querySelector(".clear").hidden = !(index < game.campaignIndex);
  }
  const selected = MAPS.find((map) => map.id === game.selectedMapId);
  document.getElementById("map-blurb").textContent = mode === "maps" && selected ? selected.blurb : "Choose a world.";
  const canDeploy = mode === "maps" && !!selected;
  document.getElementById("btn-cpu").disabled = !canDeploy;
  document.getElementById("btn-p2").disabled = !canDeploy;

  if (location.protocol === "file:") {
    const warn = document.getElementById("file-warn");
    warn.hidden = false;
    warn.textContent = "Open this through a local server. Modules do not run from a file:// page.";
  }

  renderShop();

  const battle = game.battle;
  if (!battle || !inMatch) return;
  const map = battle.map;
  const mapIndex = MAPS.findIndex((item) => item.id === map.id) + 1;
  document.getElementById("hud-map").textContent = map.name.toUpperCase();
  document.getElementById("hud-meta").textContent = `${map.body} · ${gLabel(map.g)} · ${airLabel(map.atmo)} · ${mapIndex}/${MAPS.length}`;
  document.getElementById("read-0").className = "readout";
  document.getElementById("read-1").className = "readout enemy";
  document.getElementById("read-0").innerHTML = readout(battle.tanks[0], false);
  document.getElementById("read-1").innerHTML = readout(battle.tanks[1], true);
  const activeName = document.querySelectorAll(".readout .name");
  activeName[0].classList.toggle("on", battle.turn === 0 && mode === "battle");
  activeName[1].classList.toggle("on", battle.turn === 1 && mode === "battle");

  if (map.atmo <= 0.01) {
    document.getElementById("wind-arrow").textContent = "·";
    document.getElementById("wind-value").textContent = "VACUUM";
    document.getElementById("air-value").textContent = "NO DRAG";
  } else {
    const wind = Math.round(battle.wind);
    document.getElementById("wind-arrow").textContent = wind === 0 ? "·" : wind > 0 ? "→" : "←";
    document.getElementById("wind-value").textContent = wind === 0 ? "STILL" : `${Math.abs(wind)} m/s`;
    document.getElementById("air-value").textContent = airLabel(map.atmo);
  }

  const actor = battle.tanks[battle.turn];
  document.getElementById("turn-label").textContent = mode === "victory"
    ? "END"
    : mode === "pass"
      ? "PASS"
      : actor.name;

  if (mode === "pass") {
    document.getElementById("pass-name").textContent = actor.name;
  }

  if (mode === "victory") {
    const winner = battle.winner;
    const title = winner === -1
      ? "BOTH HULLS LOST"
      : `${battle.tanks[winner].name} HOLDS THE FIELD`;
    document.getElementById("victory-title").textContent = title;
    const stats = battle.tanks.map((tank) => `${tank.name} ${tank.shots} shots · ${Math.round(tank.dealt)} dmg`).join("   ");
    const cleared = game.match?.kind === "campaign" && winner === 0 && game.campaignIndex >= MAPS.length;
    document.getElementById("victory-stats").textContent = cleared ? `${stats}   Tour complete.` : stats;
    const next = document.getElementById("btn-next");
    const showNext = game.match?.kind === "campaign" && winner === 0;
    next.hidden = !showNext;
    next.textContent = game.campaignIndex >= MAPS.length ? "REPLAY TOUR" : "NEXT WORLD";
  }

  if (mode !== "battle") return;
  const human = game.humanReady();
  const phase = battle.phase;
  const cap = maxPowerFor(actor);
  if (actor.power > cap) actor.power = cap;
  document.getElementById("angle-val").textContent = `${String(Math.round(actor.aim)).padStart(3, "0")}°`;
  document.getElementById("power-val").textContent = `${String(Math.round(actor.power)).padStart(3, "0")}/${cap}`;
  if (sliding !== "aim") angleSlider.value = String(Math.round(actor.aim));
  powerSlider.max = String(cap);
  if (sliding !== "power") powerSlider.value = String(Math.round(Math.min(actor.power, cap)));

  const locked = !human || phase === "fly" || phase === "settle" || phase === "over";
  document.getElementById("btn-fire").disabled = locked;
  document.getElementById("btn-left").disabled = locked;
  document.getElementById("btn-right").disabled = locked;
  for (const id of ["btn-angle-down", "btn-angle-up", "btn-power-down", "btn-power-up"]) {
    document.getElementById(id).disabled = locked;
  }
  angleSlider.disabled = locked;
  powerSlider.disabled = locked;

  let lamp = phase === "fly" ? "IN FLIGHT" : phase === "settle" ? "IMPACT" : "READY";
  if (!game.ai && (game.devLevel > 0 || game.debugUpgrades)) {
    const tags = [];
    if (game.devLevel > 0) tags.push(`L${game.devLevel}`);
    if (game.debugUpgrades) tags.push("FULL");
    lamp = `${lamp} · ${tags.join(" ")}`;
  }
  document.getElementById("phase-lamp").textContent = game.ai ? "ENEMY" : lamp;
  const wobble = aimWobbleFor(actor);
  const wobbleText = wobble > 0.8 ? ` ±${wobble.toFixed(1)}°` : "";
  document.getElementById("status-line").textContent = game.status || (actor.burning ? "LAVA" : wobbleText);

  for (const button of weaponsEl.children) {
    const id = button.dataset.id;
    const count = actor.loadout[id];
    const owned = count === Infinity || Number.isFinite(count);
    const label = count === Infinity ? "∞" : count;
    const weapon = arsenal().find((item) => item.id === id);
    button.hidden = !owned;
    button.textContent = `${weapon.name} ${owned ? label : ""}`;
    button.classList.toggle("on", actor.weaponId === id);
    button.disabled = locked || !owned || (count !== Infinity && count <= 0);
  }

  ticker.textContent = battle.log.slice(0, 3).join("  ·  ");
}

function upgradeText(id, value) {
  if (id === "climb") return `${Math.round(value * 100)}%`;
  if (id === "gun") return `+${value}`;
  return String(value);
}

function renderShop() {
  if (game.mode !== "shop") {
    shopSig = "";
    return;
  }
  const career = game.career;
  const catalog = shopCatalog(career);
  const purse = game.lastPurse;
  const sig = JSON.stringify({ catalog, purse, note: game.shopNote });
  const title = document.getElementById("shop-title");
  const cleared = career.index > 0 ? MAPS[Math.min(MAPS.length, career.index) - 1] : null;
  title.textContent = career.index >= MAPS.length
    ? "TOUR COMPLETE"
    : purse && cleared
      ? cleared.name.toUpperCase()
      : "SUPPLY DEPOT";
  document.getElementById("shop-credits").textContent = `${catalog.credits} cr`;
  const purseLine = document.getElementById("shop-purse");
  if (purse) {
    const scale = purse.mult === 1 ? "" : ` · ×${purse.mult}`;
    purseLine.textContent = `PAID ${purse.total} · WIN ${purse.win} · DAMAGE ${purse.damage} · AIM ${purse.accuracy} · KILL ${purse.kill}${scale}`;
  } else {
    purseLine.textContent = "Credits and shells carry to the next world. HE stays free.";
  }
  document.getElementById("shop-note").textContent = game.shopNote || "";
  document.getElementById("btn-shop-next").textContent = career.index >= MAPS.length ? "TOUR COMPLETE" : "NEXT WORLD";
  if (sig === shopSig) return;
  shopSig = sig;
  const list = document.getElementById("shop-list");
  list.replaceChildren();
  for (const row of catalog.upgrades) {
    const item = document.createElement("div");
    item.className = "shop-row";
    const copy = document.createElement("div");
    copy.className = "shop-copy";
    const name = document.createElement("strong");
    name.textContent = row.name;
    const detail = document.createElement("span");
    detail.textContent = row.maxed
      ? `${upgradeText(row.id, row.value)} · ${row.blurb}`
      : `${upgradeText(row.id, row.value)} → ${upgradeText(row.id, row.next)} · ${row.blurb}`;
    copy.append(name, detail);
    const actions = document.createElement("div");
    actions.className = "shop-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.buy = "upgrade";
    button.dataset.id = row.id;
    button.textContent = row.maxed ? "MAX" : `${row.cost} cr`;
    button.disabled = row.maxed;
    actions.append(button);
    item.append(copy, actions);
    list.append(item);
  }
  for (const row of catalog.weapons) {
    const weapon = getWeapon(row.id);
    const item = document.createElement("div");
    item.className = "shop-row";
    const copy = document.createElement("div");
    copy.className = "shop-copy";
    const name = document.createElement("strong");
    name.textContent = weapon.name;
    const detail = document.createElement("span");
    if (row.owned) detail.textContent = `${row.ammo} in the magazine · ${weapon.blurb}`;
    else if (row.locked) detail.textContent = `Unlocks after map ${row.after} · ${weapon.blurb}`;
    else detail.textContent = `Includes ${row.pack} · ${weapon.blurb}`;
    copy.append(name, detail);
    const actions = document.createElement("div");
    actions.className = "shop-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = row.id;
    if (row.owned) {
      button.dataset.buy = "ammo";
      button.textContent = `+${row.pack} · ${row.packCost} cr`;
    } else if (row.locked) {
      button.dataset.buy = "weapon";
      button.textContent = `AFTER MAP ${row.after}`;
      button.disabled = true;
    } else {
      button.dataset.buy = "weapon";
      button.textContent = `UNLOCK ${row.unlock}`;
    }
    actions.append(button);
    item.append(copy, actions);
    list.append(item);
  }
}

function sampleInput(dt) {
  const battle = game.battle;
  const human = game.humanReady();
  if (!human || !battle) return { left: false, right: false };
  if (keys.has("ArrowLeft")) game.nudgeAim(-90 * dt);
  if (keys.has("ArrowRight")) game.nudgeAim(90 * dt);
  if (keys.has("ArrowUp") || keys.has("KeyW")) game.nudgePower(55 * dt);
  if (keys.has("ArrowDown") || keys.has("KeyS")) game.nudgePower(-55 * dt);
  if (battle.phase !== "move" && battle.phase !== "aim") return { left: false, right: false };
  return {
    left: held.left || keys.has("KeyA"),
    right: held.right || keys.has("KeyD"),
  };
}

const params = new URLSearchParams(location.search);
const debugUpgrades = params.get("debug") === "1" || params.get("upgrades") === "1";
const launched = game.applyDebugLaunch({ level: params.get("level"), upgrades: debugUpgrades });
if (!launched && params.get("map")) {
  game.debugUpgrades = debugUpgrades;
  game.startMatch(params.get("map"), { versus: params.get("vs") === "p2" ? "p2" : "cpu" });
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!document.hidden) game.update(dt, sampleInput(dt));
  render(ctx, game);
  syncChrome();
  while (game.sfxQueue.length) audio.play(game.sfxQueue.shift());
  audio.engine(game.driving && !audio.muted);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
