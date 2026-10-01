// SPDX-License-Identifier: MIT
export class MusicEngine {
  constructor(audio, getState) { this.audio = audio; this.getState = getState; this.step = 0; this.timer = null; this.layer = 0; this.cycle = 'BUILD'; this.seconds = 0; }
  start(seconds = 0) { this.stop(); this.seconds = seconds; this.step = Math.floor(seconds / (60 / 112 / 4)); this.nextTime = this.audio.ctx.currentTime + .06; this.origin = this.nextTime - this.step * (60 / 112 / 4); this.tick(); this.timer = setInterval(() => this.tick(), 25); }
  get clockSeconds() { const ctx=this.audio.ctx; return this.timer!==null && this.audio.ready && ctx?.state==='running' && Number.isFinite(this.origin) ? Math.max(0,ctx.currentTime-this.origin) : null; }
  stop() { clearInterval(this.timer); this.timer = null; }
  tick() {
    const ctx = this.audio.ctx; if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - .1) { this.step = Math.ceil(this.step / 16) * 16; this.nextTime = ctx.currentTime + .04; this.origin=this.nextTime-this.step*(60/112/4); }
    while (this.nextTime < ctx.currentTime + .12) {
      if (this.step % 16 === 0) { const state = this.getState(); this.layer = state.layer; this.cycle = state.cycle; }
      this.schedule(this.step, this.nextTime); this.nextTime += 60 / 112 / 4; this.step++;
    }
  }
  schedule(step, t) {
    const s = step % 16, bar = Math.floor(step / 16), a = this.audio, rest = this.cycle === 'REST', fever = this.cycle === 'FEVER';
    if (s % 4 === 0) a.play('kick', t);
    if (this.layer >= 1 && s % (rest ? 4 : 2) === 0) a.play('hat', t);
    if (this.layer >= 2 && (s === 4 || s === 12)) { a.play('snare', t); if (fever) a.play('snare', t + .025); }
    if (this.layer >= 3 && s % (fever ? 2 : 4) === 0) a.play('bass', t, [36, 45, 40, 43][bar % 4]);
    if (!rest && this.layer >= 4 && s % 4 === 2) a.play('synth', t, [60, 64, 67, 69][(bar + s / 2) % 4] + (fever ? 12 : 0));
    if (!rest && this.layer >= 5 && s % (fever ? 1 : 4) === 0) a.play('melody', t, [72, 76, 79, 81, 79, 76, 74, 72][(fever ? step : step / 2) % 8]);
  }
}
