import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker } from '../src/hands.js';
import { cameraCrop, mapPose, viewport } from '../src/coordinates.js';
import { PoseDetector } from '../src/pose.js';
import { TargetManager, GameEngine } from '../src/game.js';
const calibration={center:{x:180,y:200},shoulder:90,rect:{x:0,y:0,width:360,height:640}};
const frame=(x,y,time,valid=true,elbow) => ({id:time+1,capturedAt:time,points:{left_wrist:{x,y,valid},left_elbow:elbow,left_shoulder:{x:135,y:200,valid:true},right_shoulder:{x:225,y:200,valid:true}}});
test('portrait cover fills the viewport, mirrors once, rejects cropped-out points and retains contain option',()=>{
  const rect=viewport(640,480,360,640,'cover');assert.equal(rect.height,640);assert.ok(rect.x<0);
  const mapped=mapPose({id:1,width:640,height:480,capturedAt:0,points:{left_wrist:{x:.5,y:.5,score:.35},outside:{x:0,y:.5,score:1}}},360,640,1,'cover');
  assert.deepEqual(mapped.rect,{x:0,y:0,width:360,height:640});assert.equal(mapped.points.left_wrist.x,180);assert.equal(mapped.points.left_wrist.y,320);
  assert.equal(mapped.points.left_wrist.valid,false);assert.equal(mapped.points.left_wrist.handValid,true);assert.equal(mapped.points.outside.handValid,false);
  const crop=cameraCrop(640,480,360,640);assert.ok(Math.abs(crop.x-185)<1e-9);assert.ok(Math.abs(crop.width-270)<1e-9);assert.equal(crop.height,480);
  assert.equal(viewport(640,480,360,640,'contain').y,185);
});
test('cropped inference is capped, maps back to the original video, and releases its scratch canvas',async()=>{
  const original=globalThis.document;let drawn;
  const canvas={width:0,height:0,getContext:()=>({drawImage:(...args)=>{drawn=args;}})};
  globalThis.document={createElement:()=>canvas};const detector=new PoseDetector();let disposed=false;
  detector.detector={estimatePoses:async input=>{assert.equal(input,canvas);assert.equal(input.height,640);return[{keypoints:[{name:'left_wrist',x:input.width*.25,y:input.height*.5,score:.9}]}];},dispose:()=>{disposed=true;}};
  try {
    const video={readyState:4,currentTime:1,videoWidth:1920,videoHeight:1080};const result=await detector.estimate(video,performance.now(),{width:360,height:640,fit:'cover'});
    const mapped=mapPose(result,360,640,result.capturedAt,'cover');assert.ok(Math.abs(mapped.points.left_wrist.x-270)<1e-8);assert.equal(mapped.points.left_wrist.y,320);
    assert.equal(drawn[0],video);assert.ok(drawn[1]>0);await detector.dispose();assert.equal(disposed,true);assert.equal(canvas.width,1);assert.equal(detector.cropCanvas,null);
  } finally {globalThis.document=original;}
});
test('hand bubble extends toward the fist and accepts hand-only lower confidence',()=>{
  const tracker=new HandTracker(), pose=frame(100,100,0,false,{x:100,y:150,valid:true});pose.points.left_wrist.handValid=true;
  const hand=tracker.update(pose,0,90).hands.left_wrist;assert.equal(hand.y,86);assert.equal(hand.radius,20);assert.equal(hand.held,false);
});
test('missing hand is held for 320ms, elbow assistance ends at 220ms and never extends its own lifetime',()=>{
  const tracker=new HandTracker();tracker.update(frame(100,100,0,true,{x:100,y:150,valid:true}),0,90);
  const inferred=tracker.update(frame(0,0,100,false,{x:110,y:150,valid:true}),100,90).hands.left_wrist;
  assert.equal(inferred.inferred,true);assert.equal(inferred.x,110);
  const tooFar=tracker.update(frame(0,0,150,false,{x:180,y:150,valid:true}),150,90).hands.left_wrist;assert.equal(tooFar.held,true);
  assert.equal(tracker.update(frame(0,0,221,false,{x:110,y:150,valid:true}),221,90).hands.left_wrist.held,true);
  assert.equal(tracker.update(frame(0,0,320,false),320,90).hands.left_wrist.held,true);
  assert.equal(tracker.update(frame(0,0,321,false),321,90).hands.left_wrist,undefined);
  tracker.reset();assert.deepEqual(tracker.previous,{});
});
test('a gentle near-edge touch hits with the bubble while held markers never score or repeat',()=>{
  const tracker=new HandTracker(),game=new GameEngine(calibration,1),t=game.targets.targets[0];
  const process=(x,y,time,valid=true)=>game.process(tracker.update(frame(x,y,time,valid),time,90),time);
  process(t.x-t.radius-29,t.y,0);let events;for(let i=1;i<=14;i++){const result=process(t.x-t.radius-29+i,t.y,i*50);if(result.length)events=result;}
  assert.equal(events.length,1);assert.equal(events[0].intensity,1);assert.equal(game.energy.energy,5);
  for(let time=750;time<=1700;time+=50)assert.equal(process(t.x-t.radius-15,t.y,time,false).length,0);
  assert.equal(process(t.x,t.y,1750).length,0);assert.equal(game.energy.hits,1);
});
test('short display-only dropout preserves entry, long dropout needs a new exit, stale frames cannot score',()=>{
  const tracker=new HandTracker(),game=new GameEngine(calibration,1),t=game.targets.targets[0];
  const process=(x,y,time,valid=true)=>game.process(tracker.update(frame(x,y,time,valid),time,90),time);
  process(t.x-90,t.y,0);process(0,0,100,false);process(0,0,200,false);
  assert.equal(process(t.x,t.y,250).length,1);
  process(t.x-90,t.y,650);process(0,0,700,false);process(0,0,850,false);process(0,0,1000,false);
  assert.equal(process(t.x,t.y,1050).length,0);
  const stale=tracker.update(frame(t.x,t.y,1050),1400,90);assert.equal(game.process(stale,1400).length,0);
});
test('elbow-assisted motion can hit briefly, but a newly appearing target cannot score a held hand',()=>{
  const tracker=new HandTracker(),manager=new TargetManager(calibration),t=manager.targets[0];
  const first=tracker.update(frame(t.x-t.radius-30,t.y,0,true,{x:t.x-t.radius-30,y:t.y+40,valid:true}),0,90);manager.process(first,0);
  const next=tracker.update(frame(0,0,50,false,{x:t.x-t.radius-5,y:t.y+40,valid:true}),50,90);
  assert.equal(next.hands.left_wrist.inferred,true);assert.equal(manager.process(next,50).length,1);
  manager.resetArms();next.hands.left_wrist.held=true;assert.equal(manager.process(next,100).length,0);
});
test('one broad hand sweep cannot hit two overlapping targets in the same frame',()=>{
  const manager=new TargetManager(calibration);manager.targets[1].x=manager.targets[0].x;manager.targets[1].y=manager.targets[0].y;
  const tracker=new HandTracker(),t=manager.targets[0];manager.process(tracker.update(frame(t.x-90,t.y,0),0,90),0);
  assert.equal(manager.process(tracker.update(frame(t.x,t.y,50),50,90),50).length,1);
  assert.equal(manager.process(tracker.update(frame(t.x,t.y,100),100,90),100).length,0);
  assert.equal(manager.process(tracker.update(frame(t.x,t.y,150),150,90),150).length,0);
});
