// SPDX-License-Identifier: MIT
import { BASE_BPM, REST_BPM, feverStage } from './fever.js';
const beatSeconds=60/BASE_BPM;
export class MusicEngine {
  constructor(audio,getState) { this.audio=audio;this.getState=getState;this.step=0;this.timer=null;this.layer=0;this.cycle='BUILD';this.bpm=BASE_BPM;this.segments=[]; }
  start(seconds=0) {
    this.stop();const beats=seconds>0 && Number.isFinite(this.savedBeat)?this.savedBeat:seconds/beatSeconds;
    this.step=Math.floor(beats*4);this.nextTime=this.audio.ctx.currentTime+.06;this.segments=[];
    this.capture(this.nextTime);this.tick();this.timer=setInterval(()=>this.tick(),25);
  }
  get clock() {
    const ctx=this.audio.ctx;if(this.timer===null || !this.audio.ready || ctx?.state!=='running' || !this.segments.length)return null;
    const segment=[...this.segments].reverse().find(s=>s.at<=ctx.currentTime)||this.segments[0];
    const beats=Math.max(0,segment.beats+(ctx.currentTime-segment.at)*segment.bpm/60);
    return {beats,bpm:segment.bpm,beatMs:60000/segment.bpm,seconds:beats*60/segment.bpm};
  }
  get clockSeconds() { const clock=this.clock;return clock?clock.beats*beatSeconds:null; }
  stop() { const clock=this.clock;if(clock)this.savedBeat=clock.beats;clearInterval(this.timer);this.timer=null; }
  capture(at) {
    const state=this.getState();this.layer=state.layer;this.cycle=state.cycle;this.feverLevel=state.feverLevel||1;
    this.bpm=this.cycle==='FEVER'?feverStage(this.feverLevel).bpm:this.cycle==='REST'?REST_BPM:BASE_BPM;
    if(!this.segments.length || this.segments.at(-1).bpm!==this.bpm)this.segments.push({at,beats:this.step/4,bpm:this.bpm});
    this.segments=this.segments.slice(-8);this.origin=at-this.step/4*60/this.bpm;
    this.audio.setMusicStyle?.(this.cycle,this.feverLevel,at);
  }
  tick() {
    const ctx=this.audio.ctx;if(!ctx || ctx.state!=='running')return;
    if(this.nextTime<ctx.currentTime-.1) {
      this.step=Math.ceil(Math.max(this.step,(this.clock?.beats||0)*4)/16)*16;this.nextTime=ctx.currentTime+.04;
      this.segments=[];this.capture(this.nextTime);
    }
    while(this.nextTime<ctx.currentTime+.12) {
      if(this.step%16===0)this.capture(this.nextTime);
      this.schedule(this.step,this.nextTime);this.nextTime+=60/this.bpm/4;this.step++;
    }
  }
  schedule(step,t) {
    const s=step%16,bar=Math.floor(step/16),a=this.audio,rest=this.cycle==='REST';
    if(this.cycle==='FEVER') {
      const level=feverStage(this.feverLevel).level,root=[48,45,40,43][bar%4];
      const kicks=level===2?[0,4,6,8,12,14]:level===4?[0,3,6,8,11,14]:[0,4,8,12];
      if(kicks.includes(s))a.play('club-kick',t);
      if(s===4||s===12)a.play(level>=4?'snare':'clap',t);
      if(s%(level>=2?1:2)===0)a.play('hat',t);
      if([6,14].includes(s))a.play('open-hat',t);
      if(s===0&&bar%4===0)a.play('crash',t);
      const bassSteps=level===1?[0,3,6,8,11,14]:level===2?[2,6,10,14]:level===4?[0,2,3,6,8,10,11,14]:[0,2,4,6,8,10,12,14];
      if(bassSteps.includes(s))a.play(level>=3?'acid-bass':'pulse-bass',t,root);
      const arps=[[72,76,79,84],[69,72,76,81],[64,67,74,76],[67,72,74,79]],arp=arps[bar%4];
      if(level===1&&s%2===0)a.play('pluck',t,[72,76,79,81,79,76,74,72][s/2]);
      if(level===2&&[0,3,6,7,10,12,14,15].includes(s))a.play('pluck',t,arp[s%4]);
      if(level===3||level===5)a.play('pluck',t,arp[s%4]);
      if(level===4&&s%2===1)a.play('pluck',t,arp[(s+bar)%4]);
      if(level>=4&&[2,6,10,14].includes(s))for(const note of [[60,64,67],[57,60,64],[52,55,62],[55,60,62]][bar%4])a.play('rave',t,note);
      if(level>=3&&bar%4===3&&[13,14,15].includes(s))a.play('snare',t);
      return;
    }
    if(s%4===0)a.play('kick',t);
    if(this.layer>=1&&s%(rest?4:2)===0)a.play('hat',t);
    if(this.layer>=2&&(s===4||s===12))a.play('snare',t);
    if(this.layer>=3&&s%4===0)a.play('bass',t,[36,45,40,43][bar%4]);
    if(!rest&&this.layer>=4&&s%4===2)a.play('synth',t,[60,64,67,69][(bar+s/2)%4]);
    if(!rest&&this.layer>=5&&s%4===0)a.play('melody',t,[72,76,79,81,79,76,74,72][step/2%8]);
  }
}
