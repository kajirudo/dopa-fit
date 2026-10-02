// SPDX-License-Identifier: MIT
// Both implementations remain PoC candidates until physical-device acceptance.
export function faceResultIssue(result,now) {
  const faces=result?.faces;
  if(!result||!Number.isFinite(result.capturedAt)||now<result.capturedAt)return 'invalid';
  if(now-result.capturedAt>200)return 'delayed';
  if(!faces?.length)return 'no-face';
  if(faces.length!==1)return 'multiple';
  const f=faces[0];
  if(![f.x,f.y,f.width,f.height,f.roll].every(Number.isFinite)||f.width<=.015||f.height<=.015||f.x<0||f.y<0||f.x+f.width>1.02||f.y+f.height>1.02)return 'invalid';
  if(f.width>.75||f.height>.8)return 'too-close';
  return null;
}
export const validFaceResult=(result,now)=>faceResultIssue(result,now)===null;
export class FaceTracker {
  constructor(provider='detector',{background='MY_ROOM',inputWidth=384}={}){this.provider=provider;this.background=background;this.inputWidth=inputWidth;this.status='unvalidated';this.busy=false;this.sequence=0;this.generation=0;this.ready=false;this.pending=null;this.latencies=[];}
  init(){return this.initializing??=this.initialize().catch(error=>{this.initializing=null;throw error;});}
  async initialize(){
    if(this.ready)return;const generation=this.generation;
    const {loadRecordPack}=await import('./optional-pack.js');await loadRecordPack();if(generation!==this.generation)throw new DOMException('Cancelled','AbortError');
    this.worker=new Worker(new URL('./face-worker.js',import.meta.url));
    await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);this.initializationCancel=null;error?reject(error):resolve();};
      const timer=setTimeout(()=>finish(new Error('Face initialization timeout')),30000);
      this.initializationCancel=()=>finish(new DOMException('Cancelled','AbortError'));
      this.worker.onmessage=event=>{const r=event.data;if(r.type==='ready')finish();else if(r.type==='error')finish(new Error(r.message));};
      this.worker.onerror=()=>finish(new Error('Face worker failed'));
      this.worker.postMessage({type:'init',provider:this.provider,background:this.background});
    });
    if(generation!==this.generation||!this.worker)throw new DOMException('Cancelled','AbortError');
    this.ready=true;this.worker.onmessage=event=>{const r=event.data;const p=this.pending;this.pending=null;this.busy=false;
      if(!p||r.id!==p.id){r.bitmap?.close();return;}
      clearTimeout(p.timer);
      if(r.type==='error')p.reject(new Error(r.message));else {this.latencies.push(performance.now()-r.capturedAt);if(this.latencies.length>120)this.latencies.shift();p.resolve(r);}};
    this.worker.onerror=()=>{const p=this.pending;this.pending=null;clearTimeout(p?.timer);this.dispose();p?.reject(new Error('Face worker failed'));};
  }
  async track(video,background){
    if(this.busy||!this.worker||!this.ready||!(video.videoWidth||video.naturalWidth||video.width))return null;
    this.busy=true;const capturedAt=performance.now(),id=++this.sequence,generation=this.generation;
    try {
      const sourceWidth=video.videoWidth||video.naturalWidth||video.width,sourceHeight=video.videoHeight||video.naturalHeight||video.height;
      const width=Math.min(this.inputWidth,sourceWidth),height=Math.round(sourceHeight*width/sourceWidth);
      const bitmap=await createImageBitmap(video,{resizeWidth:width,resizeHeight:height});
      if(!this.worker||!this.ready||generation!==this.generation){bitmap.close();this.busy=false;return null;}
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending=null;this.busy=false;this.dispose();reject(new Error('Face tracking timeout'));},2000);
        this.pending={id,resolve,reject,timer};this.worker.postMessage({type:'frame',id,capturedAt,bitmap,background},[bitmap]);
      });
    }catch(error){this.busy=false;throw error;}
  }
  dispose(){this.generation++;this.initializationCancel?.();this.ready=false;this.initializing=null;this.worker?.terminate();this.worker=null;const p=this.pending;this.pending=null;clearTimeout(p?.timer);p?.resolve(null);this.busy=false;}
}
