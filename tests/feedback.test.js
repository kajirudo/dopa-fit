import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackDirector } from '../src/feedback.js';
import { EnergySystem, BAR_SECONDS } from '../src/game.js';
import { ParticleSystem } from '../src/effects.js';

test('unlocks and cumulative HIT milestones celebrate once, including after a rest', () => {
  const director = new FeedbackDirector(), state = new EnergySystem();
  assert.equal(director.update(state), null);
  for (let i = 0; i < 2; i++) state.reward('hit');
  assert.equal(director.update(state).kind, 'unlock'); assert.equal(director.update(state), null);
  for (let i = 0; i < 3; i++) state.reward('hit');
  assert.equal(director.update(state).kind, 'unlock'); // Snare takes priority over 5 HITS.
  assert.equal(director.update(state), null); assert.equal(director.nextRally, 10);
  for (let i = 0; i < 5; i++) { state.reward('hit'); director.update(state); }
  assert.equal(director.nextRally, 20); assert.equal(state.hits, 10);
  state.tick(100, 10); assert.equal(director.update(state), null); assert.equal(state.energy, 50);
});
test('anticipation, FEVER and calm resolve once without losing energy or replaying unlocks', () => {
  const director = new FeedbackDirector(), state = new EnergySystem();
  state.energy = 70; director.update(state);
  state.energy = 75; assert.equal(director.update(state).kind, 'near'); assert.equal(director.update(state), null);
  state.energy = 100; state.tick(0, 0);
  assert.equal(director.update(state).kind, 'fever'); assert.equal(director.update(state), null);
  state.tick(8 * BAR_SECONDS, 0); assert.equal(director.update(state).kind, 'rest');
  state.tick(12 * BAR_SECONDS, 0); assert.equal(director.update(state), null); assert.equal(state.energy, 100); assert.equal(state.layer, 5);
  state.energy = 175; assert.equal(director.update(state).kind, 'near');
  state.energy = 200; state.tick(13 * BAR_SECONDS, 0); assert.equal(director.update(state).kind, 'fever');
});
test('celebration particles honor normal, degraded and reduced-motion budgets and expire', () => {
  for (const limit of [80, 160, 240]) {
    const particles = new ParticleSystem(); particles.limit = limit;
    for (let i = 0; i < 20; i++) particles.burst(100, 100, '#fff', {count:80,confetti:true,power:1.4});
    assert.equal(particles.parts.length, limit); particles.update(2); assert.equal(particles.parts.length, 0);
  }
  const reduced = new ParticleSystem(); reduced.reduced = true; reduced.burst(100, 100, '#fff', {count:80,confetti:true});
  assert.equal(reduced.parts.length, 4); assert.ok(reduced.parts.every(p => !p.confetti));
});
