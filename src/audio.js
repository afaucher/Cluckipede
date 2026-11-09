// Tiny procedural WebAudio sound kit — no assets required.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  }

  _ok(key, minGap) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[key] && t - this.last[key] < minGap) return false;
    this.last[key] = t;
    return true;
  }

  _noise(dur, { freq = 1200, q = 1, gain = 0.3, type = 'bandpass', sweep = 0 } = {}) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _tone(f0, f1, dur, { type = 'square', gain = 0.15, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shoot(type) {
    if (type === 'minigun') { if (this._ok('mg', 0.05)) this._noise(0.05, { freq: 2500, q: 0.8, gain: 0.12 }); }
    else if (type === 'broadsider') { if (this._ok('br', 0.08)) { this._noise(0.18, { freq: 700, q: 0.7, gain: 0.3, sweep: 0.4 }); } }
    else if (type === 'flak') { if (this._ok('fk', 0.1)) this._noise(0.25, { freq: 400, q: 0.5, gain: 0.35, type: 'lowpass', sweep: 0.3 }); }
    else if (type === 'mortar') { if (this._ok('mo', 0.1)) this._tone(180, 60, 0.25, { type: 'sine', gain: 0.4 }); }
  }
  flame() { if (this._ok('fl', 0.12)) this._noise(0.14, { freq: 600, q: 0.4, gain: 0.08, type: 'lowpass' }); }
  explode() { if (this._ok('ex', 0.06)) { this._noise(0.6, { freq: 300, q: 0.6, gain: 0.5, type: 'lowpass', sweep: 0.2 }); } }
  hit() { if (this._ok('hit', 0.05)) this._tone(220, 90, 0.12, { type: 'sawtooth', gain: 0.18 }); }
  sever() { if (this._ok('sv', 0.05)) { this._noise(0.4, { freq: 900, q: 1.5, gain: 0.4, sweep: 0.2 }); this._tone(300, 60, 0.3, { type: 'sawtooth', gain: 0.2 }); } }
  splat() { if (this._ok('sp', 0.03)) this._noise(0.12, { freq: 900 + Math.random() * 600, q: 3, gain: 0.25, sweep: 0.3 }); }
  tink() { if (this._ok('tk', 0.06)) this._tone(2400, 1800, 0.06, { type: 'triangle', gain: 0.12 }); }
  bow() { if (this._ok('bw', 0.1)) this._tone(500, 200, 0.12, { type: 'triangle', gain: 0.1 }); }
  coil() { if (this._ok('co', 0.2)) this._tone(200, 600, 0.4, { type: 'triangle', gain: 0.08 }); }
  cluck() {
    if (!this._ok('cl', 0.3)) return;
    this._tone(700, 1200, 0.08, { type: 'square', gain: 0.18 });
    this._tone(900, 500, 0.18, { type: 'square', gain: 0.16, delay: 0.09 });
    this._noise(0.3, { freq: 1500, q: 0.6, gain: 0.15 });
  }
  reattach() { if (this._ok('ra', 0.2)) { this._tone(400, 800, 0.12, { type: 'triangle', gain: 0.18 }); this._tone(600, 1200, 0.12, { type: 'triangle', gain: 0.15, delay: 0.1 }); } }
  weld() { if (this._ok('wd', 0.2)) { this._noise(0.5, { freq: 3000, q: 4, gain: 0.2 }); this._tone(300, 900, 0.4, { type: 'square', gain: 0.1 }); } }
  descend() { if (this._ok('ds', 1)) { for (let i = 0; i < 5; i++) this._tone(300 + i * 120, 900 + i * 200, 0.5, { type: 'sine', gain: 0.12, delay: i * 0.12 }); } }
  fall() { if (this._ok('fa', 1)) this._tone(900, 60, 1.6, { type: 'sawtooth', gain: 0.15 }); }
  death() { if (this._ok('de', 1)) { this._tone(600, 40, 1.2, { type: 'sawtooth', gain: 0.25 }); this._noise(1.2, { freq: 500, gain: 0.5, type: 'lowpass', sweep: 0.1 }); } }
}
