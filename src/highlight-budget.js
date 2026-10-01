// SPDX-License-Identifier: MIT
import { BUDGETS, RECORD_CONFIG } from './record-config.js';
import { candidateValue, similarity } from './highlight-planner.js';
const profiles=Object.keys(BUDGETS);
export class BudgetController {
  constructor({validatedMax='LOW'}={}) {this.profile='LOW';this.validatedMax=profiles.includes(validatedMax)?validatedMax:'LOW';this.badSince=null;this.goodSince=null;}
  get bytes(){return BUDGETS[this.profile];}
  observe({fps,poseP95,faceP95,encodeWait,dropped},now) {
    const bad=fps<24 || poseP95>150 || faceP95>200 || encodeWait>1000 || dropped>.1;
    if(bad){this.goodSince=null;this.badSince??=now;if(now-this.badSince>=10000){this.profile=profiles[Math.max(0,profiles.indexOf(this.profile)-1)];this.badSince=now;}}
    else {this.badSince=null;this.goodSince??=now;if(now-this.goodSince>=60000){this.profile=profiles[Math.min(profiles.indexOf(this.validatedMax),profiles.indexOf(this.profile)+1)];this.goodSince=now;}}
    return this.profile;
  }
}
export class HighlightPool {
  constructor(controller=new BudgetController(),config=RECORD_CONFIG){this.controller=controller;this.config=config;this.clips=[];this.reservations=new Map();this.sequence=0;}
  get usedBytes(){return this.clips.reduce((n,c)=>n+c.bytes,0)+[...this.reservations.values()].reduce((n,b)=>n+b,0);}
  get anchorBytes(){return this.clips.filter(c=>c.anchor).reduce((n,c)=>n+c.bytes,0);}
  release(c){if(c.url)URL.revokeObjectURL(c.url);c.bitmap?.close();c.frame?.close();c.dispose?.();c.blob=null;c.thumbnail=null;this.clips=this.clips.filter(x=>x!==c);}
  tidy(needed=0){
    const soft=this.controller.bytes*.8;
    const limit=needed?this.controller.bytes-needed:soft;
    while(this.usedBytes>limit || this.clips.length>=this.config.maxCandidates){
      const recent=new Set(this.clips.slice(-2));
      const eligible=this.clips.filter(c=>!c.anchor&&!recent.has(c));
      const priority=c=>(c.quality<.8?-100:0)+candidateValue(c)-4*Math.max(0,...this.clips.filter(x=>x!==c).map(x=>similarity(c,x)));
      const victim=eligible.sort((a,b)=>priority(a)-priority(b))[0];if(!victim)break;this.release(victim);
    }
  }
  reserve(bytes){if(bytes<=0||bytes>this.controller.bytes)return null;if(this.usedBytes>=this.controller.bytes*.8)this.tidy();this.tidy(bytes);if(this.usedBytes+bytes>this.controller.bytes)return null;const id=++this.sequence;this.reservations.set(id,bytes);return id;}
  cancel(id){this.reservations.delete(id);}
  commit(id,c){
    const reserved=this.reservations.get(id);this.cancel(id);
    const metadata=JSON.stringify({...c,blob:undefined,thumbnail:undefined}).length*2;
    c.bytes=(c.blob?.size||0)+(c.thumbnail?.size||0)+metadata;
    if(!reserved||c.bytes>reserved||metadata>this.config.maxMetadataBytes){c.blob=null;c.thumbnail=null;return false;}
    if(c.anchor){const old=this.clips.find(x=>x.anchor===c.anchor);
      if(old&&candidateValue(c)<=candidateValue(old)){c.anchor=null;}else if(old)this.release(old);
      if(this.anchorBytes+c.bytes>this.config.anchorBytes)c.anchor=null;
    }
    this.tidy(c.bytes);if(this.usedBytes+c.bytes>this.controller.bytes){c.blob=null;return false;}
    this.clips.push(c);return true;
  }
  clear(){for(const c of [...this.clips])this.release(c);this.reservations.clear();}
  keep(ids){for(const c of [...this.clips])if(!ids.has(c.id))this.release(c);}
}
