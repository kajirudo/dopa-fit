// SPDX-License-Identifier: MIT
import { distance } from './coordinates.js';
import { t } from './i18n.js';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export class CalibrationManager {
  reset() { this.samples = []; this.wrists = new Set(); this.result = null; }
  constructor() { this.reset(); }
  update(pose, now, bodyMode = 'upper') {
    const { left_shoulder: l, right_shoulder: r } = pose.points;
    for (const name of ['left_wrist', 'right_wrist']) if (pose.points[name]?.handValid ?? pose.points[name]?.valid) this.wrists.add(name);
    const checks={shoulders:!!(l?.valid&&r?.valid),hands:this.wrists.size===2,hips:bodyMode!=='full'||!!(pose.points.left_hip?.valid&&pose.points.right_hip?.valid)};
    const report=(reason,progress=0)=>({reason,message:t(reason,{},'ja'),checks,progress});
    if (!checks.shoulders) { this.samples = []; return report('calShoulders'); }
    const shoulder = distance(l, r), center = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    const rect = pose.rect;
    if (!Number.isFinite(shoulder) || center.x < rect.x+rect.width*.15 || center.x > rect.x+rect.width*.85) {
      this.samples = []; return report('calCenter');
    }
    if (shoulder < Math.max(24,rect.width*.1)) { this.samples = []; return report('calCloser'); }
    if (center.y < rect.y+30 || center.y > rect.y+rect.height-60) { this.samples = []; return report('calHeight'); }
    if (!checks.hips) { this.samples=[]; return report('calHips'); }
    this.samples.push({ now, x: center.x, y: center.y, shoulder });
    this.samples = this.samples.filter(s => now - s.now <= 1200);
    const first = this.samples[0];
    if (distance(center, first) > shoulder * .15 || Math.abs(shoulder - first.shoulder) > shoulder * .15) this.samples = [this.samples.at(-1)];
    if (this.samples.length >= 5 && now - this.samples[0].now >= 750 && this.wrists.size === 2) {
      this.result = { center: { x: median(this.samples.map(s => s.x)), y: median(this.samples.map(s => s.y)) }, shoulder: median(this.samples.map(s => s.shoulder)), rect, bodyMode };
      return { ...report('calReady',1), ready: true, calibration: this.result };
    }
    return report(this.wrists.size<2?'calHands':'calHold',checks.hands?Math.min(1,(now-this.samples[0].now)/750,this.samples.length/5):0);
  }
}
