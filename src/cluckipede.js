// The Cluckipede: rooster head, armoured arthropod spine, welded turrets.
// Spine-as-health: each body segment is one hit point (with armour plating).
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { part, merge, ink, outlineMaterial, inkMesh, toon, toonMat, bakeAO } from './materials.js';
import {
  moveOnSphere, turn, placeOnSphere, tangentToward, signedAngle, clamp, toTangent, rightOf, damp,
} from './sphere.js';
import { Turret } from './weapons.js';

const R = CFG.R0;
const HEAD_GAP = 2.5;
const TRAIL_CAP = 1600;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Shared geometry & materials
let GEO = null;
function geo() {
  if (GEO) return GEO;
  const S = CFG.SEG_RADIUS;
  const segParts = [
    part(new THREE.SphereGeometry(1, 16, 10), PALETTE.armor, { pos: [0, 1.05, 0], scale: [S * 1.12, S * 0.78, S * 0.95] }),
    part(new THREE.SphereGeometry(1, 14, 8), PALETTE.armorDark, { pos: [0, 0.72, 0], scale: [S * 1.05, S * 0.5, S * 0.9] }),
    part(new THREE.BoxGeometry(0.35, 0.25, 1.6), 0x5d4a28, { pos: [0, 1.95, 0] }),
    part(new THREE.ConeGeometry(0.18, 0.7, 6), 0xe9dcb4, { pos: [0.85, 1.75, 0.1], rot: [0, 0, -0.7] }),
    part(new THREE.ConeGeometry(0.18, 0.7, 6), 0xe9dcb4, { pos: [-0.85, 1.75, 0.1], rot: [0, 0, 0.7] }),
    part(new THREE.TorusGeometry(S * 1.0, 0.09, 5, 18), 0x3b2c18, { pos: [0, 1.02, 0], rot: [Math.PI / 2, 0, 0], scale: [1.12, 0.95, 1] }),
  ];
  const head = [
    part(new THREE.SphereGeometry(1.45, 18, 14), PALETTE.feather, { pos: [0, 1.75, 0.1], scale: [1, 1.02, 1.12] }),
    // feather ruff (neck)
    ...Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2;
      return part(new THREE.ConeGeometry(0.42, 1.3, 5), i % 2 ? 0xe9e0cc : 0xf8f4ea, {
        pos: [Math.cos(a) * 1.0, 1.55 + Math.sin(a) * 0.9, -0.95], rot: [-Math.PI / 2 - Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.7 + 0],
      });
    }),
    // comb
    part(new THREE.SphereGeometry(0.42, 10, 8), PALETTE.comb, { pos: [0, 3.25, 0.75] }),
    part(new THREE.SphereGeometry(0.5, 10, 8), PALETTE.comb, { pos: [0, 3.45, 0.2] }),
    part(new THREE.SphereGeometry(0.44, 10, 8), PALETTE.comb, { pos: [0, 3.35, -0.35] }),
    part(new THREE.SphereGeometry(0.34, 10, 8), PALETTE.comb, { pos: [0, 3.05, -0.8] }),
    // wattle
    part(new THREE.SphereGeometry(0.3, 8, 6), PALETTE.comb, { pos: [0.13, 0.95, 1.55], scale: [0.8, 1.4, 0.8] }),
    part(new THREE.SphereGeometry(0.28, 8, 6), PALETTE.comb, { pos: [-0.13, 0.98, 1.5], scale: [0.8, 1.3, 0.8] }),
    // eyes + angry brows
    part(new THREE.SphereGeometry(0.3, 10, 8), 0xfff6c8, { pos: [0.72, 2.15, 1.05] }),
    part(new THREE.SphereGeometry(0.3, 10, 8), 0xfff6c8, { pos: [-0.72, 2.15, 1.05] }),
    part(new THREE.SphereGeometry(0.15, 8, 6), 0x140c06, { pos: [0.8, 2.12, 1.27] }),
    part(new THREE.SphereGeometry(0.15, 8, 6), 0x140c06, { pos: [-0.8, 2.12, 1.27] }),
    part(new THREE.BoxGeometry(0.62, 0.14, 0.2), 0x7a1010, { pos: [0.62, 2.5, 1.18], rot: [0, 0, 0.45] }),
    part(new THREE.BoxGeometry(0.62, 0.14, 0.2), 0x7a1010, { pos: [-0.62, 2.5, 1.18], rot: [0, 0, -0.45] }),
    // scuffs
    part(new THREE.SphereGeometry(0.25, 6, 5), 0xc9a98a, { pos: [-1.1, 2.4, 0.3], scale: [0.6, 1, 1] }),
  ];
  const beakU = new THREE.ConeGeometry(0.42, 1.25, 8);
  beakU.rotateX(Math.PI / 2);
  beakU.scale(1, 0.75, 1);
  beakU.translate(0, 0.08, 0.62);
  const beakL = new THREE.ConeGeometry(0.34, 0.9, 8);
  beakL.rotateX(Math.PI / 2);
  beakL.scale(1, 0.6, 1);
  beakL.translate(0, -0.08, 0.45);
  const leg = new THREE.CylinderGeometry(0.08, 0.05, 1.25, 5);
  leg.translate(0, -0.62, 0);
  const tail = [
    part(new THREE.ConeGeometry(0.16, 2.2, 6), 0x8a5a2b, { pos: [0.35, 1.0, -1.0], rot: [-Math.PI / 2 + 0.25, 0, 0.3] }),
    part(new THREE.ConeGeometry(0.16, 2.2, 6), 0x8a5a2b, { pos: [-0.35, 1.0, -1.0], rot: [-Math.PI / 2 + 0.25, 0, -0.3] }),
    part(new THREE.SphereGeometry(0.7, 10, 8), PALETTE.armor, { pos: [0, 0.95, 0], scale: [1, 0.7, 1.1] }),
  ];
  GEO = { seg: bakeAO(merge(segParts), 0.3, 2.0, 0.5), head: bakeAO(merge(head), 0.6, 3.0, 0.62), beakU, beakL, leg, tail: bakeAO(merge(tail), 0.3, 1.6, 0.5) };
  return GEO;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const G = { scale: 0.7, strength: 0.6 };
  MATS = {
    normal: toonMat({ vertexColors: true }, G),
    damaged: toonMat({ vertexColors: true, color: 0xff8f70 }, G),
    critical: toonMat({ vertexColors: true, color: 0xff5a40, emissive: 0x401000 }, G),
    flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    charged: toonMat({ vertexColors: true, emissive: 0x7a4a00 }, G),
    leg: toon(0x8a5a2b),
  };
  return MATS;
}

