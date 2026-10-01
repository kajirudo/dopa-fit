import test from 'node:test';
import assert from 'node:assert/strict';
import { EnergySystem, BAR_SECONDS, targetPositions, TargetManager, WorkoutTracker } from '../src/game.js';
import { FEVER_STAGES } from '../src/fever.js';
import { FeedbackDirector } from '../src/feedback.js';
import { MusicEngine } from '../src/music.js';
import { AudioManager } from '../src/audio.js';
import { CalibrationManager } from '../src/calibration.js';
import { mapPose } from '../src/coordinates.js';
import { PoseDetector } from '../src/pose.js';

test('five successive fevers keep progress, bank excess ENERGY, respect calm and cap at five',()=>{
  const energy=new EnergySystem(),director=new FeedbackDirector();energy.energy=650;let time=0;
  for(let n=1;n<=6;n++) {
    energy.tick(time,0);assert.equal(energy.cycle,'FEVER');assert.equal(energy.feverLevel,Math.min(5,n));
    assert.equal(energy.lastFeverEnergy,n*100);const cue=director.update(energy);assert.equal(cue.kind,'fever');assert.equal(cue.level,Math.min(5,n));
    assert.ok(cue.title.includes(FEVER_STAGES[Math.min(4,n-1)].name));assert.equal(director.update(energy),null);
    time+=energy.feverDuration;energy.tick(time,0);assert.equal(energy.cycle,'REST');director.update(energy);
    energy.tick(time+energy.restDuration-.01,0);assert.equal(energy.cycle,'REST');assert.equal(energy.feverLevel,Math.min(5,n));
    time+=energy.restDuration;assert.equal(energy.energy,650);assert.equal(energy.layer,5);
  }
  energy.tick(time,0);assert.equal(energy.cycle,'BUILD');assert.equal(energy.nextFeverLevel,5);assert.equal(energy.energy,650);
});
test('stages have distinct musical patterns and colors, finite pentatonic notes and increasing tempos',()=>{
  const signatures=new Set(),played=[],engine=new MusicEngine({play:(...voice)=>played.push(voice)},()=>({}));engine.layer=5;engine.cycle='FEVER';
  assert.equal(new Set(FEVER_STAGES.map(s=>s.color)).size,5);
  for(const stage of FEVER_STAGES) {
    engine.feverLevel=stage.level;played.length=0;for(let i=0;i<32;i++)engine.schedule(i,i*60/stage.bpm/4);
    signatures.add(JSON.stringify(played));assert.ok(played.filter(v=>v[0]==='club-kick').length>=8);
    for(const voice of played.filter(v=>['synth','bass','melody','pulse-bass','acid-bass','pluck','rave'].includes(v[0]))) {assert.ok(Number.isFinite(voice[2]));assert.ok([0,2,4,7,9].includes(voice[2]%12));}
    const audio=new AudioManager(),hits=[];audio.ctx={currentTime:0};audio.play=(...v)=>hits.push(v);
    audio.hit(0,stage.level);audio.celebrate('fever',stage.level);
    assert.ok(hits.length<12);for(const voice of hits)assert.ok([0,2,4,7,9].includes(voice[2]%12));
  }
  assert.equal(signatures.size,5);
});
test('new FEVER level enters the music on a bar boundary and persists through the calm section',()=>{
  let state={layer:5,cycle:'FEVER',feverLevel:1};const audio={ctx:{currentTime:0,state:'running'},play(){}};
  const engine=new MusicEngine(audio,()=>state);engine.nextTime=.06;engine.tick();assert.equal(engine.feverLevel,1);
  state={...state,feverLevel:5};audio.ctx.currentTime=.15;engine.tick();assert.equal(engine.feverLevel,1);
  for(let i=2;i<=16;i++){audio.ctx.currentTime=i*60/FEVER_STAGES[0].bpm/4;engine.tick();}assert.equal(engine.feverLevel,5);
  engine.cycle='REST';const voices=[];engine.audio.play=(kind)=>voices.push(kind);for(let i=0;i<16;i++)engine.schedule(i,i*.134);
  assert.ok(!voices.includes('synth')&&!voices.includes('melody'));assert.equal(engine.feverLevel,5);
});
const closeFrame = time=>({id:time+1,capturedAt:time,width:640,height:480,points:{left_shoulder:{x:.25,y:.4,score:1},right_shoulder:{x:.75,y:.4,score:1},left_wrist:{x:.47,y:.6,score:1},right_wrist:{x:.53,y:.6,score:1}}});
test('upper-body can calibrate broad shoulders outside the visible portrait crop, but hands must be visible',()=>{
  const manager=new CalibrationManager();let result;
  for(let time=0;time<=800;time+=100)result=manager.update(mapPose(closeFrame(time),390,844,time,'cover','upper'),time,'upper');
  assert.equal(result.ready,true);assert.ok(result.calibration.shoulder>390);assert.equal(result.calibration.bodyMode,'upper');
  const mapped=mapPose(closeFrame(0),390,844,0,'cover','upper');assert.equal(mapped.points.left_shoulder.valid,true);
  assert.equal(mapPose(closeFrame(0),390,844,0,'cover','full').points.left_shoulder.valid,false);
  const offscreen=closeFrame(0);offscreen.points.left_wrist.x=.05;assert.equal(mapPose(offscreen,390,844,0,'cover','upper').points.left_wrist.handValid,false);
  for(const dynamic of [false,true]) for(const t of new TargetManager(result.calibration,dynamic).targets)assert.ok(t.x-t.radius>=0&&t.x+t.radius<=390&&t.y-t.radius>=0&&t.y+t.radius<=844);
  const positions=targetPositions(result.calibration);assert.equal(positions.length,8);assert.equal(new Set(positions.map(p=>p.height)).size,4);
});
test('full-body mode asks for visible hips, and upper-body never scores unseen lower-body movements',()=>{
  const manager=new CalibrationManager();let result;
  for(let time=0;time<=800;time+=100)result=manager.update(mapPose(closeFrame(time),390,844,time,'contain','full'),time,'full');
  assert.ok(result.message.includes('腰'));assert.equal(result.ready,undefined);
  manager.reset();
  for(let time=0;time<=800;time+=100){const f=closeFrame(time);f.points.left_hip={x:.4,y:.8,score:1};f.points.right_hip={x:.6,y:.8,score:1};result=manager.update(mapPose(f,390,844,time,'contain','full'),time,'full');}
  assert.equal(result.ready,true);assert.equal(result.calibration.bodyMode,'full');
  const tracker=new WorkoutTracker(),c={center:{x:180,y:200},shoulder:90,bodyMode:'upper'};
  const frame=(x,y)=>({points:{left_shoulder:{x:135,y:200,valid:true},right_shoulder:{x:225,y:200,valid:true},left_hip:{x:x-20,y,valid:true},right_hip:{x:x+20,y,valid:true}}});
  tracker.process(frame(180,350),c,0);tracker.process(frame(250,400),c,100);assert.deepEqual(tracker.process(frame(250,400),c,300),[]);
});
test('upper-body inference uses the full camera so cropped-out shoulders remain available; mode change resets ROI',async()=>{
  const detector=new PoseDetector(),video={videoWidth:640,videoHeight:480,readyState:4,currentTime:1};let reset=0;
  detector.inputMode='visible-crop';detector.detector={reset(){reset++;},estimatePoses:async input=>{assert.equal(input,video);return[{keypoints:[{name:'left_shoulder',x:160,y:192,score:1}]}];}};
  const f=await detector.estimate(video,performance.now(),{width:390,height:844,fit:'cover',bodyMode:'upper'});
  assert.equal(detector.cropCanvas,undefined);assert.equal(detector.inputMode,'full-camera');assert.equal(reset,1);assert.equal(f.points.left_shoulder.x,.25);
});
