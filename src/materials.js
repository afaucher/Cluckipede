// "Grimy Alchemical Stop-Motion": stepped toon shading + inverted-hull comic ink.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './config.js';

let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const toonCache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (toonCache.has(key)) return toonCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
  toonCache.set(key, m);
  return m;
}

export const vertexToon = () =>
  new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });

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
  return ink(new THREE.Mesh(geo, toon(color, opts)), thickness);
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
