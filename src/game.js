// SPDX-License-Identifier: MIT
import { clamp, distance } from './coordinates.js';
export const LAYERS = ['Kick', 'Hi-hat', 'Snare', 'Bass', 'Synth', 'Melody'];
export const THRESHOLDS = [0, 10, 25, 45, 70, 100];
export const BAR_SECONDS = 60 / 112 * 4;
export function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}
export const hitIntensity = speed => 1 + clamp(((Number.isFinite(speed) ? speed : 0) - .8) / 5, 0, 1) * .35;
export class TargetManager {
  constructor(calibration, top = false) {
    this.calibration = calibration;
    this.dynamic = top;
    this.targets = [];
    this.previous = {};
    this.place(top);
  }
  place(top = false) {
    const { center: c, shoulder: s, rect } = this.calibration;
    const radius = clamp(.28 * s, 24, 44);
    this.targets = [-1, 1].map((side, index) => ({ id: index, x: c.x + side * .9 * s, y: c.y + .25 * s, radius, readyAt: 0, arms: {}, hitAt: -Infinity }));
    if (top && c.y - .8 * s - radius > rect.y + 8) this.targets.push({ id: 2, x: c.x, y: c.y - .8 * s, radius, readyAt: 0, arms: {}, hitAt: -Infinity });
    for (const target of this.targets) { target.home = {x:target.x,y:target.y}; target.visits = 0; target.bornAt = null; target.expiresAt = Infinity; }
  }
  resetArms() { for (const t of this.targets) t.arms = {}; this.previous = {}; }
  advance(now) {
    for (const target of this.targets) {
      if (target.bornAt === null) { target.bornAt = now; target.expiresAt = this.dynamic ? now + 4600 + target.id * 220 : Infinity; }
      if ((target.relocateAt && now >= target.relocateAt) || now >= target.expiresAt) {
        const {rect,shoulder:s} = this.calibration, offsets = [[0,-.12],[0,.12],[.08,0],[0,0]], offset = offsets[target.visits++ % offsets.length];
        target.x = clamp(target.home.x + offset[0]*s, rect.x+target.radius+8, rect.x+rect.width-target.radius-8);
        target.y = clamp(target.home.y + offset[1]*s, rect.y+target.radius+8, rect.y+rect.height-target.radius-8);
        target.arms = {}; target.relocateAt = 0; target.bornAt = now; target.expiresAt = now + 4600 + target.id * 220;
      }
    }
  }
  process(pose, now) {
    this.advance(now);
    const hits = [];
    for (const target of this.targets) {
      for (const name of ['left_wrist', 'right_wrist']) {
        const p = pose.points[name];
        if (!p?.valid) { target.arms[name] = false; delete this.previous[name]; continue; }
        const d = distance(p, target);
        const previous = this.previous[name], dt = previous ? now - previous.at : 0;
        const crossed = previous && dt > 0 && dt <= 200 && previous.at >= target.bornAt && distance(previous, target) > target.radius && segmentDistance(target, previous, p) <= target.radius;
        if (d > target.radius + 8) target.arms[name] = true;
        if ((d <= target.radius || crossed) && target.arms[name]) {
          target.arms[name] = false;
          if (now < target.readyAt) continue;
          target.readyAt = now + 350;
          if (this.dynamic) target.relocateAt = target.readyAt;
          target.hitAt = now;
          target.arms = {};
          const l = pose.points.left_shoulder, r = pose.points.right_shoulder;
          const relative = l?.valid && r?.valid ? { x: p.x - (l.x + r.x) / 2, y: p.y - (l.y + r.y) / 2 } : null;
          const speed = dt >= 16 && dt <= 200 && previous?.relative && relative ? distance(relative, previous.relative) / this.calibration.shoulder * 1000 / dt : 0;
          target.intensity = hitIntensity(speed);
          hits.push({ targetId: target.id, wristId: name, x: target.x, y: target.y, at: now, intensity: target.intensity });
          break;
        }
      }
    }
    for (const name of ['left_wrist', 'right_wrist']) {
      const p = pose.points[name], l = pose.points.left_shoulder, r = pose.points.right_shoulder;
      if (p?.valid) this.previous[name] = { x: p.x, y: p.y, at: now, relative: l?.valid && r?.valid ? { x: p.x - (l.x + r.x) / 2, y: p.y - (l.y + r.y) / 2 } : null };
      else delete this.previous[name];
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
  reset() { this.anchors = {}; this.lastReward = -Infinity; this.lastMotion = -Infinity; this.event = null; }
  process(pose, calibration, now) {
    this.event = null;
    const l = pose.points.left_shoulder, r = pose.points.right_shoulder;
    if (!l?.valid || !r?.valid) { this.anchors = {}; return false; }
    const center = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    let moved = false;
    for (const name of ['left_wrist', 'right_wrist']) {
      const p = pose.points[name];
      if (!p?.valid) { delete this.anchors[name]; continue; }
      const relative = { x: p.x - center.x, y: p.y - center.y };
      if (this.anchors[name] && distance(relative, this.anchors[name]) >= .15 * calibration.shoulder) { this.anchors[name] = relative; moved = { type: 'move', wristId: name, x: p.x, y: p.y, at: now }; }
      this.anchors[name] ??= relative;
    }
    if (moved) this.lastMotion = now;
    if (moved && now - this.lastReward >= 500) { this.lastReward = now; this.event = moved; return true; }
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
    const moves = [];
    if (this.phase >= 2 && this.movement.process(pose, this.calibration, now)) { this.energy.reward('move'); moves.push(this.movement.event); }
    const exercises = this.phase >= 4 ? this.workout.process(pose, this.calibration, now) : [];
    for (const kind of exercises) this.energy.reward('exercise');
    if (hits.length || moves.length || exercises.length) this.lastFeedbackAt = now;
    return [...hits.map(hit => ({ type: 'hit', ...hit })), ...moves, ...exercises.map(kind => ({ type: 'exercise', kind, x: this.calibration.center.x, y: this.calibration.center.y, at: now }))];
  }
}
