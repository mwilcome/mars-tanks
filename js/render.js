import { WORLD_H, WORLD_W, clamp } from "./constants.js";
import { hashString, mulberry32 } from "./rng.js";
import { terrainY } from "./sim.js";
import { getWeapon } from "./weapons.js";

const layers = new WeakMap();

const SKINS = [
  { lit: "#e36a52", mid: "#8d2e24", dark: "#3d1410", trim: "#f2c56a", track: "#1a120f" },
  { lit: "#8fd0ea", mid: "#1d556c", dark: "#0c2834", trim: "#e7f7ff", track: "#10161c" },
];

function getLayers(battle) {
  let pack = layers.get(battle);
  if (!pack) {
    const sky = document.createElement("canvas");
    sky.width = WORLD_W;
    sky.height = WORLD_H;
    const ground = document.createElement("canvas");
    ground.width = WORLD_W;
    ground.height = WORLD_H;
    pack = { sky, ground, skyReady: false };
    layers.set(battle, pack);
  }
  return pack;
}

function paintSky(ctx, map) {
  const pal = map.palette;
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.55, pal.skyMid);
  g.addColorStop(1, pal.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const rng = mulberry32(hashString(map.id + ":sky"));
  if (pal.stars > 0) {
    for (let i = 0; i < 90; i++) {
      const x = rng() * WORLD_W;
      const y = rng() * 460;
      const a = (0.25 + rng() * 0.75) * pal.stars;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, rng() > 0.8 ? 2 : 1, rng() > 0.8 ? 2 : 1);
    }
  }

  const dx = pal.discX;
  const dy = pal.discY;
  const dr = pal.discR;
  const disc = ctx.createRadialGradient(dx - dr * 0.28, dy - dr * 0.32, dr * 0.1, dx, dy, dr);
  disc.addColorStop(0, pal.discLight);
  disc.addColorStop(0.45, pal.discColor);
  disc.addColorStop(1, pal.discDark);
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(dx, dy, dr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#120c08";
  for (let i = 0; i < 7; i++) {
    const cx = dx + (rng() - 0.5) * dr * 1.3;
    const cy = dy + (rng() - 0.5) * dr * 1.3;
    if (Math.hypot(cx - dx, cy - dy) > dr * 0.82) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, dr * (0.04 + rng() * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (pal.haze && pal.hazeAlpha) {
    const haze = ctx.createLinearGradient(0, 380, 0, WORLD_H);
    haze.addColorStop(0, "rgba(0,0,0,0)");
    haze.addColorStop(1, pal.haze);
    ctx.globalAlpha = pal.hazeAlpha;
    ctx.fillStyle = haze;
    ctx.fillRect(0, 380, WORLD_W, WORLD_H - 380);
    ctx.globalAlpha = 1;
  }
}

function groundPath(ctx, terrain) {
  ctx.beginPath();
  ctx.moveTo(0, WORLD_H);
  for (let x = 0; x < WORLD_W; x += 2) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(WORLD_W, terrain[WORLD_W - 1]);
  ctx.lineTo(WORLD_W, WORLD_H);
  ctx.closePath();
}

function paintGround(ctx, battle) {
  const pal = battle.map.palette;
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  const fill = ctx.createLinearGradient(0, 280, 0, WORLD_H);
  fill.addColorStop(0, pal.surface);
  fill.addColorStop(0.08, pal.dirt);
  fill.addColorStop(0.45, pal.strata);
  fill.addColorStop(1, pal.dirtDark);
  groundPath(ctx, battle.terrain);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  groundPath(ctx, battle.terrain);
  ctx.clip();
  const rng = mulberry32(hashString(battle.map.id + ":speck"));
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 700; i++) {
    const x = rng() * WORLD_W;
    const y = 320 + rng() * 560;
    ctx.fillStyle = rng() > 0.5 ? "#fff" : "#000";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  for (let x = 0; x < WORLD_W; x++) {
    const burn = battle.scorch[x];
    if (burn > 0.04) {
      ctx.fillStyle = `rgba(20,10,6,${burn * 0.55})`;
      ctx.fillRect(x, battle.terrain[x], 1, 18 + burn * 16);
    }
    if (battle.glass[x]) {
      ctx.fillStyle = "rgba(210,245,255,0.55)";
      ctx.fillRect(x, battle.terrain[x] - 1, 1, 3);
    }
  }

  ctx.beginPath();
  ctx.moveTo(0, battle.terrain[0]);
  for (let x = 0; x < WORLD_W; x += 2) ctx.lineTo(x, battle.terrain[x]);
  ctx.strokeStyle = pal.surface;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawTank(ctx, tank, battle, time, active) {
  const skin = SKINS[tank.side] || SKINS[0];
  const x = tank.x;
  const gy = terrainY(battle.terrain, x);
  const ang = Math.atan2(terrainY(battle.terrain, x + 16) - terrainY(battle.terrain, x - 16), 32);

  ctx.save();
  ctx.translate(x, gy);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 4, 36, 7, ang * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ang);

  ctx.fillStyle = skin.track;
  roundRect(ctx, -34, -16, 68, 16, 8);
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.stroke();

  const spin = tank.tread * 0.12;
  for (let i = 0; i < 5; i++) {
    const wx = -22 + i * 11;
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.arc(wx, -8, 4.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9a9a9a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx, -8);
    ctx.lineTo(wx + Math.cos(spin + i) * 3.2, -8 + Math.sin(spin + i) * 3.2);
    ctx.stroke();
  }

  const hull = ctx.createLinearGradient(0, -34, 0, -10);
  hull.addColorStop(0, tank.alive ? skin.lit : "#666");
  hull.addColorStop(0.55, tank.alive ? skin.mid : "#333");
  hull.addColorStop(1, skin.dark);
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-32, -14);
  ctx.lineTo(-26, -28);
  ctx.lineTo(18, -28);
  ctx.lineTo(32, -15);
  ctx.lineTo(30, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = skin.trim;
  ctx.fillRect(-16, -26, 22, 3);

  if (tank.hp < 65) {
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, -24);
    ctx.lineTo(4, -16);
    ctx.moveTo(8, -27);
    ctx.lineTo(16, -18);
    ctx.stroke();
  }

  ctx.fillStyle = tank.alive ? skin.lit : "#555";
  ctx.beginPath();
  ctx.arc(4, -28, 11, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = skin.dark;
  ctx.fillRect(0, -34, 8, 4);

  ctx.save();
  ctx.translate(6, -30);
  ctx.rotate(-ang);
  ctx.rotate((-tank.aim * Math.PI) / 180);
  const kick = (tank.recoil || 0) * 8;
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(8 - kick, -3.3, 38, 6.6);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(42 - kick, -4.4, 8, 8.8);
  if (tank.recoil > 0.4) {
    ctx.fillStyle = "rgba(255,220,160,0.8)";
    ctx.beginPath();
    ctx.arc(52 - kick, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();

  if (!tank.alive) return;

  if (tank.hp < 78) {
    const puffs = tank.hp < 40 ? 3 : 1;
    for (let i = 0; i < puffs; i++) {
      const cycle = (time * 28 + i * 17) % 26;
      ctx.globalAlpha = 0.28 * (1 - cycle / 26);
      ctx.fillStyle = "#9aa0a6";
      ctx.beginPath();
      ctx.arc(x - 16, gy - 34 - cycle, 3 + cycle * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, x - 28, gy - 62, 56, 8, 2);
  ctx.fill();
  ctx.fillStyle = tank.hp > 35 ? "#7ddea0" : "#ff5d4a";
  roundRect(ctx, x - 27, gy - 61, 54 * clamp(tank.hp / 100, 0, 1), 6, 2);
  ctx.fill();

  ctx.font = "600 15px Share Tech Mono, ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = active ? "#ffbf5a" : "#d7deea";
  ctx.fillText(tank.name, x, gy - 68);
  if (active) {
    const bob = Math.sin(time * 4) * 3;
    ctx.fillStyle = "#ffbf5a";
    ctx.beginPath();
    ctx.moveTo(x, gy - 86 + bob);
    ctx.lineTo(x - 6, gy - 96 + bob);
    ctx.lineTo(x + 6, gy - 96 + bob);
    ctx.fill();
  }
}

function drawHazards(ctx, battle, time) {
  for (const hazard of battle.hazards) {
    if (hazard.type === "geyser") {
      const surf = terrainY(battle.terrain, hazard.x);
      for (let i = 0; i < 16; i++) {
        const t = (time * 0.75 + i / 16) % 1;
        const y = surf - t * 250;
        const x = hazard.x + Math.sin(time * 2.4 + i) * hazard.r * 0.22 * t;
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.fillStyle = "#e7fbff";
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + t * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (hazard.type === "lava") {
      ctx.beginPath();
      const x0 = clamp(Math.floor(hazard.x0), 1, WORLD_W - 2);
      const x1 = clamp(Math.ceil(hazard.x1), 1, WORLD_W - 2);
      ctx.moveTo(x0, battle.terrain[x0] + 16);
      for (let x = x0; x <= x1; x += 3) {
        const wave = Math.sin(time * 5 + x * 0.08) * 2;
        ctx.lineTo(x, battle.terrain[x] + wave);
      }
      ctx.lineTo(x1, battle.terrain[x1] + 18);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, ${90 + Math.sin(time * 7) * 30}, 16, 0.92)`;
      ctx.fill();
    } else if (hazard.type === "slow") {
      ctx.fillStyle = "rgba(40, 90, 70, 0.28)";
      ctx.beginPath();
      const x0 = clamp(Math.floor(hazard.x0), 0, WORLD_W - 1);
      const x1 = clamp(Math.ceil(hazard.x1), 0, WORLD_W - 1);
      ctx.moveTo(x0, battle.terrain[x0]);
      for (let x = x0; x <= x1; x += 4) ctx.lineTo(x, battle.terrain[x]);
      ctx.lineTo(x1, battle.terrain[x1] + 14);
      ctx.lineTo(x0, battle.terrain[x0] + 14);
      ctx.fill();
    }
  }
  if (battle.map.friction < 0.75) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    const rng = mulberry32(3);
    for (let i = 0; i < 24; i++) {
      const x = (rng() * WORLD_W + time * 12) % WORLD_W;
      const y = terrainY(battle.terrain, x) - 1;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 3 + i);
      ctx.fillRect(x, y, 8, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}

function drawCrate(ctx, battle, time) {
  const crate = battle.crate;
  if (!crate?.alive) return;
  const y = terrainY(battle.terrain, crate.x) - 18 - Math.sin(time * 3) * 3;
  ctx.save();
  ctx.translate(crate.x, y);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.font = "700 13px Share Tech Mono, ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("FUEL", 0, -16);
  ctx.fillStyle = "#ffe08a";
  ctx.fillText("FUEL", 0, -17);
  ctx.fillStyle = "#111";
  ctx.fillRect(-11, -10, 22, 18);
  ctx.fillStyle = "#f0b429";
  ctx.fillRect(-9, -8, 18, 14);
  ctx.fillStyle = "#5c3b08";
  ctx.fillRect(-2, -8, 4, 14);
  ctx.restore();
}

function drawProjectiles(ctx, battle) {
  for (const shot of battle.projectiles) {
    const weapon = getWeapon(shot.weaponId);
    if (shot.mode === "burrow") {
      const y = terrainY(battle.terrain, shot.x);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(shot.x, y, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.strokeStyle = weapon.color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const trail = shot.trail || [];
    if (trail.length) {
      ctx.moveTo(trail[0].x, trail[0].y);
      for (const point of trail) ctx.lineTo(point.x, point.y);
      ctx.lineTo(shot.x, shot.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff8e8";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = weapon.color;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFx(ctx, fxList) {
  for (const fx of fxList) {
    const k = 1 - fx.age / fx.life;
    if (fx.kind === "boom") {
      ctx.globalAlpha = k * 0.45;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (1.1 - k), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.strokeStyle = "#fff3";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (0.3 + (1 - k)), 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.kind === "flash") {
      ctx.globalAlpha = k;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 10 * k + 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = fx.color || "#ddd";
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, (fx.size || 2) * (0.6 + k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPopups(ctx, battle) {
  ctx.font = "700 22px Share Tech Mono, ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const popup of battle.popups) {
    ctx.globalAlpha = 1 - popup.age / 1.1;
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, popup.x, popup.y - popup.age * 26);
  }
  ctx.globalAlpha = 1;
}

function drawDust(ctx, map, time) {
  const pal = map.palette;
  if (!pal.dust) return;
  const rng = mulberry32(77);
  ctx.fillStyle = pal.dustColor || "#e7b090";
  for (let i = 0; i < 28; i++) {
    const x0 = rng() * WORLD_W;
    const y = rng() * 520;
    const speed = 16 + rng() * 50;
    const x = (x0 + time * speed * pal.dust) % WORLD_W;
    ctx.globalAlpha = 0.18 * pal.dust;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

export function render(ctx, game) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const battle = game.battle;
  if (!battle) return;

  const pack = getLayers(battle);
  if (!pack.skyReady) {
    paintSky(pack.sky.getContext("2d"), battle.map);
    pack.skyReady = true;
  }
  if (battle.terrainDirty) {
    paintGround(pack.ground.getContext("2d"), battle);
    battle.terrainDirty = false;
  }

  const amp = game.reduced ? 0 : game.shake;
  const ox = Math.sin(game.time * 43) * amp;
  const oy = Math.cos(game.time * 37) * amp * 0.6;
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  ctx.drawImage(pack.sky, 0, 0);
  drawDust(ctx, battle.map, game.time);
  ctx.drawImage(pack.ground, 0, 0);
  drawHazards(ctx, battle, game.time);
  drawCrate(ctx, battle, game.time);

  const active = battle.phase === "over" ? -1 : battle.turn;
  for (const tank of battle.tanks) drawTank(ctx, tank, battle, game.time, tank.side === active && game.mode === "battle");
  drawProjectiles(ctx, battle);
  drawFx(ctx, game.fx);
  drawPopups(ctx, battle);

  const vignette = ctx.createRadialGradient(800, 480, 280, 800, 480, 980);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
