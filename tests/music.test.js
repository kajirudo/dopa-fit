import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicEngine } from '../src/music.js';
test('visual rhythm follows scheduled audio time after resume and scheduler recovery', () => {
 const played=[],audio={ready:true,ctx:{state:'running',currentTime:10},play:(kind,time)=>played.push({kind,time})};
 const engine=new MusicEngine(audio,()=>({layer:0,cycle:'BUILD'}));engine.start(5.31);
 try {
  audio.ctx.currentTime=engine.origin+10*(60/112);
  assert.ok(Math.abs(engine.clockSeconds-10*(60/112))<1e-9);
  audio.ctx.currentTime=100;engine.tick();
  const kick=played.filter(p=>p.kind==='kick').at(-1);
  audio.ctx.currentTime=kick.time;
  assert.ok(Math.abs(engine.clockSeconds/(60/112)-Math.round(engine.clockSeconds/(60/112)))<1e-9);
  audio.ready=false;assert.equal(engine.clockSeconds,null);
 }finally{engine.stop();}assert.equal(engine.clockSeconds,null);
});
test('all melodic and bass voices use finite C major pentatonic pitches', () => {
 const played=[],engine=new MusicEngine({play:(kind,time,note)=>played.push({kind,time,note})},()=>({}));engine.layer=5;engine.cycle='FEVER';
 for(let step=0;step<128;step++)engine.schedule(step,step*60/112/4);
 for(const voice of played.filter(v=>['bass','synth','melody'].includes(v.kind))){assert.ok(Number.isFinite(voice.note));assert.ok([0,2,4,7,9].includes(voice.note%12),`${voice.kind}: ${voice.note}`);}
 assert.ok(played.some(v=>v.kind==='bass')&&played.some(v=>v.kind==='melody'));
});
test('new instrument layers are captured at bar boundaries without changing reserved beats', () => {
 let state={layer:0,cycle:'BUILD'};const audio={ctx:{state:'running',currentTime:0},play(){}},engine=new MusicEngine(audio,()=>state);engine.nextTime=.06;
 engine.tick();assert.equal(engine.layer,0);state={layer:5,cycle:'FEVER'};
 audio.ctx.currentTime=.15;engine.tick();assert.equal(engine.layer,0);
 for(let i=2;i<=16;i++){audio.ctx.currentTime=i*60/112/4;engine.tick();}
 assert.equal(engine.layer,5);assert.equal(engine.cycle,'FEVER');
});
test('FEVER adds melodic motion and bass while the calm section keeps kick and unlocked layers', () => {
 const played=[],engine=new MusicEngine({play:(kind,time,note)=>played.push({kind,time,note})},()=>({}));engine.layer=5;
 const bar=cycle=>{engine.cycle=cycle;played.length=0;for(let s=0;s<16;s++)engine.schedule(s,s*.134);return [...played];};
 const normal=bar('BUILD'),fever=bar('FEVER'),rest=bar('REST');
 assert.equal(fever.filter(p=>p.kind==='melody').length,16);assert.equal(normal.filter(p=>p.kind==='melody').length,4);
 assert.equal(fever.filter(p=>p.kind==='bass').length,8);assert.equal(rest.filter(p=>p.kind==='kick').length,4);
 assert.equal(rest.some(p=>p.kind==='melody'||p.kind==='synth'),false);assert.equal(engine.layer,5);
});
