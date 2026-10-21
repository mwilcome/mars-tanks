import { planAiTurn } from "./ai.js";
import {
  applyDebugGrant,
  buyAmmo,
  buyUpgrade,
  buyWeapon,
  careerInProgress,
  careerStats,
  freshCareer,
  loadoutFromCareer,
  purseFor,
  SHOP_WEAPONS,
  syncAmmo,
  UPGRADES,
} from "./campaign.js";
import { clamp, damageScaleFor, engineMul, gravityPx, maxPower } from "./constants.js";
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
const STORE_CAREER = "mars-tanks-career";
const STORE_DIFF = "mars-tanks-difficulty";
const DIFFICULTIES = ["easy", "normal", "hard"];

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

function clampInt(value, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function normalizeCareer(raw) {
  const career = freshCareer();
  if (!raw || typeof raw !== "object") return career;
  career.index = clampInt(raw.index, MAPS.length);
  career.credits = Math.max(0, Math.floor(Number(raw.credits) || 0));
  career.fuel = clampInt(raw.fuel, UPGRADES.fuel.values.length - 1);
  career.climb = clampInt(raw.climb, UPGRADES.climb.values.length - 1);
  career.armor = clampInt(raw.armor, UPGRADES.armor.values.length - 1);
  career.gun = clampInt(raw.gun, UPGRADES.gun.values.length - 1);
  if (raw.weapons && typeof raw.weapons === "object") {
    for (const spec of SHOP_WEAPONS) {
      if (Object.prototype.hasOwnProperty.call(raw.weapons, spec.id)) {
        career.weapons[spec.id] = Math.max(0, Math.floor(Number(raw.weapons[spec.id]) || 0));
      }
    }
  }
  return career;
}

function loadCareers(difficulty) {
  const blank = () => ({
    easy: freshCareer(),
    normal: freshCareer(),
    hard: freshCareer(),
  });
  try {
    const raw = localStorage.getItem(STORE_CAREER);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        easy: normalizeCareer(parsed.easy),
        normal: normalizeCareer(parsed.normal),
        hard: normalizeCareer(parsed.hard),
      };
    }
  } catch {
    /* private mode or an older save */
  }
  const careers = blank();
  const savedCamp = Number(readStore(STORE_CAMP));
  if (Number.isFinite(savedCamp) && savedCamp > 0 && DIFFICULTIES.includes(difficulty)) {
    careers[difficulty].index = clampInt(savedCamp, MAPS.length);
  }
  return careers;
}

export class Game {
  constructor() {
    this.mode = "title";
    const savedDiff = readStore(STORE_DIFF);
    this.difficulty = DIFFICULTIES.includes(savedDiff) ? savedDiff : "normal";
    this.careers = loadCareers(this.difficulty);
    this.campaignIndex = this.careers[this.difficulty].index;
    this.saveCareers();
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
    this.debugUpgrades = false;
    this.devLevel = 0;
    this.lastPurse = null;
    this.shopNote = "";
    this.enterTitle();
  }

  get career() {
    return this.careers[this.difficulty];
  }

