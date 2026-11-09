// The Cluckipede vs. The Brine Horde — game orchestration.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';
import { InkPass, GradePass } from './post.js';
import { HATCH_PX } from './materials.js';
import { CFG, PALETTE } from './config.js';
import { Layer } from './world.js';
import { Cluckipede } from './cluckipede.js';
import { Horde } from './enemies.js';
import { Projectiles, WEAPONS, CACHE_LOOT } from './weapons.js';
import { FX } from './fx.js';
import { CameraRig } from './camera.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import {
  mulberry32, randomUnit, toTangent, tangentToward, clamp, easeInOut, smooth, lerp, arcDist, rightOf,
} from './sphere.js';

const R = CFG.R0;
const params = new URLSearchParams(location.search);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.shadowsOn = !params.has('noshadow');
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    HATCH_PX.value = 6 * this.pixelRatio;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a0f07);
    this.scene.fog = new THREE.Fog(0x4a2c12, 90, 280);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1200);

    this._buildSky();
    this._buildLights();

    this.egg = new THREE.Group();
    this.scene.add(this.egg);
    // the glowing yolk heart at the centre of the Infinite Egg
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(16, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.yolk).multiplyScalar(1.4), fog: false })
    );
    this.scene.add(this.core);

    this.fx = new FX(this.scene);
    this.audio = new Audio();
    this.proj = new Projectiles(this.scene, this.fx);
    this.horde = new Horde(this.scene, this.fx, this.audio);
    this.player = new Cluckipede(this.scene, this.fx, this.audio);
    this.rig = new CameraRig(this.camera);
    this.hud = new HUD();
    this.input = new Input(this.canvas);

    this.bloomOn = !params.has('nobloom');
    const pr = this.pixelRatio;
    const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
    rt.depthTexture = new THREE.DepthTexture(window.innerWidth * pr, window.innerHeight * pr);
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.inkPass = new InkPass(this.camera);
    this.inkPass.setSize(window.innerWidth * pr, window.innerHeight * pr);
    this.composer.addPass(this.inkPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.86);
    this.composer.addPass(this.bloom);
    this.gradePass = new GradePass();
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this.layers = [];
    this.state = 'title';
    this.time = 0;
    this.tickAcc = 0;
    this.depthLevel = 0;
    this.layerIndex = 0;
    this.frameTimes = [];
    this.best = 0;
    try { this.best = Number(localStorage.getItem('cluckipede.best') || 0); } catch { /* storage unavailable */ }

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') { this.state = 'paused'; this.hud.show('pause'); }
    });
    document.getElementById('touch-coil').addEventListener('touchstart', (e) => { e.preventDefault(); this.input.touchCoil = true; }, { passive: false });
    document.getElementById('touch-coil').addEventListener('touchend', (e) => { e.preventDefault(); this.input.touchCoil = false; }, { passive: false });
    if ('ontouchstart' in window) document.body.classList.add('touch');
    for (const o of document.querySelectorAll('.overlay')) o.addEventListener('click', () => this.input.pressed.add('Click'));

    this.newGame(); // build a world behind the title screen
    this.state = 'title';
    this.hud.show('title');
    this._updateBest();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { camN: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 camN; varying vec3 vW;
        void main() {
          vec3 d = normalize(vW - cameraPosition);
          float h = dot(d, camN);
          vec3 horizon = vec3(0.95, 0.55, 0.18);
          vec3 zenith = vec3(0.10, 0.05, 0.03);
          vec3 below = vec3(0.16, 0.08, 0.03);
          vec3 c = h > 0.0 ? mix(horizon, zenith, pow(smoothstep(0.0, 0.75, h), 0.6)) : mix(horizon, below, smoothstep(0.0, 0.25, -h));
          // faint membrane veins
          float v = sin(d.x * 23.0 + sin(d.y * 17.0)) * sin(d.z * 19.0 + sin(d.x * 13.0));
          c += vec3(0.08, 0.035, 0.0) * smoothstep(0.85, 1.0, v) * smoothstep(0.0, 0.4, h);
          gl_FragColor = vec4(c * 0.85, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.ambient = new THREE.AmbientLight(0xffe6c8, 0.55);
    this.key = new THREE.DirectionalLight(0xfff0d8, 2.1);
    this.fill = new THREE.DirectionalLight(PALETTE.yolk, 0.45);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 260;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.06;
    this.scene.add(this.ambient, this.key, this.fill, this.key.target, this.fill.target);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.inkPass.setSize(w * this.pixelRatio, h * this.pixelRatio);
    HATCH_PX.value = 6 * this.pixelRatio;
  }

  // -------------------------------------------------------------------------
  newGame() {
    for (const l of this.layers) l.dispose();
    this.horde.clear();
    this.proj.clear();
    this.fx.clear();
    this.seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 1e9) >>> 0;
    this.rng = mulberry32(this.seed ^ 0x5eed);
    this.depthLevel = 0;
    this.layerIndex = 0;
    this.horde.kills = 0;
    this.horde.score = 0;
    const spawn = randomUnit(this.rng);
    this.layers = [];
    let sd = spawn;
    for (let k = 0; k <= CFG.VISIBLE_INNER_LAYERS; k++) {
      const L = new Layer(k, sd, this.seed);
      sd = L.funnelDir;
      this.layers.push(L);
      this.egg.add(L.group);
    }
    this._applyLayerScales(0);
    const L0 = this.layers[0];
    // face along the widest open ground
    const heading = this._bestHeading(L0, spawn);
    this.player.reset(spawn, heading, { segments: CFG.START_SEGMENTS, armor: this.armorMax() });
    this.player.head.visible = true;
    this.horde.populate(L0, this.rng);
    this.rig.snap(spawn, heading, R);
    this.deadT = 0;
    this.stats = { caches: 0, descents: 0, falls: 0, start: this.time };
  }

  _bestHeading(layer, dir) {
    let best = null, bestS = -Infinity;
    for (let k = 0; k < 16; k++) {
      const h = toTangent(new THREE.Vector3(Math.cos(k), Math.sin(k * 1.7), Math.cos(k * 2.3)), dir);
      const p = dir.clone();
      const hh = h.clone();
      let s = 0;
      for (let d = 0; d < 6; d++) {
        const q = p.clone(); const qh = hh.clone(); moveAlong(q, qh, (d + 1) * 6); s += Math.min(8, layer.sdf(q));
        const b = p.clone(); const bh = hh.clone().negate(); moveAlong(b, bh, (d + 1) * 5); s += Math.min(8, layer.sdf(b)) * 0.8;
      }
      if (s > bestS) { bestS = s; best = h; }
    }
    return best;
  }

  armorMax() { return CFG.BASE_ARMOR * (1 + CFG.DEPTH_BUFF * this.depthLevel); }
  dmgMult() { return 1 + CFG.DEPTH_BUFF * this.depthLevel; }

  _applyLayerScales(z) {
    this.layers.forEach((l, k) => {
      l.group.scale.setScalar(Math.pow(CFG.LAYER_SCALE, k - z));
      l.setDepthLook(k - z);
    });
    this.core.scale.setScalar(1);
  }

  start() {
    this.audio.unlock();
    if (this.state === 'dead' || this.state === 'title' && this.stats?.used) this.newGame();
    this.stats.used = true;
    this.state = 'playing';
    this.hud.show(null);
    this.hud.message('Slither, coil and <b>slingshot</b> — find the golden <b>Chalaza Funnel</b> to descend.', 'gold');
  }

  // -------------------------------------------------------------------------
  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 1 / 20);
    this._adapt(dt);
    this.step(dt);
    this.render();
    this.input.endFrame();
  }

  _adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    this.hud.el.fps.textContent = `${Math.round(1 / avg)} fps`;
    if (avg > 1 / 40 && this.state === 'playing') {
      if (this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.5);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.composer.setPixelRatio?.(this.pixelRatio);
        this.resize();
      } else if (this.shadowsOn && avg > 1 / 30) {
        this.shadowsOn = false;
        this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      } else if (this.bloomOn && avg > 1 / 30) {
        this.bloomOn = false;
      }
    }
  }

  step(dt) {
    const inp = this.input;
    if (inp.consume('KeyM')) this.hud.message(this.audio.toggleMute() ? 'Sound off' : 'Sound on');
    if (inp.consume('KeyB')) { this.bloomOn = !this.bloomOn; }

    if (this.state === 'title' || this.state === 'dead') {
      if ((inp.consume('Enter') || inp.consume('Click') || inp.consume('Space')) && (this.state === 'title' || this.deadT > 1.2)) this.start();
    }
    if (this.state === 'playing' && (inp.consume('Escape') || inp.consume('KeyP'))) { this.state = 'paused'; this.hud.show('pause'); return; }
    if (this.state === 'paused') {
      if (inp.consume('Escape') || inp.consume('KeyP') || inp.consume('Enter') || inp.consume('Click')) { this.state = 'playing'; this.hud.show(null); }
      return;
    }

    this.time += dt;
    this.tickAcc += dt;
    let tick = false;
    if (this.tickAcc >= 1 / CFG.ANIM_FPS) { tick = true; this.tickAcc %= 1 / CFG.ANIM_FPS; }
    this.tick = tick;

    if (this.state === 'playing') this._play(dt, tick);
    else if (this.state === 'transition') this._transition(dt);
    else if (this.state === 'dead') {
      this.deadT += dt;
      this.horde.update(dt, this._hordeCtx(tick));
      this.proj.update(dt, this.horde.awake, this._projHooks());
      this.player.updateChunks(dt, this.time);
      if (this.deadT > 1.6 && this.hud.el.over.classList.contains('hidden')) this._showGameOver();
    } else if (this.state === 'title') {
      // idle attract: wander, veering away from chasm edges
      const steer = (this.player.edgeDist ?? 99) < 9 ? 1 : Math.sin(this.time * 0.4) * 0.5;
      const ev = this.player.update(dt, { steer, coil: false }, this.layers[0], this.time);
      if (ev.fell) {
        const L0 = this.layers[0];
        this.player.reset(L0.spawnDir, this._bestHeading(L0, L0.spawnDir), { armor: this.armorMax() });
      }
    }

    for (const l of this.layers) l.update(dt, this.time);
    this.fx.update(dt);
    this.core.rotation.y += dt * 0.1;

    // camera
    if (this.state !== 'transition') {
      const p = this.player;
      const edge = clamp((7 - (p.edgeDist ?? 99)) / 5, 0, 1);
      const want = Math.max(p.coilAmount, p.mode === 'coil' ? 0.85 : 0, edge, this.state === 'dead' ? 0.6 : 0);
      this.rig.update(dt, p.dir, p.heading, R, want, p.segs.length);
    }
    this._updateLights();
    this._funnelBearing();
    if (this.state !== 'title') this.hud.update(this);
  }

  _hordeCtx(tick) {
    return {
      player: this.player, layer: this.layers[0], proj: this.proj, time: this.time, tick,
      onHit: (t, dmg) => this._playerHit(t, dmg),
    };
  }

  _projHooks() {
    return {
      hitEnemy: (e, b) => {
        const res = this.horde.damage(e, b.dmg, b.heading);
        if (res === 'hit') this.fx.burst(_v.copy(e.dir).multiplyScalar(R + 1.2), { count: 3, color: PALETTE.brine, speed: 6, size: 0.18, life: 0.3 });
        return res;
      },
      explode: (dir, aoe, dmg, owner, kind) => this._explode(dir, aoe, dmg, owner, kind),
    };
  }

  _explode(dir, aoe, dmg, owner, kind) {
    const pos = _v.copy(dir).multiplyScalar(R + 0.6);
    if (kind === 'arrow') {
      this.fx.burst(pos, { count: 10, color: 0xffd23a, intensity: 2.5, speed: 10, size: 0.3, life: 0.4 });
      this.fx.burst(pos, { count: 6, color: 0xc8a020, speed: 4, size: 0.6, life: 0.6, grow: 1, grav: 0 });
      this.fx.shockwave(pos, aoe);
    } else {
      this.fx.explosion(pos, aoe * 0.8);
      this.fx.splat(dir, aoe * 0.45, 0x2b2015);
    }
    this.audio.explode();
    const cosA = (r) => Math.cos((aoe + r) / R);
    if (owner === 'player') {
      for (const e of this.horde.awake) {
        if (!e.dead && e.dir.dot(dir) > cosA(e.radius)) {
          this.horde.damage(e, dmg, null, { bypass: true });
          if (!e.dead) e.knock.copy(tangentToward(dir, e.dir, _w)).multiplyScalar(8);
        }
      }
    } else if (this.player.alive) {
      const hits = this.player.targets().filter((t) => t.dir.dot(dir) > cosA(t.r));
      // resolve from the tail toward the head so severs don't double count
      hits.sort((a, b) => (b.i ?? -1) - (a.i ?? -1));
      for (const t of hits) this._playerHit(t, dmg);
    }
    if (this.player.dir.dot(dir) > Math.cos(25 / R)) this.rig.shake(kind === 'arrow' ? 0.3 : 0.6);
  }

  _playerHit(t, dmg) {
    const res = this.player.hit(t, dmg, this.time);
    if (!res) return;
    const p = _v.copy(t.dir).multiplyScalar(R + 1.4);
    this.fx.sparks(p, 0xffe0a0, 5);
    if (res === 'sever') {
      this.rig.shake(1.2);
      const n = this.player.chunks.reduce((s, c) => s + c.segs.length, 0);
      this.hud.message(n ? '<b>SPINE SEVERED!</b> Loop back and touch the writhing tail to re-attach.' : '<b>SEGMENT LOST!</b>', 'bad');
    } else if (res === 'dead') {
      this._gameOver();
    } else this.rig.shake(0.25);
  }

  _play(dt, tick) {
    const p = this.player;
    const layer = this.layers[0];
    // steering input
    let target = null;
    if (this.input.mouse.active) target = this._mouseTarget();
    const ev = p.update(dt, { steer: target ? null : this.input.steer, target, coil: this.input.coil }, layer, this.time);
    if (ev.burst) {
      this.rig.shake(0.5);
      this.fx.burst(p.head.position, { count: 16, color: PALETTE.feather, speed: 10, size: 0.3, life: 0.8, up: 1.2, grav: 8 });
    }
    if (p.mode === 'coil' && p.charge > 0.2 && Math.random() < 0.5) {
      this.fx.spawn(_v.copy(p.dir).multiplyScalar(R + 2.5).addScaledVector(randomUnit(Math.random, _w), 1.5), _w.set(0, 0, 0), new THREE.Color(PALETTE.yolk).multiplyScalar(2), 0.15, 0.3, { grav: 0 });
    }
    if (ev.fell) { this._startTransition('fall'); return; }

    // turrets
    const hits = [];
    p.updateTurrets(dt, { enemies: this.horde.awake, proj: this.proj, fx: this.fx, audio: this.audio, dmgMult: this.dmgMult(), tick, hits });
    for (const h of hits) this.horde.damage(h.enemy, h.dmg, h.heading, { bypass: h.bypass, burn: h.burn });

    this.proj.update(dt, this.horde.awake, this._projHooks());
    this.horde.update(dt, this._hordeCtx(tick));
    this.horde.reinforce(dt, p, layer);
    this._ram();
    this._caches(layer);

    if (p.alive && arcDist(p.dir, layer.funnelDir, R) < CFG.FUNNEL_R * 0.75) this._startTransition('funnel');
  }

  _mouseTarget() {
    const m = this.input.mouse;
    const ndc = new THREE.Vector2((m.x / window.innerWidth) * 2 - 1, -(m.y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const n = this.player.dir;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, _v.copy(n).multiplyScalar(R));
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    if (hit.distanceTo(_v) < 2.5) return null;
    return hit.normalize();
  }

  _ram() {
    const p = this.player;
    if (!p.alive) return;
    const mult = this.dmgMult();
    for (const e of this.horde.awake) {
      if (e.dead) continue;
      const lim = Math.cos((CFG.HEAD_RADIUS + e.radius) / R);
      if (e.dir.dot(p.dir) < lim) continue;
      if (e.lastRam && this.time - e.lastRam < 0.35) continue;
      e.lastRam = this.time;
      const push = tangentToward(p.dir, e.dir, _w).clone();
      const facing = e.heading.dot(p.heading) < -0.3;
      if (p.isBursting) {
        this.horde.damage(e, 12 * mult, null, { bypass: true });
        e.knock.copy(push).addScaledVector(p.heading, 1).multiplyScalar(18);
        this.rig.shake(0.3);
        this.fx.sparks(e.mesh.position, 0xffffff, 6);
      } else if (e.type === 'gherkin' && e.braced && facing) {
        // the phalanx braces: charging into a wall of spears hurts
        this._playerHit({ dir: p.dir, kind: 'head', i: -1, r: CFG.HEAD_RADIUS }, e.dmg);
        e.knock.copy(push).multiplyScalar(6);
        p.slowT = 0.35;
        if (!this._braceTip) { this._braceTip = true; this.hud.message('Braced spears! Flank the phalanx or <b>slingshot</b> through it.', 'bad'); }
      } else if (e.type === 'brute') {
        this.horde.damage(e, 1 * mult, null, { bypass: !facing });
        e.knock.copy(push).multiplyScalar(2);
        p.slowT = 0.5;
        this.fx.sparks(e.mesh.position, 0xdddddd, 5);
        this.audio.tink();
      } else {
        this.horde.damage(e, 2.5 * mult, null, { bypass: true });
        e.knock.copy(push).multiplyScalar(10);
      }
    }
  }

  _caches(layer) {
    const p = this.player;
    for (const c of layer.caches) {
      if (c.cracked) continue;
      if (arcDist(p.dir, c.dir, R) > CFG.HEAD_RADIUS + 2.6) continue;
      layer.crackCache(c);
      const pos = c.dir.clone().multiplyScalar(R + 2);
      this.fx.explosion(pos, 4);
      this.fx.burst(pos, { count: 24, color: 0xf1e8d2, speed: 14, size: 0.5, life: 1.4, up: 1.4 });
      this.fx.burst(pos, { count: 18, color: PALETTE.yolk, intensity: 2.5, speed: 10, size: 0.3, life: 0.9 });
      const type = CACHE_LOOT[Math.floor(Math.random() * CACHE_LOOT.length)];
      const res = p.weld(type);
      this.audio.weld();
      this.rig.shake(0.6);
      this.stats.caches++;
      const side = res.side > 0 ? 'starboard' : res.side < 0 ? 'port' : 'omni';
      this.hud.message(`Calcified cache cracked! <b>${WEAPONS[type].name}</b> welded to segment ${res.index + 1} (${side}).`, 'gold');
    }
  }

  // -------------------------------------------------------------------------
  _startTransition(kind) {
    const p = this.player;
    const cur = this.layers[0];
    const next = this.layers[1];
    this.state = 'transition';
    cur.hideDressing();
    this.horde.clear(true);
    this.proj.clear();
    this.fx.clearSplats();
    let lost = 0;
    if (kind === 'fall') {
      lost = p.loseTail(Math.max(2, Math.ceil(p.segs.length * CFG.VOID_FALL_LOSS)));
      this.audio.fall();
      this.stats.falls++;
    } else {
      this.audio.descend();
      this.stats.descents++;
      this.fx.burst(p.head.position, { count: 50, color: PALETTE.yolk, intensity: 2.5, speed: 16, size: 0.4, life: 1.2, up: 2 });
    }
    for (const c of p.chunks) for (const cs of c.segs) cs.seg.dispose();
    p.chunks = [];
    const landing = kind === 'funnel' ? next.spawnDir.clone() : next.findSolidNear(p.dir, 7);
    const snap = p.snapshot();
    const q = new THREE.Quaternion().setFromUnitVectors(snap.head, landing);
    // generate the next-deepest layer while the screen is busy
    const deepest = this.layers[this.layers.length - 1];
    const L = new Layer(deepest.index + 1, deepest.funnelDir, this.seed);
    this.layers.push(L);
    this.egg.add(L.group);
    L.group.scale.setScalar(Math.pow(CFG.LAYER_SCALE, this.layers.length - 1));
    this.trans = { kind, t: 0, dur: kind === 'funnel' ? 2.8 : 2.3, snap, q, landing, lost };
    if (kind === 'fall') this.hud.message(`<b>VOID FREE-FALL!</b> ${lost} tail segment${lost === 1 ? '' : 's'} torn away. No depth buff.`, 'bad');
    else this.hud.message('<b>CHALAZA DESCENT</b> — spiralling into the yolk…', 'gold');
  }

  _transition(dt) {
    const T = this.trans;
    T.t += dt / T.dur;
    const t = Math.min(1, T.t);
    const e = easeInOut(t);
    this._applyLayerScales(e);
    const r0 = R * Math.pow(CFG.LAYER_SCALE, -e);
    const r1 = R * Math.pow(CFG.LAYER_SCALE, 1 - e);
    const fallT = T.kind === 'funnel' ? smooth(clamp((t - 0.12) / 0.88, 0, 1)) : Math.pow(clamp(t * 1.15, 0, 1), 1.6);
    const r = lerp(r0, r1, fallT);
    const qi = new THREE.Quaternion().slerp(T.q, e);
    const spin = T.kind === 'funnel' ? e * e * 9 : Math.sin(t * 20) * 0.15 * (1 - t);
    this.player.poseFrozen(T.snap, qi, r, spin);
    const d = T.snap.head.clone().applyQuaternion(qi).normalize();
    const h = toTangent(T.snap.heading.clone().applyQuaternion(qi), d);
    this.rig.update(dt, d, h, r, 1, this.player.segs.length);
    if (T.kind === 'funnel' && Math.random() < 0.8) {
      const pos = d.clone().multiplyScalar(r + 1).addScaledVector(randomUnit(Math.random, _w), 4);
      this.fx.spawn(pos, _v.copy(d).multiplyScalar(-8), new THREE.Color(PALETTE.yolk).multiplyScalar(2.2), 0.3, 0.6, { grav: 0 });
    }
    if (T.t >= 1) this._finishTransition(d, h);
  }

  _finishTransition(dir, heading) {
    const T = this.trans;
    const old = this.layers.shift();
    old.dispose();
    this.layerIndex = this.layers[0].index;
    this._applyLayerScales(0);
    this.player.land(T.landing, T.kind === 'fall' ? this._bestHeading(this.layers[0], T.landing) : heading);
    if (T.kind === 'funnel') {
      this.depthLevel++;
      this.player.molt(this.armorMax());
      this.hud.message(`<b>DEPTH +1</b> — damage & defence ×${this.dmgMult().toFixed(1)}. Metabolic Molting regrew your spine.`, 'gold');
    } else {
      this.hud.message(`Layer ${this.layerIndex} reached raw. The Brine Horde here outclasses you — find the funnel!`, 'bad');
    }
    this.horde.populate(this.layers[0], this.rng);
    this.rig.shake(1);
    this.state = 'playing';
    void dir;
  }

  // -------------------------------------------------------------------------
  _gameOver() {
    this.state = 'dead';
    this.deadT = 0;
    const score = this.horde.score + this.depthLevel * 500 + this.layerIndex * 250;
    this.finalScore = score;
    if (score > this.best) {
      this.best = score;
      try { localStorage.setItem('cluckipede.best', String(score)); } catch { /* ignore */ }
    }
  }

  _showGameOver() {
    const s = this.stats;
    this.hud.el.overStats.innerHTML = `
      <div><span>Final score</span><b>${this.finalScore}</b></div>
      <div><span>Deepest layer</span><b>L${this.layerIndex}</b></div>
      <div><span>Depth level</span><b>+${this.depthLevel}</b></div>
      <div><span>Pickles brined</span><b>${this.horde.kills}</b></div>
      <div><span>Caches cracked</span><b>${s.caches}</b></div>
      <div><span>Funnel descents / void falls</span><b>${s.descents} / ${s.falls}</b></div>`;
    this._updateBest();
    this.hud.show('over');
  }

  _updateBest() {
    this.hud.el.best.textContent = this.best ? `Best: ${this.best}` : '';
  }

  _funnelBearing() {
    const p = this.player;
    const f = this.layers[0]?.funnelDir;
    if (!f) return;
    const t = tangentToward(p.dir, f, _v);
    const fw = this.rig.forward;
    const right = rightOf(p.dir, fw, _w);
    this.funnelBearing = { angle: Math.atan2(t.dot(right), t.dot(fw)), dist: arcDist(p.dir, f, R) };
  }

  _updateLights() {
    const n = this.player.dir;
    const focus = this.rig.focus;
    const camRight = _v.crossVectors(this.rig.forward, n).normalize();
    this.key.position.copy(focus).addScaledVector(n, 120).addScaledVector(camRight, -60).addScaledVector(this.rig.forward, 35);
    this.key.target.position.copy(focus);
    this.fill.position.copy(focus).addScaledVector(n, 20).addScaledVector(camRight, 50).addScaledVector(this.rig.forward, -30);
    this.fill.target.position.copy(focus);
    this.sky.material.uniforms.camN.value.copy(this.camera.position).normalize();
  }

  render() {
    if (this.tick) {
      this.inkPass.uniforms.boil.value = (this.inkPass.uniforms.boil.value + 1) % 64;
      this.gradePass.uniforms.seed.value = Math.random() * 100;
    }
    this.bloom.enabled = this.bloomOn;
    this.composer.render();
  }
}

function moveAlong(d, h, dist) {
  // small helper for scouting headings
  const axis = new THREE.Vector3().crossVectors(d, h).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(axis, dist / R);
  d.applyQuaternion(q);
  h.applyQuaternion(q);
}

const game = new Game();
window.__game = game;
