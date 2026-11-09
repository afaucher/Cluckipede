// The Brine Horde: medieval pickle infantry animated on stop-motion twos.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { part, merge, outlineMaterial, toonMat, bakeAO } from './materials.js';
import {
  moveOnSphere, turn, placeOnSphere, tangentToward, signedAngle, clamp, toTangent, randomUnit, rightOf,
} from './sphere.js';

const R = CFG.R0;
const ENEMY_SCALE = 1.8;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();

export const ENEMY_TYPES = {
  gherkin: { name: 'Spear Gherkin', hp: 3, speed: 4.4, radius: 0.9, reach: 2.8, dmg: 1, cd: 1.6, windup: 0.42, score: 10 },
  cornichon: { name: 'Scimitar Cornichon', hp: 2, speed: 9, radius: 0.75, reach: 1.7, dmg: 1, cd: 1.1, windup: 0.25, score: 15 },
  longbow: { name: 'Bread-and-Butter Longbowman', hp: 2, speed: 3.6, radius: 0.8, reach: 46, dmg: 1, cd: 3.4, windup: 0.9, score: 20 },
  brute: { name: 'Kosher Dill Brute', hp: 16, speed: 2.9, radius: 1.7, reach: 3.0, dmg: 2, cd: 2.3, windup: 0.6, score: 60 },
};

// ---------------------------------------------------------------------------
function eyes(z, y, sx, size = 0.13) {
  return [
    part(new THREE.SphereGeometry(size, 8, 6), 0xfffbe8, { pos: [sx, y, z] }),
    part(new THREE.SphereGeometry(size, 8, 6), 0xfffbe8, { pos: [-sx, y, z] }),
    part(new THREE.SphereGeometry(size * 0.55, 6, 5), 0x120c05, { pos: [sx * 1.05, y, z + size * 0.75] }),
    part(new THREE.SphereGeometry(size * 0.55, 6, 5), 0x120c05, { pos: [-sx * 1.05, y, z + size * 0.75] }),
    part(new THREE.BoxGeometry(size * 2.6, size * 0.6, size * 0.8), 0x1c2a0c, { pos: [sx, y + size * 1.3, z + size * 0.3], rot: [0, 0, -0.5] }),
    part(new THREE.BoxGeometry(size * 2.6, size * 0.6, size * 0.8), 0x1c2a0c, { pos: [-sx, y + size * 1.3, z + size * 0.3], rot: [0, 0, 0.5] }),
  ];
}

function bumps(n, rad, h0, h1, color, size, seed) {
  const out = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    out.push(part(new THREE.SphereGeometry(size * (0.7 + rnd() * 0.6), 6, 4), color, {
      pos: [Math.cos(a) * rad, h0 + rnd() * (h1 - h0), Math.sin(a) * rad],
    }));
  }
  return out;
}

