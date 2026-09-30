import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicEngine } from '../src/music.js';
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
