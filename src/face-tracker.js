// SPDX-License-Identifier: MIT
// Both implementations remain PoC candidates until physical-device acceptance.
export function validFaceResult(result,now) {
  const faces=result?.faces;
  return result && now>=result.capturedAt && now-result.capturedAt<=200 && faces?.length===1 &&
    [faces[0].x,faces[0].y,faces[0].width,faces[0].height,faces[0].roll].every(Number.isFinite) &&
    faces[0].width>.015 && faces[0].height>.015 && faces[0].width<.95 && faces[0].height<.95 &&
    faces[0].x>=0 && faces[0].y>=0 && faces[0].x+faces[0].width<=1.02 && faces[0].y+faces[0].height<=1.02;
}
export class FaceTracker {
  constructor(provider='detector'){this.provider=provider;this.status='unvalidated';this.busy=false;this.sequence=0;this.generation=0;this.ready=false;this.pending=null;this.latencies=[];}
  init(){return this.initializing??=this.initialize().catch(error=>{this.initializing=null;throw error;});}
  async initialize(){
    if(this.ready)return;const generation=this.generation;
    const {loadRecordPack}=await import('./optional-pack.js');await loadRecordPack();if(generation!==this.generation)throw new DOMException('Cancelled','AbortError');
    this.worker=new Worker(new URL('./face-worker.js',import.meta.url));
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.dispose();reject(new Error('Face initialization timeout'));},30000);
      this.worker.onmessage=event=>{const r=event.data;if(r.type==='ready'){clearTimeout(timer);resolve();}else if(r.type==='error'){clearTimeout(timer);reject(new Error(r.message));}};
      this.worker.onerror=()=>{clearTimeout(timer);reject(new Error('Face worker failed'));};
      this.worker.postMessage({type:'init',provider:this.provider});
    });
    this.ready=true;this.worker.onmessage=event=>{const r=event.data;const p=this.pending;this.pending=null;this.busy=false;
      if(!p||r.id!==p.id){r.bitmap?.close();return;}
      clearTimeout(p.timer);
      if(r.type==='error')p.reject(new Error(r.message));else {this.latencies.push(performance.now()-r.capturedAt);if(this.latencies.length>120)this.latencies.shift();p.resolve(r);}};
    this.worker.onerror=()=>{const p=this.pending;this.pending=null;this.busy=false;clearTimeout(p?.timer);p?.reject(new Error('Face worker failed'));};
  }
  async track(video,background){
    if(this.busy||!this.worker||!this.ready||!(video.videoWidth||video.naturalWidth||video.width))return null;
    this.busy=true;const capturedAt=performance.now(),id=++this.sequence,generation=this.generation;
    try {
      const sourceWidth=video.videoWidth||video.naturalWidth||video.width,sourceHeight=video.videoHeight||video.naturalHeight||video.height;
      const width=Math.min(512,sourceWidth),height=Math.round(sourceHeight*width/sourceWidth);
      const bitmap=await createImageBitmap(video,{resizeWidth:width,resizeHeight:height});
      if(!this.worker||!this.ready||generation!==this.generation){bitmap.close();this.busy=false;return null;}
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending=null;this.busy=false;this.dispose();reject(new Error('Face tracking timeout'));},2000);
        this.pending={id,resolve,reject,timer};this.worker.postMessage({type:'frame',id,capturedAt,bitmap,background},[bitmap]);
      });
    }catch(error){this.busy=false;throw error;}
  }
  dispose(){this.generation++;this.ready=false;this.initializing=null;this.worker?.terminate();this.worker=null;const p=this.pending;this.pending=null;clearTimeout(p?.timer);p?.resolve(null);this.busy=false;}
}
