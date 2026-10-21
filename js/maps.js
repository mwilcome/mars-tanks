import { WORLD_H, WORLD_W } from "./constants.js";
import { fbm, hashString, mulberry32 } from "./rng.js";

function pal(over) {
  return {
    skyTop: "#070a14",
    skyMid: "#1b2233",
    skyBot: "#3a342c",
    dirt: "#6e675c",
    dirtDark: "#2a251f",
    strata: "#8c8478",
    surface: "#e6dfd4",
    haze: null,
    hazeAlpha: 0,
    stars: 1,
    dust: 0,
    dustColor: "#e7b090",
    discColor: "#d9d3c5",
    discDark: "#5c574e",
    discLight: "#f4f1ea",
    discX: 1240,
    discY: 170,
    discR: 62,
    ...over,
  };
}

const BODY = {
  Moon: pal({
    skyTop: "#05070f",
    skyMid: "#1a2234",
    skyBot: "#3e3a34",
    dirt: "#7c776e",
    dirtDark: "#2c2924",
    strata: "#9a9388",
    surface: "#e7e1d6",
    stars: 1,
  }),
  Mars: pal({
    skyTop: "#1a0906",
    skyMid: "#7a3424",
    skyBot: "#d0744c",
    dirt: "#8d3e28",
    dirtDark: "#3a140e",
    strata: "#c4623c",
    surface: "#f0b08a",
    haze: "#e89a6a",
    hazeAlpha: 0.28,
    stars: 0.22,
    dust: 0.85,
    discColor: "#e6d3ae",
    discDark: "#6e5840",
    discLight: "#fff8ee",
    discX: 180,
    discY: 150,
    discR: 46,
  }),
  Mercury: pal({
    skyTop: "#120c08",
    skyMid: "#3a2a22",
    skyBot: "#8a6244",
    dirt: "#6a5346",
    dirtDark: "#241812",
    strata: "#8a7060",
    surface: "#d9c2ae",
    stars: 1,
    discColor: "#f2e2c4",
    discDark: "#8a6a40",
    discLight: "#fffaf0",
    discX: 1280,
    discY: 140,
    discR: 90,
  }),
  Phobos: pal({
    skyTop: "#04060c",
    skyMid: "#151820",
    skyBot: "#2a2428",
    dirt: "#5c514c",
    dirtDark: "#1c1618",
    strata: "#7a6c66",
    surface: "#c8b8b0",
    stars: 1,
    discColor: "#c46a45",
    discDark: "#6a2818",
    discLight: "#ffc2a4",
    discX: 1180,
    discY: 200,
    discR: 150,
  }),
  Deimos: pal({
    skyTop: "#05060d",
    skyMid: "#141820",
    skyBot: "#242028",
    dirt: "#564e48",
    dirtDark: "#181410",
    strata: "#6e645c",
    surface: "#b8aea4",
    stars: 1,
    discColor: "#d07048",
    discDark: "#5a2416",
    discLight: "#ffc8aa",
    discX: 260,
    discY: 180,
    discR: 120,
  }),
  Eros: pal({
    skyTop: "#05060e",
    skyMid: "#12151c",
    skyBot: "#1e222c",
    dirt: "#6a6458",
    dirtDark: "#1a1814",
    strata: "#888274",
    surface: "#d5cfc2",
    stars: 1,
    discColor: "#9bb4d0",
    discDark: "#243044",
    discLight: "#e8f2ff",
    discX: 1320,
    discY: 220,
    discR: 36,
  }),
  Ceres: pal({
    skyTop: "#071018",
    skyMid: "#1a2c38",
    skyBot: "#3a4a52",
    dirt: "#8a9294",
    dirtDark: "#243034",
    strata: "#b7c0c2",
    surface: "#e7eeef",
    stars: 1,
    discColor: "#d5dde0",
    discDark: "#4a5a60",
    discLight: "#ffffff",
    discX: 200,
    discY: 160,
    discR: 40,
  }),
  Vesta: pal({
    skyTop: "#0a0c12",
    skyMid: "#22202a",
    skyBot: "#3a342e",
    dirt: "#7a6a62",
    dirtDark: "#241c18",
    strata: "#a09088",
    surface: "#e0d2c8",
    stars: 1,
    discColor: "#c8b8a8",
    discDark: "#4a4038",
    discLight: "#fff6ee",
    discX: 1250,
    discY: 160,
    discR: 54,
  }),
  Europa: pal({
    skyTop: "#030712",
    skyMid: "#102038",
    skyBot: "#1c3a4a",
    dirt: "#c5d5dc",
    dirtDark: "#3a5560",
    strata: "#8eb0bc",
    surface: "#f4fbff",
    stars: 1,
    discColor: "#d8b48a",
    discDark: "#6a4028",
    discLight: "#ffe6c4",
    discX: 1180,
    discY: 210,
    discR: 168,
  }),
  Enceladus: pal({
    skyTop: "#050814",
    skyMid: "#142033",
    skyBot: "#243848",
    dirt: "#d5e4ea",
    dirtDark: "#3e5864",
    strata: "#9ec4d0",
    surface: "#f7fdff",
    stars: 1,
    discColor: "#f0d7a4",
    discDark: "#705030",
    discLight: "#fff4dc",
    discX: 220,
    discY: 200,
    discR: 150,
  }),
  Io: pal({
    skyTop: "#140e04",
    skyMid: "#3a3010",
    skyBot: "#6a5818",
    dirt: "#d2a24a",
    dirtDark: "#4a300c",
    strata: "#e0c070",
    surface: "#ffe6a4",
    stars: 0.7,
    haze: "#e6c86a",
    hazeAlpha: 0.12,
    discColor: "#e6c49a",
    discDark: "#6a4830",
    discLight: "#fff0d8",
    discX: 1280,
    discY: 190,
    discR: 140,
  }),
  Ganymede: pal({
    skyTop: "#060810",
    skyMid: "#1a2030",
    skyBot: "#2c333c",
    dirt: "#8a8e92",
    dirtDark: "#22262a",
    strata: "#b0b4b8",
    surface: "#e4e8ea",
    stars: 1,
    discColor: "#e0c4a0",
    discDark: "#684830",
    discLight: "#fff0dc",
    discX: 180,
    discY: 180,
    discR: 130,
  }),
  Callisto: pal({
    skyTop: "#07080e",
    skyMid: "#161820",
    skyBot: "#2a2824",
    dirt: "#5c5850",
    dirtDark: "#1a1814",
    strata: "#7a756c",
    surface: "#c8c2b6",
    stars: 1,
    discColor: "#e4c8a4",
    discDark: "#6a4c30",
    discLight: "#fff2dc",
    discX: 1260,
    discY: 170,
    discR: 120,
  }),
  Titan: pal({
    skyTop: "#2a1408",
    skyMid: "#8a4a18",
    skyBot: "#e09040",
    dirt: "#6a4028",
    dirtDark: "#241408",
    strata: "#8a5a32",
    surface: "#c48858",
    haze: "#f0a050",
    hazeAlpha: 0.55,
    stars: 0,
    dust: 0.25,
    dustColor: "#f0c090",
    discColor: "#e8d8c0",
    discDark: "#806850",
    discLight: "#fffaf2",
    discX: 200,
    discY: 420,
    discR: 20,
  }),
  Triton: pal({
    skyTop: "#060812",
    skyMid: "#1a2040",
    skyBot: "#3a4068",
    dirt: "#c8c4d4",
    dirtDark: "#343044",
    strata: "#8888a8",
    surface: "#f0eef8",
    haze: "#b8c0e8",
    hazeAlpha: 0.16,
    stars: 0.8,
    discColor: "#d8e0f0",
    discDark: "#405068",
    discLight: "#ffffff",
    discX: 1240,
    discY: 160,
    discR: 70,
  }),
  Pluto: pal({
    skyTop: "#0c1018",
    skyMid: "#243044",
    skyBot: "#4a5a68",
    dirt: "#e4d8cc",
    dirtDark: "#6a5a50",
    strata: "#b8a898",
    surface: "#fff6ee",
    haze: "#d8e0ea",
    hazeAlpha: 0.14,
    stars: 0.85,
    discColor: "#c8b8c0",
    discDark: "#504048",
    discLight: "#fff0f4",
    discX: 250,
    discY: 170,
    discR: 48,
  }),
  Charon: pal({
    skyTop: "#0a0608",
    skyMid: "#241418",
    skyBot: "#3a2428",
    dirt: "#4a3030",
    dirtDark: "#180c0c",
    strata: "#6a4040",
    surface: "#c09090",
    stars: 1,
    discColor: "#f0e6dc",
    discDark: "#a09088",
    discLight: "#ffffff",
    discX: 1200,
    discY: 180,
    discR: 100,
  }),
  Iapetus: pal({
    skyTop: "#08090e",
    skyMid: "#1c1a16",
    skyBot: "#3a3428",
    dirt: "#6a5a40",
    dirtDark: "#1c1610",
    strata: "#8a7a58",
    surface: "#d8c8a4",
    stars: 1,
    discColor: "#f0d8a8",
    discDark: "#705830",
    discLight: "#fff6e0",
    discX: 1280,
    discY: 180,
    discR: 110,
  }),
  Mimas: pal({
    skyTop: "#070910",
    skyMid: "#1a2430",
    skyBot: "#2e3a44",
    dirt: "#c8d0d4",
    dirtDark: "#3a484e",
    strata: "#8aa0a8",
    surface: "#f4f8fa",
    stars: 1,
    discColor: "#f2deb0",
    discDark: "#786040",
    discLight: "#fff8e8",
    discX: 200,
    discY: 190,
    discR: 160,
  }),
  Miranda: pal({
    skyTop: "#080a12",
    skyMid: "#202838",
    skyBot: "#3a4550",
    dirt: "#b8c4c8",
    dirtDark: "#2c3c44",
    strata: "#7a949c",
    surface: "#eef6f8",
    stars: 1,
    discColor: "#d8e8f0",
    discDark: "#406070",
    discLight: "#ffffff",
    discX: 1260,
    discY: 160,
    discR: 80,
  }),
  Rhea: pal({
    skyTop: "#080a10",
    skyMid: "#1e2830",
    skyBot: "#3a4650",
    dirt: "#d8e2e6",
    dirtDark: "#4a5c64",
    strata: "#a8bcc4",
    surface: "#fbfeff",
    stars: 1,
    discColor: "#f0dcb4",
    discDark: "#706040",
    discLight: "#fff8ea",
    discX: 240,
    discY: 170,
    discR: 130,
  }),
};

