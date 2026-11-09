// Modular turrets welded onto spine segments, plus the projectile simulation.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { inkMesh, glow } from './materials.js';
import { moveOnSphere, placeOnSphere, slerpDir, tangentToward, turn, angleBetween } from './sphere.js';

export const WEAPONS = {
  minigun: { name: 'Backpack Minigun', short: 'MG', omni: true, arc: Math.PI, range: 30, rate: 11, dmg: 1, spread: 0.06, speed: 95, color: [4, 2.6, 0.9], width: 0.12, len: 2.2, turnRate: 7 },
  broadsider: { name: 'Broadsider Cannon', short: 'BR', arc: 0.75, range: 42, rate: 2.4, dmg: 3.2, spread: 0.02, speed: 120, color: [5, 3.4, 1.2], width: 0.22, len: 3.5, turnRate: 4, barrels: 2 },
  flak: { name: 'Flak Blunderbuss', short: 'FK', arc: 0.95, range: 22, rate: 1.1, dmg: 1.3, pellets: 7, spread: 0.42, speed: 70, color: [4, 2, 0.6], width: 0.14, len: 1.2, turnRate: 5 },
  mortar: { name: 'Mortar Tube', short: 'MO', arc: 1.35, range: 60, minRange: 9, rate: 0.5, dmg: 7, aoe: 5.5, flight: 1.15, turnRate: 3 },
  flame: { name: 'Flame Cooker', short: 'FL', arc: 0.6, range: 12, dps: 10, turnRate: 4 },
};
export const CACHE_LOOT = ['broadsider', 'broadsider', 'flak', 'mortar', 'mortar', 'flame', 'flame'];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function buildTurretMesh(type) {
  const root = new THREE.Group();
  const base = inkMesh(new THREE.CylinderGeometry(0.5, 0.65, 0.35, 10), PALETTE.gunmetal, 0.04);
  base.position.y = 0.17;
  root.add(base);
  const pivot = new THREE.Group();
  pivot.position.y = 0.35;
  root.add(pivot);
  const barrels = new THREE.Group();
  pivot.add(barrels);
  let spinner = null;
  const cyl = (r, l, color, seg = 8, rTop = r) => {
    const m = inkMesh(new THREE.CylinderGeometry(rTop, r, l, seg), color, 0.035);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  if (type === 'minigun') {
    const house = inkMesh(new THREE.BoxGeometry(1.0, 0.75, 1.2), PALETTE.olive, 0.05);
    house.position.y = 0.38;
    pivot.add(house);
    const drum = cyl(0.38, 0.5, PALETTE.brass, 12);
    drum.rotation.set(0, 0, Math.PI / 2);
    drum.position.set(0.7, 0.35, -0.1);
    pivot.add(drum);
    for (const sx of [-0.28, 0.28]) {
      const stack = inkMesh(new THREE.CylinderGeometry(0.12, 0.14, 1.3, 8), PALETTE.brass, 0.035);
      stack.position.set(sx, 1.1, -0.45);
      pivot.add(stack);
    }
    spinner = new THREE.Group();
    spinner.position.set(0, 0.42, 1.25);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = cyl(0.06, 1.6, PALETTE.gunmetal, 6);
      b.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0);
      spinner.add(b);
    }
    barrels.add(spinner);
  } else if (type === 'broadsider') {
    const house = inkMesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), PALETTE.brass, 0.04);
    house.position.y = 0.25;
    pivot.add(house);
    for (const sx of [-0.18, 0.18]) {
      const b = cyl(0.12, 1.9, PALETTE.gunmetal, 8);
      b.position.set(sx, 0.3, 1.05);
      barrels.add(b);
    }
  } else if (type === 'flak') {
    const house = inkMesh(new THREE.SphereGeometry(0.45, 10, 8), PALETTE.brass, 0.04);
    house.position.y = 0.3;
    pivot.add(house);
    const b = cyl(0.2, 1.1, PALETTE.gunmetal, 10, 0.36);
    b.position.set(0, 0.32, 0.75);
    barrels.add(b);
  } else if (type === 'mortar') {
    const tube = cyl(0.27, 1.2, PALETTE.olive, 10);
    tube.rotation.x = Math.PI / 2 - 0.9;
    tube.position.set(0, 0.6, 0.25);
    barrels.add(tube);
    const band = inkMesh(new THREE.TorusGeometry(0.3, 0.06, 6, 12), PALETTE.brass, 0.03);
    band.position.set(0, 0.85, 0.5);
    band.rotation.x = -0.9;
    barrels.add(band);
  } else if (type === 'flame') {
    for (const sx of [-0.25, 0.25]) {
      const tank = inkMesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), 0xb8321f, 0.035);
      tank.position.set(sx, 0.45, -0.3);
      pivot.add(tank);
    }
    const n = cyl(0.09, 1.3, PALETTE.brass, 8);
    n.position.set(0, 0.35, 0.65);
    barrels.add(n);
    const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), glow(0x6fb8ff, 3));
    pilot.position.set(0, 0.35, 1.35);
    barrels.add(pilot);
  }
  return { root, pivot, barrels, spinner };
}