function buildSegmentMesh() {
  const G = geo(), M = mats();
  const group = new THREE.Group();
  const body = new THREE.Mesh(G.seg, M.normal);
  body.castShadow = true;
  body.add(new THREE.Mesh(G.seg, outlineMaterial(0.11)));
  group.add(body);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-0.45, 0.45]) {
    const l = new THREE.Mesh(G.leg, M.leg);
    l.position.set(sx * 1.15, 0.85, sz);
    l.castShadow = true;
    l.userData = { sx, sz };
    group.add(l);
    legs.push(l);
  }
  return { group, body, legs };
}

// ---------------------------------------------------------------------------
class Segment {
  constructor(scene, turretType = null, side = 1) {
    const m = buildSegmentMesh();
    this.group = m.group;
    this.body = m.body;
    this.legs = m.legs;
    this.turret = null;
    this.dir = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.armor = 1;
    this.maxArmor = 1;
    this.flash = 0;
    this.blend = 0;
    this.blendFrom = new THREE.Vector3();
    this.side = side;
    scene.add(this.group);
    if (turretType) this.mount(turretType, side);
  }

  mount(type, side = this.side) {
    if (this.turret) this.turret.dispose();
    this.turret = new Turret(type, side);
    this.group.add(this.turret.root);
  }

  dispose() {
    this.turret?.dispose();
    this.group.removeFromParent();
  }
}

