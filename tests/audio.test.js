import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/audio.js';

// Model both unresolved Safari resume() and a running-but-stalled clock.
function fakeContext({ stalled = false, blocked = false } = {}) {
  const calls = [], nodes = [], startedAt = performance.now();
  const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => { const n = { connect() {}, disconnect() { this.disconnected = true; }, gain: param(), threshold: param(), ratio: param(), start() { calls.push('start'); }, stop() {}, onended: null }; nodes.push(n); return n; };
  return { calls, nodes, sampleRate: 8000, state: 'suspended', destination: {},
    get currentTime() { return stalled || this.state !== 'running' ? 0 : (performance.now() - startedAt) / 1000; },
    createGain: node, createDynamicsCompressor: node, createBufferSource: node,
    createBuffer(channels, size) { const data = new Float32Array(size); return { getChannelData() { return data; } }; },
    resume() { calls.push('resume'); if (!blocked) this.state = 'running'; return blocked ? new Promise(() => {}) : Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); }, suspend() { this.state = 'suspended'; return Promise.resolve(); }
  };
}

test('gesture starts a confirmation source synchronously and requests playback session', async () => {
  const ctx = fakeContext(), session = { type: 'auto' };
  const audio = new AudioManager({ createContext: () => ctx, getSession: () => session, timeoutMs: 100 });
  const promise = audio.unlock();
  assert.deepEqual(ctx.calls, ['resume', 'start']); assert.equal(session.type, 'playback'); assert.equal(audio.pending, true);
  assert.equal(await promise, true); assert.equal(audio.ready, true);
  const source = [...audio.voices][0].sources[0]; source.onended();
  assert.equal(audio.voices.size, 0); assert.equal(source.disconnected, true);
});

test('unresolved resume and stalled running clocks settle as recoverable without blocking startup', async () => {
  for (const options of [{ blocked: true }, { stalled: true }]) {
    const audio = new AudioManager({ createContext: () => fakeContext(options), timeoutMs: 40 });
    const start = performance.now(); assert.equal(await audio.unlock(), false);
    assert.equal(audio.pending, false); assert.equal(audio.ready, false); assert.ok(performance.now() - start < 300);
    await audio.close();
  }
});

test('explicit recovery replaces an interrupted context before yielding and cleans old voices', async () => {
  const old = fakeContext({ blocked: true }), fresh = fakeContext(); let count = 0;
  const audio = new AudioManager({ createContext: () => ++count === 1 ? old : fresh, getSession: () => { throw Error('Unavailable'); }, timeoutMs: 40 });
  await audio.unlock(); old.state = 'interrupted';
  const recovered = audio.unlock({ rebuild: true });
  assert.equal(old.state, 'closed'); assert.equal(audio.ctx, fresh); assert.deepEqual(fresh.calls, ['resume', 'start']);
  assert.equal(audio.voices.size, 1); assert.equal(await recovered, true);
  await audio.close(); assert.equal(audio.ctx, null); assert.equal(audio.voices.size, 0);
});
