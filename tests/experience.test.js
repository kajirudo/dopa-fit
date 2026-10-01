import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice } from '../src/practice.js';
import { GameEngine, targetPositions } from '../src/game.js';
import { MusicEngine } from '../src/music.js';
import { resultSummary } from '../src/result-card.js';
const calibration={center:{x:195,y:380},shoulder:120,bodyMode:'upper',rect:{x:0,y:0,width:390,height:844},ui:{top:140,bottom:24}};
test('practice accepts fresh entries left then right, holding cannot repeat, rewards stay and normal reach is restored',()=>{
  const game=new GameEngine(calibration),practice=new Practice();practice.attach(game,0);
  let id=0;const frame=(x,y,now)=>({id:++id,capturedAt:now,points:{left_shoulder:{x:135,y:380,valid:true},right_shoulder:{x:255,y:380,valid:true},left_wrist:{x,y,valid:true}}});
  const hit=(now)=>{const target=game.targets.active[0];game.process(frame(195,600,now),now);return game.process(frame(target.x,target.y,now+50),now+50);};
  assert.equal(game.targets.dynamic,false);assert.equal(game.targets.active.length,1);
  assert.equal(practice.hit([{type:'hit',targetId:1}]),false);
  const events=hit(0);assert.ok(events.some(e=>e.type==='hit'));const target=game.targets.active[0];assert.equal(game.process(frame(target.x,target.y,100),100).some(e=>e.type==='hit'),false);
  assert.ok(practice.hit(events));assert.equal(practice.lane,1);practice.attach(game,200);
  assert.ok(practice.hit(hit(200)));assert.equal(practice.active,false);const energy=game.energy.energy;assert.equal(game.energy.hits,2);
  practice.restore(game,'wide');assert.equal(game.targets.dynamic,true);assert.deepEqual(game.targets.positions,targetPositions(calibration,'wide'));assert.equal(game.energy.energy,energy);
});
test('practice times out at ten active seconds, can be skipped and remains disabled in phase one',()=>{
  const p=new Practice();p.tick(4);assert.equal(p.remaining,6);p.tick(5.9);assert.equal(p.active,true);p.tick(.1);assert.equal(p.active,false);
  const skipped=new Practice();skipped.skip();assert.equal(skipped.active,false);assert.equal(new Practice(false).active,false);
});
test('each FEVER token gets one rise bar followed by a chord drop; repeating level five starts a fresh rise',()=>{
  let state={cycle:'FEVER',layer:5,feverLevel:5,lastFeverEnergy:500};const voices=[],audio={ctx:{currentTime:0},play:(...v)=>voices.push(v)},engine=new MusicEngine(audio,()=>state);
  engine.capture(0);assert.equal(engine.cycle,'RISE');assert.equal(engine.bpm,112);
  for(let step=0;step<16;step++)engine.schedule(step,step*.134);assert.ok(voices.filter(v=>v[0]==='snare').length>=12);assert.equal(voices.some(v=>v[0]==='club-kick'),false);
  engine.step=16;engine.capture(3);assert.equal(engine.cycle,'FEVER');assert.equal(engine.bpm,160);voices.length=0;engine.schedule(16,3);assert.ok(voices.some(v=>v[0]==='crash'));assert.equal(voices.filter(v=>v[0]==='rave').length,3);
  engine.step=32;engine.capture(6);assert.equal(engine.cycle,'FEVER');assert.equal(engine.dropStep,16);
  state={...state,lastFeverEnergy:600};engine.step=48;engine.capture(9);assert.equal(engine.cycle,'RISE');engine.step=64;engine.capture(12);assert.equal(engine.cycle,'FEVER');assert.equal(engine.dropStep,64);
});
test('resume during a rise keeps its pending drop and does not restart a whole build-up',()=>{
  const audio={ready:true,ctx:{currentTime:0,state:'running'},play(){}},engine=new MusicEngine(audio,()=>({cycle:'FEVER',layer:5,feverLevel:3,lastFeverEnergy:300}));
  engine.start();try{audio.ctx.currentTime=.5;engine.stop();const end=engine.riseEndsStep;audio.ctx.currentTime=10;engine.start(1);assert.equal(engine.riseEndsStep,end);assert.equal(engine.cycle,'RISE');}finally{engine.stop();}
});
test('result totals support older sessions and clamp invalid input without requiring images or camera data',()=>{
  assert.deepEqual(resultSummary({seconds:185,energy:123,hits:23,feverLevel:4}),{time:'3:05',energy:123,hits:23,level:4,stage:'HYPER'});
  assert.equal(resultSummary({seconds:0,energy:0,hits:0}).level,0);const invalid=resultSummary({seconds:NaN,energy:Infinity,hits:-1,feverLevel:8});assert.equal(invalid.time,'0:00');assert.equal(invalid.energy,0);assert.equal(invalid.hits,0);assert.equal(invalid.level,5);
});
