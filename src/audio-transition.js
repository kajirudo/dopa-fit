// SPDX-License-Identifier: MIT
export const TRANSITION_SECONDS=.04;
// One short tail and one short head; equal-power fades do not retain a session of PCM.
export function crossfade(tail,head){
  const n=Math.min(tail.length,head.length),result=new Float32Array(n);
  for(let i=0;i<n;i++){const phase=(i+.5)/n*Math.PI/2;result[i]=tail[i]*Math.cos(phase)+head[i]*Math.sin(phase);}
  return result;
}
