export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash2(x, seed) {
  let n = (x | 0) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function valueNoise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash2(i, seed) * (1 - u) + hash2(i + 1, seed) * u;
}

export function fbm(x, seed, octaves = 4, lac = 2, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * (valueNoise(x * freq, (seed + o * 9176) >>> 0) * 2 - 1);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return norm ? sum / norm : 0;
}
