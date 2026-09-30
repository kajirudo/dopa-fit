// SPDX-License-Identifier: MIT
// Independent synthesis implementation; no recorded sound assets.
export const midiHz = midi => 440 * 2 ** ((midi - 69) / 12);
export class AudioManager {
  constructor() { this.ctx = null; this.voices = new Set(); this.volume = .55; this.muted = false; }
  unlock() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14; this.compressor.ratio.value = 6;
      this.master.connect(this.compressor); this.compressor.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.setVolume(this.volume);
    }
    return this.ctx.resume();
  }
  get nodeCount() { return this.ctx ? 2 + [...this.voices].reduce((n, voice) => n + voice.nodes.length, 0) : 0; }
  setVolume(value) { this.volume = Math.max(0, Math.min(1, value)); if (this.ctx && this.ctx.state !== 'closed') this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .65, this.ctx.currentTime, .02); }
  setMuted(value) { this.muted = value; this.setVolume(this.volume); }
  play(kind, when, note = 60, priority = false) {
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
      duration = kind === 'hit' ? .24 : kind === 'bass' ? .25 : .38; peak = kind === 'hit' ? .23 : kind === 'bass' ? .15 : .07;
      if (kind === 'hit') { const overtone = oscillator('sine', midiHz(note + 12)); overtone.connect(gain); peak = .13; }
    }
    gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(peak, t + .006); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    gain.connect(this.master);
    const voice = { nodes, sources }; this.voices.add(voice);
    let ended = 0;
    for (const source of sources) { source.onended = () => { if (++ended === sources.length) { nodes.forEach(n => n.disconnect()); this.voices.delete(voice); } }; source.start(t); source.stop(t + duration + .02); }
  }
  hit(id) { this.play('hit', this.ctx.currentTime, [72, 76, 79][id % 3], true); }
  stopVoices() { for (const voice of this.voices) { for (const source of voice.sources) { try { source.stop(); } catch {} } voice.nodes.forEach(n => n.disconnect()); } this.voices.clear(); }
  suspend() { this.stopVoices(); return this.ctx?.suspend().catch(() => {}); }
  async close() { this.stopVoices(); const ctx = this.ctx; this.ctx = null; if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => {}); }
}
