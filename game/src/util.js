// Small shared helpers: a seeded RNG so the city is the same on every visit, math clamps,
// and circle/AABB collision tests used by the player, traffic and police alike.

/** A mulberry32 RNG: tiny, fast, and deterministic for a given seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move an angle toward a target by at most maxStep. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** Circle vs axis-aligned box: true when the circle overlaps the box. */
export function circleHitsBox(x, z, r, box) {
  const nx = clamp(x, box.minX, box.maxX);
  const nz = clamp(z, box.minZ, box.maxZ);
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < r * r;
}

/** Push a circle out of a box along the shallowest axis; returns the corrected [x, z]. */
export function pushOutOfBox(x, z, r, box) {
  if (!circleHitsBox(x, z, r, box)) return [x, z];
  const left = x - (box.minX - r);
  const right = box.maxX + r - x;
  const top = z - (box.minZ - r);
  const bottom = box.maxZ + r - z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [box.minX - r, z];
  if (m === right) return [box.maxX + r, z];
  if (m === top) return [x, box.minZ - r];
  return [x, box.maxZ + r];
}

/** Format a dollar amount the way the HUD shows it: $1,250. */
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
