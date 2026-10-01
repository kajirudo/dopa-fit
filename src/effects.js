// SPDX-License-Identifier: MIT
export class ParticleSystem {
  constructor() { this.parts = []; this.reduced = false; this.limit = 160; }
  burst(x, y, color = '#ffb192', { count = 18, power = 1, confetti = false } = {}) {
    count = this.reduced ? Math.min(4, count) : count;
    for (let i = 0; i < count && this.parts.length < this.limit; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (70 + Math.random() * 160) * power;
      this.parts.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (confetti ? 60 : 0), life: (confetti ? 1 : .5) + Math.random() * .4, color: confetti ? ['#85d9c0', '#ffb192', '#ffe486', '#d7aaff'][i % 4] : color, size: 2 + Math.random() * 4, confetti: confetti && !this.reduced, angle, spin: Math.random() * 6 - 3 });
    }
  }
  update(dt) { for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.confetti ? 80 : 160) * dt; p.angle += p.spin * dt; p.life -= dt; } this.parts = this.parts.filter(p => p.life > 0); }
  draw(ctx) { for (const p of this.parts) { ctx.globalAlpha = Math.min(1, p.life / .3); ctx.fillStyle = p.color; if (p.confetti) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2); ctx.restore(); } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } } ctx.globalAlpha = 1; }
}
