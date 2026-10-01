// SPDX-License-Identifier: MIT
import { RECORD_CONFIG } from './record-config.js';
const clamp = n => Math.max(0,Math.min(1,Number(n)||0));
export function qualityGate(c) {
  return c.duration > .4 && c.quality >= .8 && c.privacySafe === true &&
    !c.paused && !c.preparing && c.tracking >= .8 && c.audio !== false && c.motion > 0;
}
export function similarity(a,b) {
  if (a.id === b.id) return 1;
  const overlap=Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
  if (overlap > .02) return 1;
  const distribution=(a.actions||[]).reduce((s,n,i)=>s+Math.abs(n-(b.actions?.[i]||0)),0);
  const framing=Math.hypot((a.position??.5)-(b.position??.5),(a.size??.5)-(b.size??.5));
  return clamp(.22*(a.stage===b.stage)+.22*(a.cycleId===b.cycleId)+.18*(a.variant===b.variant)
    +.18*(1-Math.min(1,distribution/2))+.12*(1-Math.min(1,framing*2))+.08*Math.exp(-Math.abs(a.start-b.start)/20));
}
export function candidateValue(c) {
  return 3*clamp(c.quality)+3*clamp(c.evolution)+clamp(c.hitDensity/3)+2*clamp(c.motion)
    +.5*clamp(c.fever)+.5*clamp(c.stage/5)+clamp(c.novelty);
}
export function planHighlights(candidates, config=RECORD_CONFIG) {
  const target=Math.max(0,config.targetDuration-config.outroDuration), selected=[];
  const valid=candidates.filter(qualityGate).sort((a,b)=>a.start-b.start);
  const crossfade=config.crossfadeDuration??0;
  const available=valid.reduce((n,c)=>n+c.duration,0);
  if (!valid.length) return {segments:[],duration:0,outroDuration:0};
  if(available-crossfade*Math.max(0,valid.length-1)<=target)return {segments:valid.map(c=>({...c,offset:c.offset||0})),duration:available-crossfade*Math.max(0,valid.length-1)+config.outroDuration,outroDuration:config.outroDuration};
  const quota=Math.min(target,available), maximumStage=Math.max(...valid.map(c=>c.stage));
  const add=(c,limit=Infinity)=> {
    if (!c || selected.some(s=>s.id===c.id || Math.max(s.start,c.start)<Math.min(s.end,c.end))) return;
    const remaining=quota-(selected.reduce((n,s)=>n+s.duration,0)-crossfade*Math.max(0,selected.length-1))+(selected.length?crossfade:0);
    const duration=Math.min(c.duration,remaining,limit);
    const evolutionAt=c.evolutions?.at(-1)?.at;const offset=c.anchor!=='beginning'&&Number.isFinite(evolutionAt)?Math.max(0,Math.min(c.duration-duration,evolutionAt-duration*.4)):0;
    if(duration>.05)selected.push({...c,duration,offset,start:c.start+offset,end:c.start+offset+duration});
  };
  const byValue=list=>list.sort((a,b)=>candidateValue(b)-candidateValue(a))[0];
  add(valid.find(c=>c.anchor==='beginning')||valid[0],Math.max(1,quota*config.storyWeights.beginning));
  const growth=valid.filter(c=>c.evolution>0 || c.anchor?.startsWith('growth:'));
  const growthBudget=quota*config.storyWeights.growth;
  for(const c of growth.sort((a,b)=>a.stage-b.stage||a.start-b.start))add(c,growthBudget/Math.max(1,growth.length));
  add(byValue(valid.filter(c=>c.stage===maximumStage)),quota*config.storyWeights.peak);
  for(const relax of [false,true]) {
    while(selected.reduce((n,s)=>n+s.duration,0)-crossfade*Math.max(0,selected.length-1)<quota-.05) {
      const eligible=valid.filter(c=>!selected.some(s=>s.id===c.id || Math.max(s.start,c.start)<Math.min(s.end,c.end)))
        .filter(c=>{const same=selected.filter(s=>s.cycleId===c.cycleId&&s.fever&&c.fever);return relax||same.length<2&&same.reduce((n,s)=>n+s.duration,0)<12;});
      const best=eligible.sort((a,b)=>(candidateValue(b)-4*Math.max(0,...selected.map(s=>similarity(b,s))))-(candidateValue(a)-4*Math.max(0,...selected.map(s=>similarity(a,s)))))[0];
      if(!best)break;
      const used=selected.filter(s=>s.fever&&s.cycleId===best.cycleId).reduce((n,s)=>n+s.duration,0);
      add(best,!relax&&best.fever?Math.max(0,12-used):Infinity);
    }
  }
  selected.sort((a,b)=>a.start-b.start);
  // Trim close to a beat only inward, never invent or repeat frames.
  const segments=selected.map(c=>{const beat=c.beatSeconds||.5;const end=Math.floor(((c.offset||0)+c.duration)/beat)*beat;
    const trimmed=end-(c.offset||0);const duration=trimmed>.4&&Math.abs(trimmed-c.duration)<.12?trimmed:c.duration;return {...c,offset:c.offset||0,duration};});
  const duration=segments.reduce((n,s)=>n+s.duration,0)-crossfade*Math.max(0,segments.length-1);
  return {segments,duration:duration+config.outroDuration,outroDuration:config.outroDuration};
}
