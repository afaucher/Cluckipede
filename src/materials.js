// "Grimy Alchemical Stop-Motion": stepped toon shading + inverted-hull comic ink.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './config.js';
import { mulberry32, fbm3 } from './sphere.js';

let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([62, 58, 66, 255, 150, 146, 150, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

// --- grime: a procedural clay/thumbprint/stain texture, sampled triplanar in world space
let grimeTex = null;
export function grimeTexture() {
  if (grimeTex) return grimeTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const rnd = mulberry32(90210);
  const blobs = Array.from({ length: 40 }, () => [rnd() * N, rnd() * N, 6 + rnd() * 30, rnd()]);
  const prints = Array.from({ length: 6 }, () => [rnd() * N, rnd() * N, 18 + rnd() * 22]);
  const scratches = Array.from({ length: 26 }, () => [rnd() * N, rnd() * N, rnd() * Math.PI, 10 + rnd() * 50]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0.78 + fbm3(x / 22, y / 22, 0.5, 3) * 0.16 + fbm3(x / 5, y / 5, 9.5, 5) * 0.07;
    for (const [bx, by, br, bs] of blobs) {
      const d = Math.hypot(x - bx, y - by) / br;
      if (d < 1) v -= (1 - d * d) * 0.12 * bs; // grime stains
    }
    for (const [px, py, pr] of prints) {
      const d = Math.hypot(x - px, y - py);
      if (d < pr) v += Math.sin(d * 1.6) * 0.035 * (1 - d / pr); // thumbprint ridges in the clay
    }
    for (const [sx, sy, sa, sl] of scratches) {
      const dx = x - sx, dy = y - sy;
      const along = dx * Math.cos(sa) + dy * Math.sin(sa);
      const across = -dx * Math.sin(sa) + dy * Math.cos(sa);
      if (Math.abs(along) < sl && Math.abs(across) < 0.7) v -= 0.12;
    }
    if (rnd() < 0.03) v -= 0.12 * rnd(); // grit
    const c = Math.max(0, Math.min(255, v * 255));
    const o = (y * N + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = c;
    data[o + 3] = 255;
  }
  grimeTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  grimeTex.wrapS = grimeTex.wrapT = THREE.MirroredRepeatWrapping;
  grimeTex.magFilter = THREE.LinearFilter;
  grimeTex.minFilter = THREE.LinearMipmapLinearFilter;
  grimeTex.generateMipmaps = true;
  grimeTex.needsUpdate = true;
  return grimeTex;
}

/** Shared uniform: hatch line spacing in device pixels. */
export const HATCH_PX = { value: 6 };

/**
 * Inject world-space grime and screen-space comic cross-hatching (in the shadow
 * bands) into a MeshToonMaterial.
 */
export function grimeify(mat, { scale = 0.45, strength = 0.55, hatch = 1 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrime = { value: grimeTexture() };
    shader.uniforms.grimeScale = { value: scale };
    shader.uniforms.grimeStrength = { value: strength };
    shader.uniforms.hatchAmt = { value: hatch };
    shader.uniforms.hatchPx = HATCH_PX;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;\nvarying vec3 vGNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 gp = vec4(transformed, 1.0);
          vec3 gn = objectNormal;
          #ifdef USE_INSTANCING
            gp = instanceMatrix * gp;
            gn = mat3(instanceMatrix) * gn;
          #endif
          gp = modelMatrix * gp;
          vGPos = gp.xyz;
          vGNrm = normalize(mat3(modelMatrix) * gn);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrime;
        uniform float grimeScale, grimeStrength, hatchAmt, hatchPx;
        varying vec3 vGPos;
        varying vec3 vGNrm;
        float grimeSample() {
          vec3 w = pow(abs(normalize(vGNrm)), vec3(4.0));
          w /= (w.x + w.y + w.z);
          vec3 p = vGPos * grimeScale;
          return texture2D(tGrime, p.yz).r * w.x + texture2D(tGrime, p.xz).r * w.y + texture2D(tGrime, p.xy).r * w.z;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grimeV = grimeSample();
        diffuseColor.rgb *= mix(1.0, grimeV * 1.2, grimeStrength);`)
      .replace('#include <opaque_fragment>', `
        {
          float base = max(0.03, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
          float lit = dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / base;
          float a = (gl_FragCoord.x + gl_FragCoord.y) / hatchPx;
          float b = (gl_FragCoord.x - gl_FragCoord.y) / hatchPx;
          float l1 = 1.0 - smoothstep(0.07, 0.17, abs(fract(a) - 0.5));
          float l2 = 1.0 - smoothstep(0.07, 0.17, abs(fract(b) - 0.5));
          float s1 = 1.0 - smoothstep(0.42, 0.62, lit);
          float s2 = 1.0 - smoothstep(0.22, 0.36, lit);
          outgoingLight *= 1.0 - hatchAmt * (0.4 * l1 * s1 + 0.45 * l2 * s2);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'grime-v1';
  return mat;
}

/** Grimy toon material factory used everywhere instead of bare MeshToonMaterial. */
export function toonMat(opts = {}, grime = {}) {
  return grimeify(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...opts }), grime);
}

const toonCache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (toonCache.has(key)) return toonCache.get(key);
  const m = toonMat({ color, ...opts });
  toonCache.set(key, m);
  return m;
}

export const vertexToon = () => toonMat({ vertexColors: true });

/** Darken vertex colours toward the bottom of a model: cheap clay "ambient occlusion". */
export function bakeAO(geo, y0, y1, min = 0.6) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = min + (1 - min) * Math.sqrt(t);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}

const outlineCache = new Map();
export function outlineMaterial(thickness = 0.08, color = PALETTE.ink) {
  const key = `${thickness.toFixed(3)}|${color}`;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
    ]),
    vertexShader: /* glsl */ `
      uniform float thickness;
      #include <fog_pars_vertex>
      void main() {
        vec4 p = vec4(position + normal * thickness, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 mvPosition = modelViewMatrix * p;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  outlineCache.set(key, m);
  return m;
}

/** Add an ink outline shell to a mesh (as a child, so it follows animation). */
export function ink(mesh, thickness = 0.08) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.name = 'ink';
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

/** Convenience: toon mesh + ink. */
export function inkMesh(geo, color, thickness = 0.08, opts) {
  const m = ink(new THREE.Mesh(geo, toon(color, opts)), thickness);
  m.castShadow = true;
  return m;
}

/** Bake a primitive into a coloured part for merging into a single mesh. */
export function part(geo, color, { pos, rot, scale } = {}) {
  const g = geo.index ? geo : geo;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0])));
  m.compose(
    new THREE.Vector3(...(pos || [0, 0, 0])),
    q,
    new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1]))
  );
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

export function merge(parts) {
  const prepared = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of prepared) {
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
  }
  return mergeGeometries(prepared, false);
}

/** Bright unlit material for glowing things (picked up by bloom). */
const glowCache = new Map();
export function glow(color, intensity = 1, opts = {}) {
  const key = `${color}|${intensity}|${JSON.stringify(opts)}`;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({ color: c, ...opts });
  glowCache.set(key, m);
  return m;
}