const T = {
  mare: { base: 640, amp: 42, octaves: 3, lac: 2, gain: 0.45, smooth: 3, maxStep: 1.55, craters: 2, craterMax: 36 },
  mareWide: { base: 655, amp: 28, octaves: 2, lac: 2, gain: 0.4, smooth: 4, maxStep: 1.3, craters: 1, craterMax: 30 },
  craters: { base: 610, amp: 64, octaves: 4, lac: 2.05, gain: 0.52, smooth: 1, maxStep: 2.3, craters: 8, craterMax: 88 },
  darkJag: { base: 590, amp: 120, octaves: 5, lac: 2.2, gain: 0.55, smooth: 1, maxStep: 2.8, craters: 5, craterMax: 70 },
  slopes: { base: 600, amp: 100, octaves: 4, lac: 2, gain: 0.5, smooth: 2, maxStep: 2.15, craters: 1, craterMax: 40, peaks: [{ at: 0.42, h: 90, wide: 200 }] },
  canyon: { base: 540, amp: 36, octaves: 3, smooth: 2, maxStep: 2.7, canyon: { center: 0.52, width: 0.2, depth: 200 } },
  basin: { base: 630, amp: 24, octaves: 3, smooth: 3, maxStep: 1.4, craters: 3, craterMax: 50, dunes: true, duneFreq: 0.02, duneAmp: 16 },
  dunes: { base: 650, amp: 22, octaves: 3, smooth: 2, maxStep: 1.45, dunes: true, duneFreq: 0.017, duneAmp: 52 },
  yardang: { base: 620, amp: 20, octaves: 2, smooth: 1, maxStep: 2.5, dunes: true, duneFreq: 0.0075, duneAmp: 86 },
  darkRock: { base: 615, amp: 78, octaves: 4, lac: 2.1, gain: 0.5, smooth: 2, maxStep: 2.1, craters: 2, craterMax: 44, tilt: 70 },
  iceCap: { base: 640, amp: 70, octaves: 3, lac: 1.8, gain: 0.42, smooth: 4, maxStep: 1.7 },
  harsh: { base: 600, amp: 90, octaves: 4, smooth: 1, maxStep: 2.4, craters: 6, craterMax: 76 },
  microCrater: { base: 590, amp: 130, octaves: 5, lac: 2.15, gain: 0.55, smooth: 0, maxStep: 3.3, craters: 4, craterMax: 110 },
  microJag: { base: 580, amp: 150, octaves: 5, lac: 2.25, gain: 0.58, smooth: 0, maxStep: 3.5, craters: 3, craterMax: 60 },
  iceFall: { base: 620, amp: 88, octaves: 3, smooth: 2, maxStep: 2.2, peaks: [{ at: 0.55, h: 70, wide: 160 }] },
  vesta: { base: 600, amp: 84, octaves: 4, smooth: 1, maxStep: 2.5, craters: 6, craterMax: 80 },
  iceChaos: { base: 635, amp: 76, octaves: 4, lac: 2.1, gain: 0.5, smooth: 2, maxStep: 2.1, craters: 3, craterMax: 50 },
  vents: { base: 630, amp: 60, octaves: 3, smooth: 2, maxStep: 2, peaks: [{ at: 0.35, h: 50, wide: 90 }, { at: 0.62, h: 64, wide: 80 }] },
  sulfur: { base: 610, amp: 70, octaves: 4, smooth: 2, maxStep: 2.2, craters: 4, craterMax: 64 },
  grooves: { base: 615, amp: 30, octaves: 2, smooth: 1, maxStep: 2.35, dunes: true, duneFreq: 0.011, duneAmp: 72 },
  ancient: { base: 625, amp: 48, octaves: 3, smooth: 2, maxStep: 1.9, craters: 9, craterMax: 60 },
  methane: { base: 650, amp: 54, octaves: 3, smooth: 3, maxStep: 1.6, canyon: { center: 0.5, width: 0.34, depth: 90 } },
  plume: { base: 640, amp: 66, octaves: 3, smooth: 2, maxStep: 2, peaks: [{ at: 0.48, h: 40, wide: 70 }] },
  heart: { base: 660, amp: 36, octaves: 2, smooth: 4, maxStep: 1.35, dunes: true, duneFreq: 0.012, duneAmp: 22 },
  mordor: { base: 590, amp: 110, octaves: 5, lac: 2.2, gain: 0.56, smooth: 1, maxStep: 2.9, craters: 4, craterMax: 66 },
  ridge: { base: 640, amp: 30, octaves: 2, smooth: 2, maxStep: 2.6, peaks: [{ at: 0.5, h: 150, wide: 70 }] },
  herschel: { base: 600, amp: 40, octaves: 3, smooth: 2, maxStep: 2.2, craters: 1, craterMax: 220 },
  cliffs: { base: 560, amp: 40, octaves: 2, smooth: 1, maxStep: 3.4, peaks: [{ at: 0.33, h: 160, wide: 50 }, { at: 0.66, h: 140, wide: 46 }] },
  snow: { base: 645, amp: 58, octaves: 3, lac: 1.7, gain: 0.4, smooth: 3, maxStep: 1.6 },
};

