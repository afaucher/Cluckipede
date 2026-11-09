// One shell of the Infinite Egg: shattered continental plates, void chasms,
// causeways, dead-end peninsulas with weapon caches and the Chalaza Funnel.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { mulberry32, randomUnit, fbm3, clamp, slerpDir, angleBetween, placeOnSphere, toTangent } from './sphere.js';
import { ink, toon, toonMat, glow, outlineMaterial } from './materials.js';

const R = CFG.R0;

// ---------------------------------------------------------------------------
// Icosphere (indexed, midpoint subdivision) — shared by every layer.
let ICO = null;
function icosphere(detail) {
  if (ICO) return ICO;
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => new THREE.Vector3(...v).normalize());
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < detail; l++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      let idx = cache.get(key);
      if (idx === undefined) {
        idx = verts.length;
        verts.push(verts[a].clone().add(verts[b]).normalize());
        cache.set(key, idx);
      }
      return idx;
    };
    const nf = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
  }
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => v.toArray(pos, i * 3));
  const idx = new Uint32Array(faces.length * 3);
  faces.forEach((f, i) => idx.set(f, i * 3));
  ICO = { pos, idx, count: verts.length };
  return ICO;
}

// ---------------------------------------------------------------------------
function arcShape(a, b, width) {
  const n = new THREE.Vector3().crossVectors(a, b).normalize();
  const na = new THREE.Vector3().crossVectors(n, a);
  const nb = new THREE.Vector3().crossVectors(b, n);
  const mid = a.clone().add(b).normalize();
  const half = angleBetween(a, b) / 2;
  return { a: a.clone(), b: b.clone(), n, na, nb, mid, cosLimit: Math.cos(half + width / R + 0.02), half: width / 2 };
}

function arcAngle(dx, dy, dz, s) {
  const sn = dx * s.n.x + dy * s.n.y + dz * s.n.z;
  const px = dx - sn * s.n.x, py = dy - sn * s.n.y, pz = dz - sn * s.n.z;
  if (px * s.na.x + py * s.na.y + pz * s.na.z >= 0 && px * s.nb.x + py * s.nb.y + pz * s.nb.z >= 0) {
    return Math.abs(Math.asin(clamp(sn, -1, 1)));
  }
  const da = Math.acos(clamp(dx * s.a.x + dy * s.a.y + dz * s.a.z, -1, 1));
  const db = Math.acos(clamp(dx * s.b.x + dy * s.b.y + dz * s.b.z, -1, 1));
  return Math.min(da, db);
}

// ---------------------------------------------------------------------------
export class Layer {
  constructor(index, spawnDir, baseSeed) {
    this.index = index;
    this.seed = (baseSeed + index * 7919) >>> 0;
    this.rng = mulberry32(this.seed);
    this.spawnDir = spawnDir.clone().normalize();
    this.caches = [];
    this.group = new THREE.Group();
    this.group.name = `layer-${index}`;
    this.materials = [];
    this._generateTopology();
    this._buildMesh();
    this._buildProps();
    this._buildFunnel();
    this._buildCaches();
    this.setDepthLook(index);
  }

  // ---- topology -----------------------------------------------------------
  _generateTopology() {
    const rng = this.rng;
    const N = CFG.PLATE_COUNT;
    // Fibonacci sphere, rotated so point 0 sits on the spawn direction, then jittered.
    const pts = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2;
      const r = Math.sqrt(1 - y * y);
      pts.push(new THREE.Vector3(Math.cos(ga * i) * r, y, Math.sin(ga * i) * r));
    }
    const spin = new THREE.Quaternion().setFromAxisAngle(randomUnit(rng), rng() * Math.PI * 2);
    pts.forEach((p) => p.applyQuaternion(spin));
    const align = new THREE.Quaternion().setFromUnitVectors(pts[0], this.spawnDir);
    pts.forEach((p, i) => {
      p.applyQuaternion(align);
      if (i > 0) p.add(randomUnit(rng).multiplyScalar(0.12)).normalize();
    });
    this.centers = pts;
    this.N = N;

    // funnel = farthest cell from spawn
    let far = 1, farAng = 0;
    for (let i = 1; i < N; i++) {
      const a = angleBetween(pts[i], this.spawnDir);
      if (a > farAng) { farAng = a; far = i; }
    }
    this.funnelCell = far;
    this.solid = pts.map((_, i) => i === 0 || i === far || rng() > CFG.VOID_FRACTION);