/** A severed tail that writhes on the ground until re-attached or crumbled. */
class TailChunk {
  constructor(segs, time) {
    this.segs = segs.map((s) => ({ seg: s, base: s.dir.clone(), fwd: s.fwd.clone(), hp: 1 }));
    this.timer = CFG.TAIL_ADRIFT_TIME;
    this.born = time;
    this.dead = false;
  }
}

// ---------------------------------------------------------------------------
export class Cluckipede {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.dir = new THREE.Vector3(0, 1, 0);
    this.heading = new THREE.Vector3(0, 0, 1);
    this.trail = new Float32Array(TRAIL_CAP * 3);
    this.segs = [];
    this.chunks = [];
    this.alive = true;
    this.radius = R; // render radius of the body (changes while falling)

    const G = geo(), M = mats();
    this.head = new THREE.Group();
    this.headMesh = new THREE.Mesh(G.head, M.normal);
    this.headMesh.add(new THREE.Mesh(G.head, outlineMaterial(0.12)));
    this.headMesh.castShadow = true;
    this.head.add(this.headMesh);
    this.beakU = inkMesh(G.beakU, PALETTE.beak, 0.06);
    this.beakL = inkMesh(G.beakL, 0xe09a10, 0.06);
    this.beakU.position.set(0, 1.55, 1.45);
    this.beakL.position.set(0, 1.45, 1.4);
    this.head.add(this.beakU, this.beakL);
    scene.add(this.head);

