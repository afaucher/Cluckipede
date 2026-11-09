// Keyboard + mouse + touch input for Scheme C: Slither & Slingshot.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, active: false, down: false };
    this.touchCoil = false;
    this.pressed = new Set(); // edge-triggered keys for this frame
    this._lastMove = [0, 0];

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.mouse.active = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    canvas.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this._lastMove[0], dy = e.clientY - this._lastMove[1];
      if (dx * dx + dy * dy > 16) this.mouse.active = true;
      this._lastMove = [e.clientX, e.clientY];
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; this.pressed.add('Click'); });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onTouch = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) { this.mouse.active = false; return; }
      this.mouse.active = true;
      this.mouse.x = t.clientX;
      this.mouse.y = t.clientY;
      this.mouse.down = e.touches.length >= 2;
    };
    canvas.addEventListener('touchstart', (e) => { this.pressed.add('Click'); onTouch(e); }, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    canvas.addEventListener('touchend', onTouch, { passive: false });
  }

  get steer() {
    let s = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s -= 1;
    return s;
  }

  get coil() {
    return this.keys.has('Space') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.mouse.down || this.touchCoil;
  }

  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }
}