export class Turret {
  constructor(type, side) {
    this.type = type;
    this.def = WEAPONS[type];
    this.side = this.def.omni ? 0 : side; // +1 right, -1 left
    // local yaw (radians about +Y): +Z is 0, local +X is the LEFT side
    this.baseYaw = this.side === 0 ? 0 : this.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.yaw = this.baseYaw;
    this.cooldown = Math.random() * 0.3;
    this.recoil = 0;
    this.spin = 0;
    this.flaming = false;
    const m = buildTurretMesh(type);
    Object.assign(this, m);
    this.root.position.y = 1.65;
    this.pivot.rotation.y = this.yaw;
  }

  /**
   * ctx: { dir, fwd, left, enemies, proj, fx, audio, dmgMult, tick, hits }
   */
  update(dt, ctx) {
    const def = this.def;
    this.cooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 5);
    const { dir, fwd, left } = ctx;
    // pick target: nearest enemy within range and arc
    let best = null, bestD = Infinity, bestYaw = 0;
    const cosRange = Math.cos(def.range / CFG.R0);
    for (const e of ctx.enemies) {
      const dd = dir.dot(e.dir);
      if (dd < cosRange) continue;
      const d = Math.acos(Math.min(1, dd)) * CFG.R0;
      if (def.minRange && d < def.minRange) continue;
      tangentToward(dir, e.dir, _v);
      const yaw = Math.atan2(_v.dot(left), _v.dot(fwd));
      if (Math.abs(wrap(yaw - this.baseYaw)) > def.arc) continue;
      if (d < bestD) { bestD = d; best = e; bestYaw = yaw; }
    }
    this.flaming = false;
    let desired = best ? bestYaw : this.baseYaw;
    const diff = wrap(desired - this.yaw);
    const stepA = def.turnRate * dt;
    this.yaw = wrap(this.yaw + Math.max(-stepA, Math.min(stepA, diff)));
    // keep inside arc
    const rel = wrap(this.yaw - this.baseYaw);
    if (Math.abs(rel) > def.arc) this.yaw = wrap(this.baseYaw + Math.sign(rel) * def.arc);

    if (best && Math.abs(diff) < 0.2) this._fire(dt, ctx, best, bestD);