    // flat arrays for fast SDF
    this.cx = new Float32Array(N * 3);
    pts.forEach((p, i) => p.toArray(this.cx, i * 3));
    this.bis = new Float32Array(N * N * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i === j) continue;
      tmp.copy(pts[i]).sub(pts[j]).normalize();
      tmp.toArray(this.bis, (i * N + j) * 3);
    }

    // Voronoi adjacency via midpoint test
    const adjacent = (i, j) => {
      const m = pts[i].clone().add(pts[j]).normalize();
      const di = m.dot(pts[i]);
      for (let k = 0; k < N; k++) if (k !== i && k !== j && m.dot(pts[k]) > di + 1e-6) return false;
      return true;
    };
    this.adj = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (adjacent(i, j)) this.adj.push([i, j]);

    // causeways: Kruskal spanning tree across solid plates + some loops
    const solidIdx = pts.map((_, i) => i).filter((i) => this.solid[i]);
    const edges = [];
    for (let a = 0; a < solidIdx.length; a++) for (let b = a + 1; b < solidIdx.length; b++) {
      const i = solidIdx[a], j = solidIdx[b];
      edges.push({ i, j, ang: angleBetween(pts[i], pts[j]) });
    }
    edges.sort((x, y) => x.ang - y.ang);
    const parent = pts.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const chosen = [];
    const isAdj = new Set(this.adj.map(([i, j]) => i * 100 + j));
    for (const e of edges) {
      const a = find(e.i), b = find(e.j);
      if (a !== b) { parent[a] = b; chosen.push(e); }
      else if (e.ang < 1.0 && isAdj.has(Math.min(e.i, e.j) * 100 + Math.max(e.i, e.j)) && rng() < 0.4) chosen.push(e);
    }
    this.causeways = chosen.map((e) => arcShape(pts[e.i], pts[e.j], CFG.CAUSEWAY_W));
    this.peninsulas = [];

    // peninsulas into void plates, each ending in a round dead-end with a cache
    const cands = this.adj
      .map(([i, j]) => (this.solid[i] && !this.solid[j] ? [i, j] : !this.solid[i] && this.solid[j] ? [j, i] : null))
      .filter(Boolean)
      .sort(() => rng() - 0.5);
    for (const [s, v] of cands) {
      if (this.peninsulas.length >= 4) break;
      const tip = slerpDir(pts[s], pts[v], 0.78);
      const midway = slerpDir(pts[s], pts[v], 0.55);
      if (this.sdf(tip) > -(CFG.PENINSULA_TIP_R + 6)) continue;
      if (this.sdf(midway) > -(CFG.CAUSEWAY_W / 2 + 3)) continue;
      if (this.peninsulas.some((p) => angleBetween(p.tip, tip) < 0.35)) continue;
      const arc = arcShape(pts[s], tip, CFG.CAUSEWAY_W);
      this.peninsulas.push({ arc, tip });
    }
    this.funnelDir = pts[this.funnelCell].clone();
  }

  /** Signed distance (world units) to the edge of solid ground; > 0 is ground. */
  sdf(d) {
    return this._sdf(d.x, d.y, d.z, false);
  }

  _sdf(dx, dy, dz, platesOnly) {
    const N = this.N, cx = this.cx;
    let best = -2, bi = 0;
    for (let i = 0; i < N; i++) {
      const v = dx * cx[i * 3] + dy * cx[i * 3 + 1] + dz * cx[i * 3 + 2];
      if (v > best) { best = v; bi = i; }
    }
    let minB = 10;
    const bis = this.bis;
    for (let j = 0; j < N; j++) {
      if (j === bi) continue;
      const o = (bi * N + j) * 3;
      const s = dx * bis[o] + dy * bis[o + 1] + dz * bis[o + 2];
      if (s < minB) minB = s;
    }
    const b = Math.asin(clamp(minB, -1, 1)) * R;
    let s = this.solid[bi] ? b - CFG.PLATE_MARGIN : -b - CFG.PLATE_MARGIN;
    s += fbm3(dx * 9, dy * 9, dz * 9, this.seed & 0xffff) * 3.2;
    if (platesOnly) return s;
    const cw = this.causeways;
    for (let k = 0; k < cw.length; k++) {
      const c = cw[k];
      if (dx * c.mid.x + dy * c.mid.y + dz * c.mid.z < c.cosLimit) continue;
      const v = c.half - arcAngle(dx, dy, dz, c) * R;
      if (v > s) s = v;
    }
    const pn = this.peninsulas;
    if (pn) for (let k = 0; k < pn.length; k++) {
      const p = pn[k];
      const v = p.arc.half - arcAngle(dx, dy, dz, p.arc) * R;
      if (v > s) s = v;
      const dt = Math.acos(clamp(dx * p.tip.x + dy * p.tip.y + dz * p.tip.z, -1, 1)) * R;
      const v2 = CFG.PENINSULA_TIP_R - dt;
      if (v2 > s) s = v2;
    }
    return s;
  }

  isSolid(d, margin = 0) {
    return this.sdf(d) > margin;
  }

  randomSolidDir(rng = Math.random, minSdf = 3, tries = 200) {
    const d = new THREE.Vector3();
    for (let i = 0; i < tries; i++) {
      randomUnit(rng, d);
      if (this.sdf(d) > minSdf) return d;
    }
    return this.spawnDir.clone();
  }

  /** Nearest point with sdf > minSdf found by ring search around `dir`. */
  findSolidNear(dir, minSdf = 4) {
    if (this.sdf(dir) > minSdf) return dir.clone();
    const t1 = toTangent(new THREE.Vector3(0.3, 1, 0.2), dir);
    const t2 = new THREE.Vector3().crossVectors(dir, t1);
    const p = new THREE.Vector3();
    for (let r = 2; r < 160; r += 2) {
      const a = r / R;
      let bestS = -Infinity, bestP = null;
      for (let k = 0; k < 24; k++) {
        const th = (k / 24) * Math.PI * 2;
        p.copy(dir).multiplyScalar(Math.cos(a))
          .addScaledVector(t1, Math.sin(a) * Math.cos(th))
          .addScaledVector(t2, Math.sin(a) * Math.sin(th)).normalize();
        const s = this.sdf(p);
        if (s > minSdf && s > bestS) { bestS = s; bestP = p.clone(); }
      }
      if (bestP) return bestP;
    }
    return this.spawnDir.clone();
  }

  // ---- mesh -----------------------------------------------------------------
  _buildMesh() {
    const ico = icosphere(CFG.ICO_DETAIL);
    const n = ico.count;
    const sd = new Float32Array(n);
    const plate = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const cIvory = new THREE.Color(PALETTE.ivory), cShade = new THREE.Color(PALETTE.ivoryShade);
    const cDirt = new THREE.Color(PALETTE.dirt), cCrack = new THREE.Color(PALETTE.crack);
    const cBridge = new THREE.Color(0xd8c9a0);
    const c = new THREE.Color();
    const seed = this.seed & 0xffff;
    for (let i = 0; i < n; i++) {
      const x = ico.pos[i * 3], y = ico.pos[i * 3 + 1], z = ico.pos[i * 3 + 2];
      const s = this._sdf(x, y, z, false);
      const ps = this._sdf(x, y, z, true);
      sd[i] = s;
      plate[i] = ps;
      const mott = fbm3(x * 22, y * 22, z * 22, seed + 3) * 0.5 + 0.5;
      const dirt = clamp((fbm3(x * 5, y * 5, z * 5, seed + 11) + 0.1) * 1.8, 0, 1);
      const craq = 1 - clamp(Math.abs(fbm3(x * 11, y * 11, z * 11, seed + 29)) / 0.07, 0, 1);
      c.copy(cIvory).lerp(cShade, mott * 0.85).lerp(cDirt, dirt * 0.7);
      c.lerp(cCrack, craq * 0.45);
      if (((i * 2654435761) >>> 0) % 100 < 5) c.multiplyScalar(0.82); // clay grain speckles
      if (s > ps + 0.5) c.lerp(cBridge, 0.55); // causeway / peninsula stone
      const edge = clamp(1 - s / 4, 0, 1);
      c.lerp(cCrack, edge * edge * 0.75);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }

    const P = [], C = [];
    const rimP = [], cliffP = [], cliffC = [], glowP = [];
    const vtx = (i) => [ico.pos[i * 3], ico.pos[i * 3 + 1], ico.pos[i * 3 + 2]];
    const cl = (i) => [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    const crackC = [cCrack.r, cCrack.g, cCrack.b];
    const push = (p, cc) => { P.push(p[0] * R, p[1] * R, p[2] * R); C.push(...cc); };
    const tri = (a, ca, b, cb, d, cd) => { push(a, ca); push(b, cb); push(d, cd); };
    const segs = [];

    for (let f = 0; f < ico.idx.length; f += 3) {
      const id = [ico.idx[f], ico.idx[f + 1], ico.idx[f + 2]];
      const s = id.map((i) => sd[i]);
      const pos = s.map((v) => v > 0);
      const np = pos.filter(Boolean).length;
      if (np === 0) continue;
      if (np === 3) { tri(vtx(id[0]), cl(id[0]), vtx(id[1]), cl(id[1]), vtx(id[2]), cl(id[2])); continue; }
      if (np === 1) {
        const k = pos.indexOf(true);
        const p = id[k], n1 = id[(k + 1) % 3], n2 = id[(k + 2) % 3];
        const sp = sd[p];
        const x1 = norm(mix(vtx(p), vtx(n1), sp / (sp - sd[n1])));
        const x2 = norm(mix(vtx(p), vtx(n2), sp / (sp - sd[n2])));
        tri(vtx(p), cl(p), x1, crackC, x2, crackC);
        segs.push([x1, x2, vtx(p)]);
      } else {
        const k = pos.indexOf(false);
        const nn = id[k], p1 = id[(k + 1) % 3], p2 = id[(k + 2) % 3];
        const sn = sd[nn];
        const x1 = norm(mix(vtx(nn), vtx(p1), sn / (sn - sd[p1])));
        const x2 = norm(mix(vtx(nn), vtx(p2), sn / (sn - sd[p2])));
        tri(x1, crackC, vtx(p1), cl(p1), vtx(p2), cl(p2));
        tri(x1, crackC, vtx(p2), cl(p2), x2, crackC);
        segs.push([x2, x1, mix(vtx(p1), vtx(p2), 0.5)]);
      }
    }

    const T = CFG.SHELL_THICKNESS;
    const rimW = 0.5;
    const cWall = new THREE.Color(0x8a7656), cWallLow = new THREE.Color(0x5b3f20);
    for (const [a, b, inner] of segs) {
      // inward tangent offset for the ink rim
      const mid = norm(mix(a, b, 0.5));
      let ix = inner[0] - mid[0], iy = inner[1] - mid[1], iz = inner[2] - mid[2];
      const dd = ix * mid[0] + iy * mid[1] + iz * mid[2];
      ix -= dd * mid[0]; iy -= dd * mid[1]; iz -= dd * mid[2];
      const il = Math.hypot(ix, iy, iz) || 1;
      const off = rimW / R / il;
      const a2 = norm([a[0] + ix * off, a[1] + iy * off, a[2] + iz * off]);
      const b2 = norm([b[0] + ix * off, b[1] + iy * off, b[2] + iz * off]);
      const rr = R + 0.04;
      rimP.push(...a.map((v) => v * rr), ...b.map((v) => v * rr), ...b2.map((v) => v * rr));
      rimP.push(...a.map((v) => v * rr), ...b2.map((v) => v * rr), ...a2.map((v) => v * rr));
      // cliff wall: upper (shaded rock) and lower glowing yolk band
      const r0 = R, r1 = R - T * 0.74, r2 = R - T;
      const q = (u, r) => u.map((x) => x * r);
      cliffP.push(...q(a, r0), ...q(b, r0), ...q(b, r1), ...q(a, r0), ...q(b, r1), ...q(a, r1));
      for (const rr2 of [r0, r0, r1, r0, r1, r1]) {
        const cc = rr2 === r0 ? cWall : cWallLow;
        cliffC.push(cc.r, cc.g, cc.b);
      }
      glowP.push(...q(a, r1), ...q(b, r1), ...q(b, r2), ...q(a, r1), ...q(b, r2), ...q(a, r2));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.computeVertexNormals();
    // radial normals look better on a sphere than faceted ones
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) {
      const l = Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      nrm.setXYZ(i, P[i * 3] / l, P[i * 3 + 1] / l, P[i * 3 + 2] / l);
    }
    this.shellMat = toonMat({ vertexColors: true }, { scale: 0.11, strength: 0.75, hatch: 0.8 });
    this.shell = new THREE.Mesh(geo, this.shellMat);
    this.shell.receiveShadow = true;
    this.shell.name = 'shell';

    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cliffP, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cliffC, 3));
    cg.computeVertexNormals();
    this.cliffMat = toonMat({ vertexColors: true, side: THREE.DoubleSide }, { scale: 0.25, strength: 0.8 });
    this.cliff = new THREE.Mesh(cg, this.cliffMat);

    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glowP, 3));
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.yolk).multiplyScalar(1.2), side: THREE.DoubleSide });
    this.glowBand = new THREE.Mesh(gg, this.glowMat);

    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rimP, 3));
    this.rimMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.DoubleSide });
    this.rim = new THREE.Mesh(rg, this.rimMat);

    this.fadeMats = [this.shellMat, this.cliffMat, this.glowMat, this.rimMat];
    this.materials.push(...this.fadeMats);
    this.group.add(this.shell, this.cliff, this.glowBand, this.rim);
    this.boundaryCount = segs.length;
  }

  _scatter(count, minSdf, rng) {
    const out = [];
    const d = new THREE.Vector3();
    let guard = 0;
    while (out.length < count && guard++ < count * 30) {
      randomUnit(rng, d);
      if (this.sdf(d) > minSdf && angleBetween(d, this.funnelDir) > 0.09) out.push(d.clone());
    }
    return out;
  }

  _buildProps() {
    const rng = mulberry32(this.seed ^ 0xabcdef);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const tmpObj = new THREE.Object3D();
    const head = new THREE.Vector3();
    const addInstanced = (geo, mat, dirs, setup, outline = 0) => {
      const im = new THREE.InstancedMesh(geo, mat, dirs.length);
      dirs.forEach((d, i) => {
        toTangent(head.copy(randomUnit(rng)), d);
        setup(tmpObj, d, head, i);
        tmpObj.updateMatrix();
        im.setMatrixAt(i, tmpObj.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
      if (outline) {
        const o = new THREE.InstancedMesh(geo, outlineMaterial(outline), dirs.length);
        o.instanceMatrix = im.instanceMatrix;
        o.computeBoundingSphere();
        this.group.add(o);
      }
      return im;
    };
    // rocks / clay lumps
    addInstanced(new THREE.DodecahedronGeometry(1, 0), toon(0x8b6b47), this._scatter(220, 2.5, rng), (o, d, h) => {
      placeOnSphere(o, d, h, R - 0.2);
      const k = 0.4 + rng() * 1.3;
      o.scale.set(k * (0.8 + rng() * 0.6), k * (0.5 + rng() * 0.5), k);
      o.rotateY(rng() * 6);
    }, 0.08);
    // broken eggshell shards
    addInstanced(new THREE.TetrahedronGeometry(1, 0), toon(0xf3ead6), this._scatter(160, 2.5, rng), (o, d, h) => {
      placeOnSphere(o, d, h, R + 0.1);
      const k = 0.5 + rng() * 1.1;
      o.scale.set(k * 1.6, k * 0.35, k);
      o.rotateX((rng() - 0.5) * 0.6);
    }, 0.07);
    // discarded cocktail spears
    addInstanced(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), toon(0xc8a26b), this._scatter(90, 2.5, rng), (o, d, h) => {
      placeOnSphere(o, d, h, R + 0.08);
      o.rotateX(Math.PI / 2);
      o.rotateZ(rng() * 6);
    }, 0.05);
    // old brine puddles
    addInstanced(new THREE.CircleGeometry(1, 9), glow(PALETTE.brineDark, 0.9, { polygonOffset: true, polygonOffsetFactor: -2 }),
      this._scatter(70, 3, rng), (o, d, h) => {
        placeOnSphere(o, d, h, R + 0.05);
        o.rotateX(-Math.PI / 2);
        const k = 0.6 + rng() * 1.6;
        o.scale.set(k * (1 + rng()), k, 1);
      });
  }

  _buildFunnel() {
    const g = new THREE.Group();
    g.name = 'funnel';
    const segs = 96, rings = 14;
    const geo = new THREE.CircleGeometry(CFG.FUNNEL_R, segs, 0, Math.PI * 2);
    // turn it into a dish with a spiral groove texture in vertex colours
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const gold = new THREE.Color(PALETTE.yolk).multiplyScalar(1.05), deep = new THREE.Color(PALETTE.yolkDeep).multiplyScalar(0.45);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y) / CFG.FUNNEL_R;
      const th = Math.atan2(y, x);
      const stripe = 0.5 + 0.5 * Math.sin(th * 3 + r * 14);
      c.copy(deep).lerp(gold, stripe * (0.4 + 0.6 * r));
      if (r < 0.12) c.set(0x2a1405);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    void rings;
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.funnelDisc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.funnelDisc.rotation.x = -Math.PI / 2;
    this.funnelDisc.position.y = 0.15;
    g.add(this.funnelDisc);
    // brass-ringed lip
    const lip = new THREE.Mesh(new THREE.TorusGeometry(CFG.FUNNEL_R, 0.45, 8, 48), toon(PALETTE.brass));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.2;
    ink(lip, 0.08);
    g.add(lip);
    // beacon of yolk light
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.materials.push(this.funnelDisc.material, beamMat);
    const beamGeo = new THREE.CylinderGeometry(CFG.FUNNEL_R * 0.45, CFG.FUNNEL_R * 0.85, 28, 20, 6, true);
    const bp = beamGeo.attributes.position;
    const bc = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) {
      const k = Math.pow(1 - (bp.getY(i) + 14) / 28, 2);
      bc.set([k, k * 0.75, k * 0.3], i * 3);
    }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 14;
    g.add(beam);
    this.beam = beam;
    const h = toTangent(new THREE.Vector3(0, 0, 1), this.funnelDir);
    placeOnSphere(g, this.funnelDir, h, R);
    this.funnel = g;
    this.group.add(g);
  }

  _buildCaches() {
    const shellGeo = new THREE.SphereGeometry(1, 14, 10);
    for (const p of this.peninsulas) {
      const g = new THREE.Group();
      const egg = new THREE.Mesh(shellGeo, toon(0xe9e1cb));
      egg.castShadow = true;
      egg.scale.set(1.7, 2.2, 1.7);
      egg.position.y = 1.9;
      ink(egg, 0.06);
      g.add(egg);
      // calcified crust nodules
      for (let i = 0; i < 7; i++) {
        const k = new THREE.Mesh(shellGeo, toon(0xc9bd9d));
        const a = (i / 7) * Math.PI * 2;
        k.position.set(Math.cos(a) * 1.5, 0.5 + (i % 3) * 0.9, Math.sin(a) * 1.5);
        k.scale.setScalar(0.45 + (i % 2) * 0.25);
        ink(k, 0.08);
        g.add(k);
      }
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), glow(PALETTE.yolk, 2.2));
      core.position.y = 4.4;
      g.add(core);
      const h = toTangent(new THREE.Vector3(1, 0, 0), p.tip);
      placeOnSphere(g, p.tip, h, R);
      this.group.add(g);
      this.caches.push({ dir: p.tip.clone(), group: g, core, cracked: false, hp: 3 });
    }
  }

  crackCache(cache) {
    cache.cracked = true;
    cache.group.visible = false;
  }

  /** Continuous depth look: 0 = active layer, 1 = one layer down, <0 = fading out above. */
  setDepthLook(k) {
    const amber = new THREE.Color(PALETTE.yolkDeep);
    const kk = Math.max(0, k);
    // inner shells: dimmer albedo but lit from within by warm yolk light
    const dim = Math.pow(0.55, kk);
    this.shellMat.color.setScalar(dim);
    this.shellMat.emissive.copy(amber).multiplyScalar(Math.min(0.5, kk * 0.42));
    this.cliffMat.color.setScalar(dim);
    this.cliffMat.emissive.copy(amber).multiplyScalar(Math.min(0.45, kk * 0.3));
    const fade = k < 0 ? clamp(1 + k * 3, 0, 1) : 1;
    const t = fade < 1;
    for (const m of this.fadeMats) {
      if (m.transparent !== t) {
        m.transparent = t;
        m.depthWrite = !t;
        m.needsUpdate = true;
      }
      m.opacity = fade;
    }
    this.shell.visible = this.cliff.visible = this.glowBand.visible = this.rim.visible = fade > 0.01;
  }

  /** Hide everything except the shell itself (used while the layer fades away). */
  hideDressing() {
    for (const o of this.group.children) {
      if (![this.shell, this.cliff, this.glowBand, this.rim].includes(o)) o.visible = false;
    }
  }

  update(dt, time) {
    this.funnelDisc.rotation.z = -time * 1.4;
    this.beam.material.opacity = 0.2 + Math.sin(time * 3) * 0.05;
    for (const c of this.caches) if (!c.cracked) {
      c.core.position.y = 4.4 + Math.sin(time * 2.5 + c.dir.x * 10) * 0.25;
      c.core.rotation.y = time;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== ICO) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
  }
}
