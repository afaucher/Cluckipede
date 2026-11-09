// Sanity checks for procedural layer generation (runs in Node, no WebGL needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Layer } from '../src/world.js';
import { CFG } from '../src/config.js';
import { moveOnSphere, toTangent } from '../src/sphere.js';

const seeds = [1, 1234, 98765, 4242];

for (const seed of seeds) {
  test(`layer generation is well-formed (seed ${seed})`, () => {
    const spawn = new THREE.Vector3(0.3, 0.8, 0.1).normalize();
    const L = new Layer(0, spawn, seed);
    // no NaNs in any generated geometry
    L.group.traverse((o) => {
      if (!o.geometry) return;
      for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v), `NaN in ${o.name || o.type}`);
    });
    // spawn and funnel sit on solid ground, far apart
    assert.ok(L.sdf(L.spawnDir) > 5, 'spawn must be on solid ground');
    assert.ok(L.sdf(L.funnelDir) > CFG.FUNNEL_R, 'funnel must be on solid ground');
    assert.ok(L.spawnDir.angleTo(L.funnelDir) > 1.5, 'funnel should be far from spawn');
    // caches sit on solid dead-end tips
    for (const c of L.caches) assert.ok(L.sdf(c.dir) > 3, 'cache on solid ground');
    // the egg has real chasms
    let voids = 0;
    const d = new THREE.Vector3();
    for (let i = 0; i < 2000; i++) { d.randomDirection(); if (L.sdf(d) < 0) voids++; }
    assert.ok(voids > 300 && voids < 1500, `void share ${voids / 2000}`);
  });

  test(`causeways are wide enough for U-turns (seed ${seed})`, () => {
    const L = new Layer(1, new THREE.Vector3(0, 0, 1), seed);
    for (const c of L.causeways) {
      // sample the arc midpoint: half-width of solid ground across the bridge
      const mid = c.mid.clone();
      const h = toTangent(c.n.clone(), mid); // perpendicular to the arc
      const p = mid.clone(), ph = h.clone();
      moveOnSphere(p, ph, CFG.CAUSEWAY_W / 2 - 0.5, CFG.R0);
      assert.ok(L.sdf(p) > 0, 'causeway edge should still be solid');
      assert.ok(CFG.CAUSEWAY_W >= 2 * CFG.R_MIN * 1.6, 'causeway width allows high-speed U-turns');
    }
  });
}

test('next layer spawns where the previous funnel was', () => {
  const L0 = new Layer(0, new THREE.Vector3(1, 0, 0), 77);
  const L1 = new Layer(1, L0.funnelDir, 77);
  assert.ok(L1.sdf(L0.funnelDir) > 5);
});