function mapDef(partial) {
  const palette = partial.palette || BODY[partial.body];
  return { windBase: 0, windJitter: 0, friction: 1, hazard: "none", ...partial, palette };
}

export const MAPS = [
  mapDef({
    id: "tranquility",
    name: "Tranquility Shelf",
    body: "Moon",
    blurb: "Hard vacuum, gentle ground. 0° is flat right, 90° is straight up. No wind, no drag.",
    g: 1.62,
    atmo: 0,
    terrain: T.mare,
  }),
  mapDef({
    id: "tycho",
    name: "Tycho Rim",
    body: "Moon",
    blurb: "Craters break the line of fire. Vacuum still means a clean arc. Aim over the lips.",
    g: 1.62,
    atmo: 0,
    terrain: T.craters,
  }),
  mapDef({
    id: "south-pole",
    name: "South Pole Shadows",
    body: "Moon",
    blurb: "Jagged highland. Steep faces stop the tracks. Shoot across what you cannot climb.",
    g: 1.62,
    atmo: 0,
    terrain: T.darkJag,
    palette: pal({ ...BODY.Moon, skyTop: "#03040a", skyMid: "#12151f", skyBot: "#1c1e28", dirt: "#4a4e56", surface: "#b8bcc4", discX: 300 }),
  }),
  mapDef({
    id: "crisium",
    name: "Mare Crisium",
    body: "Moon",
    blurb: "A wide lava plain. Long shots and little cover. Power is the whole game.",
    g: 1.62,
    atmo: 0,
    terrain: T.mareWide,
  }),
  mapDef({
    id: "olympus",
    name: "Olympus Shelf",
    body: "Mars",
    blurb: "Thin air and a real wind. Uphill burns fuel. Downhill is cheap. Read the arrow.",
    g: 3.71,
    atmo: 0.14,
    windBase: 4,
    windJitter: 18,
    terrain: T.slopes,
  }),
  mapDef({
    id: "marineris",
    name: "Valles Marineris",
    body: "Mars",
    blurb: "A canyon between you. Drop a shell into the cut or collapse the rim under them.",
    g: 3.71,
    atmo: 0.12,
    windBase: -3,
    windJitter: 14,
    terrain: T.canyon,
  }),
  mapDef({
    id: "hellas",
    name: "Hellas Dust Bowl",
    body: "Mars",
    blurb: "The wind swings hard between turns. A shot that worked last volley will drift.",
    g: 3.71,
    atmo: 0.2,
    windBase: 0,
    windJitter: 32,
    terrain: T.basin,
  }),
  mapDef({
    id: "acidalia",
    name: "Acidalia Dunes",
    body: "Mars",
    blurb: "Rolling dunes. Crests give range. The lee side is a fuel trap.",
    g: 3.71,
    atmo: 0.13,
    windBase: 6,
    windJitter: 16,
    terrain: T.dunes,
  }),
  mapDef({
    id: "medusae",
    name: "Medusae Yardangs",
    body: "Mars",
    blurb: "Stone ridges like waves. You will not drive over them. Lob, or use a mole.",
    g: 3.71,
    atmo: 0.15,
    windBase: 8,
    windJitter: 12,
    terrain: T.yardang,
  }),
  mapDef({
    id: "syrtis",
    name: "Syrtis Major",
    body: "Mars",
    blurb: "Dark rock and a long tilt. The low tank needs more power for the same angle.",
    g: 3.71,
    atmo: 0.14,
    windBase: -5,
    windJitter: 20,
    terrain: T.darkRock,
    palette: pal({ ...BODY.Mars, dirt: "#5c2a24", dirtDark: "#240e0c", surface: "#c48474", strata: "#8a4038" }),
  }),
  mapDef({
    id: "polar-cap",
    name: "Polar Cap",
    body: "Mars",
    blurb: "Ice over thin air. The tank slides. Wind still counts. Don't park on a slope.",
    g: 3.71,
    atmo: 0.1,
    windBase: 2,
    windJitter: 14,
    friction: 0.4,
    terrain: T.iceCap,
    palette: pal({ ...BODY.Mars, dirt: "#efe8e4", dirtDark: "#8a7a78", strata: "#d8c8c4", surface: "#ffffff", skyBot: "#e8b8a0", dust: 0.3 }),
  }),
  mapDef({
    id: "caloris",
    name: "Caloris Basin",
    body: "Mercury",
    blurb: "Heavy gravity, hard vacuum. Arcs are short and honest. Bring the siege shell in close.",
    g: 3.7,
    atmo: 0,
    terrain: T.harsh,
  }),
  mapDef({
    id: "stickney",
    name: "Stickney Scar",
    body: "Phobos",
    blurb: "Microgravity. Shells barely fall and fuse out at 9 seconds. Fire low and direct.",
    g: 0.0057,
    atmo: 0,
    terrain: T.microCrater,
  }),
  mapDef({
    id: "deimos",
    name: "Deimos Drift",
    body: "Deimos",
    blurb: "Even lighter than Phobos. Terrain is the obstacle, not the drop. Skim the ridges.",
    g: 0.003,
    atmo: 0,
    terrain: T.microJag,
  }),
  mapDef({
    id: "eros",
    name: "433 Eros",
    body: "Eros",
    blurb: "A rubble shard. No air, almost no weight. A horizontal shot is a legal strategy.",
    g: 0.0059,
    atmo: 0,
    terrain: T.microJag,
  }),
  mapDef({
    id: "ceres",
    name: "Ceres Icefalls",
    body: "Ceres",
    blurb: "Low gravity. The same power that works on Mars will sail past the map. Start low.",
    g: 0.29,
    atmo: 0,
    friction: 0.72,
    terrain: T.iceFall,
  }),
  mapDef({
    id: "vesta",
    name: "Vesta Chain",
    body: "Vesta",
    blurb: "Crater overlapping crater. Low gravity makes the rims easy to clear and easy to overshoot.",
    g: 0.25,
    atmo: 0,
    terrain: T.vesta,
  }),
  mapDef({
    id: "europa",
    name: "Europa Chaos",
    body: "Europa",
    blurb: "Ice crust. You slide. Vacuum arcs. Jupiter fills the sky and does not catch your shell.",
    g: 1.314,
    atmo: 0,
    friction: 0.42,
    terrain: T.iceChaos,
  }),
  mapDef({
    id: "enceladus",
    name: "Enceladus Vents",
    body: "Enceladus",
    blurb: "Plumes shove a shell upward. Ice under the tracks. Very low gravity. Avoid the white columns.",
    g: 0.113,
    atmo: 0,
    friction: 0.36,
    hazard: "geyser",
    terrain: T.vents,
  }),
  mapDef({
    id: "io",
    name: "Io Sulfur Flats",
    body: "Io",
    blurb: "Lava pools burn the hull if you sit in them. No real air. Drive the high sulfur, not the glow.",
    g: 1.796,
    atmo: 0,
    hazard: "lava",
    terrain: T.sulfur,
  }),
  mapDef({
    id: "ganymede",
    name: "Ganymede Grooves",
    body: "Ganymede",
    blurb: "Parallel grooves. Cross-range shots are blocked. Climb a groove or lob from the trough.",
    g: 1.428,
    atmo: 0,
    terrain: T.grooves,
  }),
  mapDef({
    id: "callisto",
    name: "Callisto Palimpsest",
    body: "Callisto",
    blurb: "Ancient overlapping basins. Vacuum, moderate gravity, lots of places to hide a hull.",
    g: 1.235,
    atmo: 0,
    terrain: T.ancient,
  }),
  mapDef({
    id: "titan",
    name: "Titan Methane",
    body: "Titan",
    blurb: "Thick air kills speed. Wind is heavy. Low ground is a methane drag. Use more power.",
    g: 1.352,
    atmo: 1,
    windBase: 8,
    windJitter: 6,
    hazard: "slow",
    terrain: T.methane,
  }),
  mapDef({
    id: "triton",
    name: "Triton Plumes",
    body: "Triton",
    blurb: "Thin nitrogen air, a little wind, and geysers. A plume can lift a miss into a hit.",
    g: 0.779,
    atmo: 0.12,
    windBase: -4,
    windJitter: 10,
    hazard: "geyser",
    terrain: T.plume,
  }),
  mapDef({
    id: "sputnik",
    name: "Sputnik Plain",
    body: "Pluto",
    blurb: "Nitrogen ice. You slide. Thin air, long flight, small wind still moves the shell.",
    g: 0.62,
    atmo: 0.08,
    windBase: 0,
    windJitter: 8,
    friction: 0.38,
    terrain: T.heart,
  }),
  mapDef({
    id: "charon",
    name: "Charon Mordor",
    body: "Charon",
    blurb: "Dark red highlands in vacuum. Rough ground, short fuel, no excuses from the wind.",
    g: 0.288,
    atmo: 0,
    terrain: T.mordor,
  }),
  mapDef({
    id: "iapetus",
    name: "Iapetus Ridge",
    body: "Iapetus",
    blurb: "A wall on the equator. You cannot drive through it. The shot has to clear the ridge.",
    g: 0.223,
    atmo: 0,
    terrain: T.ridge,
  }),
  mapDef({
    id: "mimas",
    name: "Herschel",
    body: "Mimas",
    blurb: "One enormous crater. Low gravity. Whoever owns the rim owns the range.",
    g: 0.064,
    atmo: 0,
    terrain: T.herschel,
  }),
  mapDef({
    id: "miranda",
    name: "Verona Cliffs",
    body: "Miranda",
    blurb: "Cliffs taller than the tanks. Low gravity lets you shoot the faces. Don't drive off them.",
    g: 0.079,
    atmo: 0,
    terrain: T.cliffs,
  }),
  mapDef({
    id: "rhea",
    name: "Rhea Snow",
    body: "Rhea",
    blurb: "Bright ice, soft gravity, long slides. A damaged tank will not stop where you parked it.",
    g: 0.264,
    atmo: 0,
    friction: 0.48,
    terrain: T.snow,
  }),
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

function smooth(h, passes) {
  if (!passes) return;
  const n = h.length;
  const tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    tmp[0] = h[0];
    tmp[n - 1] = h[n - 1];
    for (let x = 1; x < n - 1; x++) tmp[x] = h[x - 1] * 0.25 + h[x] * 0.5 + h[x + 1] * 0.25;
    h.set(tmp);
  }
}