    this.tailTip = new THREE.Mesh(G.tail, M.normal);
    this.tailTip.castShadow = true;
    ink(this.tailTip, 0.09);
    scene.add(this.tailTip);
  }

  // ---- lifecycle ---------------------------------------------------------
  reset(dir, heading, { segments = CFG.START_SEGMENTS, armor = CFG.BASE_ARMOR } = {}) {
    for (const s of this.segs) s.dispose();
    for (const c of this.chunks) for (const s of c.segs) s.seg.dispose();
    this.segs = [];
    this.chunks = [];
    this.dir.copy(dir).normalize();
    this.heading.copy(heading);
    toTangent(this.heading, this.dir);
    this.speed = CFG.SPEED;
    this.mode = 'cruise';
    this.charge = 0;
    this.burstT = 0;
    this.burstMax = 1;
    this.alive = true;
    this.maxSegments = segments;
    this.armorMax = armor;
    this.travel = 0;
    this.turnHistory = [];
    this.coilAmount = 0;
    this.radius = R;
    this.headFlash = 0;
    this.lastHitTime = -10;
    const loadout = { 0: ['minigun', 0], 1: ['broadsider', 1], 2: ['broadsider', -1], 4: ['flak', 1], 5: ['flak', -1] };
    for (let i = 0; i < segments; i++) {
      const lo = loadout[i];
      const s = new Segment(this.scene, lo?.[0], lo ? lo[1] : i % 2 ? -1 : 1);
      s.armor = s.maxArmor = armor;
      this.segs.push(s);
    }
    this.resetTrail();
    this.layoutBody(0, true);
  }

  resetTrail() {
    const d = this.dir.clone(), h = this.heading.clone().negate();
    this.trailHead = 0;
    this.trailCount = 0;
    this.acc = 0;
    const needed = Math.ceil((HEAD_GAP + (this.segs.length + 30) * CFG.SEG_SPACING) / CFG.TRAIL_STEP) + 4;
    const pts = [];
    for (let k = 0; k < Math.min(needed, TRAIL_CAP - 1); k++) {
      pts.push(d.clone());
      moveOnSphere(d, h, CFG.TRAIL_STEP, R);
    }
    for (let k = pts.length - 1; k >= 0; k--) this.pushTrail(pts[k]);
  }

  pushTrail(d) {
    this.trailHead = (this.trailHead + 1) % TRAIL_CAP;
    this.trail[this.trailHead * 3] = d.x;
    this.trail[this.trailHead * 3 + 1] = d.y;
    this.trail[this.trailHead * 3 + 2] = d.z;
    this.trailCount = Math.min(this.trailCount + 1, TRAIL_CAP);
  }

  trailAt(k, out) {
    k = Math.min(k, this.trailCount - 1);
    const i = ((this.trailHead - k) % TRAIL_CAP + TRAIL_CAP) % TRAIL_CAP;
    return out.set(this.trail[i * 3], this.trail[i * 3 + 1], this.trail[i * 3 + 2]);
  }

  /** Position on the body path `D` units behind the head. */
  sampleBack(D, out) {
    if (D <= this.acc && this.acc > 1e-6) {
      this.trailAt(0, _a);
      return out.copy(this.dir).lerp(_a, D / this.acc).normalize();
    }
    const k = (D - this.acc) / CFG.TRAIL_STEP;
    const i = Math.floor(k);
    const f = k - i;
    this.trailAt(i, _a);
    this.trailAt(i + 1, out);
    return out.lerp(_a, 1 - f).normalize();
  }

  get segmentCount() { return this.segs.length; }
  get isBursting() { return this.mode === 'burst' && this.speed > CFG.SPEED * 1.4; }

  // ---- per-frame -------------------------------------------------------------
  /**
   * input: { steer: -1..1 | null, target: Vector3 | null, coil: bool }
   * returns { fell: bool }
   */
  update(dt, input, layer, time) {
    const ev = { fell: false, burst: false };
    if (!this.alive) return ev;

    // slingshot state machine
    if (input.coil && this.mode !== 'burst') {
      if (this.mode !== 'coil') this.audio?.coil();
      this.mode = 'coil';
      this.charge = Math.min(CFG.MAX_CHARGE, this.charge + dt);
    } else if (this.mode === 'coil') {
      const c = this.charge / CFG.MAX_CHARGE;
      if (c > 0.18) {
        this.mode = 'burst';
        this.burstMax = CFG.BURST_TIME * (0.5 + 0.5 * c);
        this.burstT = this.burstMax;
        this.burstPeak = CFG.SPEED + (CFG.BURST_SPEED - CFG.SPEED) * c;
        ev.burst = true;
        this.audio?.cluck();
      } else this.mode = 'cruise';
      this.charge = 0;
    }
    let targetSpeed = CFG.SPEED;
    if (this.mode === 'coil') targetSpeed = CFG.COIL_SPEED;
    if (this.mode === 'burst') {
      this.burstT -= dt;
      const k = Math.max(0, this.burstT / this.burstMax);
      targetSpeed = CFG.SPEED + (this.burstPeak - CFG.SPEED) * Math.sqrt(k);
      if (this.burstT <= 0) this.mode = 'cruise';
      this.speed = targetSpeed;
    } else {
      this.speed += (targetSpeed - this.speed) * damp(this.mode === 'coil' ? 6 : 2.5, dt);
    }
    if (this.slowT > 0) { this.slowT -= dt; this.speed *= 0.5; }

    // steering
    let steer = input.steer ?? 0;
    if (input.target) {
      tangentToward(this.dir, input.target, _v);
      const a = signedAngle(this.heading, _v, this.dir);
      steer = clamp(a * 2.5, -1, 1);
    }
    const rmin = this.mode === 'coil' ? CFG.COIL_R_MIN : CFG.R_MIN;
    const turnRate = this.speed / rmin;

    const dist = this.speed * dt;
    const sub = Math.max(1, Math.ceil(dist / (CFG.TRAIL_STEP * 0.5)));
    const turnTotal = steer * turnRate * dt;
    for (let s = 0; s < sub; s++) {
      turn(this.dir, this.heading, turnTotal / sub);
      moveOnSphere(this.dir, this.heading, dist / sub, R);
      this.acc += dist / sub;
      while (this.acc >= CFG.TRAIL_STEP) {
        this.pushTrail(this.dir);
        this.acc -= CFG.TRAIL_STEP;
      }
    }
    this.travel += dist;

    // coil detection for the camera: accumulated turning over the last ~1.5 s
    this.turnHistory.push([time, turnTotal]);
    while (this.turnHistory.length && this.turnHistory[0][0] < time - 1.5) this.turnHistory.shift();
    const turned = Math.abs(this.turnHistory.reduce((s, x) => s + x[1], 0));
    this.coilAmount = clamp((turned - 2.2) / 2.5, 0, 1);

    // void check
    this.edgeDist = layer.sdf(this.dir);
    if (this.edgeDist < -0.6) ev.fell = true;

    this.layoutBody(dt, false, time);
    this.updateChunks(dt, time);
    return ev;
  }

  layoutBody(dt, snap = false, time = 0) {
    const r = this.radius;
    const M = mats();
    // head
    const bob = Math.sin(this.travel * 0.9) * 0.08;
    placeOnSphere(this.head, this.dir, this.heading, r + bob);
    const open = this.mode === 'burst' ? 0.5 : this.mode === 'coil' ? 0.15 + Math.sin(time * 30) * 0.05 : 0.02;
    this.beakL.rotation.x = open;
    this.headFlash = Math.max(0, this.headFlash - dt);
    this.headMesh.material = this.headFlash > 0 ? M.flash : this.mode === 'coil' && this.charge > 0.3 ? M.charged : M.normal;

    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const D = HEAD_GAP + i * CFG.SEG_SPACING;
      this.sampleBack(D, s.dir);
      this.sampleBack(Math.max(0, D - 0.6), _w);
      tangentToward(s.dir, _w, s.fwd);
      placeOnSphere(s.group, s.dir, s.fwd, r + Math.sin(this.travel * 0.8 - i * 0.7) * 0.06);
      if (s.blend > 0 && !snap) {
        s.blend = Math.max(0, s.blend - dt * 2.8);
        s.group.position.lerp(s.blendFrom, s.blend * s.blend);
      } else s.blend = 0;
      // legs scuttle
      for (const l of s.legs) {
        const ph = this.travel * 2.2 + i * 1.1 + (l.userData.sx > 0 ? 0 : Math.PI) + (l.userData.sz > 0 ? Math.PI / 2 : 0);
        l.rotation.z = l.userData.sx * (0.85 + Math.sin(ph) * 0.35);
        l.rotation.x = Math.cos(ph) * 0.45;
      }
      s.flash = Math.max(0, s.flash - dt);
      const ar = s.armor / s.maxArmor;
      s.body.material = s.flash > 0 ? M.flash : ar < 0.35 ? M.critical : ar < 0.75 ? M.damaged : M.normal;
    }
    // tail tip
    const D = HEAD_GAP + Math.max(0, this.segs.length - 1) * CFG.SEG_SPACING + CFG.SEG_SPACING * 0.85;
    const td = this.sampleBack(D, new THREE.Vector3());
    this.sampleBack(D - 0.6, _w);
    const tf = tangentToward(td, _w, new THREE.Vector3());
    placeOnSphere(this.tailTip, td, tf, r);
    this.tailTip.visible = this.segs.length > 0;
  }

  /** Run turrets on every segment. */
  updateTurrets(dt, ctx) {
    if (!this.alive) return;
    for (const s of this.segs) {
      if (!s.turret) continue;
      ctx.dir = s.dir;
      ctx.fwd = s.fwd;
      ctx.left = _v.crossVectors(s.dir, s.fwd).normalize().clone();
      s.turret.update(dt, ctx);
    }
  }

  // ---- damage & severing ----------------------------------------------------
  /** Target points enemies can attack. */
  targets() {
    const out = [{ dir: this.dir, kind: 'head', i: -1, r: CFG.HEAD_RADIUS }];
    this.segs.forEach((s, i) => out.push({ dir: s.dir, kind: 'seg', i, r: CFG.SEG_RADIUS, seg: s }));
    for (const c of this.chunks) c.segs.forEach((cs, j) => out.push({ dir: cs.seg.dir, kind: 'chunk', chunk: c, j, r: CFG.SEG_RADIUS, cs }));
    return out;
  }

  /** Apply a hit to a target returned by targets(). Returns event string. */
  hit(t, dmg, time) {
    if (!this.alive) return null;
    this.lastHitTime = time;
    if (t.kind === 'chunk') {
      if (t.chunk.dead || !t.chunk.segs.includes(t.cs)) return null;
      this.destroyChunkSeg(t.chunk, t.cs);
      return 'chunk';
    }
    if (t.kind === 'head') {
      this.headFlash = 0.12;
      if (this.segs.length === 0) { this.die(); return 'dead'; }
      return this.hitSegment(this.segs.length - 1, dmg);
    }
    const idx = this.segs.indexOf(t.seg);
    if (idx < 0) return null;
    return this.hitSegment(idx, dmg);
  }

  hitSegment(i, dmg) {
    const s = this.segs[i];
    s.armor -= dmg;
    s.flash = 0.1;
    this.audio?.hit();
    if (s.armor > 0.01) return 'armor';
    this.sever(i);
    return 'sever';
  }

  sever(i) {
    const removed = this.segs.splice(i);
    const dead = removed.shift();
    const p = dead.group.position.clone();
    this.fx.explosion(p, 3.5);
    this.fx.burst(p, { count: 12, color: PALETTE.armor, speed: 12, size: 0.45, life: 1.0, up: 1.2 });
    this.audio?.sever();
    dead.dispose();
    if (removed.length) {
      this.chunks.push(new TailChunk(removed, performance.now() / 1000));
      this.fx.burst(removed[0].group.position, { count: 10, color: PALETTE.brine, intensity: 0.8, speed: 8, size: 0.3, life: 0.7 });
    }
    this.severed = (this.severed || 0) + 1;
  }

  destroyChunkSeg(chunk, cs) {
    const i = chunk.segs.indexOf(cs);
    if (i < 0) return;
    chunk.segs.splice(i, 1);
    const p = cs.seg.group.position.clone();
    this.fx.burst(p, { count: 10, color: PALETTE.armor, speed: 9, size: 0.4, life: 0.8, up: 1 });
    cs.seg.dispose();
    if (!chunk.segs.length) chunk.dead = true;
  }

  updateChunks(dt, time) {
    const lim = Math.cos((CFG.HEAD_RADIUS + CFG.SEG_RADIUS + 0.6) / R);
    for (const c of this.chunks) {
      if (c.dead) continue;
      c.timer -= dt;
      const blink = c.timer < 3 && Math.floor(c.timer * 8) % 2 === 0;
      c.segs.forEach((cs, j) => {
        const s = cs.seg;
        // writhe: lateral wriggle around the resting spot
        const w = Math.sin(time * 9 + j * 1.3) * 0.55;
        const right = rightOf(cs.base, cs.fwd, _v);
        s.dir.copy(cs.base).addScaledVector(right, w / R).normalize();
        s.fwd.copy(cs.fwd);
        turn(s.dir, s.fwd, Math.sin(time * 9 + j * 1.3 + 1) * 0.35);
        placeOnSphere(s.group, s.dir, s.fwd, this.radius + Math.abs(Math.sin(time * 6 + j)) * 0.25);
        for (const l of s.legs) l.rotation.z = l.userData.sx * (0.9 + Math.sin(time * 25 + j) * 0.5);
        s.group.visible = !blink;
      });
      // re-attach by touching the severed tail with the head
      if (this.alive && c.segs.some((cs) => cs.seg.dir.dot(this.dir) > lim)) {
        this.attachChunk(c);
        continue;
      }
      if (c.timer <= 0) {
        for (const cs of c.segs) {
          this.fx.burst(cs.seg.group.position, { count: 8, color: 0x6b5a3a, speed: 6, size: 0.45, life: 0.8 });
          cs.seg.dispose();
        }
        c.segs = [];
        c.dead = true;
      }
    }
    this.chunks = this.chunks.filter((c) => !c.dead);
  }

  attachChunk(c) {
    for (const cs of c.segs) {
      const s = cs.seg;
      s.group.visible = true;
      s.blendFrom.copy(s.group.position);
      s.blend = 1;
      this.segs.push(s);
    }
    this.fx.burst(this.head.position, { count: 16, color: PALETTE.yolk, intensity: 2, speed: 10, size: 0.3, life: 0.6 });
    this.audio?.reattach();
    c.segs = [];
    c.dead = true;
    this.reattached = (this.reattached || 0) + 1;
    this.ensureTrailLength();
  }

  ensureTrailLength() {
    // trail buffer always holds plenty of history; nothing to do unless capacity exceeded
    const need = (HEAD_GAP + (this.segs.length + 2) * CFG.SEG_SPACING) / CFG.TRAIL_STEP;
    if (need > TRAIL_CAP - 10) console.warn('trail capacity exceeded');
  }

  /** Metabolic Molting: regrow lost segments up to max and repair all armour. */
  molt(armorMax) {
    this.armorMax = armorMax;
    for (const c of this.chunks) this.attachChunk(c);
    this.chunks = [];
    while (this.segs.length < this.maxSegments) {
      const s = new Segment(this.scene, null, this.segs.length % 2 ? -1 : 1);
      const last = this.segs[this.segs.length - 1];
      s.blendFrom.copy(last ? last.group.position : this.head.position);
      s.blend = 1;
      this.segs.push(s);
    }
    for (const s of this.segs) s.armor = s.maxArmor = armorMax;
    this.layoutBody(0, false);
  }

  /** Raw void fall: the tail is torn off. Returns number lost. */
  loseTail(n) {
    n = Math.min(n, this.segs.length);
    for (let k = 0; k < n; k++) {
      const s = this.segs.pop();
      this.fx.burst(s.group.position, { count: 6, color: PALETTE.armor, speed: 5, size: 0.4, life: 0.8, up: -0.5 });
      s.dispose();
    }
    for (const c of this.chunks) for (const cs of c.segs) cs.seg.dispose();
    this.chunks = [];
    return n;
  }

  /** Weld a turret onto the first empty slot, growing a new segment if needed. */
  weld(type) {
    let idx = this.segs.findIndex((s) => !s.turret);
    if (idx < 0) {
      const s = new Segment(this.scene, null, this.segs.length % 2 ? -1 : 1);
      s.armor = s.maxArmor = this.armorMax;
      const last = this.segs[this.segs.length - 1];
      s.blendFrom.copy(last ? last.group.position : this.head.position);
      s.blend = 1;
      this.segs.push(s);
      this.maxSegments = Math.max(this.maxSegments, this.segs.length);
      idx = this.segs.length - 1;
    }
    const s = this.segs[idx];
    s.mount(type, s.side);
    s.flash = 0.25;
    return { index: idx, side: s.turret.side };
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.fx.explosion(this.head.position.clone(), 6);
    this.fx.burst(this.head.position, { count: 40, color: PALETTE.feather, speed: 14, size: 0.35, life: 2.0, up: 1.5, grav: 6, drag: 1.5 });
    this.fx.burst(this.head.position, { count: 10, color: PALETTE.comb, speed: 10, size: 0.4, life: 1.2, up: 1.2 });
    this.audio?.death();
    this.head.visible = false;
    this.tailTip.visible = false;
  }

  /** Render the whole spine at a frozen shape, rotated by `q` and at radius r (descent). */
  poseFrozen(baseDirs, q, r, spin = 0) {
    this.radius = r;
    const d = _v.copy(baseDirs.head).applyQuaternion(q).normalize();
    const h = toTangent(_w.copy(baseDirs.heading).applyQuaternion(q), d);
    turn(d, h, spin);
    placeOnSphere(this.head, d, h, r);
    this.segs.forEach((s, i) => {
      const sd = baseDirs.segs[i].clone().applyQuaternion(q).normalize();
      const sf = toTangent(baseDirs.fwds[i].clone().applyQuaternion(q), sd);
      placeOnSphere(s.group, sd, sf, r);
    });
    this.tailTip.visible = false;
  }

  snapshot() {
    return {
      head: this.dir.clone(), heading: this.heading.clone(),
      segs: this.segs.map((s) => s.dir.clone()), fwds: this.segs.map((s) => s.fwd.clone()),
    };
  }

  /** Start fresh on a new layer at dir/heading, blending segments from where they were drawn. */
  land(dir, heading) {
    this.dir.copy(dir);
    this.heading.copy(heading);
    toTangent(this.heading, this.dir);
    this.radius = R;
    for (const s of this.segs) { s.blendFrom.copy(s.group.position); s.blend = 1; }
    this.resetTrail();
    this.layoutBody(0, false);
    this.head.visible = true;
  }
}
