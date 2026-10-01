import test from 'node:test';
import assert from 'node:assert/strict';
import { targetPositions,TargetManager } from '../src/game.js';
import { MusicEngine } from '../src/music.js';
import { mascotBox,overlapsTarget } from '../src/layout.js';
test('nearby low shoulders still generate upper and central targets without narrowing vertical reach to screen width',()=>{
  const box=mascotBox(390,844,72),c={center:{x:195,y:660},shoulder:560,bodyMode:'upper',rect:{x:0,y:0,width:390,height:844},ui:{top:box.y+box.height+12,bottom:24}};
  for(const reach of ['wide','small']) {
    const points=targetPositions(c,reach);assert.equal(points.length,8);
    assert.ok(points.some(p=>p.y<844*.4));assert.ok(points.some(p=>p.y>844*.4&&p.y<844*.6));
    assert.ok(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))>300);
    for(const p of points){assert.ok(!overlapsTarget(box,p));assert.ok(p.y-p.radius>=c.ui.top&&p.y+p.radius<=820);}
  }
  assert.ok(box.y<844*.2);assert.equal(mascotBox(844,390),null);
});
test('tempo changes exactly on the next unreserved bar, musical phase is continuous, and resume retains its beat',()=>{
  let state={layer:5,cycle:'BUILD',feverLevel:0};const played=[],audio={ready:true,ctx:{state:'running',currentTime:0},play:(...v)=>played.push(v)};
  const engine=new MusicEngine(audio,()=>state);engine.start();
  try {
    state={layer:5,cycle:'FEVER',feverLevel:5};const boundary=.06+16*60/112/4;
    for(let time=.04;time<boundary-.03;time+=.04){audio.ctx.currentTime=time;engine.tick();}
    const segment=engine.segments.at(-1);assert.equal(segment.bpm,160);assert.ok(Math.abs(segment.at-boundary)<1e-9);
    audio.ctx.currentTime=boundary-.001;assert.equal(engine.clock.bpm,112);const before=engine.clock.beats;
    audio.ctx.currentTime=boundary;assert.equal(engine.clock.bpm,160);assert.equal(engine.clock.beats,4);assert.ok(engine.clock.beats-before<.01);
    audio.ctx.currentTime=boundary+.375;assert.ok(Math.abs(engine.clock.beats-5)<1e-8);const saved=engine.clock.beats;
    engine.stop();audio.ctx.currentTime=10;engine.start(100);audio.ctx.currentTime=10.06;
    assert.ok(Math.abs(engine.clock.beats-Math.floor(saved*4)/4)<1e-8);assert.equal(engine.clock.bpm,160);
    const club=played.filter(v=>v[0]==='club-kick');assert.ok(club.length>0);
  } finally {engine.stop();}
});
test('target replacement stays on the changed music grid and maintains the 350ms hit rest',()=>{
  const manager=new TargetManager({center:{x:180,y:200},shoulder:90,rect:{x:0,y:0,width:360,height:600}},true);
  manager.advance(0,0,'FEVER',500);const target=manager.targets[0];target.hitAt=50;manager.planNext(target,50);
  manager.advance(100,.1,'FEVER',375);assert.ok(target.relocateAt>=400);
  assert.ok(Math.abs((target.relocateAt-manager.beatOrigin)/375-Math.round((target.relocateAt-manager.beatOrigin)/375))<1e-8);
  assert.equal(target.next.arrivesAt,target.relocateAt);
});