function limitSlope(h, maxStep) {
  const step = maxStep || 2.4;
  for (let pass = 0; pass < 3; pass++) {
    for (let x = 1; x < h.length; x++) {
      if (h[x] > h[x - 1] + step) h[x] = h[x - 1] + step;
      else if (h[x] < h[x - 1] - step) h[x] = h[x - 1] - step;
    }
    for (let x = h.length - 2; x >= 0; x--) {
      if (h[x] > h[x + 1] + step) h[x] = h[x + 1] + step;
      else if (h[x] < h[x + 1] - step) h[x] = h[x + 1] - step;
    }
  }
}

function flattenSpawn(h, a, b) {
  let avg = 0;
  let n = 0;
  const a0 = Math.max(0, a);
  const b0 = Math.min(h.length - 1, b);
  for (let x = a0; x <= b0; x++) {
    avg += h[x];
    n++;
  }
  avg /= n || 1;
  const mid = (a0 + b0) / 2;
  const rad = (b0 - a0) / 2 || 1;
  for (let x = a0 - 50; x <= b0 + 50; x++) {
    if (x < 1 || x >= h.length - 1) continue;
    const d = Math.abs(x - mid) / rad;
    const k = d < 1 ? (1 - d) * (1 - d) : 0;
    h[x] = h[x] * (1 - k * 0.92) + avg * (k * 0.92);
  }
}

