// SPDX-License-Identifier: MIT
export class ParticleSystem {
  constructor() { this.parts = []; this.reduced = false; this.limit = 160; }
  burst(x, y, color = '#ffb192') {
    const count = this.reduced ? 4 : 18;
    for (let i = 0; i < count && this.parts.length < this.limit; i++) { const angle = Math.random() * Math.PI * 2, speed = 70 + Math.random() * 160; this.parts.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .5 + Math.random() * .4, max: .9, color, size: 2 + Math.random() * 4 }); }
  }
  update(dt) { for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.life -= dt; } this.parts = this.parts.filter(p => p.life > 0); }
  draw(ctx) { for (const p of this.parts) { ctx.globalAlpha = Math.min(1, p.life / .3); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
}
