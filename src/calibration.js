// SPDX-License-Identifier: MIT
import { distance } from './coordinates.js';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export class CalibrationManager {
  reset() { this.samples = []; this.wrists = new Set(); this.result = null; }
  constructor() { this.reset(); }
  update(pose, now, bodyMode = 'upper') {
    const { left_shoulder: l, right_shoulder: r } = pose.points;
    for (const name of ['left_wrist', 'right_wrist']) if (pose.points[name]?.handValid ?? pose.points[name]?.valid) this.wrists.add(name);
    if (!l?.valid || !r?.valid) { this.samples = []; return { message: '肩と両手が映る位置に立ってね' }; }
    const shoulder = distance(l, r), center = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    const rect = pose.rect;
    if (!Number.isFinite(shoulder) || center.x < rect.x+rect.width*.15 || center.x > rect.x+rect.width*.85) {
      this.samples = []; return { message: '身体を画面の中央へ' };
    }
    if (shoulder < Math.max(24,rect.width*.1)) { this.samples = []; return { message: 'もう少し近づいてね' }; }
    if (center.y < rect.y+30 || center.y > rect.y+rect.height-60) { this.samples = []; return { message: '肩が画面内に入る高さへ調整してね' }; }
    if (bodyMode === 'full' && (!pose.points.left_hip?.valid || !pose.points.right_hip?.valid)) { this.samples=[]; return { message: '全身モード：腰まで映る位置へ\n近くで遊ぶなら「半身モード」へ' }; }
    this.samples.push({ now, x: center.x, y: center.y, shoulder });
    this.samples = this.samples.filter(s => now - s.now <= 1200);
    const first = this.samples[0];
    if (distance(center, first) > shoulder * .15 || Math.abs(shoulder - first.shoulder) > shoulder * .15) this.samples = [this.samples.at(-1)];
    if (this.samples.length >= 5 && now - this.samples[0].now >= 750 && this.wrists.size === 2) {
      this.result = { center: { x: median(this.samples.map(s => s.x)), y: median(this.samples.map(s => s.y)) }, shoulder: median(this.samples.map(s => s.shoulder)), rect, bodyMode };
      return { ready: true, calibration: this.result };
    }
    return { message: this.wrists.size < 2 ? '両手を一度、画面に見せてね' : 'その位置で、少しだけ待ってね' };
  }
}
