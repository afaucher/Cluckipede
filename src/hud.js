// DOM overlay: depth, spine health bar, slingshot charge, funnel compass, messages.
import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), depth: $('depth'), layer: $('layer'), score: $('score'), kills: $('kills'),
      spine: $('spine'), charge: $('charge'), chargeFill: $('charge-fill'), compass: $('compass'),
      compassArrow: $('compass-arrow'), compassDist: $('compass-dist'), msgs: $('msgs'), edge: $('edge'),
      adrift: $('adrift'), title: $('title'), over: $('gameover'), pause: $('pause'), overStats: $('over-stats'),
      best: $('best'), touchCoil: $('touch-coil'), fps: $('fps'),
    };
    this.spineSig = '';
    this.cache = {};
  }

  show(which) {
    for (const k of ['title', 'over', 'pause']) this.el[k].classList.toggle('hidden', k !== which);
    this.el.hud.classList.toggle('hidden', which === 'title');
  }

  _set(key, el, text) {
    if (this.cache[key] === text) return;
    this.cache[key] = text;
    el.textContent = text;
  }

  message(html, cls = '') {
    const now = performance.now();
    if (this._lastMsg === html && now - this._lastMsgT < 2000) return;
    this._lastMsg = html;
    this._lastMsgT = now;
    const d = document.createElement('div');
    d.className = `msg ${cls}`;
    d.innerHTML = html;
    this.el.msgs.prepend(d);
    setTimeout(() => d.classList.add('fade'), 3200);
    setTimeout(() => d.remove(), 4200);
    while (this.el.msgs.children.length > 5) this.el.msgs.lastChild.remove();
  }

  update(g) {
    const p = g.player;
    this._set('depth', this.el.depth, `+${g.depthLevel}  (×${(1 + 0.2 * g.depthLevel).toFixed(1)})`);
    this._set('layer', this.el.layer, `L${g.layerIndex}`);
    this._set('score', this.el.score, String(g.horde.score));
    this._set('kills', this.el.kills, String(g.horde.kills));

    // spine
    const sig = p.segs.map((s) => `${s.turret ? WEAPONS[s.turret.type].short : '_'}${Math.ceil((s.armor / s.maxArmor) * 4)}`).join('|') + `/${p.maxSegments}`;
    if (sig !== this.spineSig) {
      this.spineSig = sig;
      let html = '<div class="pip head" title="Head">🐓</div>';
      for (let i = 0; i < Math.max(p.maxSegments, p.segs.length); i++) {
        const s = p.segs[i];
        if (!s) { html += '<div class="pip empty"></div>'; continue; }
        const r = s.armor / s.maxArmor;
        const cls = r > 0.75 ? 'ok' : r > 0.35 ? 'hurt' : 'crit';
        const t = s.turret ? WEAPONS[s.turret.type].short : '';
        const side = s.turret ? (s.turret.side > 0 ? '▸' : s.turret.side < 0 ? '◂' : '✦') : '';
        html += `<div class="pip ${cls}" title="${s.turret ? WEAPONS[s.turret.type].name : 'Empty slot'}"><span>${t}</span><i>${side}</i></div>`;
      }
      this.el.spine.innerHTML = html;
    }

    // slingshot charge
    const c = p.mode === 'coil' ? p.charge / 1.4 : 0;
    this.el.charge.classList.toggle('active', p.mode === 'coil' || p.mode === 'burst');
    this.el.chargeFill.style.width = `${Math.round((p.mode === 'burst' ? Math.max(0, p.burstT / p.burstMax) : c) * 100)}%`;
    this.el.chargeFill.classList.toggle('burst', p.mode === 'burst');

    // compass toward the Chalaza Funnel
    if (g.funnelBearing) {
      const { angle, dist } = g.funnelBearing;
      this.el.compassArrow.style.transform = `rotate(${angle}rad)`;
      this._set('cdist', this.el.compassDist, `${Math.round(dist)}m`);
      this.el.compass.classList.toggle('near', dist < 40);
    }

    // edge warning vignette
    const e = p.edgeDist ?? 99;
    this.el.edge.style.opacity = g.state === 'playing' ? String(Math.max(0, Math.min(1, (6 - e) / 5))) : '0';

    // adrift tail
    const ch = p.chunks.filter((x) => !x.dead && x.segs.length);
    if (ch.length) {
      const n = ch.reduce((s, x) => s + x.segs.length, 0);
      const tmin = Math.min(...ch.map((x) => x.timer));
      this._set('adrift', this.el.adrift, `TAIL ADRIFT: ${n} seg${n > 1 ? 's' : ''} — loop back! ${tmin.toFixed(1)}s`);
      this.el.adrift.classList.remove('hidden');
    } else this.el.adrift.classList.add('hidden');
  }
}
