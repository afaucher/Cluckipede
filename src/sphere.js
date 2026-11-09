// Small toolkit for living on the surface of a sphere. Every surface entity is
// stored as a unit direction `dir` plus a unit tangent `heading`.
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Frame-rate independent exponential approach factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function angleBetween(a, b) {
  return Math.acos(clamp(a.dot(b), -1, 1));
}

export function arcDist(a, b, R) {
  return angleBetween(a, b) * R;
}

/** Remove the radial component of `v` relative to unit `dir` and normalise. */
export function toTangent(v, dir) {
  v.addScaledVector(dir, -v.dot(dir));
  const l = v.length();
  if (l < 1e-8) {
    // pick any perpendicular vector
    v.set(1, 0, 0).cross(dir);
    if (v.lengthSq() < 1e-6) v.set(0, 1, 0).cross(dir);
  }
  return v.normalize();
}

/** Tangent direction at `from` pointing along the great circle toward `to`. */
export function tangentToward(from, to, out = new THREE.Vector3()) {
  out.copy(to).addScaledVector(from, -from.dot(to));
  if (out.lengthSq() < 1e-12) return toTangent(out.set(0, 0, 1), from);
  return out.normalize();
}

/** Walk `dist` units along the great circle defined by dir/heading (both mutated). */
export function moveOnSphere(dir, heading, dist, R) {
  if (dist === 0) return;
  _axis.crossVectors(dir, heading);
  const l = _axis.length();
  if (l < 1e-9) return;
  _axis.multiplyScalar(1 / l);
  _q.setFromAxisAngle(_axis, dist / R);
  dir.applyQuaternion(_q).normalize();
  heading.applyQuaternion(_q);
  toTangent(heading, dir);
}

/** Rotate heading about the local normal. Positive angle = turn left (CCW from outside). */
export function turn(dir, heading, angle) {
  _q.setFromAxisAngle(dir, angle);
  heading.applyQuaternion(_q);
  toTangent(heading, dir);
}

/** Signed angle (radians) from heading a to heading b around normal n. */
export function signedAngle(a, b, n) {
  _v.crossVectors(a, b);
  return Math.atan2(_v.dot(n), clamp(a.dot(b), -1, 1));
}

/** Right-hand vector of a surface frame. */
export function rightOf(dir, heading, out = new THREE.Vector3()) {
  return out.crossVectors(heading, dir).normalize();
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
/** Orient an Object3D so +Y = surface normal and +Z = heading, placed at radius r. */
export function placeOnSphere(obj, dir, heading, r) {
  _x.crossVectors(dir, heading).normalize();
  _m.makeBasis(_x, dir, heading);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.copy(dir).multiplyScalar(r);
}

export function slerpDir(a, b, t, out = new THREE.Vector3()) {
  const ang = angleBetween(a, b);
  if (ang < 1e-6) return out.copy(a);
  const s = Math.sin(ang);
  const wa = Math.sin((1 - t) * ang) / s;
  const wb = Math.sin(t * ang) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize();
}

// --- deterministic randomness ----------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomUnit(rng, out = new THREE.Vector3()) {
  const z = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(t), r * Math.sin(t), z);
}

// --- 3D value noise -----------------------------------------------------------
function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf), v = smooth(yf), w = smooth(zf);
  const c000 = hash3(xi, yi, zi, seed), c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed), c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed), c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}

export function fbm3(x, y, z, seed = 0) {
  return noise3(x, y, z, seed) * 0.65 + noise3(x * 2.1, y * 2.1, z * 2.1, seed + 7) * 0.35;
}
