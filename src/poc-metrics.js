// SPDX-License-Identifier: MIT
// Fixed-size histograms keep long acceptance runs from retaining an event log.
export class Histogram {
  constructor(){this.bins=new Uint32Array(201);this.count=0;this.maximum=0;}
  add(ms){if(!Number.isFinite(ms)||ms<0)return;this.bins[Math.min(200,Math.ceil(ms/10))]++;this.count++;this.maximum=Math.max(this.maximum,ms);}
  get p95(){if(!this.count)return null;let n=0;for(let i=0;i<this.bins.length;i++){n+=this.bins[i];if(n>=this.count*.95)return i===200?'≥2000':i*10;}return null;}
}
export class PoCMetrics {
  constructor(provider){this.provider=provider;this.startedAt=new Date().toISOString();this.face=new Histogram();this.pose=new Histogram();this.frames=0;this.frameMs=0;this.safe=0;this.fallback=0;this.maxOwnedBytes=0;this.maxCandidates=0;this.samples=0;}
  frame(dt,safe){this.frames++;this.frameMs+=dt*1000;if(safe)this.safe++;else this.fallback++;}
  sample(metrics,diagnostics){this.samples++;this.maxOwnedBytes=Math.max(this.maxOwnedBytes,diagnostics.ownedBytes);this.maxCandidates=Math.max(this.maxCandidates,diagnostics.candidates);}
  report({background,recordEnabled,bodyMode,elapsed,exposureObservations=null,notes=''}){
    return {schema:1,provider:this.provider,adoption:'UNVALIDATED',startedAt:this.startedAt,endedAt:new Date().toISOString(),userAgent:navigator.userAgent,
      settings:{inputWidth:512,delegate:'CPU',background,recordEnabled,bodyMode},elapsedSeconds:elapsed,
      face:{samples:this.face.count,p95ms:this.face.p95,maxMs:this.face.count?this.face.maximum:null,safeFrames:this.safe,fallbackFrames:this.fallback,fallbackFraction:this.fallback/Math.max(1,this.frames)},
      pose:{samples:this.pose.count,p95ms:this.pose.p95,maxMs:this.pose.count?this.pose.maximum:null},canvas:{frames:this.frames,averageFPS:this.frameMs?this.frames*1000/this.frameMs:null},
      retainedMedia:{maxOwnedBytes:this.maxOwnedBytes,maxCandidates:this.maxCandidates},
      cpuUtilization:'not measured by browser',gpuUtilization:'not measured by browser',totalProcessMemory:'requires external device measurement',
      privacy:{observedExposures:exposureObservations,coverageAcceptance:exposureObservations===null?'pending manual observation':exposureObservations===0?'observed zero; scenario review still required':'FAILED'},
      scenarios:['front','profile left/right','tilt','fast motion','tracking loss','reacquisition','multiple people','background failure','pause/resume'],notes};
  }
}
