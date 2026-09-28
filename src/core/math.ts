import * as T from "three";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, k: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-k * dt));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrap = (x: number, n: number) => ((x % n) + n) % n;
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (x: number, z: number) => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
export function noise(x: number, z: number) {
  const a = Math.floor(x),
    b = Math.floor(z),
    u = smooth(0, 1, x - a),
    v = smooth(0, 1, z - b);
  return lerp(
    lerp(hash(a, b), hash(a + 1, b), u),
    lerp(hash(a, b + 1), hash(a + 1, b + 1), u),
    v,
  );
}
export function fbm(x: number, z: number) {
  return (
    noise(x, z) * 0.57 + noise(x * 2, z * 2) * 0.28 + noise(x * 4, z * 4) * 0.15
  );
}
export const UP = new T.Vector3(0, 1, 0);
export const timeText = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
