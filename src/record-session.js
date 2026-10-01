// SPDX-License-Identifier: MIT
import {RECORD_CONFIG,recordQuality} from './record-config.js';
import {BudgetController,HighlightPool} from './highlight-budget.js';
import {qualityGate} from './highlight-planner.js';
export function recorderMime(){
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm']
    .find(type=>globalThis.MediaRecorder?.isTypeSupported(type))||null;
}
export class RecordSession {
  constructor({config=RECORD_CONFIG,validatedMax='LOW',onStatus=()=>{}}={}){
    this.config=config;this.controller=new BudgetController({validatedMax});this.pool=new HighlightPool(this.controller,config);this.canvas=document.createElement('canvas');
    this.quality=recordQuality(this.controller.profile);Object.assign(this.canvas,{width:this.quality.width,height:this.quality.height});
    this.ctx=this.canvas.getContext('2d');this.onStatus=onStatus;this.sequence=0;this.highestStage=0;this.lastStage=0;this.disposed=false;this.closing=null;
    this.mime=recorderMime();if(!this.mime||!this.canvas.captureStream)throw new Error('Recording unavailable');
  }
  note(events,pose,width,height){const c=this.current;if(!c)return;
    for(const e of events){c.motionCount++;if(e.type==='hit')c.hits++;const index=e.type==='exercise'?2:e.wristId==='right_wrist'?1:0;c.actionCounts[index]++;if(e.wristId){const previous=c.lastPoints[e.wristId];if(previous&&Number.isFinite(e.x)&&Number.isFinite(e.y)){const dx=e.x-previous.x,dy=e.y-previous.y;c.actionCounts[Math.abs(dx)>Math.abs(dy)?dx>0?5:6:dy>0?4:3]++;}c.lastPoints[e.wristId]={x:e.x,y:e.y};}}
    const l=pose?.points?.left_shoulder,r=pose?.points?.right_shoulder;
    if(l?.valid&&r?.valid){c.position=(l.x+r.x)/2/width;c.size=Math.hypot(l.x-r.x,l.y-r.y)/width;}
  }
  frame(scene,overlay,state,audio,{active,safe,seconds,cycle,beatSeconds=.5}){
    if(this.disposed)return;
    if(!active||!safe){if(this.current)this.stop(true);return;}
    if(!this.current&&!this.closing&&(this.canvas.width!==this.quality.width||this.canvas.height!==this.quality.height)){this.canvas.width=this.quality.width;this.canvas.height=this.quality.height;}
    const w=this.canvas.width,h=this.canvas.height,c=this.ctx;c.fillStyle='#102c29';c.fillRect(0,0,w,h);
    // Same processed pixels as preview. Letterboxing preserves the complete reach.
    const scale=Math.min(w/scene.width,h/scene.height),dw=scene.width*scale,dh=scene.height*scale,x=(w-dw)/2,y=(h-dh)/2;
    c.drawImage(scene,x,y,dw,dh);c.drawImage(overlay,x,y,dw,dh);c.font='bold 22px system-ui';c.fillStyle='#fff';c.textAlign='left';c.fillText(`${state.energy} ENERGY · ${state.hits} HIT`,24,42);
    if(this.current){const level=state.presentedStageLevel||0;if(level>this.current.stage)this.current.evolutions.push({level,at:seconds-this.current.start});this.current.stage=Math.max(this.current.stage,level);this.current.frames++;this.current.end=seconds;if(seconds-this.current.start>=this.config.clipSeconds)this.stop();}
    else if(!this.closing&&audio?.ready&&audio.recordStream){this.begin(state,audio.recordStream,seconds,cycle,beatSeconds);}
  }
  begin(state,audioStream,seconds,cycle,beatSeconds){
    const reservation=this.pool.reserve(this.config.reservationBytes);if(!reservation){this.onStatus('limited');return;}
    const video=this.canvas.captureStream(this.quality.fps),audio=audioStream.getAudioTracks().map(t=>t.clone()),stream=new MediaStream([...video.getVideoTracks(),...audio]);
    const c={id:++this.sequence,reservation,start:seconds,end:seconds,frames:0,motionCount:0,hits:0,actionCounts:[0,0,0,0,0,0,0],lastPoints:{},evolutions:[],stage:state.presentedStageLevel??state.stageLevel??state.feverLevel,cycleId:state.cycleId||0,variant:state.variant||'meteor',fever:cycle==='FEVER'?1:0,beatSeconds,parts:[],partBytes:0,stream};
    try{
      const recorder=new MediaRecorder(stream,{mimeType:this.mime,videoBitsPerSecond:this.quality.bitrate,audioBitsPerSecond:96_000});c.recorder=recorder;this.current=c;
      recorder.ondataavailable=event=>{if(event.data.size){c.partBytes+=event.data.size;
        if(c.partBytes>this.config.reservationBytes-this.config.maxMetadataBytes){c.discard=true;c.parts=[];if(this.current===c)this.stop(true);}
        else if(!c.discard)c.parts.push(event.data);}};
      recorder.onerror=()=>{c.discard=true;this.onStatus('error');this.stop(true);};
      recorder.start(500);this.onStatus('on');
    }catch(error){stream.getTracks().forEach(t=>t.stop());this.pool.cancel(reservation);this.current=null;this.onStatus('error');}
  }
  stop(discard=false){
    if(!this.current)return this.closing||Promise.resolve();
    const c=this.current;this.current=null;c.discard||=discard;
    this.closing=new Promise(resolve=>{
      let settled=false;
      const complete=()=>{if(settled)return;settled=true;clearTimeout(timer);c.stream.getTracks().forEach(t=>t.stop());
        const duration=c.end-c.start,actions=c.actionCounts.map(n=>n/Math.max(1,c.actionCounts.reduce((a,b)=>a+b,0))),blob=c.discard?null:new Blob(c.parts,{type:this.mime});c.parts=[];
        const evolution=c.stage>this.lastStage?1:0;let anchor=!this.pool.clips.length?'beginning':evolution?`growth:${c.stage}`:null;
        if(!anchor&&c.stage>0&&!this.pool.clips.some(clip=>clip.anchor===`growth:${c.stage}`))anchor=`growth:${c.stage}`;
        const incomingHighest=Math.max(this.highestStage,c.stage);
        if(!anchor&&c.stage===incomingHighest)anchor='peak';
        const candidate={id:c.id,blob,start:c.start,end:c.end,duration,stage:c.stage,cycleId:c.cycleId,variant:c.variant,beatSeconds:c.beatSeconds,actions,
          position:c.position??.5,size:c.size??.3,quality:1,tracking:1,privacySafe:true,audio:true,motion:Math.min(1,c.motionCount/Math.max(1,duration)),hitDensity:c.hits/Math.max(.1,duration),fever:c.fever,evolution,evolutions:c.evolutions,novelty:0,anchor};
        if(!this.disposed&&blob&&qualityGate(candidate)){if(this.pool.commit(c.reservation,candidate)){if(c.stage>this.highestStage){for(const old of this.pool.clips)if(old!==candidate&&old.anchor==='peak')old.anchor=null;this.highestStage=c.stage;}this.lastStage=Math.max(this.lastStage,c.stage);}}else this.pool.cancel(c.reservation);
        this.closing=null;resolve();};
      const timer=setTimeout(()=>{c.discard=true;complete();},3000);
      c.recorder.onstop=complete;
      if(c.recorder.state!=='inactive')c.recorder.stop();else complete();
    });return this.closing||Promise.resolve();
  }
  observe(metrics,now){const previous=this.controller.profile;this.controller.observe(metrics,now);
    if(previous!==this.controller.profile){this.stop();this.pool.tidy();this.quality=recordQuality(this.controller.profile);/* Existing canvas remains stable until pending recorder closes. */}
  }
  async finish(){await this.stop();await this.closing;return this.pool.clips;}
  async dispose(){this.disposed=true;await this.stop(true);await this.closing;this.pool.clear();this.canvas.width=this.canvas.height=1;}
}
