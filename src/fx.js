// Pooled visual effects: particles, brine splats, telegraph rings.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { placeOnSphere, toTangent } from './sphere.js';

const MAX_P = 1400;
const MAX_SPLATS = 180;
const MAX_RINGS = 64;
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _h = new THREE.Vector3();

function blobGeometry() {
  const g = new THREE.CircleGeometry(1, 14);
  const p = g.attributes.position;
  for (let i = 1; i < p.count; i++) {
    const k = 0.7 + Math.random() * 0.5;
    p.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  return g;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    // --- particles ---
    const pg = new THREE.IcosahedronGeometry(1, 1);
    this.pMesh = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.setColorAt(0, _c.set(0xffffff));
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    scene.add(this.pMesh);
    this.p = {
      pos: new Float32Array(MAX_P * 3), vel: new Float32Array(MAX_P * 3), col: new Float32Array(MAX_P * 3),
      life: new Float32Array(MAX_P), age: new Float32Array(MAX_P), size: new Float32Array(MAX_P),
      grav: new Float32Array(MAX_P), drag: new Float32Array(MAX_P), grow: new Float32Array(MAX_P),
    };
    this.pCount = 0;

    // --- brine splats (ground decals) ---
    this.splatMesh = new THREE.InstancedMesh(
      blobGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      MAX_SPLATS
    );
    this.splatMesh.frustumCulled = false;
    this.splatMesh.count = 0;
    this.splatMesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.splatMesh);
    this.splats = [];
    this.splatHead = 0;

    // --- rings (arrow telegraphs, shockwaves) ---
    this.ringMesh = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.82, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }),
      MAX_RINGS
    );
    this.ringMesh.frustumCulled = false;
    this.ringMesh.count = 0;
    this.ringMesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.ringMesh);
    this.rings = [];
  }

  // ---------------------------------------------------------------------------
  spawn(pos, vel, color, size, life, { grav = 28, drag = 0.5, grow = 0 } = {}) {
    if (this.pCount >= MAX_P) return;
    const i = this.pCount++;
    const P = this.p;
    P.pos[i * 3] = pos.x; P.pos[i * 3 + 1] = pos.y; P.pos[i * 3 + 2] = pos.z;
    P.vel[i * 3] = vel.x; P.vel[i * 3 + 1] = vel.y; P.vel[i * 3 + 2] = vel.z;
    _c.set(color);
    if (typeof color === 'object' && color.isColor) _c.copy(color);
    P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.age[i] = 0; P.size[i] = size; P.grav[i] = grav; P.drag[i] = drag; P.grow[i] = grow;
  }

  burst(pos, { count = 10, color = 0xffffff, speed = 10, size = 0.3, life = 0.6, up = 0.6, grav = 28, drag = 1, grow = 0, intensity = 1 } = {}) {
    const n = _h.copy(pos).normalize();
    const col = new THREE.Color(color).multiplyScalar(intensity);
    for (let k = 0; k < count; k++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      _v.addScaledVector(n, up).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.spawn(pos, _v, col, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.7), { grav, drag, grow });
    }
  }

  muzzle(pos, dir) {
    const col = new THREE.Color(PALETTE.yolk).multiplyScalar(1.15);
    for (let k = 0; k < 2; k++) {
      _v.copy(dir).multiplyScalar(6 + Math.random() * 8);
      _v.x += (Math.random() - 0.5) * 3; _v.y += (Math.random() - 0.5) * 3; _v.z += (Math.random() - 0.5) * 3;
      this.spawn(pos, _v, col, 0.22 + Math.random() * 0.15, 0.07, { grav: 0, drag: 6 });
    }
  }

  smoke(pos, n = 1) {
    for (let k = 0; k < n; k++) {
      _v.copy(pos).normalize().multiplyScalar(2 + Math.random() * 2);
      _v.x += (Math.random() - 0.5) * 2; _v.z += (Math.random() - 0.5) * 2;
      this.spawn(pos, _v, 0x9a9184, 0.5, 1.1 + Math.random() * 0.6, { grav: -1, drag: 1.5, grow: 1.4 });
    }
  }

  explosion(pos, radius = 4) {
    this.burst(pos, { count: 4, color: 0xffd890, intensity: 2.2, speed: radius * 2, size: radius * 0.25, life: 0.16, grav: 0, drag: 4, grow: 2 });
    this.burst(pos, { count: 14, color: PALETTE.yolk, intensity: 2.2, speed: radius * 5, size: 0.3, life: 0.5, up: 0.8 });
    this.burst(pos, { count: 7, color: 0x5d5148, speed: radius * 1.5, size: radius * 0.25, life: 1.0, grav: -2, drag: 1.8, grow: 1.3 });
    this.shockwave(pos, radius);
  }

  brineSplash(pos, scale = 1) {
    this.burst(pos, { count: Math.round(14 * scale), color: PALETTE.brine, intensity: 1.3, speed: 9 * scale, size: 0.28 * scale, life: 0.7, up: 1.1 });
    this.burst(pos, { count: Math.round(5 * scale), color: 0x6fae2a, speed: 6, size: 0.5 * scale, life: 0.9, up: 1.4 });
  }

  sparks(pos, color = 0xfff0a0, count = 6) {
    this.burst(pos, { count, color, intensity: 1.4, speed: 12, size: 0.1, life: 0.22, up: 0.5, grav: 10, drag: 2 });
  }

  // ---------------------------------------------------------------------------
  splat(dir, size = 1.5, color = PALETTE.brine) {
    const s = { dir: dir.clone().normalize(), size, age: 0, color: new THREE.Color(color), rot: Math.random() * 6.28 };
    if (this.splats.length < MAX_SPLATS) this.splats.push(s);
    else { this.splats[this.splatHead] = s; this.splatHead = (this.splatHead + 1) % MAX_SPLATS; }
    this._splatDirty = true;
  }

  clearSplats() {
    this.splats.length = 0;
    this.splatHead = 0;
    this.splatMesh.count = 0;
  }

  ring(dir, radius, life, color = 0xffc23a, grow = 0) {
    if (this.rings.length >= MAX_RINGS) return null;
    const r = { dir: dir.clone().normalize(), radius, life, age: 0, color: new THREE.Color(color), grow };
    this.rings.push(r);
    return r;
  }

  shockwave(pos, radius) {
    const d = _v.copy(pos).normalize();
    this.ring(d, radius * 0.3, 0.28, new THREE.Color(0xfff1b0).multiplyScalar(1.6), radius * 2.2);
  }

  clear() {
    this.pCount = 0;
    this.rings.length = 0;
    this.clearSplats();
  }

  update(dt) {
    const P = this.p;
    let n = this.pCount;
    for (let i = 0; i < n; i++) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) {
        // swap-remove
        n--;
        const j = n;
        for (const key of ['pos', 'vel', 'col']) {
          P[key][i * 3] = P[key][j * 3]; P[key][i * 3 + 1] = P[key][j * 3 + 1]; P[key][i * 3 + 2] = P[key][j * 3 + 2];
        }
        for (const key of ['life', 'age', 'size', 'grav', 'drag', 'grow']) P[key][i] = P[key][j];
        i--;
        continue;
      }
      const o = i * 3;
      const x = P.pos[o], y = P.pos[o + 1], z = P.pos[o + 2];
      const l = Math.hypot(x, y, z) || 1;
      const g = P.grav[i] * dt / l;
      const dr = Math.max(0, 1 - P.drag[i] * dt);
      P.vel[o] = (P.vel[o] - x * g) * dr;
      P.vel[o + 1] = (P.vel[o + 1] - y * g) * dr;
      P.vel[o + 2] = (P.vel[o + 2] - z * g) * dr;
      P.pos[o] += P.vel[o] * dt; P.pos[o + 1] += P.vel[o + 1] * dt; P.pos[o + 2] += P.vel[o + 2] * dt;
    }
    this.pCount = n;
    for (let i = 0; i < n; i++) {
      const t = P.age[i] / P.life[i];
      const s = P.grow[i] > 0 ? P.size[i] * (1 + P.grow[i] * t) * (1 - t * 0.5) : P.size[i] * Math.sqrt(1 - t);
      _o.position.set(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
      _o.scale.setScalar(Math.max(0.001, s));
      _o.rotation.set(0, 0, 0);
      _o.updateMatrix();
      this.pMesh.setMatrixAt(i, _o.matrix);
      _c.setRGB(P.col[i * 3], P.col[i * 3 + 1], P.col[i * 3 + 2]);
      this.pMesh.setColorAt(i, _c);
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    // splats slowly dry up
    for (let i = 0; i < this.splats.length; i++) {
      const s = this.splats[i];
      s.age += dt;
      const k = s.age < 0.15 ? s.age / 0.15 : s.age > 30 ? Math.max(0, 1 - (s.age - 30) / 8) : 1;
      toTangent(_h.set(Math.cos(s.rot), Math.sin(s.rot), 0.3), s.dir);
      placeOnSphere(_o, s.dir, _h, CFG.R0 + 0.06 + (i % 7) * 0.004);
      _o.rotateX(-Math.PI / 2);
      _o.scale.set(s.size * k, s.size * k * 0.85, 1);
      _o.updateMatrix();
      this.splatMesh.setMatrixAt(i, _o.matrix);
      this.splatMesh.setColorAt(i, s.color);
    }
    this.splatMesh.count = this.splats.length;
    this.splatMesh.instanceMatrix.needsUpdate = true;
    if (this.splatMesh.instanceColor) this.splatMesh.instanceColor.needsUpdate = true;

    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const t = r.age / r.life;
      const rad = r.radius + r.grow * t;
      const pulse = r.grow ? 1 : 1 + Math.sin(r.age * 20) * 0.06;
      toTangent(_h.set(0, 0, 1), r.dir);
      placeOnSphere(_o, r.dir, _h, CFG.R0 + 0.15);
      _o.rotateX(-Math.PI / 2);
      _o.scale.setScalar(rad * pulse);
      _o.updateMatrix();
      this.ringMesh.setMatrixAt(i, _o.matrix);
      _c.copy(r.color).multiplyScalar(r.grow ? 1 - t : 0.6 + t * 0.8);
      this.ringMesh.setColorAt(i, _c);
    }
    this.ringMesh.count = this.rings.length;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
  }
}
