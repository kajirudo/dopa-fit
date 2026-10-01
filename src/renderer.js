// SPDX-License-Identifier: MIT
import { ParticleSystem } from './effects.js';
import { impactAt } from './impact.js';
import { HAND_GRACE_MS } from './hands.js';
import { feverStage } from './fever.js';
import { targetLayout } from './game.js';
import { overlapsTarget } from './layout.js';
// An independent rounded tile, entirely inside its circular contact area.
function tilePath(ctx, x, y, radius) {
  const r = radius * .76, corner = r * .32;
  ctx.beginPath(); ctx.moveTo(x-r+corner,y-r); ctx.lineTo(x+r-corner,y-r); ctx.quadraticCurveTo(x+r,y-r,x+r,y-r+corner);
  ctx.lineTo(x+r,y+r-corner); ctx.quadraticCurveTo(x+r,y+r,x+r-corner,y+r); ctx.lineTo(x-r+corner,y+r); ctx.quadraticCurveTo(x-r,y+r,x-r,y+r-corner);
  ctx.lineTo(x-r,y-r+corner); ctx.quadraticCurveTo(x-r,y-r,x-r+corner,y-r); ctx.closePath();
}
export class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.particles = new ParticleSystem(); this.markers = {}; this.trails = {}; this.dpr = 1.5; this.characters = {}; for (const name of ['idle', 'cheer', 'fever']) { const img = new Image(); img.src = new URL(`../assets/characters/${name}.png`, import.meta.url).href; this.characters[name] = img; } }
  resize() { const rect = this.canvas.getBoundingClientRect(); this.width = rect.width; this.height = rect.height; const dpr = Math.min(devicePixelRatio || 1, this.dpr); this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.markers = {}; this.trails = {}; }
  reward(event) {
    this.rewards ??= [];
    const move = event.type === 'move', color = event.wristId === 'right_wrist' || event.targetId === 1 ? '#85d9c0' : '#ffb192';
    this.rewards = this.rewards.filter(reward => Math.hypot(event.x - reward.x, event.y - reward.y) > 64);
    this.rewards.push({ ...event, color, label: move ? 'MOVE +1' : event.type === 'hit' ? 'HIT +5' : 'NICE +5' });
    if (this.rewards.length > 8) this.rewards.shift();
    if (!move) this.particles.burst(event.x, event.y, this.inFever ? feverStage(this.feverLevel).color : color, { count: Math.round((this.phase >= 3 ? this.inFever ? 54+6*this.feverLevel : 48 : 18) * (event.intensity || 1)), power: (1.55+(this.inFever?this.feverLevel*.07:0)) * (event.intensity || 1), confetti: this.phase >= 3 && this.inFever, life: .2 });
  }
  celebrate(cue, now) {
    this.celebration = { ...cue, at: now };
    if (cue.kind === 'fever' || cue.kind === 'rally' || cue.kind === 'unlock') this.particles.burst(this.width / 2, this.height * .3, feverStage(cue.level).color, { count: cue.kind === 'fever' ? 72+8*(cue.level||1) : 36, power: 1.4, confetti: true });
  }
  draw(pose, game, now, dt, seconds = 0) {
    const ctx = this.ctx; ctx.clearRect(0, 0, this.width, this.height);
    const feedback = game?.energy, advanced = game?.phase >= 3, fever = feedback?.cycle === 'FEVER', reduced = this.particles.reduced;
    this.inFever = fever;
    const stage=feverStage(feedback?.feverLevel);this.feverLevel=stage.level;
    const beat = reduced ? 0 : Math.exp(-(seconds % (60 / 112)) / (60 / 112) * 6);
    this.particles.limit = Math.min(this.particleBudget || 240, game?.phase === 1 ? 80 : fever ? 160+16*stage.level : 160);
    if (advanced) {
      const cx = this.width / 2, cy = this.height * .48, radius = Math.max(this.width, this.height) * .75;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, fever ? `rgba(${stage.rgb},${.10+stage.level*.018+beat*.10})` : `rgba(133,217,192,${.06 + beat * .04})`); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
      if (fever && !reduced) {
        const rays = this.particleBudget === 80 ? 6 : 8+stage.level*2;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(seconds * (.08+stage.level*.025)); ctx.fillStyle = `rgba(${stage.rgb},${.025 + beat * .018})`;
        for (let i = 0; i < rays; i++) { ctx.rotate(Math.PI * 2 / rays); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, -.07, .07); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      // Beat bars sit along the floor, leaving the camera and targets readable.
      if (!reduced) for (let i = 0; i < 18; i++) {
        const height = (6 + 12 * beat) * (.45 + .55 * Math.sin(i * 1.7 + seconds * 2) ** 2) * (1 + (feedback?.layer || 0) * .15);
        ctx.fillStyle = fever ? stage.color : '#85d9c0'; ctx.globalAlpha = .18; ctx.fillRect(12 + i * (this.width * .65 / 18), this.height - height - 8, 4, height);
      }
      ctx.globalAlpha = 1;
    }
    if (game?.targets.dynamic) {
      const manager = game.targets, c = game.calibration.center, s = targetLayout(game.calibration).span;
      const origin = { x: c.x, y: c.y - .45 * s };
      const lead = manager.active.find(t => t.id === manager.leadId) || manager.active[0];
      const next = manager.active.find(t => t !== lead);
      if (lead && next && !reduced) {
        ctx.save(); ctx.setLineDash([3,9]); ctx.strokeStyle = '#c7f0df'; ctx.globalAlpha = .22; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(lead.x,lead.y); ctx.quadraticCurveTo(c.x,Math.min(lead.y,next.y)-s*.25,next.x,next.y); ctx.stroke(); ctx.restore();
      }
      const preview = manager.preview;
      if (preview) {
        const duration = Math.max(1,preview.arrivesAt-preview.bornAt), progress = Math.min(1,Math.max(0,(now-preview.bornAt)/duration));
        const travel = reduced ? 1 : 1-(1-progress)**2;
        const x = origin.x+(preview.x-origin.x)*travel, y = origin.y+(preview.y-origin.y)*travel;
        const color = preview.lane === 1 ? '#85d9c0' : '#ffb192';
        ctx.save(); ctx.globalAlpha = .28; ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.setLineDash([4,6]);
        ctx.beginPath();ctx.arc(preview.x,preview.y,preview.radius+6,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        ctx.globalAlpha = .35 + progress*.2; tilePath(ctx,x,y,preview.radius*(reduced? .8 : .3+progress*.55));ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#fff';ctx.stroke();
        ctx.globalAlpha=.8;ctx.fillStyle=color;ctx.textAlign='center';ctx.font='700 10px system-ui';ctx.fillText('NEXT',preview.x,preview.y-preview.radius-12);ctx.restore();
      }
    }
    if (game) for (const t of game.targets.targets) {
      const color = t.id === 1 ? '#85d9c0' : '#ffb192', impact = impactAt(now - t.hitAt, t.intensity || 1, reduced);
      if (t.waiting && !impact.alpha) continue;
      const arrival = reduced || !game.targets.dynamic ? 1 : Math.min(1, Math.max(0, (now - (t.bornAt ?? now)) / 900));
      const depth = .8 + .2 * (1 - (1 - arrival) ** 3), radius = t.radius * depth * impact.scale;
      const fade = reduced || !Number.isFinite(t.expiresAt) ? 1 : Math.min(1, Math.max(.2, (t.expiresAt - now) / 200));
      if (!reduced) {
        const glow = ctx.createRadialGradient(t.x,t.y,0,t.x,t.y,t.radius*2.4);
        glow.addColorStop(0, t.id === 1 ? '#85d9c080' : '#ffb19280'); glow.addColorStop(1,'#ffffff00');
        ctx.globalAlpha=fade*(.55+beat*.3);ctx.fillStyle=glow;ctx.fillRect(t.x-t.radius*2.4,t.y-t.radius*2.4,t.radius*4.8,t.radius*4.8);
      }
      // The faint outer circle marks the generous, constant hit area.
      ctx.globalAlpha = .25 * fade; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.x, t.y, t.radius + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = fade * (t.waiting ? impact.alpha : t.id === game.targets.leadId || !game.targets.dynamic ? 1 : .78);
      const disc = ctx.createRadialGradient(t.x - radius * .25, t.y - radius * .3, 0, t.x, t.y, radius);
      disc.addColorStop(0, t.id === 1 ? '#b8f4de' : '#ffd6be'); disc.addColorStop(.68, color); disc.addColorStop(1, t.id === 1 ? '#347d70' : '#b65e44');
      if (game.targets.dynamic) { ctx.fillStyle=t.id === 1 ? '#28584f' : '#763f32';tilePath(ctx,t.x+3,t.y-4,radius);ctx.fill();tilePath(ctx,t.x,t.y,radius); }
      else { ctx.beginPath(); ctx.arc(t.x, t.y, radius, 0, Math.PI * 2); }
      ctx.fillStyle = disc; ctx.fill(); ctx.strokeStyle = '#ffffffc9'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#173b32'; ctx.font = `800 ${Math.max(10, radius * .36)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(game.targets.dynamic && t.id === game.targets.leadId ? 'GO' : 'タッチ', t.x, t.y + 4);
      if (impact.flash) { ctx.globalAlpha = impact.flash; ctx.fillStyle = '#fff'; if(game.targets.dynamic)tilePath(ctx,t.x,t.y,radius+2);else{ctx.beginPath();ctx.arc(t.x,t.y,radius+2,0,Math.PI*2);}ctx.fill(); }
      if (!reduced && !t.waiting && game.targets.dynamic && t.id === game.targets.leadId) { ctx.globalAlpha=.3+beat*.25;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(t.x,t.y,t.radius+9+beat*3,0,Math.PI*2);ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (advanced && !reduced) for (const reward of this.rewards || []) {
      const impact = impactAt(now - reward.at, reward.intensity || 1);
      if (reward.type === 'move' || !impact.alpha) continue;
      ctx.strokeStyle = fever ? stage.color : reward.color; ctx.globalAlpha = impact.alpha * .9; ctx.lineWidth = 3 * impact.alpha + 1;
      for (let ring = 0; ring < (fever && stage.level>=4?4:3); ring++) { ctx.beginPath(); ctx.arc(reward.x, reward.y, 22 + impact.ring * (85 + ring * 28), 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4, start = 26 + impact.ring * 38, end = start + impact.alpha * 20; ctx.beginPath(); ctx.moveTo(reward.x + Math.cos(angle) * start, reward.y + Math.sin(angle) * start); ctx.lineTo(reward.x + Math.cos(angle) * end, reward.y + Math.sin(angle) * end); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const [name, color] of [['left_wrist', '#ffb192'], ['right_wrist', '#85d9c0']]) {
      const p = pose?.hands?.[name] ?? (pose?.hands ? null : pose?.points[name]);
      const age=now-(p?.seenAt ?? pose?.capturedAt ?? -Infinity);
      if (!p?.valid || age > (pose?.hands ? HAND_GRACE_MS : 200)) { delete this.markers[name]; delete this.trails[name]; continue; }
      const opacity=p.held || p.inferred || now-pose.capturedAt>200 ? Math.max(.15,1-age/HAND_GRACE_MS) : 1;
      const marker = this.markers[name] ??= { x: p.x, y: p.y }; const factor = 1 - Math.exp(-dt * 35);
      marker.x += (p.x - marker.x) * factor; marker.y += (p.y - marker.y) * factor;
      const trail = this.trails[name] ??= []; trail.push({ ...marker, at: now }); while (trail.length > 16 || trail[0]?.at < now - 240) trail.shift();
      if (!reduced && trail.length > 1) {
        ctx.lineCap = 'round'; ctx.strokeStyle = color;
        for (let i = 1; i < trail.length; i++) { ctx.globalAlpha = opacity * .8 * (i / trail.length) ** 2; ctx.lineWidth = 2 + i / trail.length * 10; ctx.beginPath(); ctx.moveTo(trail[i-1].x, trail[i-1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha=opacity*.2;ctx.fillStyle=color;ctx.beginPath();ctx.arc(marker.x,marker.y,p.radius||20,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=opacity*.7;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
      ctx.globalAlpha=opacity;ctx.fillStyle = color; ctx.beginPath(); ctx.arc(marker.x, marker.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();ctx.globalAlpha=1;
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
    const box=this.mascot;
    const announcing=this.celebration && now<this.celebration.at+this.celebration.duration;
    const covered=box && game && [...game.targets.active,...(game.targets.preview?[game.targets.preview]:[])].some(t=>overlapsTarget(box,t));
    this.mascotVisible=!!(box && game && game.phase>=3 && !announcing && !covered);
    if(this.mascotVisible) { const img=this.characters[fever?'fever':now-(game.lastFeedbackAt??-Infinity)<900?'cheer':'idle'];if(img.complete&&img.naturalWidth)ctx.drawImage(img,box.x,box.y,box.width,box.height); }
  }
}