    if (ctx.tick) {
      // mechanical motion lives on stop-motion twos
      this.pivot.rotation.y = this.yaw;
      this.barrels.position.z = -this.recoil * 0.35;
      if (this.spinner) this.spinner.rotation.z = this.spin;
    }
  }

  _fireDir(ctx, out, spread = 0) {
    const y = this.yaw + (Math.random() - 0.5) * spread * 2;
    return out.copy(ctx.fwd).multiplyScalar(Math.cos(y)).addScaledVector(ctx.left, Math.sin(y)).normalize();
  }

  _muzzleWorld(ctx, fdir, out) {
    return out.copy(ctx.dir).multiplyScalar(CFG.R0 + 2.1).addScaledVector(fdir, 1.6);
  }

  _fire(dt, ctx, target, dist) {
    const def = this.def;
    const mult = ctx.dmgMult;
    if (this.type === 'flame') {
      this.flaming = true;
      const fdir = this._fireDir(ctx, _h);
      const cosCone = Math.cos(0.38);
      for (const e of ctx.enemies) {
        const dd = ctx.dir.dot(e.dir);
        if (dd < Math.cos(def.range / CFG.R0)) continue;
        tangentToward(ctx.dir, e.dir, _v);
        if (_v.dot(fdir) < cosCone) continue;
        ctx.hits.push({ enemy: e, dmg: def.dps * dt * mult, heading: fdir.clone(), bypass: true, burn: true });
      }
      if (Math.random() < 0.9) {
        const mp = this._muzzleWorld(ctx, fdir, _w);
        for (let k = 0; k < 2; k++) {
          _v.copy(fdir).multiplyScalar(14 + Math.random() * 8);
          _v.x += (Math.random() - 0.5) * 4; _v.y += (Math.random() - 0.5) * 4; _v.z += (Math.random() - 0.5) * 4;
          const c = new THREE.Color().setHSL(0.04 + Math.random() * 0.08, 1, 0.55).multiplyScalar(2.6);
          ctx.fx.spawn(mp, _v, c, 0.35 + Math.random() * 0.3, 0.45, { grav: -6, drag: 2.5, grow: 1.6 });
        }
      }
      ctx.audio?.flame();
      return;
    }
    if (this.cooldown > 0) return;
    this.cooldown = 1 / def.rate;
    this.recoil = 1;
    this.spin += 1.1;
    const fdir = this._fireDir(ctx, _h, def.spread);
    const mp = this._muzzleWorld(ctx, fdir, _w);
    ctx.fx.muzzle(mp, fdir);
    if (this.type === 'mortar') {
      ctx.proj.lob({ from: ctx.dir, to: target.dir, flight: def.flight, peak: 14, dmg: def.dmg * mult, aoe: def.aoe, kind: 'mortar', owner: 'player' });
      ctx.fx.smoke(mp, 2);
      ctx.audio?.shoot('mortar');
      return;
    }
    const n = def.pellets || def.barrels || 1;
    for (let i = 0; i < n; i++) {
      const fd = def.pellets ? this._fireDir(ctx, new THREE.Vector3(), def.spread) : fdir.clone();
      const start = ctx.dir.clone();
      const hd = tangentToward(start, start.clone().addScaledVector(fd, 0.01));
      moveOnSphere(start, hd, 1.4, CFG.R0);
      if (def.barrels) { // offset the twin barrels sideways
        const side = (i - 0.5) * 0.4;
        turn(start, hd, Math.PI / 2); moveOnSphere(start, hd, side, CFG.R0); turn(start, hd, -Math.PI / 2);
      }
      ctx.proj.bullet({
        dir: start, heading: hd, height: 2.0, speed: def.speed * (def.pellets ? 0.85 + Math.random() * 0.3 : 1),
        range: def.range * 1.1, dmg: def.dmg * mult, color: def.color, width: def.width, len: def.len, owner: 'player',
      });
    }
    ctx.audio?.shoot(this.type);
    void dist;
  }

  dispose() {
    this.root.traverse((o) => o.geometry?.dispose());
    this.root.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
const MAX_TRACERS = 600;
const MAX_LOBS = 120;
const _o = new THREE.Object3D();
const _c = new THREE.Color();

export class Projectiles {
  constructor(scene, fx) {
    this.fx = fx;
    this.bullets = [];
    this.lobs = [];
    const tg = new THREE.BoxGeometry(1, 1, 1);
    tg.translate(0, 0, -0.5);
    this.tracerMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_TRACERS);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.tracerMesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.tracerMesh);

    const shell = new THREE.SphereGeometry(0.35, 8, 6);
    shell.scale(1, 1, 1.5);
    this.shellMesh = new THREE.InstancedMesh(shell, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_LOBS);
    this.shellMesh.frustumCulled = false;
    this.shellMesh.count = 0;
    this.shellMesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.shellMesh);
  }

  bullet(o) {
    if (this.bullets.length >= MAX_TRACERS) return;
    this.bullets.push({ ...o, traveled: 0, dead: false, cosHit: 0 });
  }

  lob(o) {
    if (this.lobs.length >= MAX_LOBS) return;
    const dist = angleBetween(o.from, o.to) * CFG.R0;
    const p = { ...o, from: o.from.clone(), to: o.to.clone(), t: 0, dist, dir: o.from.clone(), height: 2, dead: false };
    if (o.telegraph) p.ring = this.fx.ring(o.to, o.aoe, o.flight, o.ringColor ?? 0xffc23a);
    this.lobs.push(p);
  }

  clear() {
    this.bullets.length = 0;
    this.lobs.length = 0;
  }

  /**
   * hooks.hitEnemy(enemy, bullet) -> 'blocked' | 'hit' | null
   * hooks.explode(dir, aoe, dmg, owner, kind)
   */
  update(dt, enemies, hooks) {
    const R = CFG.R0;
    for (const b of this.bullets) {
      const step = b.speed * dt;
      moveOnSphere(b.dir, b.heading, step, R);
      b.traveled += step;
      if (b.traveled > b.range) { b.dead = true; continue; }
      if (b.owner === 'player') {
        for (const e of enemies) {
          if (e.dead) continue;
          const lim = Math.cos((e.radius + 0.3) / R);
          if (b.dir.dot(e.dir) > lim) {
            const res = hooks.hitEnemy(e, b);
            if (res) { b.dead = true; break; }
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    for (const p of this.lobs) {
      p.t += dt / p.flight;
      if (p.t >= 1) {
        p.dead = true;
        hooks.explode(p.to, p.aoe, p.dmg, p.owner, p.kind);
        continue;
      }
      slerpDir(p.from, p.to, p.t, p.dir);
      p.height = 1.5 + 4 * p.peak * p.t * (1 - p.t) * Math.min(1, p.dist / 30);
      if (p.kind === 'mortar' && Math.random() < 0.5) {
        this.fx.spawn(_v.copy(p.dir).multiplyScalar(R + p.height), _w.set(0, 0, 0), 0x8f877a, 0.25, 0.5, { grav: 0, drag: 1, grow: 1.5 });
      }
    }
    this.lobs = this.lobs.filter((p) => !p.dead);

    // --- render ---
    let i = 0;
    for (const b of this.bullets) {
      const len = Math.min(b.len, b.traveled + 0.3);
      placeOnSphere(_o, b.dir, b.heading, R + b.height);
      _o.scale.set(b.width, b.width, len);
      _o.updateMatrix();
      this.tracerMesh.setMatrixAt(i, _o.matrix);
      _c.setRGB(b.color[0], b.color[1], b.color[2]);
      this.tracerMesh.setColorAt(i, _c);
      i++;
    }
    this.tracerMesh.count = i;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;

    i = 0;
    for (const p of this.lobs) {
      tangentToward(p.dir, p.to, _h);
      if (_h.lengthSq() < 0.5) _h.set(1, 0, 0);
      placeOnSphere(_o, p.dir, _h, R + p.height);
      const pitch = Math.atan2(-(8 * p.peak * (0.5 - p.t)) * Math.min(1, p.dist / 30), p.dist);
      _o.rotateX(pitch);
      if (p.kind === 'arrow') { _o.scale.set(0.35, 0.35, 2.6); _c.setRGB(2.4, 1.7, 0.2); }
      else { _o.scale.set(1, 1, 1); _c.setRGB(0.25, 0.22, 0.18); }
      _o.updateMatrix();
      this.shellMesh.setMatrixAt(i, _o.matrix);
      this.shellMesh.setColorAt(i, _c);
      i++;
    }
    this.shellMesh.count = i;
    this.shellMesh.instanceMatrix.needsUpdate = true;
    if (this.shellMesh.instanceColor) this.shellMesh.instanceColor.needsUpdate = true;
  }
}
