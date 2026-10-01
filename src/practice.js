// SPDX-License-Identifier: MIT
import { TargetManager,targetLayout } from './game.js';
import { clamp } from './coordinates.js';
// A short introduction only. The normal fitness destinations remain unchanged.
export class Practice {
  constructor(enabled=true) { this.done=!enabled;this.elapsed=0;this.touched=new Set();this.lane=0; }
  get active() { return !this.done; }
  get remaining() { return Math.max(0,Math.ceil(10-this.elapsed)); }
  attach(game,now) {
    if(!this.active)return;
    const manager=new TargetManager(game.calibration,false),{radius,span,bounds}=targetLayout(game.calibration),c=game.calibration.center;
    const r=Math.min(68,radius*1.18,(bounds.width-32)/4);
    const target=manager.targets[this.lane];Object.assign(target,{x:clamp(c.x+(this.lane?1:-1)*span*.9,bounds.x+r+8,bounds.x+bounds.width-r-8),y:clamp(c.y+span*.1,bounds.y+r+8,bounds.y+bounds.height-r-8),radius:r,bornAt:now,expiresAt:Infinity});
    manager.targets=[target];game.targets=manager;game.resetTracking();
  }
  hit(events) {
    if(!this.active)return false;
    if(events.some(e=>e.type==='hit'&&e.targetId===this.lane)) { this.touched.add(this.lane);if(this.lane===0)this.lane=1;else this.done=true;return true; }
    return false;
  }
  tick(dt) { if(this.active){this.elapsed+=Math.max(0,dt);if(this.elapsed>=10)this.done=true;} }
  skip() { this.done=true; }
  restore(game,reach) { game.targets=new TargetManager(game.calibration,game.phase>=2,reach);game.resetTracking(); }
}
