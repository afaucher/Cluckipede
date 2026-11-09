// Screen-space passes for the "Grimy Alchemical Stop-Motion" look.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Comic ink lines from depth discontinuities (Laplacian of the raw depth buffer,
 * so flat ground produces no lines) plus colour edges. Sample positions jitter on
 * a 12 fps cadence for hand-drawn "line boil".
 */
export class InkPass extends ShaderPass {
  constructor(camera) {
    super({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        thickness: { value: 1.5 },
        boil: { value: 0 },
        inkColor: { value: new THREE.Color(0x120c07) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 resolution;
        uniform float cameraNear, cameraFar, thickness, boil;
        uniform vec3 inkColor;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float lin(float d) { return (cameraNear * cameraFar) / (cameraFar - d * (cameraFar - cameraNear)); }
        float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        void main() {
          vec2 px = thickness / resolution;
          vec2 cell = floor(gl_FragCoord.xy / 7.0) + boil;
          vec2 uv = vUv + (vec2(hash(cell), hash(cell + 17.0)) - 0.5) * px * 0.9;
          float dc = texture2D(tDepth, uv).x;
          float dl = texture2D(tDepth, uv - vec2(px.x, 0.0)).x;
          float dr = texture2D(tDepth, uv + vec2(px.x, 0.0)).x;
          float du = texture2D(tDepth, uv + vec2(0.0, px.y)).x;
          float dd = texture2D(tDepth, uv - vec2(0.0, px.y)).x;
          float z = lin(dc);
          // relative view-space depth Laplacian (planes -> 0)
          float lap = abs(dl + dr + du + dd - 4.0 * dc) * z * (cameraFar - cameraNear) / (cameraFar * cameraNear);
          float e = smoothstep(0.012, 0.035, lap);
          vec3 c = texture2D(tDiffuse, uv).rgb;
          float lc = abs(lum(texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb) + lum(texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb)
            + lum(texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb) + lum(texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb) - 4.0 * lum(c));
          e = max(e, smoothstep(0.35, 0.7, lc / max(0.25, lum(c))) * 0.55);
          e *= 1.0 - smoothstep(110.0, 230.0, z);
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          gl_FragColor = vec4(mix(col, inkColor, e * 0.92), 1.0);
        }`,
    });
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  setSize(w, h) {
    this.uniforms.resolution.value.set(w, h);
  }
}

/** Warm split-tone, vignette and 12 fps film grain. */
export class GradePass extends ShaderPass {
  constructor() {
    super({
      uniforms: {
        tDiffuse: { value: null },
        seed: { value: 0 },
        grain: { value: 0.06 },
        vignette: { value: 1.25 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float seed, grain, vignette;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          // shadows lean umber, highlights lean amber
          vec3 shadowTint = vec3(0.95, 0.85, 0.72), lightTint = vec3(1.05, 1.0, 0.9);
          c *= mix(shadowTint, lightTint, smoothstep(0.05, 0.6, l));
          c = mix(vec3(l), c, 1.12);
          vec2 q = vUv - 0.5;
          c *= clamp(1.0 - dot(q, q) * vignette, 0.0, 1.0);
          float n = hash(floor(gl_FragCoord.xy / 1.5) + seed * 13.1) - 0.5;
          c += n * grain * (0.35 + l);
          gl_FragColor = vec4(max(c, 0.0), 1.0);
        }`,
    });
  }
}
