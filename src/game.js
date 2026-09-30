// SPDX-License-Identifier: MIT
import { clamp, distance } from './coordinates.js';
export const LAYERS = ['Kick', 'Hi-hat', 'Snare', 'Bass', 'Synth', 'Melody'];
export const THRESHOLDS = [0, 10, 25, 45, 70, 100];
export const BAR_SECONDS = 60 / 112 * 4;
export class TargetManager {
  constructor(calibration, top = false) {
    this.calibration = calibration;
    this.dynamic = top;
    this.targets = [];
    this.place(top);
  }
  place(top = false) {
    const { center: c, shoulder: s, rect } = this.calibration;
    const radius = clamp(.28 * s, 24, 44);
    this.targets = [-1, 1].map((side, index) => ({ id: index, x: c.x + side * .9 * s, y: c.y + .25 * s, radius, readyAt: 0, arms: {}, hitAt: -Infinity }));
    if (top && c.y - .8 * s - radius > rect.y + 8) this.targets.push({ id: 2, x: c.x, y: c.y - .8 * s, radius, readyAt: 0, arms: {}, hitAt: -Infinity });
    for (const target of this.targets) { target.home = {x:target.x,y:target.y}; target.visits = 0; }
  }
  resetArms() { for (const t of this.targets) t.arms = {}; }
  process(pose, now) {
    const hits = [];
    for (const target of this.targets) {
      if (target.relocateAt && now >= target.relocateAt) {
        const {rect,shoulder:s} = this.calibration, offsets = [[0,-.12],[0,.12],[.08,0],[0,0]], offset = offsets[target.visits++ % offsets.length];
        target.x = clamp(target.home.x + offset[0]*s, rect.x+target.radius+8, rect.x+rect.width-target.radius-8);
        target.y = clamp(target.home.y + offset[1]*s, rect.y+target.radius+8, rect.y+rect.height-target.radius-8);
        target.arms = {}; target.relocateAt = 0;
      }
      for (const name of ['left_wrist', 'right_wrist']) {
        const p = pose.points[name];
        if (!p?.valid) { target.arms[name] = false; continue; }
        const d = distance(p, target);
        if (d > target.radius + 8) target.arms[name] = true;
        if (d <= target.radius && target.arms[name]) {
          target.arms[name] = false;
          if (now < target.readyAt) continue;
          target.readyAt = now + 350;
          if (this.dynamic) target.relocateAt = target.readyAt;
          target.hitAt = now;
          target.arms = {};
          hits.push({ targetId: target.id, wristId: name, x: target.x, y: target.y, at: now });
          break;
        }
      }
    }
    return hits;
  }
}
export class EnergySystem {
  constructor() { this.energy = 0; this.hits = 0; this.moves = 0; this.flow = 0; this.heat = 0; this.cycle = 'BUILD'; this.lastFeverEnergy = 0; this.phaseAt = 0; }
  reward(kind) { this.energy += kind === 'hit' || kind === 'exercise' ? 5 : 1; if (kind === 'hit') this.hits++; else this.moves++; this.heat = Math.min(1, this.heat + .12); }
  get layer() { return THRESHOLDS.reduce((level, value, i) => this.energy >= value ? i : level, 0); }
  tick(seconds, dt, canStartFever = true) {
    this.heat = Math.max(0, this.heat - dt * .045);
    if (this.cycle === 'FEVER' && seconds - this.phaseAt >= 8 * BAR_SECONDS - 1e-6) { this.cycle = 'REST'; this.phaseAt = seconds; }
    else if (this.cycle === 'REST' && seconds - this.phaseAt >= 4 * BAR_SECONDS - 1e-6) this.cycle = 'BUILD';
    if (canStartFever && this.cycle === 'BUILD' && this.energy - this.lastFeverEnergy >= 100) { this.cycle = 'FEVER'; this.phaseAt = seconds; this.lastFeverEnergy = this.energy; }
  }
}
export class MovementTracker {
  constructor() { this.reset(); }
  reset() { this.anchors = {}; this.lastReward = -Infinity; this.lastMotion = -Infinity; }
  process(pose, calibration, now) {
    const l = pose.points.left_shoulder, r = pose.points.right_shoulder;
    if (!l?.valid || !r?.valid) { this.anchors = {}; return false; }
    const center = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    let moved = false;
    for (const name of ['left_wrist', 'right_wrist']) {
      const p = pose.points[name];
      if (!p?.valid) { delete this.anchors[name]; continue; }
      const relative = { x: p.x - center.x, y: p.y - center.y };
      if (this.anchors[name] && distance(relative, this.anchors[name]) >= .15 * calibration.shoulder) { this.anchors[name] = relative; moved = true; }
      this.anchors[name] ??= relative;
    }
    if (moved) this.lastMotion = now;
    if (moved && now - this.lastReward >= 500) { this.lastReward = now; return true; }
    return false;
  }
}
export class WorkoutTracker {
  constructor() { this.reset(); }
  reset() { this.active = {}; this.hipBase = null; this.cooldowns = {}; this.armed = {}; }
  process(pose, calibration, now) {
    const p = pose.points, s = calibration.shoulder;
    const shoulders = p.left_shoulder?.valid && p.right_shoulder?.valid;
    const hands = shoulders && p.left_wrist?.valid && p.right_wrist?.valid;
    const hips = shoulders && p.left_hip?.valid && p.right_hip?.valid;
    if (!hands) { delete this.active.raise; this.armed.raise = false; }
    if (!hips) { this.hipBase = null; delete this.active.step; delete this.active.squat; this.armed.step = false; this.armed.squat = false; }
    const events = [];
    const transition = (kind, enter, exit) => {
      if (exit) this.armed[kind] = true;
      if (!this.armed[kind]) return;
      const state = this.active[kind];
      if (!state && enter) this.active[kind] = { since: now, counted: false };
      if (state && exit) delete this.active[kind];
      const current = this.active[kind];
      if (current && !current.counted && now - current.since >= 150 && now >= (this.cooldowns[kind] || 0)) {
        current.counted = true; this.cooldowns[kind] = now + 600; events.push(kind);
      }
    };
    if (hands) {
      const shoulderY = (p.left_shoulder.y + p.right_shoulder.y) / 2;
      transition('raise', Math.max(p.left_wrist.y, p.right_wrist.y) < shoulderY - .4 * s, Math.min(p.left_wrist.y, p.right_wrist.y) > shoulderY - .1 * s);
    }
    if (hips) {
      const hip = { x: (p.left_hip.x + p.right_hip.x) / 2, y: (p.left_hip.y + p.right_hip.y) / 2 };
      this.hipBase ??= hip;
      transition('step', Math.abs(hip.x - this.hipBase.x) > .35 * s, Math.abs(hip.x - this.hipBase.x) < .15 * s);
      transition('squat', hip.y - this.hipBase.y > .3 * s, hip.y - this.hipBase.y < .12 * s);
    }
    return events;
  }
}
export class GameEngine {
  constructor(calibration, phase = 7) { this.phase = phase; this.calibration = calibration; this.targets = new TargetManager(calibration, phase >= 2); this.energy = new EnergySystem(); this.movement = new MovementTracker(); this.workout = new WorkoutTracker(); this.lastId = -1; this.lastPoseAt = -Infinity; }
  resetTracking() { this.targets.resetArms(); this.movement.reset(); this.workout.reset(); }
  process(pose, now) {
    if (pose.id <= this.lastId || now - pose.capturedAt > 200) return [];
    this.lastId = pose.id;
    if (pose.capturedAt - this.lastPoseAt > 200) this.resetTracking();
    this.lastPoseAt = pose.capturedAt;
    const hits = this.targets.process(pose, now);
    if (hits.length) this.lastHitAt = now;
    for (const hit of hits) this.energy.reward('hit');
    if (this.phase >= 2 && this.movement.process(pose, this.calibration, now)) this.energy.reward('move');
    const exercises = this.phase >= 4 ? this.workout.process(pose, this.calibration, now) : [];
    for (const kind of exercises) this.energy.reward('exercise');
    return [...hits.map(hit => ({ type: 'hit', ...hit })), ...exercises.map(kind => ({ type: 'exercise', kind, x: this.calibration.center.x, y: this.calibration.center.y, at: now }))];
  }
}
