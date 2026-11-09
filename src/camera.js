// Dynamic camera rig: 45° iso tilt by default, pitching to 85° top-down for
// tight coils or when the head nears a chasm edge.
import * as THREE from 'three';
import { CFG } from './config.js';
import { toTangent, damp, lerp, clamp, slerpDir } from './sphere.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pitch = CFG.CAM_PITCH_ISO;
    this.forward = new THREE.Vector3(0, 0, 1);
    this.dist = CFG.CAM_DIST;
    this.shakeAmt = 0;
    this.topDown = 0;
    this.focus = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  snap(dir, heading, r) {
    this.forward.copy(heading);
    this.focus.copy(dir).multiplyScalar(r);
    this.update(0, dir, heading, r, 0, 12, true);
  }

  shake(a) {
    this.shakeAmt = Math.min(2.5, this.shakeAmt + a);
  }

  /**
   * wantTop: 0..1 how strongly we want the top-down view.
   */
  update(dt, dir, heading, r, wantTop, segCount, snap = false) {
    const n = dir;
    // parallel transport the lagging forward vector, then ease toward heading
    toTangent(this.forward, n);
    const rate = lerp(1.6, 0.35, this.topDown);
    if (snap) this.forward.copy(heading);
    else slerpDir(this.forward, heading, damp(rate, dt), this.forward);
    toTangent(this.forward, n);

    this.topDown += (wantTop - this.topDown) * (snap ? 1 : damp(wantTop > this.topDown ? 3 : 1.2, dt));
    const pitch = lerp(CFG.CAM_PITCH_ISO, CFG.CAM_PITCH_TOP, this.topDown);
    this.pitch = pitch;
    const targetDist = CFG.CAM_DIST + clamp(segCount, 0, 30) * 0.7 + this.topDown * 8;
    this.dist += (targetDist - this.dist) * (snap ? 1 : damp(2, dt));

    const f = this.forward;
    const target = this._look.copy(n).multiplyScalar(r).addScaledVector(f, lerp(6, 0, this.topDown));
    this.focus.lerp(target, snap ? 1 : damp(14, dt));
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    const pos = this._pos.copy(this.focus).addScaledVector(n, sp * this.dist).addScaledVector(f, -cp * this.dist);
    if (this.shakeAmt > 0.01) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt;
      pos.y += (Math.random() - 0.5) * this.shakeAmt;
      pos.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.max(0, 1 - dt * 7);
    }
    this.camera.position.copy(pos);
    this._up.copy(n).multiplyScalar(cp).addScaledVector(f, sp).normalize();
    this.camera.up.copy(this._up);
    this.camera.lookAt(this.focus);
  }
}
