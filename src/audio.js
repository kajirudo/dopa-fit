// SPDX-License-Identifier: MIT
// Independent synthesis implementation; no recorded sound assets.
export const midiHz = midi => 440 * 2 ** ((midi - 69) / 12);
export class AudioManager {
  constructor({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)({ latencyHint: 'interactive' }), getSession = () => globalThis.navigator?.audioSession, timeoutMs = 1200 } = {}) {
    this.ctx = null; this.voices = new Set(); this.volume = .55; this.muted = false;
    this.createContext = createContext; this.getSession = getSession; this.timeoutMs = timeoutMs; this.ready = false; this.pending = false; this.onStatus = () => {}; this.moveStep = 0;
  }
  // Invoke directly from a click: resume AND source.start must precede any await.
  unlock({ rebuild = false } = {}) {
    try { const session = this.getSession(); if (session) session.type = 'playback'; } catch { /* Optional API; Web Audio still works without it. */ }
    if (rebuild && this.ctx) {
      const old = this.ctx; old.onstatechange = null; this.stopVoices(); this.master.disconnect(); this.compressor.disconnect();
      this.ctx = null; old.close().catch(() => {});
    }
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = this.createContext();
      this.master = this.ctx.createGain(); this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14; this.compressor.ratio.value = 6;
      this.master.connect(this.compressor); this.compressor.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.setVolume(this.volume);
      const context = this.ctx;
      context.onstatechange = () => { if (this.ctx !== context) return; if (context.state !== 'running') this.ready = false; this.onStatus(); };
    }
    const ctx = this.ctx;
    this.ready = false; this.pending = true;
    // Safari can leave resume() unresolved after an interruption. Never gate
    // camera startup indefinitely on that promise; check its clock instead.
    try { ctx.resume().catch(() => {}); } catch { /* Show the explicit retry control. */ }
    this.confirmation(); this.onStatus();
    const initialTime = ctx.currentTime, started = performance.now();
    return new Promise(resolve => {
      const check = () => {
        const ready = this.ctx === ctx && ctx.state === 'running' && ctx.currentTime > initialTime + .001;
        if (ready || this.ctx !== ctx || ctx.state === 'closed' || performance.now() - started >= this.timeoutMs) {
          if (this.ctx === ctx) { this.ready = ready; this.pending = false; this.onStatus(); }
          resolve(ready);
        } else setTimeout(check, 25);
      };
      check();
    });
  }
  confirmation() {
    const ctx = this.ctx, duration = .18, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) { const t = i / ctx.sampleRate, envelope = Math.min(1, t / .008) * (1 - t / duration) ** 2; data[i] = .12 * envelope * (Math.sin(2 * Math.PI * midiHz(72) * t) + .4 * Math.sin(2 * Math.PI * midiHz(76) * t)); }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this.master);
    const voice = { nodes: [source], sources: [source] }; this.voices.add(voice);
    source.onended = () => { source.disconnect(); this.voices.delete(voice); }; source.start(); source.stop(ctx.currentTime + duration + .02);
  }
  get nodeCount() { return this.ctx ? 2 + [...this.voices].reduce((n, voice) => n + voice.nodes.length, 0) : 0; }
  setVolume(value) { this.volume = Math.max(0, Math.min(1, value)); if (this.ctx && this.ctx.state !== 'closed') this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .65, this.ctx.currentTime, .02); }
  setMuted(value) { this.muted = value; this.setVolume(this.volume); }
  play(kind, when, note = 60, priority = false, intensity = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.voices.size >= (priority ? 24 : 20) || this.nodeCount > 152) return;
    const t = Math.max(ctx.currentTime, when), gain = ctx.createGain();
    const nodes = [gain], sources = [];
    let duration = .22, peak = .11;
    const oscillator = (type, frequency) => { const source = ctx.createOscillator(); source.type = type; source.frequency.setValueAtTime(frequency, t); nodes.push(source); sources.push(source); return source; };
    if (kind === 'kick') {
      const source = oscillator('sine', 145); source.frequency.exponentialRampToValueAtTime(43, t + .14); source.connect(gain); duration = .3; peak = .45;
    } else if (kind === 'hat' || kind === 'snare') {
      const source = ctx.createBufferSource(); source.buffer = this.noise;
      const filter = ctx.createBiquadFilter(); filter.type = kind === 'hat' ? 'highpass' : 'bandpass'; filter.frequency.value = kind === 'hat' ? 7000 : 1800;
      source.connect(filter); filter.connect(gain); nodes.push(source, filter); sources.push(source); duration = kind === 'hat' ? .055 : .15; peak = kind === 'hat' ? .065 : .17;
    } else {
      const source = oscillator(kind === 'bass' ? 'triangle' : 'sine', midiHz(note)); source.connect(gain);
      duration = kind === 'move' ? .16 : kind === 'hit' ? .24 : kind === 'bass' ? .25 : .38; peak = kind === 'move' ? .065 : kind === 'hit' ? .23 : kind === 'bass' ? .15 : .07;
      if (kind === 'hit') {
        // A fast attack, a downward pitch flick and a consonant overtone.
        source.frequency.exponentialRampToValueAtTime(midiHz(note) * .98, t + .09);
        const overtone = oscillator('sine', midiHz(note + 12)); overtone.connect(gain); peak = .13 * Math.max(1, Math.min(1.35, intensity)); duration = .19;
      }
    }
    gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(peak, t + .006); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    gain.connect(this.master);
    const voice = { nodes, sources }; this.voices.add(voice);
    let ended = 0;
    for (const source of sources) { source.onended = () => { if (++ended === sources.length) { nodes.forEach(n => n.disconnect()); this.voices.delete(voice); } }; source.start(t); source.stop(t + duration + .02); }
  }
  hit(id, fever = false, intensity = 1) { if (this.ctx) this.play('hit', this.ctx.currentTime, [72, 76, 79][id % 3] + (fever ? 12 : 0), true, intensity); }
  move() { if (this.ctx) this.play('move', this.ctx.currentTime, [72, 74, 76, 79, 81, 79, 76, 74][this.moveStep++ % 8], true); }
  celebrate(kind) {
    if (!this.ctx || !['unlock', 'rally', 'fever'].includes(kind)) return;
    const notes = kind === 'fever' ? [72, 76, 79, 84] : kind === 'unlock' ? [76, 79, 84] : [79, 81];
    notes.forEach((note, i) => this.play('melody', this.ctx.currentTime + i * .085, note, true));
  }
  stopVoices() { for (const voice of this.voices) { for (const source of voice.sources) { try { source.stop(); } catch {} } voice.nodes.forEach(n => n.disconnect()); } this.voices.clear(); }
  suspend() { this.ready = false; this.stopVoices(); return this.ctx?.suspend().catch(() => {}); }
  async close() { this.ready = false; this.pending = false; this.stopVoices(); const ctx = this.ctx; this.ctx = null; if (ctx) ctx.onstatechange = null; if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => {}); }
}
