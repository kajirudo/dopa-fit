// SPDX-License-Identifier: MIT
import { clamp, distance } from './coordinates.js';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export class CalibrationManager {
  reset() { this.samples = []; this.wrists = new Set(); this.result = null; }
  constructor() { this.reset(); }
  update(pose, now) {
    const { left_shoulder: l, right_shoulder: r } = pose.points;
    for (const name of ['left_wrist', 'right_wrist']) if (pose.points[name]?.valid) this.wrists.add(name);
    if (!l?.valid || !r?.valid) { this.samples = []; return { message: '肩と両手が映る位置に立ってね' }; }
    const shoulder = distance(l, r), center = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    const radius = clamp(.28 * shoulder, 24, 44), rect = pose.rect;
    if (shoulder > rect.width * .38 || center.x - .9 * shoulder - radius < rect.x + 4 || center.x + .9 * shoulder + radius > rect.x + rect.width - 4) {
      this.samples = []; return { message: '少し下がって、画面の中央へ' };
    }
    if (shoulder < rect.width * .18) { this.samples = []; return { message: 'もう少し近づいてね' }; }
    if (center.y + .25 * shoulder - radius < rect.y + 4) { this.samples = []; return { message: '肩と丸が画面内に入る位置へ調整してね' }; }
    if (center.y + .25 * shoulder + radius > rect.y + rect.height) { this.samples = []; return { message: 'カメラを少し下へ向けてね' }; }
    this.samples.push({ now, x: center.x, y: center.y, shoulder });
    this.samples = this.samples.filter(s => now - s.now <= 1200);
    const first = this.samples[0];
    if (distance(center, first) > shoulder * .15 || Math.abs(shoulder - first.shoulder) > shoulder * .15) this.samples = [this.samples.at(-1)];
    if (this.samples.length >= 5 && now - this.samples[0].now >= 750 && this.wrists.size === 2) {
      this.result = { center: { x: median(this.samples.map(s => s.x)), y: median(this.samples.map(s => s.y)) }, shoulder: median(this.samples.map(s => s.shoulder)), rect };
      return { ready: true, calibration: this.result };
    }
    return { message: this.wrists.size < 2 ? '両手を一度、画面に見せてね' : 'その位置で、少しだけ待ってね' };
  }
}
