import test from 'node:test';
import assert from 'node:assert/strict';
import { TargetManager, feverPositions } from '../src/game.js';
import { FEVER_STAGES } from '../src/fever.js';

const calibration={center:{x:195,y:380},shoulder:120,bodyMode:'upper',rect:{x:0,y:0,width:390,height:844},ui:{top:140,bottom:24}};
const pose=(x,y,time)=>({capturedAt:time,points:{left_shoulder:{x:135,y:380,valid:true},right_shoulder:{x:255,y:380,valid:true},left_wrist:{x,y,valid:true}}});
const separated=targets=>{
  for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++)assert.ok(Math.hypot(targets[i].x-targets[j].x,targets[i].y-targets[j].y)>=targets[i].radius+targets[j].radius+9.9);
};

test('each fever stage fills more reachable targets; rest returns to two with fresh tracking',()=>{
  const manager=new TargetManager(calibration,true);
  for(const stage of FEVER_STAGES){
    manager.advance(stage.level*1000,stage.level,'FEVER',60000/stage.bpm,stage.level);
    assert.equal(manager.active.length,stage.targets);separated(manager.active);
    const before=manager.targets;manager.advance(stage.level*1000+16);assert.equal(manager.targets,before);
  }
  manager.advance(6000,6,'REST');assert.equal(manager.targets.length,2);assert.equal(manager.active.length,2);assert.equal(manager.leadId,0);
  assert.deepEqual(manager.previous,{});assert.ok(manager.targets.every(t=>!Object.keys(t.arms).length));
});

test('compact, short, full-body and near-camera fields fit HUD bounds and never overlap',()=>{
  for(const c of [calibration,{...calibration,bodyMode:'full'},{...calibration,shoulder:500,center:{x:195,y:610}},{...calibration,rect:{x:0,y:0,width:320,height:568}},{...calibration,rect:{x:0,y:0,width:700,height:340},center:{x:350,y:190},ui:{top:90,bottom:24}}])for(const reach of ['wide','small']){
    const field=feverPositions(c,reach);separated(field);
    const manager=new TargetManager(c,true,reach);manager.advance(0,0,'FEVER',375,5);
    assert.equal(manager.active.length,Math.min(12,field.length));
    for(const p of field)assert.ok(p.x-p.radius>=c.rect.x&&p.x+p.radius<=c.rect.x+c.rect.width&&p.y-p.radius>=c.ui.top&&p.y+p.radius<=c.rect.height-c.ui.bottom);
  }
  assert.ok(feverPositions(calibration,'small').length<feverPositions(calibration,'wide').length);
});

test('fever sweep scores once per hand, requires leaving on arrival, and replenishes on the half beat',()=>{
  const manager=new TargetManager(calibration,true);manager.advance(0,0,'FEVER',375,5);
  const t=manager.targets[0];
  assert.equal(manager.process(pose(-100,-100,0),0).length,0);
  const hits=manager.process(pose(t.x,t.y,50),50);assert.equal(hits.length,1);assert.equal(hits[0].targetId,t.id);
  assert.equal(manager.active.length,11);assert.ok(t.relocateAt>=270&&t.relocateAt<270+187.5);
  assert.equal(t.relocateAt/187.5,Math.round(t.relocateAt/187.5));
  assert.equal(manager.process(pose(t.x,t.y,100),100).length,0);
  const due=t.relocateAt,next={...t.next};
  // A target arriving under an already resting hand cannot award a free hit.
  manager.process(pose(next.x,next.y,due-1),due-1);manager.advance(due);
  assert.equal(manager.active.length,12);assert.equal(manager.process(pose(next.x,next.y,due+1),due+1).length,0);separated(manager.active);
});

test('repeated fever hits and quiet expiration keep a bounded, separated field',()=>{
  const manager=new TargetManager(calibration,true);manager.advance(0,0,'FEVER',375,5);
  let now=0;
  for(let i=0;i<50;i++){
    now+=600;manager.advance(now);
    const t=manager.active[0];if(!t)continue;
    manager.process(pose(-100,-100,now),now);manager.process(pose(t.x,t.y,now+50),now+50);
    assert.equal(manager.targets.length,12);separated(manager.active);
    separated(manager.targets.map(t=>t.next||t));
  }
  manager.advance(now+4000);assert.equal(manager.targets.length,12);
  manager.advance(now+5000);assert.equal(manager.active.length,12);separated(manager.active);
});
