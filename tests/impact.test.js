import test from 'node:test';
import assert from 'node:assert/strict';
import { impactAt } from '../src/impact.js';
import { TargetManager, GameEngine, hitIntensity } from '../src/game.js';
const calibration = { center: { x: 180, y: 200 }, shoulder: 90, rect: { x: 0, y: 0, width: 360, height: 600 } };
const pose = (x, y, id, time) => ({ id, capturedAt: time, points: { left_shoulder: { x: 135, y: 200, valid: true }, right_shoulder: { x: 225, y: 200, valid: true }, left_wrist: { x, y, valid: true }, right_wrist: { x: 180, y: 400, valid: true } } });
test('impact returns immediate light, a short contraction and rings, then settles at 280ms', () => {
  assert.ok(impactAt(0).flash > .8);
  assert.ok(Math.abs(impactAt(75).scale - .58) < .001);
  assert.equal(impactAt(80).flash, 0);
  assert.ok(impactAt(180).ring > .9);
  assert.deepEqual(impactAt(280), { scale: 1, flash: 0, ring: 0, alpha: 0 });
  assert.equal(impactAt(75, 1.35, true).scale, 1);
  assert.equal(impactAt(0, 1.35, true).flash, 0);
  assert.equal(hitIntensity(0), 1); assert.equal(hitIntensity(100), 1.35);
});
test('slow touch and a fast sweep each earn five ENERGY without requiring speed', () => {
  const slow = new GameEngine(calibration, 1), t = slow.targets.targets[0];
  slow.process(pose(t.x + t.radius + 9, t.y, 1, 0), 0);
  let event;
  for (let i = 1; i <= 12; i++) event = slow.process(pose(t.x + t.radius + 9 - i, t.y, i + 1, i * 50), i * 50)[0] || event;
  assert.equal(slow.energy.energy, 5); assert.equal(event.intensity, 1);
  const fast = new GameEngine(calibration, 1), f = fast.targets.targets[0];
  fast.process(pose(f.x - f.radius - 16, f.y, 1, 0), 0);
  const events = fast.process(pose(f.x + f.radius + 16, f.y, 2, 50), 50);
  assert.equal(events.length, 1); assert.equal(fast.energy.energy, 5);
  assert.ok(events[0].intensity > 1 && events[0].intensity <= 1.35);
  assert.equal(fast.process(pose(f.x + f.radius + 16, f.y, 3, 100), 100).length, 0);
});
test('a tracking gap cannot become a swept HIT', () => {
  const game = new GameEngine(calibration, 1), t = game.targets.targets[0];
  game.process(pose(t.x - t.radius - 16, t.y, 1, 0), 0);
  assert.deepEqual(game.process(pose(t.x + t.radius + 16, t.y, 2, 250), 250), []);
  assert.equal(game.energy.energy, 0);
});
test('targets cycle quietly without a pose and never hit a hand already overlapping the new target', () => {
  const targets = new TargetManager(calibration, true), t = targets.targets[0];
  targets.advance(0); const radius = t.radius;
  targets.advance(4601); assert.equal(t.waiting, true); assert.equal(t.radius, radius);
  const arrival = t.relocateAt; targets.advance(arrival);
  assert.equal(t.bornAt, arrival);
  assert.equal(targets.process(pose(t.x, t.y, 1, arrival + 1), arrival + 1).length, 0);
  assert.equal(targets.process(pose(t.x, t.y, 2, arrival + 50), arrival + 50).length, 0);
});
test('body translation does not increase impact intensity', () => {
  const targets = new TargetManager(calibration), t = targets.targets[0];
  const start = pose(t.x - t.radius - 16, t.y, 1, 0); targets.process(start, 0);
  const end = pose(t.x, t.y, 2, 50);
  end.points.left_shoulder.x += t.radius + 16; end.points.right_shoulder.x += t.radius + 16;
  assert.equal(targets.process(end, 50)[0].intensity, 1);
});