let GEOS = null;
function geos() {
  if (GEOS) return GEOS;
  const G = {};
  // Spear Gherkin — stubby neon-chartreuse, pot helmet, cocktail spear
  G.gherkin = {
    body: merge([
      part(new THREE.CapsuleGeometry(0.55, 0.8, 4, 10), 0xa6dc24, { pos: [0, 0.95, 0] }),
      ...bumps(9, 0.52, 0.5, 1.4, 0x76a818, 0.09, 7),
      ...eyes(0.5, 1.22, 0.21, 0.16),
      part(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8e959c, { pos: [0, 1.58, -0.05] }),
      part(new THREE.CylinderGeometry(0.6, 0.6, 0.07, 14), 0x6d737a, { pos: [0, 1.6, -0.05] }),
      part(new THREE.SphereGeometry(0.08, 6, 4), 0x6d737a, { pos: [0, 2.1, -0.05] }),
      part(new THREE.CapsuleGeometry(0.12, 0.3, 3, 6), 0x8cc21f, { pos: [-0.62, 1.0, 0.15], rot: [0.6, 0, 0.3] }),
    ]),
    weapon: merge([
      part(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), 0xd2ad74, { pos: [0, 0.6, 0] }),
      part(new THREE.ConeGeometry(0.13, 0.45, 6), 0xd9dde2, { pos: [0, 2.2, 0] }),
      part(new THREE.SphereGeometry(0.1, 6, 4), 0xd23b2b, { pos: [0, 1.85, 0] }),
    ]),
    hand: [0.62, 0.95, 0.2],
  };
  // Scimitar Cornichon — dark green, chili speckles, serrated butter knife
  G.cornichon = {
    body: merge([
      part(new THREE.CapsuleGeometry(0.42, 0.6, 4, 10), 0x2f6a1e, { pos: [0, 0.8, 0] }),
      ...bumps(8, 0.42, 0.4, 1.2, 0xd8341e, 0.055, 11),
      ...eyes(0.36, 1.08, 0.16, 0.11),
      part(new THREE.TorusGeometry(0.4, 0.06, 5, 12), 0xb82020, { pos: [0, 1.25, 0], rot: [Math.PI / 2, 0, 0] }),
    ]),
    weapon: merge([
      part(new THREE.BoxGeometry(0.06, 0.16, 1.2), 0xdfe3e8, { pos: [0, 0, 0.6] }),
      part(new THREE.BoxGeometry(0.07, 0.08, 0.12), 0xdfe3e8, { pos: [0, -0.1, 0.3] }),
      part(new THREE.BoxGeometry(0.07, 0.08, 0.12), 0xdfe3e8, { pos: [0, -0.1, 0.6] }),
      part(new THREE.BoxGeometry(0.07, 0.08, 0.12), 0xdfe3e8, { pos: [0, -0.1, 0.9] }),
      part(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 6), 0x5a3a1e, { pos: [0, 0, -0.1], rot: [Math.PI / 2, 0, 0] }),
    ]),
    hand: [0.5, 0.85, 0.15],
  };
  // Bread-and-Butter Longbowman — lanky crinkle-cut amber archer
  const ridges = [];
  for (let i = 0; i < 6; i++) ridges.push(part(new THREE.TorusGeometry(0.42, 0.05, 5, 14), 0xb88a24, { pos: [0, 0.55 + i * 0.28, 0], rot: [Math.PI / 2, 0, 0] }));
  G.longbow = {
    body: merge([
      part(new THREE.CapsuleGeometry(0.4, 1.4, 4, 10), 0xdcae3c, { pos: [0, 1.15, 0] }),
      ...ridges,
      ...eyes(0.36, 1.85, 0.15, 0.11),
      part(new THREE.ConeGeometry(0.5, 0.5, 10), 0x6a4a22, { pos: [0, 2.35, 0] }),
    ]),
    weapon: merge([
      part(new THREE.TorusGeometry(0.9, 0.05, 5, 14, Math.PI), 0x6b4423, { rot: [0, Math.PI / 2, Math.PI / 2] }),
      part(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 3), 0xf0e6c8, { pos: [0, 0, -0.05] }),
    ]),
    hand: [0.45, 1.2, 0.35],
  };
  // Kosher Dill Brute — hulking, knobby, tin-can tower shield
  const shieldParts = [
    part(new THREE.CylinderGeometry(1.4, 1.4, 2.8, 16, 1, true, -0.65, 1.3), 0xb7bcc3, { pos: [0, 1.5, -1.15], rot: [0, 0, 0] }),
  ];
  for (let i = 0; i < 4; i++) shieldParts.push(part(new THREE.TorusGeometry(1.42, 0.05, 4, 20, 1.3), 0x8a8f96, { pos: [0, 0.5 + i * 0.68, -1.15], rot: [Math.PI / 2, 0, Math.PI / 2 - 0.65] }));
  shieldParts.push(part(new THREE.TorusGeometry(0.35, 0.08, 6, 14), 0xd8c25a, { pos: [0, 1.6, 0.3] }));
  G.brute = {
    body: merge([
      part(new THREE.CapsuleGeometry(0.95, 1.5, 5, 12), 0x5f8d26, { pos: [0, 1.7, 0] }),
      ...bumps(16, 0.95, 0.9, 2.6, 0x3f6618, 0.16, 23),
      ...eyes(0.85, 2.55, 0.32, 0.17),
      part(new THREE.CapsuleGeometry(0.3, 0.7, 3, 8), 0x55801f, { pos: [-1.05, 1.6, 0.4], rot: [0.9, 0, 0.3] }),
    ]),
    weapon: merge(shieldParts),
    hand: [0, 0, 0.95],
  };
  for (const k of Object.keys(G)) {
    G[k].body.computeBoundingBox();
    const bb = G[k].body.boundingBox;
    bakeAO(G[k].body, bb.min.y, bb.max.y * 0.8, 0.5);
    G[k].body.computeBoundingSphere();
    G[k].weapon.computeBoundingSphere();
  }
  GEOS = G;
  return G;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    body: toonMat({ vertexColors: true }, { scale: 0.9, strength: 0.65 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    burn: toonMat({ vertexColors: true, color: 0xff9050, emissive: 0x401000 }, { scale: 0.9, strength: 0.65 }),
  };
  return MATS;
}

