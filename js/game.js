import { planAiTurn } from "./ai.js";
import { clamp, gravityPx, maxPower } from "./constants.js";
import { MAPS, mapById } from "./maps.js";
import {
  applyEnvironment,
  beginTurn,
  createBattle,
  driveTank,
  fuelCapFor,
  launch,
  maxPowerFor,
  stepProjectiles,
  terrainY,
  updateWinner,
} from "./sim.js";
import { getWeapon } from "./weapons.js";

const STORE_CAMP = "mars-tanks-campaign";
const STORE_DIFF = "mars-tanks-difficulty";

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export class Game {
  constructor() {
    this.mode = "title";
    const savedDiff = readStore(STORE_DIFF);
    this.difficulty = ["easy", "normal", "hard"].includes(savedDiff) ? savedDiff : "normal";
    const savedCamp = Number(readStore(STORE_CAMP));
    this.campaignIndex = Number.isFinite(savedCamp) ? Math.max(0, savedCamp) : 0;
    this.battle = null;
    this.match = null;
    this.fx = [];
    this.banner = "";
    this.bannerT = 0;
    this.status = "";
    this.statusT = 0;
    this.shake = 0;
    this.time = 0;
    this.ai = null;
    this.driving = false;
    this.sfxQueue = [];
    this.reduced = false;
    this.selectedMapId = "tranquility";
    this.attract = false;
    this.enterTitle();
  }

  enterTitle() {
    this.mode = "title";
    this.ai = null;
    this.driving = false;
    this.match = null;
    this.fx = [];
    this.shake = 0;
    this.banner = "";
    this.bannerT = 0;
    this.battle = createBattle(mapById("olympus"), { seed: 11, names: ["LANCER", "DRIFT"] });
    this.attract = true;
  }

  setDifficulty(level) {
    if (!["easy", "normal", "hard"].includes(level)) return;
    this.difficulty = level;
    writeStore(STORE_DIFF, level);
  }

  setBanner(text, seconds = 1.5) {
    this.banner = text;
    this.bannerT = seconds;
  }

  setStatus(text) {
    this.status = text;
    this.statusT = 1.3;
  }

  showHelp() {
    this.mode = "help";
  }

  showMaps() {
    this.mode = "maps";
  }

  showTitle() {
    if (!this.attract || !this.battle) this.enterTitle();
    else this.mode = "title";
  }

  startMatch(mapId, { versus, campaign, seed } = {}) {
    const map = mapById(mapId);
    const names = versus === "p2" ? ["PILOT 1", "PILOT 2"] : ["LANCER", "DRIFT"];
    this.match = {
      kind: campaign ? "campaign" : "skirmish",
      versus,
      mapId: map.id,
      names,
      seed: seed ?? ((Math.random() * 1e9) >>> 0),
    };
    this.battle = createBattle(map, { seed: this.match.seed, names });
    this.attract = false;
    this.fx = [];
    this.shake = 0;
    this.ai = null;
    this.driving = false;
    this.mode = "battle";
    beginTurn(this.battle);
    this.battle.phase = "move";
    this.setBanner(`${this.battle.tanks[0].name} — DRIVE`, 1.7);
    this.sfxQueue.push("blip");
  }

  startCampaign() {
    if (this.campaignIndex >= MAPS.length) {
      this.campaignIndex = 0;
      writeStore(STORE_CAMP, "0");
    }
    const map = MAPS[this.campaignIndex];
    this.startMatch(map.id, { versus: "cpu", campaign: true });
  }

  isHumanTurn() {
    if (!this.match || !this.battle) return false;
    if (this.match.versus === "p2") return true;
    return this.battle.turn === 0;
  }

  humanReady() {
    return this.mode === "battle" && this.battle && !this.ai && this.isHumanTurn();
  }

  pressAim() {
    const battle = this.battle;
    if (!this.humanReady() || battle.phase !== "move") return;
    battle.phase = "aim";
    this.setBanner("AIM — TRUST THE NUMBERS", 1.3);
    this.sfxQueue.push("blip");
  }

  pressDrive() {
    const battle = this.battle;
    if (!this.humanReady() || battle.phase !== "aim") return;
    battle.phase = "move";
    this.setBanner("DRIVE", 0.8);
    this.sfxQueue.push("blip");
  }

  pressFire() {
    if (!this.humanReady() || this.battle.phase !== "aim") return;
    this.fireCurrent();
  }

  selectWeapon(id) {
    if (!this.humanReady()) return;
    const battle = this.battle;
    if (battle.phase === "fly" || battle.phase === "settle") return;
    const tank = battle.tanks[battle.turn];
    const weapon = getWeapon(id);
    if (weapon.hidden) return;
    if (!weapon.unlimited && !(tank.loadout[id] > 0)) {
      this.sfxQueue.push("denied");
      this.setStatus("NO AMMO");
      return;
    }
    tank.weaponId = id;
    this.sfxQueue.push("blip");
  }

  nudgeAim(delta) {
    if (!this.humanReady()) return;
    const battle = this.battle;
    if (battle.phase === "fly" || battle.phase === "settle") return;
    const tank = battle.tanks[battle.turn];
    tank.aim = clamp((tank.aim || 0) + delta, 0, 180);
  }

  nudgePower(delta) {
    if (!this.humanReady()) return;
    const battle = this.battle;
    if (battle.phase === "fly" || battle.phase === "settle") return;
    const tank = battle.tanks[battle.turn];
    tank.power = clamp(tank.power + delta, 5, maxPowerFor(tank));
  }

  setAim(value) {
    if (!this.humanReady()) return;
    const battle = this.battle;
    if (battle.phase === "fly" || battle.phase === "settle") return;
    battle.tanks[battle.turn].aim = clamp(value, 0, 180);
  }

  setPower(value) {
    if (!this.humanReady()) return;
    const battle = this.battle;
    if (battle.phase === "fly" || battle.phase === "settle") return;
    const tank = battle.tanks[battle.turn];
    tank.power = clamp(value, 5, maxPowerFor(tank));
  }

  fireCurrent() {
    const battle = this.battle;
    const res = launch(battle, battle.turn, { rng: () => battle.rng() });
    if (!res.ok) {
      this.sfxQueue.push("denied");
      this.setStatus(res.reason === "ammo" ? "NO AMMO" : "CANNOT FIRE");
      return false;
    }
    battle.phase = "fly";
    this.ai = null;
    this.driving = false;
    this.sfxQueue.push("fire");
    this.fx.push({ kind: "flash", x: res.x, y: res.y, age: 0, life: 0.1, color: res.color || "#fff" });
    return true;
  }

  update(dt, input) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.statusT > 0) {
      this.statusT -= dt;
      if (this.statusT <= 0) this.status = "";
    }
    this.driving = false;
    this.updateFx(dt);
    if (this.attract) {
      this.updateAttract(dt);
      return;
    }
    if (this.mode !== "battle" || !this.battle) return;
    const battle = this.battle;
    if (battle.phase === "fly") {
      const events = stepProjectiles(battle, dt * 1.28);
      this.consume(events);
      applyEnvironment(battle, dt);
      if (!battle.projectiles.length) {
        battle.phase = "settle";
        battle.settle = 0.82;
      }
      return;
    }
    if (battle.phase === "settle") {
      applyEnvironment(battle, dt);
      battle.settle -= dt;
      if (battle.settle <= 0) this.finishShot();
      return;
    }
    applyEnvironment(battle, dt);
    if (updateWinner(battle) != null) {
      this.finishMatch();
      return;
    }
    if (this.ai) this.updateAi(dt);
    else this.updateHuman(dt, input);
  }

  updateHuman(dt, input) {
    const battle = this.battle;
    if (battle.phase !== "move") return;
    const dir = (input?.right ? 1 : 0) - (input?.left ? 1 : 0);
    if (!dir) return;
    const res = driveTank(battle, battle.turn, dir, dt);
    if (res.moved) {
      this.driving = true;
      this.puff(battle.tanks[battle.turn]);
    } else if (res.reason === "steep") this.setStatus("TOO STEEP");
    else if (res.reason === "fuel") this.setStatus("NO FUEL");
    else if (res.reason === "blocked") this.setStatus("BLOCKED");
  }

  updateAi(dt) {
    const battle = this.battle;
    const tank = battle.tanks[battle.turn];
    const ai = this.ai;
    if (ai.phase === "think") {
      ai.t -= dt;
      if (ai.t <= 0) ai.phase = "drive";
      return;
    }
    if (ai.phase === "drive") {
      if (Math.abs(tank.x - ai.plan.dest) < 8 || tank.fuel <= 0.15) {
        this.enterAiAim();
        return;
      }
      const dir = Math.sign(ai.plan.dest - tank.x);
      const res = driveTank(battle, battle.turn, dir, dt);
      if (res.moved) {
        this.driving = true;
        this.puff(tank);
        ai.stuck = 0;
      } else {
        ai.stuck += dt;
        if (ai.stuck > 0.4) this.enterAiAim();
      }
      return;
    }
    if (ai.phase === "aim") {
      const k = 1 - Math.pow(0.015, dt);
      tank.aim += (ai.plan.aim - tank.aim) * k;
      const cap = maxPowerFor(tank);
      const target = Math.min(ai.plan.power, cap);
      tank.power += (target - tank.power) * k;
      ai.t -= dt;
      if (ai.t <= 0) {
        tank.aim = ai.plan.aim;
        tank.power = target;
        tank.weaponId = ai.plan.weaponId;
        if (!this.fireCurrent()) {
          tank.weaponId = "he";
          this.fireCurrent();
        }
      }
    }
  }

  enterAiAim() {
    const battle = this.battle;
    const tank = battle.tanks[battle.turn];
    tank.weaponId = this.ai.plan.weaponId;
    battle.phase = "aim";
    this.ai.phase = "aim";
    this.ai.t = 0.85;
    this.setBanner(`${tank.name} IS AIMING`, 1);
  }

  beginAi() {
    const plan = planAiTurn(this.battle, this.difficulty);
    this.ai = { phase: "think", t: 0.45, plan, stuck: 0 };
    this.battle.phase = "move";
    this.setBanner(`${this.battle.tanks[this.battle.turn].name} IS HUNTING`, 1.4);
  }

  finishShot() {
    const winner = updateWinner(this.battle);
    if (winner !== null) {
      this.finishMatch();
      return;
    }
    this.battle.turn = 1 - this.battle.turn;
    beginTurn(this.battle);
    this.battle.phase = "move";
    if (this.match.versus === "p2") {
      this.mode = "pass";
      this.ai = null;
      this.bannerT = 0;
      return;
    }
    if (this.battle.turn === 1) this.beginAi();
    else {
      this.ai = null;
      this.setBanner(`${this.battle.tanks[0].name} — DRIVE`, 1.3);
    }
  }

  acknowledgePass() {
    if (this.mode !== "pass") return;
    this.mode = "battle";
    this.setBanner(`${this.battle.tanks[this.battle.turn].name} — DRIVE`, 1.2);
    this.sfxQueue.push("blip");
  }

  finishMatch() {
    const battle = this.battle;
    battle.winner = updateWinner(battle);
    battle.phase = "over";
    this.ai = null;
    this.driving = false;
    this.mode = "victory";
    if (this.match?.kind === "campaign" && battle.winner === 0) {
      this.campaignIndex = Math.min(MAPS.length, this.campaignIndex + 1);
      writeStore(STORE_CAMP, String(this.campaignIndex));
    }
  }

  rematch() {
    if (!this.match) return;
    this.startMatch(this.match.mapId, {
      versus: this.match.versus,
      campaign: this.match.kind === "campaign",
    });
  }

  nextCampaign() {
    if (this.campaignIndex >= MAPS.length) {
      this.campaignIndex = 0;
      writeStore(STORE_CAMP, "0");
    }
    this.startCampaign();
  }

  abort() {
    this.enterTitle();
    this.sfxQueue.push("blip");
  }

  puff(tank) {
    if (!this.battle || this.fx.length > 420) return;
    const y = terrainY(this.battle.terrain, tank.x);
    this.fx.push({
      kind: "dust",
      x: tank.x + (Math.random() * 12 - 6),
      y: y - 2,
      vx: (Math.random() * 2 - 1) * 18,
      vy: -12 - Math.random() * 24,
      g: gravityPx(this.battle.map.g) * 0.35,
      age: 0,
      life: 0.55,
      color: this.battle.map.palette.surface,
      size: 2 + Math.random() * 2.2,
    });
  }

  consume(events) {
    for (const event of events) {
      if (event.type === "explode" || event.type === "fuse") {
        const radius = event.radius || 40;
        this.fx.push({
          kind: "boom",
          x: event.x,
          y: event.y,
          age: 0,
          life: 0.48,
          radius,
          color: event.color || "#ffb15a",
        });
        const sparks = Math.min(28, 8 + Math.floor(radius / 6));
        for (let i = 0; i < sparks; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 40 + Math.random() * 180;
          this.fx.push({
            kind: "spark",
            x: event.x,
            y: event.y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - 40,
            g: gravityPx(this.battle.map.g) * 0.5,
            age: 0,
            life: 0.35 + Math.random() * 0.35,
            color: event.color || "#ffd27a",
            size: 1.5 + Math.random() * 2,
          });
        }
        if (!this.reduced) this.shake = Math.min(16, this.shake + Math.min(12, radius * 0.07));
        this.sfxQueue.push(event.damaged?.some((d) => d.amount > 8) ? "hit" : "boom");
      } else if (event.type === "ricochet" || event.type === "split") {
        this.sfxQueue.push("blip");
      }
    }
  }

  updateAttract(dt) {
    const battle = this.battle;
    if (!battle) return;
    battle.tanks[0].aim = 56 + Math.sin(this.time * 0.4) * 18;
    battle.tanks[1].aim = 124 + Math.sin(this.time * 0.33 + 1) * 12;
    applyEnvironment(battle, dt);
  }

  updateFx(dt) {
    for (const fx of this.fx) {
      fx.age += dt;
      if (fx.vx) fx.x += fx.vx * dt;
      if (fx.vy != null) {
        fx.vy += (fx.g || 0) * dt;
        fx.y += fx.vy * dt;
      }
    }
    if (this.fx.length > 480) this.fx.splice(0, this.fx.length - 480);
    this.fx = this.fx.filter((fx) => fx.age < fx.life);
  }

  /** Readout helpers for the HUD. */
  tankReadout(tank) {
    const cap = fuelCapFor(tank);
    const powerCap = maxPowerFor(tank);
    const speed = Math.round((0.38 + 0.62 * (tank.hp / 100)) * (1 - (tank.debuff?.speedCut || 0)) * 100);
    return {
      hp: Math.max(0, Math.round(tank.hp)),
      fuel: Math.max(0, Math.round(tank.fuel)),
      fuelCap: Math.round(cap),
      powerCap,
      speed,
      range: powerCap,
    };
  }
}

export { MAPS, maxPower };
