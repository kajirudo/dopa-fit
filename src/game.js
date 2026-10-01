// SPDX-License-Identifier: MIT
import { clamp, distance } from './coordinates.js';
import { HAND_GRACE_MS } from './hands.js';
export const LAYERS = ['Kick', 'Hi-hat', 'Snare', 'Bass', 'Synth', 'Melody'];
export const THRESHOLDS = [0, 10, 25, 45, 70, 100];
export const BAR_SECONDS = 60 / 112 * 4;
export const BEAT_MS = 60 / 112 * 1000;
export const targetRadius = shoulder => clamp(.32 * shoulder, 34, 60);
export function targetLayout(calibration) {
  const { shoulder, rect } = calibration;
  const radius = Math.min(targetRadius(shoulder), Math.max(20,Math.min(rect.width,rect.height)*.13));
  const span = Math.min(shoulder, Math.max(24,(rect.width-2*radius-32)/1.8), Math.max(24,(rect.height-2*radius-32)/2.4));
  return { radius, span };
}
// Four heights on each side. These are destinations, not eight simultaneous targets.
export function targetPositions(calibration, reach = 'wide') {
  const { center: c, rect } = calibration, { radius, span: s } = targetLayout(calibration);
  const scale = reach === 'small' ? .68 : 1, positions = [];
  for (const side of [-1, 1]) for (const [height, offset] of [-.75, -.1, .55, 1.15].entries()) {
    const point = { lane: side < 0 ? 0 : 1, height, radius,
      x: clamp(c.x + side * [.75, .9, .85, .65][height] * s * scale, rect.x + radius + 8, rect.x + rect.width - radius - 8),
      y: clamp(c.y + offset * s * scale, rect.y + radius + 8, rect.y + rect.height - radius - 8) };
    if (!positions.some(p => p.lane === point.lane && distance(p, point) < radius * 1.25)) positions.push(point);
  }
  return positions;
}
export function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}
export const hitIntensity = speed => 1 + clamp(((Number.isFinite(speed) ? speed : 0) - .8) / 5, 0, 1) * .35;
export class TargetManager {
  constructor(calibration, flow = false, reach = 'wide') {
    this.calibration = calibration;
    this.dynamic = flow;
    this.targets = [];
    this.previous = {};
    this.handReadyAt = {};
    this.positions = targetPositions(calibration, reach); this.leadId = 0; this.cycle = 'BUILD';
    this.place();
  }
  place() {
    const { center: c, rect } = this.calibration, { radius, span: s } = targetLayout(this.calibration);
    this.targets = [-1, 1].map((side, index) => ({ id: index, x: clamp(c.x + side * .9 * s,rect.x+radius+8,rect.x+rect.width-radius-8), y: clamp(c.y + .25 * s,rect.y+radius+8,rect.y+rect.height-radius-8), radius, readyAt: 0, arms: {}, hitAt: -Infinity }));
    if (this.dynamic) for (const target of this.targets) Object.assign(target, this.destination(target.id, 0));
    for (const target of this.targets) { target.visits = 0; target.bornAt = null; target.expiresAt = Infinity; }
  }
  resetArms() { for (const t of this.targets) t.arms = {}; this.previous = {}; }
  destination(lane, visit) {
    const patterns = this.cycle === 'REST' ? [[1, 2], [1, 2]] : this.cycle === 'FEVER' ? [[0, 2, 1, 3], [2, 0, 3, 1]] : [[1, 0, 2, 3], [1, 0, 2, 3]];
    const height = patterns[lane][visit % patterns[lane].length];
    const candidates = this.positions.filter(p => p.lane === lane);
    return candidates.find(p => p.height === height) || candidates.reduce((a, b) => Math.abs(b.height - height) < Math.abs(a.height - height) ? b : a);
  }
  get active() { return this.targets.filter(t => !t.waiting); }
  get preview() { return this.targets.filter(t => t.waiting).sort((a, b) => a.relocateAt - b.relocateAt)[0]?.next || null; }
  planNext(target, now) {
    target.waiting = true; target.arms = {};
    const earliest = now + 350;
    target.relocateAt = this.beatOrigin + Math.ceil((earliest - this.beatOrigin) / BEAT_MS) * BEAT_MS;
    target.next = { ...this.destination(target.id, ++target.visits), bornAt: now, arrivesAt: target.relocateAt };
    this.leadId = 1 - target.id;
  }
  advance(now, seconds, cycle = this.cycle) {
    this.cycle = cycle; this.beatOrigin ??= now;
    if (Number.isFinite(seconds)) this.beatOrigin = now - seconds * 1000;
    for (const target of this.targets) {
      if (target.bornAt === null) { target.bornAt = now; target.expiresAt = this.dynamic ? now + 8 * BEAT_MS : Infinity; }
      if (target.waiting && now >= target.relocateAt) {
        Object.assign(target, target.next); target.next = null; target.waiting = false;
        target.arms = {}; target.relocateAt = 0; target.bornAt = now; target.hitAt = -Infinity;
        target.expiresAt = now + (this.cycle === 'REST' ? 12 : 8) * BEAT_MS;
      }
      if (this.dynamic && !target.waiting && now >= target.expiresAt) this.planNext(target, now);
    }
  }
  process(pose, now) {
    this.advance(now);
    const hits = [], usedHands = new Set();
    for (const target of [...this.targets].sort((a,b) => Number(b.id===this.leadId)-Number(a.id===this.leadId))) {
      if (target.waiting) continue;
      for (const name of ['left_wrist', 'right_wrist']) {
        if (usedHands.has(name)) continue;
        const p = pose.hands?.[name] ?? (pose.hands ? null : pose.points[name]);
        // Held markers are display-only. Preserve a brief arm state, never score them.
        if (p?.held) { if(now-p.seenAt>HAND_GRACE_MS) { target.arms[name]=false;delete this.previous[name]; } continue; }
        if (!p?.valid) { target.arms[name] = false; delete this.previous[name]; continue; }
        const radius = target.radius + (p.radius || 0);
        const d = distance(p, target);
        const previous = this.previous[name], dt = previous ? now - previous.at : 0;
        const grace = pose.hands ? HAND_GRACE_MS : 200;
        if (dt > grace) target.arms[name] = false;
        const crossed = previous && dt > 0 && dt <= grace && previous.at >= target.bornAt && distance(previous, target) > radius && segmentDistance(target, previous, p) <= radius;
        if (d > radius + 8) target.arms[name] = true;
        if ((d <= radius || crossed) && target.arms[name]) {
          target.arms[name] = false;
          if (now < target.readyAt || now < (this.handReadyAt[name] || 0)) continue;
          target.readyAt = now + 350;
          this.handReadyAt[name] = now + 350;
          if (this.dynamic) this.planNext(target, now);
          target.hitAt = now;
          target.arms = {};
          const l = pose.points.left_shoulder, r = pose.points.right_shoulder;
          const relative = l?.valid && r?.valid ? { x: p.x - (l.x + r.x) / 2, y: p.y - (l.y + r.y) / 2 } : null;
          const speed = dt >= 16 && dt <= 200 && previous?.relative && relative ? distance(relative, previous.relative) / this.calibration.shoulder * 1000 / dt : 0;
          target.intensity = hitIntensity(speed);
          hits.push({ targetId: target.id, wristId: name, x: target.x, y: target.y, at: now, intensity: target.intensity });
          usedHands.add(name);
          break;
        }
      }
    }
    for (const name of ['left_wrist', 'right_wrist']) {
      const p = pose.hands?.[name] ?? (pose.hands ? null : pose.points[name]), l = pose.points.left_shoulder, r = pose.points.right_shoulder;
      if (p?.held && now-p.seenAt<=HAND_GRACE_MS) continue;
      if (p?.valid && !p.held) this.previous[name] = { x: p.x, y: p.y, at: now, relative: l?.valid && r?.valid ? { x: p.x - (l.x + r.x) / 2, y: p.y - (l.y + r.y) / 2 } : null };
      else delete this.previous[name];
    }
    return hits;
  }
}
export class EnergySystem {
  constructor() { this.energy = 0; this.hits = 0; this.moves = 0; this.flow = 0; this.heat = 0; this.cycle = 'BUILD'; this.lastFeverEnergy = 0; this.phaseAt = 0; this.feverLevel = 0; }
  get nextFeverLevel() { return Math.min(5,this.feverLevel+1); }
  reward(kind) { this.energy += kind === 'hit' || kind === 'exercise' ? 5 : 1; if (kind === 'hit') this.hits++; else this.moves++; this.heat = Math.min(1, this.heat + .12); }
  get layer() { return THRESHOLDS.reduce((level, value, i) => this.energy >= value ? i : level, 0); }
  tick(seconds, dt, canStartFever = true) {
    this.heat = Math.max(0, this.heat - dt * .045);
    if (this.cycle === 'FEVER' && seconds - this.phaseAt >= 8 * BAR_SECONDS - 1e-6) { this.cycle = 'REST'; this.phaseAt = seconds; }
    else if (this.cycle === 'REST' && seconds - this.phaseAt >= 4 * BAR_SECONDS - 1e-6) this.cycle = 'BUILD';
    if (canStartFever && this.cycle === 'BUILD' && this.energy - this.lastFeverEnergy >= 100) { this.cycle = 'FEVER'; this.phaseAt = seconds; this.lastFeverEnergy += 100; this.feverLevel = this.nextFeverLevel; }
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
    const hips = calibration.bodyMode !== 'upper' && shoulders && p.left_hip?.valid && p.right_hip?.valid;
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
  constructor(calibration, phase = 7, reach = 'wide') { this.phase = phase; this.calibration = calibration; this.targets = new TargetManager(calibration, phase >= 2, reach); this.energy = new EnergySystem(); this.movement = new MovementTracker(); this.workout = new WorkoutTracker(); this.lastId = -1; this.lastPoseAt = -Infinity; }
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