export function generateTerrain(map) {
  const spec = map.terrain;
  const seed = hashString(map.id);
  const rng = mulberry32(seed);
  const h = new Float32Array(WORLD_W);
  const octaves = spec.octaves || 4;
  for (let x = 0; x < WORLD_W; x++) {
    let y = spec.base + fbm(x * 0.01, seed, octaves, spec.lac || 2, spec.gain || 0.5) * spec.amp;
    if (spec.dunes) {
      y += Math.sin(x * spec.duneFreq) * spec.duneAmp;
      y += Math.sin(x * spec.duneFreq * 0.37 + 1.7) * spec.duneAmp * 0.35;
    }
    if (spec.tilt) y += (x / WORLD_W - 0.5) * spec.tilt;
    h[x] = y;
  }
  if (spec.canyon) {
    const c = spec.canyon;
    for (let x = 0; x < WORLD_W; x++) {
      const d = Math.abs(x - WORLD_W * c.center) / (WORLD_W * c.width);
      if (d < 1) {
        const bowl = Math.cos(d * Math.PI) * 0.5 + 0.5;
        h[x] += bowl * c.depth;
      }
    }
  }
  if (spec.peaks) {
    for (const p of spec.peaks) {
      const cx = p.at * WORLD_W;
      const wide = p.wide || 140;
      for (let x = 0; x < WORLD_W; x++) {
        const d = (x - cx) / wide;
        h[x] -= Math.exp(-d * d) * p.h;
      }
    }
  }
  const craterCount = spec.craters || 0;
  for (let i = 0; i < craterCount; i++) {
    const cx = 200 + rng() * (WORLD_W - 400);
    const cr = 24 + rng() * (spec.craterMax || 60);
    const depth = cr * (0.28 + rng() * 0.22);
    for (let x = Math.floor(cx - cr - 8); x <= cx + cr + 8; x++) {
      if (x < 0 || x >= WORLD_W) continue;
      const dx = (x - cx) / cr;
      const ad = Math.abs(dx);
      if (ad <= 1) {
        h[x] += Math.sqrt(1 - dx * dx) * depth;
        if (ad > 0.82) h[x] -= depth * 0.18;
      }
    }
  }
  if (spec.mesa) {
    const step = spec.mesa;
    for (let x = 0; x < WORLD_W; x++) h[x] = Math.round(h[x] / step) * step;
    smooth(h, 2);
  }
  limitSlope(h, spec.maxStep || 2.4);
  smooth(h, spec.smooth || 0);
  flattenSpawn(h, 70, 260);
  flattenSpawn(h, WORLD_W - 260, WORLD_W - 70);
  for (let x = 0; x < WORLD_W; x++) {
    if (h[x] < 300) h[x] = 300;
    if (h[x] > WORLD_H - 36) h[x] = WORLD_H - 36;
  }
  return h;
}