// ---------------------------------------------------------------------------
export class Enemy {
  constructor(type, dir, heading, layerIndex) {
    const def = ENEMY_TYPES[type];
    this.type = type;
    this.def = def;
    this.dir = dir.clone();
    this.heading = heading.clone();
    toTangent(this.heading, this.dir);
    this.maxHp = this.hp = def.hp * (1 + 0.25 * layerIndex);
    this.dmg = def.dmg * (1 + CFG.DEPTH_BUFF * layerIndex);
    this.radius = def.radius * ENEMY_SCALE;
    this.state = 'chase';
    this.t = 0;
    this.cd = Math.random() * def.cd;
    this.retarget = Math.random() * 0.4;
    this.target = null;
    this.phase = Math.random() * 10;
    this.flash = 0;
    this.burn = 0;
    this.dead = false;
    this.awake = false;
    this.braced = false;
    this.pose = 0;
    this.knock = new THREE.Vector3();

    const G = geos()[type], M = mats();
    this.mesh = new THREE.Group();
    this.body = new THREE.Mesh(G.body, M.body);
    this.body.castShadow = true;
    this.body.add(new THREE.Mesh(G.body, outlineMaterial(type === 'brute' ? 0.08 : 0.06)));
    this.mesh.add(this.body);
    this.weapon = new THREE.Mesh(G.weapon, M.body);
    this.weapon.castShadow = true;
    this.weapon.add(new THREE.Mesh(G.weapon, outlineMaterial(0.04)));
    this.weaponPivot = new THREE.Group();
    this.weaponPivot.position.set(...G.hand);
    this.weaponPivot.add(this.weapon);
    this.mesh.add(this.weaponPivot);
    this.renderTick();
  }

