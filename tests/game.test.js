import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPose, viewport } from '../src/coordinates.js';
import { CalibrationManager } from '../src/calibration.js';
import { TargetManager, EnergySystem, MovementTracker, WorkoutTracker, GameEngine, BAR_SECONDS } from '../src/game.js';
import { Store } from '../src/storage.js';
const calibration = { center: { x: 180, y: 200 }, shoulder: 90, rect: { x: 0, y: 0, width: 360, height: 600 } };
const pose = (x, y, id = 1, time = 0) => ({ id, capturedAt: time, rect: calibration.rect, points: { left_shoulder: { x: 135, y: 200, valid: true }, right_shoulder: { x: 225, y: 200, valid: true }, left_wrist: { x, y, valid: true }, right_wrist: { x: 180, y: 400, valid: true } } });
test('contain + one mirror maps the original video consistently', () => {
  assert.deepEqual(viewport(640, 480, 360, 640), { x: 0, y: 185, width: 360, height: 270 });
  const mapped = mapPose({ id: 1, width: 640, height: 480, capturedAt: 0, points: { left_wrist: { x: .25, y: .5, score: .9 } } }, 360, 640, 100);
  assert.deepEqual(mapped.points.left_wrist, { x: 270, y: 320, valid: true });
  assert.equal(mapPose({ width: 640, height: 480, capturedAt: 0, points: { wrist: { x: .25, y: .5, score: 1 } } }, 360, 640, 201).points.wrist.valid, false);
  assert.equal(viewport(0, 480, 360, 640), null);
});
test('entry hits once, holding and dropout never rearm', () => {
  const targets = new TargetManager(calibration), t = targets.targets[0];
  assert.equal(targets.process(pose(t.x, t.y), 0).length, 0);
  targets.process(pose(180, 400), 1);
  assert.equal(targets.process(pose(t.x, t.y), 2).length, 1);
  assert.equal(targets.process(pose(t.x, t.y), 1000).length, 0);
  const invalid = pose(t.x, t.y); invalid.points.left_wrist.valid = false; targets.process(invalid, 1001);
  assert.equal(targets.process(pose(t.x, t.y), 1002).length, 0);
  targets.process(pose(180, 400), 1100);
  assert.equal(targets.process(pose(t.x, t.y), 1200).length, 1);
});
test('cooldown and hysteresis prevent boundary chatter and simultaneous double hits', () => {
  const targets = new TargetManager(calibration), t = targets.targets[0];
  targets.process(pose(180, 400), 0); assert.equal(targets.process(pose(t.x, t.y), 1).length, 1);
  targets.process(pose(t.x + t.radius + 2, t.y), 400);
  assert.equal(targets.process(pose(t.x, t.y), 401).length, 0);
  targets.process(pose(180, 400), 500);
  const both = pose(t.x, t.y); both.points.right_wrist = { ...both.points.left_wrist };
  assert.equal(targets.process(both, 501).length, 1);
});
test('stale or duplicate pose frames do not add energy', () => {
  const game = new GameEngine(calibration, 1), t = game.targets.targets[0];
  game.process(pose(180, 400, 1, 0), 0);
  game.process(pose(t.x, t.y, 2, 50), 50); assert.equal(game.energy.energy, 5);
  game.process(pose(t.x, t.y, 2, 50), 100); assert.equal(game.energy.energy, 5);
  game.process(pose(180, 400, 3, 50), 400); assert.equal(game.energy.energy, 5);
});
test('tracking gaps inside targets do not count a new entry', () => {
  const game = new GameEngine(calibration, 1), t = game.targets.targets[0];
  game.process(pose(180, 400, 1, 0), 0);
  assert.equal(game.process(pose(t.x, t.y, 2, 300), 300).length, 0);
});
test('fever restarts from fresh cumulative energy without taking rewards away', () => {
  const energy = new EnergySystem(); for (let i = 0; i < 20; i++) energy.reward('hit');
  energy.tick(0, 0); assert.equal(energy.cycle, 'FEVER'); assert.equal(energy.layer, 5);
  for (let i = 0; i < 20; i++) energy.reward('hit');
  energy.tick(8 * BAR_SECONDS, 0); assert.equal(energy.cycle, 'REST'); assert.equal(energy.energy, 200);
  energy.tick(12 * BAR_SECONDS, 0); assert.equal(energy.cycle, 'FEVER'); assert.equal(energy.energy, 200);
  energy.tick(20 * BAR_SECONDS, 0); energy.tick(24 * BAR_SECONDS, 0); assert.equal(energy.cycle, 'BUILD'); assert.equal(energy.energy, 200);
});
test('movement has a dead zone, global rate limit, and no reward on reacquisition', () => {
  const tracker = new MovementTracker(); assert.equal(tracker.process(pose(100, 100), calibration, 0), false);
  assert.equal(tracker.process(pose(101, 101), calibration, 100), false);
  assert.equal(tracker.process(pose(140, 100), calibration, 200), true);
  assert.equal(tracker.process(pose(100, 100), calibration, 300), false);
  const invalid = pose(100, 100); invalid.points.left_wrist.valid = false; tracker.process(invalid, calibration, 400);
  assert.equal(tracker.process(pose(250, 100), calibration, 1000), false);
});
test('calibration requires stable shoulders and both wrists', () => {
  const manager = new CalibrationManager(); let result;
  for (let t = 0; t <= 800; t += 100) result = manager.update(pose(100, 300, t, t), t);
  assert.equal(result.ready, true); assert.equal(result.calibration.shoulder, 90);
  manager.reset(); const noHand = pose(100, 300); noHand.points.right_wrist.valid = false;
  for (let t = 0; t <= 800; t += 100) result = manager.update(noHand, t);
  assert.equal(result.ready, undefined);
  manager.reset();const nearEdge=pose(100,200);nearEdge.points.left_shoulder.y=0;nearEdge.points.right_shoulder.y=0;
  for(let t=0;t<=800;t+=100)result=manager.update(nearEdge,t);
  assert.equal(result.ready,undefined);assert.ok(result.message.includes('画面内'));
});
test('raised hands count once, require return, and do not count a dropout jump', () => {
  const tracker = new WorkoutTracker(), raised = pose(130, 140); raised.points.right_wrist = { x: 230, y: 140, valid: true };
  tracker.process(pose(130, 350), calibration, -1);
  assert.deepEqual(tracker.process(raised, calibration, 0), []);
  assert.deepEqual(tracker.process(raised, calibration, 160), ['raise']);
  assert.deepEqual(tracker.process(raised, calibration, 1000), []);
  tracker.process(pose(130, 350), calibration, 1001);
  tracker.process(raised, calibration, 1200); assert.deepEqual(tracker.process(raised, calibration, 1360), ['raise']);
  const missing = pose(130,140); missing.points.left_wrist.valid=false;
  tracker.process(missing,calibration,1600);
  tracker.process(raised,calibration,1700); assert.deepEqual(tracker.process(raised,calibration,1900),[]);
  tracker.process(pose(130,350),calibration,2000);tracker.process(raised,calibration,2100);assert.deepEqual(tracker.process(raised,calibration,2300),['raise']);
});
test('step and squat require neutral return and ignore reacquisition while held', () => {
  const tracker = new WorkoutTracker();
  const hips = (x,y) => { const p=pose(150,300);p.points.left_hip={x:x-30,y,valid:true};p.points.right_hip={x:x+30,y,valid:true};return p; };
  tracker.process(hips(180,350),calibration,0);
  tracker.process(hips(220,350),calibration,100);assert.deepEqual(tracker.process(hips(220,350),calibration,260),['step']);
  assert.deepEqual(tracker.process(hips(220,350),calibration,1000),[]);
  tracker.process(hips(180,350),calibration,1100);tracker.process(hips(180,390),calibration,1200);assert.deepEqual(tracker.process(hips(180,390),calibration,1360),['squat']);
  assert.deepEqual(tracker.process(hips(180,390),calibration,2000),[]);
  const invalid=hips(180,390);invalid.points.left_hip.valid=false;tracker.process(invalid,calibration,2100);
  tracker.process(hips(180,390),calibration,2200);assert.deepEqual(tracker.process(hips(180,390),calibration,2400),[]);
});
test('storage denial and corrupt history do not prevent playing', () => {
  const denied = new Store({ getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } });
  assert.deepEqual(denied.history(), []); assert.equal(denied.saveSession({}), false); assert.equal(denied.clearHistory(), false);
  const data = new Map(); const store = new Store({ getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) });
  store.write('history', {}); assert.deepEqual(store.history(), []);
  for (let i = 0; i < 40; i++) store.saveSession({ at: '2026-10-01', energy: i, seconds: 1 });
  assert.equal(store.history().length, 30); assert.equal(store.history()[0].energy, 39);
});