export function generateHazards(map, terrain) {
  const rng = mulberry32(hashString(`${map.id}:haz`));
  const hazards = [];
  if (map.hazard === "geyser") {
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      hazards.push({
        type: "geyser",
        x: 340 + rng() * (WORLD_W - 680),
        r: 28 + rng() * 26,
        power: 260 + rng() * 220,
      });
    }
  } else if (map.hazard === "lava") {
    const pits = [];
    for (let x = 380; x < WORLD_W - 380; x += 6) {
      if (terrain[x] >= terrain[x - 6] && terrain[x] >= terrain[x + 6]) pits.push(x);
    }
    pits.sort((a, b) => terrain[b] - terrain[a]);
    const picks = pits.slice(0, 3);
    if (!picks.length) picks.push(WORLD_W * 0.45, WORLD_W * 0.6);
    for (const x of picks) {
      hazards.push({ type: "lava", x0: x - 48, x1: x + 48 });
    }
  } else if (map.hazard === "slow") {
    let min = Infinity;
    let max = -Infinity;
    for (let x = 280; x < WORLD_W - 280; x++) {
      if (terrain[x] < min) min = terrain[x];
      if (terrain[x] > max) max = terrain[x];
    }
    const thresh = max - (max - min) * 0.22;
    let run = null;
    for (let x = 280; x < WORLD_W - 280; x++) {
      const low = terrain[x] >= thresh;
      if (low && !run) run = x;
      if ((!low || x === WORLD_W - 281) && run != null) {
        if (x - run > 36) hazards.push({ type: "slow", x0: run, x1: x });
        run = null;
      }
    }
  }
  return hazards;
}

export function placeCrate(map, terrain, hazards) {
  const rng = mulberry32(hashString(`${map.id}:crate`));
  let best = Math.round(WORLD_W * 0.5);
  let bestY = WORLD_H;
  for (let i = 0; i < 28; i++) {
    const x = Math.round(400 + rng() * (WORLD_W - 800));
    const blocked = hazards.some((h) => h.type === "lava" && x >= h.x0 && x <= h.x1);
    if (blocked) continue;
    if (terrain[x] < bestY) {
      bestY = terrain[x];
      best = x;
    }
  }
  return { x: best, alive: true, fuel: 36 };
}