  /** Called on stop-motion ticks only: commit the simulated pose to the mesh. */
  renderTick() {
    placeOnSphere(this.mesh, this.dir, this.heading, R);
    this.mesh.scale.setScalar(ENEMY_SCALE);
    const boil = 0.04;
    this.mesh.rotateY((Math.random() - 0.5) * boil * 2);
    this.mesh.rotateZ((Math.random() - 0.5) * boil);
    const step = Math.floor(this.pose) % 2;
    const moving = this.state === 'chase' || this.state === 'flee' || this.state === 'reposition';
    this.body.position.y = moving ? step * 0.12 : 0;
    this.body.scale.set(1, moving && step ? 0.94 : 1, 1);
    const w = this.weaponPivot;
    const wp = this.state === 'windup' ? clamp(this.t / this.def.windup, 0, 1) : 0;
    switch (this.type) {
      case 'gherkin':
        if (this.state === 'strike') w.rotation.set(Math.PI / 2, 0, 0), (w.position.z = 0.9);
        else if (this.state === 'windup' || this.braced) w.rotation.set(Math.PI / 2 - 0.15, 0, 0), (w.position.z = 0.2 - wp * 0.5);
        else w.rotation.set(0.25 + step * 0.06, 0, 0), (w.position.z = 0.2);
        break;
      case 'cornichon':
        if (this.state === 'strike') w.rotation.set(0.2, -1.2, 0);
        else if (this.state === 'windup') w.rotation.set(-1.0 * wp, 1.1 * wp, 0);
        else w.rotation.set(0.3 + step * 0.2, 0.2, 0);
        break;
      case 'longbow':
        w.rotation.set(0, 0, 0);
        w.position.z = this.state === 'windup' ? 0.55 : 0.35;
        this.weapon.scale.set(1, 1, 1 + wp * 0.3);
        break;
      case 'brute':
        w.position.z = this.state === 'strike' ? 1.6 : this.state === 'windup' ? 0.7 - wp * 0.3 : 0.95;
        w.rotation.set(0, 0, step * 0.03);
        break;
    }
    const M = mats();
    this.body.material = this.flash > 0 ? M.flash : this.burn > 0 ? M.burn : M.body;
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
export class Horde {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.list = [];
    this.awake = [];
    this.kills = 0;
    this.score = 0;
    this.reinforceT = 20;
    this.layerIndex = 0;
  }

  clear(poof = false) {
    for (const e of this.list) {
      if (poof) this.fx.brineSplash(e.mesh.position, 0.6);
      e.dispose();
    }
    this.list = [];
    this.awake = [];
  }

  spawn(type, dir, heading) {
    const e = new Enemy(type, dir, heading, this.layerIndex);
    this.scene.add(e.mesh);
    this.list.push(e);
    return e;
  }

  /** Spawn a squad around `center` on `layer` (skipping members over the void). */
  spawnSquad(kind, center, layer, rng = Math.random) {
    const heading = toTangent(randomUnit(rng), center);
    const right = rightOf(center, heading);
    const members = [];
    const add = (type, fx, fz) => {
      const d = center.clone().addScaledVector(right, fx / R).addScaledVector(heading, fz / R).normalize();
      if (layer.sdf(d) < 1.2) return;
      members.push(this.spawn(type, d, heading));
    };
    const L = this.layerIndex;
    switch (kind) {
      case 'phalanx': {
        const rows = 3, cols = 4 + Math.min(1, Math.floor(L / 2));
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add('gherkin', (c - (cols - 1) / 2) * 2.0, -r * 2.2);
        break;
      }
      case 'pack':
        for (let i = 0; i < 4 + Math.min(3, L); i++) add('cornichon', (rng() - 0.5) * 8, (rng() - 0.5) * 8);
        break;
      case 'archers':
        for (let i = 0; i < 3 + Math.min(2, L); i++) add('longbow', (i - 1.5) * 2.6, 0);
        break;
      case 'brutes':
        add('brute', -2.4, 2); add('brute', 2.4, 2);
        for (let c = 0; c < 4; c++) add('gherkin', (c - 1.5) * 2, -2);
        if (L >= 2) add('brute', 0, 4.5);
        break;
    }
    const squad = { id: Math.random() };
    members.forEach((m) => (m.squad = squad));
    return members;
  }

  populate(layer, rng) {
    this.layerIndex = layer.index;
    const L = layer.index;
    const kinds = [];
    // squad counts plateau quickly; deeper layers get tougher pickles instead
    const extra = Math.min(2, Math.ceil(L / 2));
    for (let i = 0; i < 2 + extra; i++) kinds.push('phalanx');
    for (let i = 0; i < 2 + extra; i++) kinds.push('pack');
    for (let i = 0; i < 1 + extra; i++) kinds.push('archers');
    for (let i = 0; i < Math.min(3, Math.ceil(L / 2)); i++) kinds.push('brutes');
    for (const k of kinds) {
      let d = null;
      for (let t = 0; t < 40; t++) {
        const c = layer.randomSolidDir(rng, 5);
        if (c.angleTo(layer.spawnDir) > 0.5) { d = c; break; }
      }
      if (d) this.spawnSquad(k, d, layer, rng);
    }
    // the funnel is guarded
    const guard = layer.findSolidNear(layer.funnelDir.clone().add(randomUnit(rng).multiplyScalar(0.12)).normalize(), 5);
    this.spawnSquad(L >= 1 ? 'brutes' : 'phalanx', guard, layer, rng);
    this.spawnSquad('archers', layer.findSolidNear(layer.funnelDir.clone().add(randomUnit(rng).multiplyScalar(0.2)).normalize(), 5), layer, rng);
    this.reinforceT = 16;
  }

  /** Periodic reinforcements spawn out of sight near the player. */
  reinforce(dt, player, layer) {
    this.reinforceT -= dt;
    const cap = Math.min(110, CFG.ENEMY_CAP_BASE + 10 * this.layerIndex);
    if (this.reinforceT > 0) return;
    this.reinforceT = Math.max(11, 22 - 2.5 * this.layerIndex);
    if (this.list.length >= cap) return;
    for (let t = 0; t < 30; t++) {
      const h = toTangent(randomUnit(Math.random), player.dir);
      const d = player.dir.clone();
      moveOnSphere(d, h, 55 + Math.random() * 20, R);
      if (layer.sdf(d) > 5) {
        const kinds = ['phalanx', 'pack', 'pack', 'archers'];
        if (this.layerIndex >= 1) kinds.push('brutes');
        this.spawnSquad(kinds[Math.floor(Math.random() * kinds.length)], d, layer);
        return;
      }
    }
  }

  /**
   * Damage an enemy. heading = travel direction of the projectile (for shields).
   * Returns 'blocked' | 'hit' | 'killed'.
   */
  damage(e, dmg, heading, { bypass = false, burn = false, silent = false } = {}) {
    if (e.dead) return null;
    if (e.type === 'brute' && !bypass && heading) {
      if (heading.dot(e.heading) < -0.34) {
        if (!silent) {
          this.fx.sparks(_v.copy(e.dir).multiplyScalar(R + 1.6).addScaledVector(e.heading, 1.2));
          this.audio?.tink();
        }
        return 'blocked';
      }
    }
    e.hp -= dmg;
    if (burn) e.burn = 0.5;
    else e.flash = 0.06;
    if (e.hp <= 0) {
      this.kill(e);
      return 'killed';
    }
    return 'hit';
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true;
    const p = e.mesh.position.clone().addScaledVector(e.dir, 1);
    const big = e.type === 'brute' ? 1.8 : 1;
    this.fx.brineSplash(p, big);
    this.fx.splat(e.dir, (1.2 + Math.random() * 0.9) * big);
    if (e.type === 'brute') this.fx.burst(p, { count: 10, color: 0xb7bcc3, speed: 10, size: 0.35, life: 1.2, up: 1.2 });
    this.audio?.splat();
    this.kills++;
    this.score += e.def.score * (1 + this.layerIndex);
    e.dispose();
  }

  /**
   * ctx: { player, layer, proj, time, tick, onHit(target, dmg) }
   */
  update(dt, ctx) {
    const { player, layer } = ctx;
    const targets = player.alive ? player.targets() : [];
    const cosWake = Math.cos(CFG.ENEMY_WAKE_DIST / R);
    const cosShow = Math.cos((CFG.ENEMY_WAKE_DIST + 25) / R);
    this.awake.length = 0;
    for (const e of this.list) {
      if (e.dead) continue;
      const dp = e.dir.dot(player.dir);
      e.mesh.visible = dp > cosShow;
      e.awake = dp > cosWake;
      if (!e.awake) continue;
      this.awake.push(e);
      e.flash -= dt;
      e.burn -= dt;
      if (e.burn > 0 && Math.random() < 0.2) this.fx.smoke(_v.copy(e.dir).multiplyScalar(R + 1.5), 1);
      this._think(e, dt, targets, ctx);
    }
    this._separate(dt, layer);
    if (ctx.tick) for (const e of this.awake) if (!e.dead) e.renderTick();
    this.list = this.list.filter((e) => !e.dead);
  }

  _think(e, dt, targets, ctx) {
    const def = e.def;
    const { player, layer } = ctx;
    e.cd -= dt;
    e.retarget -= dt;
    if ((e.retarget <= 0 || !e.target || (e.target.chunk && e.target.chunk.dead)) && targets.length) {
      e.retarget = 0.4 + Math.random() * 0.2;
      let best = null, bd = -2;
      for (const t of targets) {
        // cornichons prefer the vulnerable tail end
        const bias = e.type === 'cornichon' && t.kind !== 'head' ? 0.00004 * (t.i ?? 0) : 0;
        const d = t.dir.dot(e.dir) + bias;
        if (d > bd) { bd = d; best = t; }
      }
      e.target = best;
    }
    if (!e.target || !player.alive) { e.state = 'idle'; return; }
    const tdir = e.target.dir;
    const dist = Math.acos(clamp(tdir.dot(e.dir), -1, 1)) * R;
    const want = tangentToward(e.dir, tdir, _h);
    const contact = def.reach + e.target.r;
    let speed = def.speed;
    let move = true;
    e.braced = false;

    // knockback impulse
    if (e.knock.lengthSq() > 0.01) {
      const k = e.knock.length();
      _w.copy(e.knock).normalize();
      const kd = e.dir.clone();
      moveOnSphere(kd, toTangent(_w, kd), k * dt, R);
      if (layer.sdf(kd) > 0.3) e.dir.copy(kd);
      e.knock.multiplyScalar(Math.max(0, 1 - 6 * dt));
    }

    if (e.state === 'windup') {
      e.t += dt;
      move = false;
      this._face(e, want, dt, 8);
      if (e.t >= def.windup) {
        e.state = 'strike';
        e.t = 0;
        if (e.type === 'longbow') {
          // lead the target: aim where the head is going
          const aim = tdir.clone();
          const flight = clamp(dist / 28, 0.8, 1.8);
          if (e.target.kind !== 'chunk') {
            const hh = player.heading.clone();
            moveOnSphere(aim, hh, player.speed * flight * 0.7, R);
          }
          ctx.proj.lob({ from: e.dir, to: aim, flight, peak: 9, dmg: e.dmg, aoe: 3.2, kind: 'arrow', owner: 'enemy', telegraph: true });
          this.audio?.bow();
        } else if (dist <= contact * 1.35) {
          ctx.onHit(e.target, e.dmg, e);
        }
      }
    } else if (e.state === 'strike') {
      e.t += dt;
      move = false;
      if (e.t > 0.2) {
        e.state = e.type === 'cornichon' ? 'flee' : 'chase';
        e.t = 0;
        e.cd = def.cd * (0.8 + Math.random() * 0.4);
      }
    } else if (e.state === 'flee') {
      e.t += dt;
      want.negate();
      speed *= 1.1;
      if (e.t > 0.8) { e.state = 'chase'; e.t = 0; }
    } else {
      e.state = 'chase';
      if (e.type === 'longbow') {
        if (dist < 18) want.negate();
        else if (dist < 40) move = false;
        if (dist < def.reach && e.cd <= 0) { e.state = 'windup'; e.t = 0; }
      } else {
        if (dist <= contact && e.cd <= 0) { e.state = 'windup'; e.t = 0; }
        if (dist < contact * 0.8) move = false;
      }
      if (e.type === 'cornichon') turn(e.dir, want, Math.sin(ctx.time * 4 + e.phase) * 0.8);
      if (e.type === 'gherkin') {
        // phalanx: brace spears when the head is close and in front
        const toHead = tangentToward(e.dir, player.dir, _w);
        const dh = Math.acos(clamp(player.dir.dot(e.dir), -1, 1)) * R;
        if (dh < 9 && toHead.dot(e.heading) > 0.6) { e.braced = true; speed *= 0.3; }
      }
      if (e.type === 'brute') speed *= dist < 12 ? 1.2 : 1;
    }
    if (e.state === 'idle') return;

    this._face(e, want, dt, e.type === 'brute' ? 2.2 : 6);
    if (move && e.state !== 'windup') {
      const nd = e.dir.clone(), nh = e.heading.clone();
      moveOnSphere(nd, nh, speed * dt, R);
      if (layer.sdf(nd) > 0.8) {
        e.dir.copy(nd);
        e.heading.copy(nh);
      } else {
        turn(e.dir, e.heading, (e.phase > 5 ? 1 : -1) * 2.5 * dt);
      }
      e.pose += dt * (e.type === 'cornichon' ? 9 : 6);
    }
  }

  _face(e, want, dt, rate) {
    const a = signedAngle(e.heading, want, e.dir);
    turn(e.dir, e.heading, clamp(a, -rate * dt, rate * dt));
  }

  _separate(dt, layer) {
    const A = this.awake;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j];
        const minD = (a.radius + b.radius) * 0.9;
        const d = a.dir.dot(b.dir);
        if (d < Math.cos(minD / R)) continue;
        const dist = Math.acos(clamp(d, -1, 1)) * R;
        const push = (minD - dist) * 0.5;
        _v.copy(a.dir).sub(b.dir);
        if (_v.lengthSq() < 1e-12) _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        _v.normalize().multiplyScalar(push / R);
        const wa = a.type === 'brute' ? 0.2 : 1, wb = b.type === 'brute' ? 0.2 : 1;
        const na = a.dir.clone().addScaledVector(_v, wa).normalize();
        const nb = b.dir.clone().addScaledVector(_v, -wb).normalize();
        if (layer.sdf(na) > 0.3) a.dir.copy(na);
        if (layer.sdf(nb) > 0.3) b.dir.copy(nb);
        toTangent(a.heading, a.dir);
        toTangent(b.heading, b.dir);
      }
    }
    void dt;
  }
}
