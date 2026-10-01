// SPDX-License-Identifier: MIT
import { clamp, distance } from './coordinates.js';
export const HAND_GRACE_MS = 320;
export class HandTracker {
  constructor() { this.reset(); }
  reset() { this.previous = {}; }
  update(pose, now, shoulder) {
    const s = Math.max(40,shoulder), radius=clamp(.18*s,20,40), hands={};
    const fresh=now-pose.capturedAt<=200 && now>=pose.capturedAt;
    for(const side of ['left','right']) {
      const name=side+'_wrist', wrist=pose.points[name], elbow=pose.points[side+'_elbow'];
      const last=this.previous[name];
      if(fresh && (wrist?.handValid ?? wrist?.valid)) {
        let x=wrist.x,y=wrist.y;
        if(elbow?.valid) { const length=distance(wrist,elbow), extension=Math.min(length*.28,s*.22);if(length>1){x+=(wrist.x-elbow.x)/length*extension;y+=(wrist.y-elbow.y)/length*extension;} }
        hands[name]={x,y,radius,valid:true,held:false,inferred:false,seenAt:now};
        this.previous[name]={...hands[name],elbow:elbow?.valid?{x:elbow.x,y:elbow.y}:null};
      } else if(last && now-last.seenAt<=HAND_GRACE_MS) {
        const age=now-last.seenAt, delta=fresh && elbow?.valid && last.elbow ? distance(elbow,last.elbow) : Infinity;
        const inferred=age<=220 && delta<=s*.35;
        hands[name]={...last, x:last.x+(inferred?elbow.x-last.elbow.x:0), y:last.y+(inferred?elbow.y-last.elbow.y:0), valid:true, held:!inferred, inferred};
      } else delete this.previous[name];
    }
    return {...pose,hands};
  }
}