  saveCareers() {
    writeStore(STORE_CAREER, JSON.stringify(this.careers));
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
    if (!DIFFICULTIES.includes(level)) return;
    this.difficulty = level;
    writeStore(STORE_DIFF, level);
    this.campaignIndex = this.career.index;
    this.saveCareers();
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

  startMatch(mapId, { versus, campaign, seed, levelIndex } = {}) {
    const map = mapById(mapId);
    const names = versus === "p2" ? ["PILOT 1", "PILOT 2"] : ["LANCER", "DRIFT"];
    this.match = {
      kind: campaign ? "campaign" : "skirmish",
      versus,
      mapId: map.id,
      names,
      seed: seed ?? ((Math.random() * 1e9) >>> 0),
    };
    const options = {
      seed: this.match.seed,
      names,
      damageScale: damageScaleFor(this.difficulty),
    };
    if (campaign) {
      const player = careerStats(this.career);
      const enemy = careerStats(freshCareer());
      options.loads = [
        { ...player, loadout: loadoutFromCareer(this.career) },
        { ...enemy, loadout: loadoutFromCareer(freshCareer()) },
      ];
      this.match.levelIndex = levelIndex ?? this.campaignIndex;
    }
    this.match.settled = false;
    this.battle = createBattle(map, options);
    this.attract = false;
    this.fx = [];
    this.shake = 0;
    this.ai = null;
    this.driving = false;
    this.mode = "battle";
    beginTurn(this.battle);
    this.battle.phase = "move";
    this.setBanner(this.turnBanner(this.battle.tanks[0]), 1.7);
    this.sfxQueue.push("blip");
  }

  /**
   * Hidden phone testing. `?level=N` is 1-based and starts that campaign map.
   * `?debug=1` banks credits, maxes fuel and traction, and unlocks every gun.
   * The grant is saved. Armor and the gun stay so the depot still has a purchase.
   */
  applyDebugLaunch({ level, upgrades } = {}) {
    this.debugUpgrades = !!upgrades;
    if (upgrades) {
      this.careers[this.difficulty] = applyDebugGrant(this.career);
      this.saveCareers();
    }
    if (level == null || level === "") return false;
    const n = Number(level);
    if (!Number.isInteger(n) || n < 1) return false;
    this.devLevel = Math.min(MAPS.length, n);
    this.campaignIndex = this.devLevel - 1;
    this.career.index = this.campaignIndex;
    this.saveCareers();
    this.startCampaign();
    return true;
  }

  turnBanner(tank) {
    const bits = [`${tank.name}'S TURN`];
    if (this.devLevel > 0) bits.push(`L${this.devLevel}`);
    if (this.debugUpgrades) bits.push("FULL TANKS");
    return bits.join(" · ");
  }

  startCampaign() {
    if (this.campaignIndex >= MAPS.length) {
      this.campaignIndex = 0;
      this.career.index = 0;
      this.saveCareers();
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

  pressFire() {
    if (!this.humanReady()) return;
    const phase = this.battle.phase;
    if (phase !== "move" && phase !== "aim") return;
    this.fireCurrent();
  }

  selectWeapon(id) {
    if (!this.humanReady()) return;
    const battle = this.battle;
    if (battle.phase === "fly" || battle.phase === "settle") return;
    const tank = battle.tanks[battle.turn];
    const weapon = getWeapon(id);
    if (weapon.hidden) return;
    const count = tank.loadout[id];
    const owned = weapon.unlimited || Number.isFinite(count);
    if (!owned) {
      this.sfxQueue.push("denied");
      this.setStatus("LOCKED");
      return;
    }
    if (!weapon.unlimited && !(count > 0)) {
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
      this.setBanner(this.turnBanner(this.battle.tanks[0]), 1.3);
    }
  }

  acknowledgePass() {
    if (this.mode !== "pass") return;
    this.mode = "battle";
    this.setBanner(this.turnBanner(this.battle.tanks[this.battle.turn]), 1.2);
    this.sfxQueue.push("blip");
  }

  finishMatch() {
    if (this.match?.settled) return;
    if (this.match) this.match.settled = true;
    const battle = this.battle;
    battle.winner = updateWinner(battle);
    battle.phase = "over";
    this.ai = null;
    this.driving = false;
    const campaign = this.match?.kind === "campaign";
    const won = campaign && battle.winner === 0;
    if (campaign) {
      let career = syncAmmo(this.career, battle.tanks[0].loadout);
      if (won) {
        const player = battle.tanks[0];
        const purse = purseFor({
          levelIndex: this.campaignIndex,
          dealt: player.dealt,
          shots: player.shots,
          hits: player.hits,
          killed: true,
          difficulty: this.difficulty,
        });
        career.credits += purse.total;
        career.index = Math.min(MAPS.length, career.index + 1);
        this.campaignIndex = career.index;
        this.lastPurse = purse;
        this.shopNote = "";
      }
      this.careers[this.difficulty] = career;
      this.saveCareers();
    }
    this.mode = won ? "shop" : "victory";
  }

  purchase(kind, id) {
    if (this.mode !== "shop") return { ok: false, reason: "closed" };
    const fn = kind === "upgrade" ? buyUpgrade : kind === "weapon" ? buyWeapon : kind === "ammo" ? buyAmmo : null;
    if (!fn) return { ok: false, reason: "unknown" };
    const result = fn(this.career, id);
    if (!result.ok) {
      const notes = {
        credits: "NOT ENOUGH CREDITS",
        locked: "LOCKED",
        max: "MAXED",
        owned: "ALREADY OWNED",
      };
      this.shopNote = notes[result.reason] || "UNAVAILABLE";
      return result;
    }
    this.careers[this.difficulty] = result.career;
    this.shopNote = "";
    this.saveCareers();
    return result;
  }

  openDepot() {
    this.attract = false;
    this.lastPurse = null;
    this.shopNote = "";
    this.mode = "shop";
  }

  continueFromShop() {
    if (this.campaignIndex >= MAPS.length) {
      this.enterTitle();
      return;
    }
    this.startCampaign();
  }

  resetCampaign() {
    this.careers[this.difficulty] = freshCareer(0);
    this.campaignIndex = 0;
    this.lastPurse = null;
    this.shopNote = "";
    this.saveCareers();
    this.startCampaign();
  }

  showDepotOnTitle() {
    return careerInProgress(this.career);
  }

  rematch() {
    if (!this.match) return;
    this.startMatch(this.match.mapId, {
      versus: this.match.versus,
      campaign: this.match.kind === "campaign",
    });
  }

  nextCampaign() {
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
    const hpMax = tank.hpMax || 100;
    const speed = Math.round(engineMul(tank.hp, tank.debuff?.speedCut || 0, hpMax) * 100);
    return {
      hp: Math.max(0, Math.round(tank.hp)),
      hpMax,
      fuel: Math.max(0, Math.round(tank.fuel)),
      fuelCap: Math.round(cap),
      powerCap,
      speed,
      range: powerCap,
    };
  }
}

export { MAPS, maxPower };
