// SPDX-License-Identifier: MIT
import { ParticleSystem } from './effects.js';
export class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.particles = new ParticleSystem(); this.markers = {}; this.trails = {}; this.dpr = 1.5; this.characters = {}; for (const name of ['idle', 'cheer', 'fever']) { const img = new Image(); img.src = new URL(`../assets/characters/${name}.png`, import.meta.url).href; this.characters[name] = img; } }
  resize() { const rect = this.canvas.getBoundingClientRect(); this.width = rect.width; this.height = rect.height; const dpr = Math.min(devicePixelRatio || 1, this.dpr); this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.markers = {}; this.trails = {}; }
  reward(event) {
    this.rewards ??= [];
    const move = event.type === 'move', color = event.wristId === 'right_wrist' || event.targetId === 1 ? '#85d9c0' : '#ffb192';
    this.rewards = this.rewards.filter(reward => Math.hypot(event.x - reward.x, event.y - reward.y) > 64);
    this.rewards.push({ ...event, color, label: move ? 'MOVE +1' : event.type === 'hit' ? 'HIT +5' : 'NICE +5' });
    if (this.rewards.length > 8) this.rewards.shift();
    if (!move) this.particles.burst(event.x, event.y, color, { count: this.phase >= 3 ? this.inFever ? 40 : 32 : 18, power: this.phase >= 3 ? 1.25 : 1, confetti: this.phase >= 3 && this.inFever });
  }
  celebrate(cue, now) {
    this.celebration = { ...cue, at: now };
    if (cue.kind === 'fever' || cue.kind === 'rally' || cue.kind === 'unlock') this.particles.burst(this.width / 2, this.height * .3, '#ffe486', { count: cue.kind === 'fever' ? 80 : 36, power: 1.4, confetti: true });
  }
  draw(pose, game, now, dt, seconds = 0) {
    const ctx = this.ctx; ctx.clearRect(0, 0, this.width, this.height);
    const feedback = game?.energy, advanced = game?.phase >= 3, fever = feedback?.cycle === 'FEVER', reduced = this.particles.reduced;
    this.inFever = fever;
    const beat = reduced ? 0 : Math.exp(-(seconds % (60 / 112)) / (60 / 112) * 6);
    this.particles.limit = Math.min(this.particleBudget || 240, game?.phase === 1 ? 80 : feedback?.cycle === 'FEVER' ? 240 : 160);
    if (advanced) {
      const cx = this.width / 2, cy = this.height * .48, radius = Math.max(this.width, this.height) * .75;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, fever ? `rgba(205,120,255,${.08 + beat * .07})` : `rgba(133,217,192,${.025 + beat * .025})`); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
      if (fever && !reduced) {
        const rays = this.particleBudget === 80 ? 6 : 12;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(seconds * .12); ctx.fillStyle = `rgba(255,228,134,${.025 + beat * .018})`;
        for (let i = 0; i < rays; i++) { ctx.rotate(Math.PI * 2 / rays); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, -.07, .07); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      // Beat bars sit along the floor, leaving the camera and targets readable.
      if (!reduced) for (let i = 0; i < 18; i++) {
        const height = (6 + 12 * beat) * (.45 + .55 * Math.sin(i * 1.7 + seconds * 2) ** 2) * (1 + (feedback?.layer || 0) * .15);
        ctx.fillStyle = fever ? '#ffe486' : '#85d9c0'; ctx.globalAlpha = .18; ctx.fillRect(12 + i * (this.width * .65 / 18), this.height - height - 8, 4, height);
      }
      ctx.globalAlpha = 1;
    }
    if (game) for (const t of game.targets.targets) {
      const color = t.id === 1 ? '#85d9c0' : '#ffb192', glow = Math.max(0, 1 - (now - t.hitAt) / 500);
      if (advanced) {
        ctx.strokeStyle = color; ctx.globalAlpha = .18 + beat * .15; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.x, t.y, t.radius + 7 + beat * 3, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(t.x, t.y, t.radius + glow * 12, 0, Math.PI * 2);
      ctx.fillStyle = t.id === 1 ? 'rgba(133,217,192,.17)' : 'rgba(255,177,146,.17)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 3 + glow * 3; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(['REACH', 'REACH', 'UP'][t.id], t.x, t.y + 4);
    }
    if (advanced && !reduced) for (const reward of this.rewards || []) {
      const age = (now - reward.at) / 650;
      if (reward.type === 'move' || age < 0 || age > 1) continue;
      ctx.strokeStyle = reward.color; ctx.globalAlpha = (1 - age) * .65; ctx.lineWidth = 3 * (1 - age) + 1;
      for (let ring = 0; ring < 2; ring++) { ctx.beginPath(); ctx.arc(reward.x, reward.y, 18 + age * (70 + ring * 35), 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4, start = 26 + age * 38, end = start + (1 - age) * 20; ctx.beginPath(); ctx.moveTo(reward.x + Math.cos(angle) * start, reward.y + Math.sin(angle) * start); ctx.lineTo(reward.x + Math.cos(angle) * end, reward.y + Math.sin(angle) * end); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const [name, color] of [['left_wrist', '#ffb192'], ['right_wrist', '#85d9c0']]) {
      const p = pose?.points[name];
      if (!p?.valid || now - pose.capturedAt > 200) { delete this.markers[name]; delete this.trails[name]; continue; }
      const marker = this.markers[name] ??= { x: p.x, y: p.y }; const factor = 1 - Math.exp(-dt * 35);
      marker.x += (p.x - marker.x) * factor; marker.y += (p.y - marker.y) * factor;
      const trail = this.trails[name] ??= []; trail.push({ ...marker }); if (trail.length > 8) trail.shift();
      if (!this.particles.reduced && trail.length > 1) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = .3; ctx.beginPath(); trail.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(marker.x, marker.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    this.particles.update(dt); this.particles.draw(ctx);
    this.rewards = (this.rewards || []).filter(reward => now - reward.at < 650);
    for (const reward of this.rewards) {
      const age = (now - reward.at) / 650, x = Math.max(48, Math.min(this.width - 48, reward.x)), y = Math.max(28, reward.y - 22 - (this.particles.reduced ? 0 : age * 24));
      ctx.globalAlpha = Math.min(1, (1 - age) * 3); ctx.fillStyle = reward.color; ctx.font = `800 ${advanced && reward.type !== 'move' ? 22 : 14}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(reward.label, x, y);
      if (reward.type === 'move' && !this.particles.reduced) { ctx.beginPath(); ctx.arc(reward.x, reward.y, 12 + age * 22, 0, Math.PI * 2); ctx.strokeStyle = reward.color; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    if (game && game.phase >= 3) { const img = this.characters[feedback?.cycle === 'FEVER' ? 'fever' : now - (game.lastFeedbackAt ?? -Infinity) < 900 ? 'cheer' : 'idle']; if (img.complete && img.naturalWidth) { const size = Math.min(88, this.width * .18); ctx.drawImage(img, this.width - size - 8, this.height - size - 8, size, size); } }
  }
}
