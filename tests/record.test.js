import test from 'node:test';
import assert from 'node:assert/strict';
import {BudgetController,HighlightPool} from '../src/highlight-budget.js';
import {planHighlights,qualityGate,similarity} from '../src/highlight-planner.js';
import {RECORD_CONFIG,BUDGETS,MiB} from '../src/record-config.js';
import {validFaceResult} from '../src/face-tracker.js';
import {crossfade} from '../src/audio-transition.js';
import {Histogram} from '../src/poc-metrics.js';
import {MusicEngine} from '../src/music.js';
import {EnergySystem} from '../src/game.js';
import {preferredRecorderMime} from '../src/record-session.js';
const candidate=(id,extra={})=>({id,start:id*4,end:id*4+4,duration:4,quality:1,privacySafe:true,tracking:1,audio:true,motion:.8,hitDensity:1,stage:Math.min(5,Math.floor(id/3)),cycleId:Math.floor(id/3),variant:['meteor','rings','waves','star-rain'][id%4],actions:[id%2,1-id%2,0],evolution:id%3===0?1:0,fever:id>3?1:0,blob:{size:600_000},...extra});
test('unknown devices stay LOW even after hours of high FPS; validated promotion is slow and downgrade protects capacity',()=>{
  const unknown=new BudgetController();for(let time=0;time<7200000;time+=1000)unknown.observe({fps:60,poseP95:30,faceP95:40,encodeWait:0,dropped:0},time);assert.equal(unknown.profile,'LOW');
  const b=new BudgetController({validatedMax:'HIGH'}),good={fps:30,poseP95:100,faceP95:100,encodeWait:0,dropped:0};b.observe(good,0);b.observe(good,59999);assert.equal(b.profile,'LOW');b.observe(good,60000);assert.equal(b.profile,'NORMAL');b.observe(good,120000);assert.equal(b.profile,'HIGH');
  b.observe({...good,encodeWait:2000},121000);b.observe({...good,encodeWait:2000},130999);assert.equal(b.profile,'HIGH');b.observe({...good,encodeWait:2000},131000);assert.equal(b.profile,'NORMAL');
});
test('3/10/20 minute and multi-hour candidate streams stay bounded and preserve beginning, evolution and peak at LOW',()=>{
  for(const seconds of [180,600,1200,72000]){
    const controller=new BudgetController({validatedMax:'HIGH'}),pool=new HighlightPool(controller);controller.profile='HIGH';
    const anchors=new Map();for(let id=0;id<seconds/4;id++){
      if(id===50){controller.profile='LOW';pool.tidy();}
      const c=candidate(id,{stage:Math.min(5,id),anchor:id===0?'beginning':id<=5?`growth:${id}`:id===6?'peak':null,evolution:id<=5?1:0});
      const reservation=pool.reserve(RECORD_CONFIG.reservationBytes);if(reservation)pool.commit(reservation,c);
      if(id<=6)anchors.set(c.anchor,c.id);
      assert.ok(pool.usedBytes<=controller.bytes);assert.ok(pool.anchorBytes<=12*MiB);assert.ok(pool.clips.length<=RECORD_CONFIG.maxCandidates);assert.ok(pool.reservations.size<=1);
    }
    for(const [role,id] of anchors)assert.equal(pool.clips.find(c=>c.anchor===role)?.id,id);assert.ok(pool.clips.some(c=>c.id>10));pool.clear();assert.equal(pool.usedBytes,0);
  }
});
test('reservations, metadata, invalid size and eviction release resources instead of exceeding the budget',()=>{
  const pool=new HighlightPool();const id=pool.reserve(1000);assert.equal(pool.usedBytes,1000);assert.equal(pool.commit(id,candidate(1)),false);assert.equal(pool.usedBytes,0);
  const r=pool.reserve(RECORD_CONFIG.reservationBytes),c=candidate(0,{anchor:'beginning'});assert.equal(pool.commit(r,c),true);let closed=0;c.bitmap={close:()=>closed++};pool.clear();assert.equal(closed,1);assert.equal(c.blob,null);
  assert.equal(pool.reserve(BUDGETS.LOW+1),null);assert.equal(pool.reservations.size,0);
});
test('planner keeps chronology and growth, suppresses similar fever, follows 15/30/45/60 configurations',()=>{
  const clips=Array.from({length:48},(_,id)=>candidate(id,{anchor:id===0?'beginning':id%3===0&&id<18?`growth:${Math.floor(id/3)}`:null}));
  clips.push(candidate(50,{quality:.4,hitDensity:1000}));
  for(const targetDuration of [15,30,45,60]){
    const plan=planHighlights(clips,{...RECORD_CONFIG,targetDuration});assert.ok(plan.duration<=targetDuration+.001);assert.ok(plan.duration>targetDuration-2);assert.equal(plan.segments[0].id,0);assert.ok(plan.segments.some(c=>c.stage===5));assert.ok(plan.segments.some(c=>c.stage>0&&c.stage<5));
    assert.equal(new Set(plan.segments.map(c=>c.id)).size,plan.segments.length);assert.ok(!plan.segments.some(c=>c.id===50));
    for(let i=1;i<plan.segments.length;i++)assert.ok(plan.segments[i].start>=plan.segments[i-1].end);
    const fevers=plan.segments.filter(c=>c.fever);for(const id of new Set(fevers.map(c=>c.cycleId))){const group=fevers.filter(c=>c.cycleId===id);assert.ok(group.length<=2);assert.ok(group.reduce((n,c)=>n+c.duration,0)<=12);}
  }
  assert.ok(similarity(clips[20],clips[21])<similarity(clips[20],{...clips[20],id:200,start:84,end:88}));
});
test('short, static, paused and privacy-failed sessions never invent footage or unearned stages',()=>{
  for(const extra of [{privacySafe:false},{tracking:.2},{motion:0},{paused:true},{preparing:true},{audio:false}])assert.equal(qualityGate(candidate(0,extra)),false);
  const plan=planHighlights([candidate(0,{duration:1,end:1,stage:0,evolution:0,anchor:'beginning'})]);assert.equal(plan.segments.length,1);assert.equal(plan.duration,1+RECORD_CONFIG.outroDuration);assert.equal(plan.segments[0].stage,0);
  assert.equal(planHighlights([]).duration,0);
});
test('face loss, multiple people, stale results and abnormal bounds fail closed',()=>{
  const r={capturedAt:100,faces:[{x:.3,y:.3,width:.2,height:.3,roll:.2}]};assert.equal(validFaceResult(r,299),true);assert.equal(validFaceResult(r,301),false);assert.equal(validFaceResult(r,99),false);
  for(const faces of [[],[...r.faces,...r.faces],[{...r.faces[0],x:NaN}],[{...r.faces[0],width:0}]])assert.equal(validFaceResult({...r,faces},100),false);
});
test('growth is retained at rest, and 500 to 800 ENERGY creates four further waves with bounded scalar state',()=>{
  const e=new EnergySystem();let seconds=0;const variants=[];
  for(let level=1;level<=8;level++){
    for(let hit=0;hit<20;hit++)e.reward('hit');e.tick(seconds,0);assert.equal(e.stageLevel,Math.min(5,level));assert.equal(e.cycleId,level);assert.equal(e.cycle,'FEVER');e.presentedStageLevel=e.stageLevel;
    if(level>=5)variants.push(e.variant);
    seconds+=e.feverDuration;e.tick(seconds,0);assert.equal(e.cycle,'REST');const stage=e.stageLevel;
    e.tick(seconds+e.restDuration-.01,0);assert.equal(e.cycle,'REST');assert.equal(e.stageLevel,stage);seconds+=e.restDuration;e.tick(seconds,0);assert.equal(e.cycle,'BUILD');
  }
  assert.equal(new Set(variants).size,4);assert.equal(e.energy,800);assert.ok(!Object.values(e).some(Array.isArray));
});

test('audio transitions mix only a short tail/head and stay finite across cuts',()=>{const tail=new Float32Array(1920).fill(.5),head=new Float32Array(1920).fill(-.5),mixed=crossfade(tail,head);assert.equal(mixed.length,1920);assert.ok(mixed[0]>.49);assert.ok(mixed.at(-1)<-.49);assert.ok([...mixed].every(Number.isFinite));assert.equal(tail[0],.5);});

test('all four Supernova variations produce distinct musical lead/fill patterns',()=>{const signatures=new Set();for(const variant of ['meteor','rings','waves','star-rain']){const played=[],music=new MusicEngine({play:(...v)=>played.push(v)},()=>({}));Object.assign(music,{cycle:'FEVER',feverLevel:5,variant});for(let i=0;i<32;i++)music.schedule(i,i/4);signatures.add(JSON.stringify(played));}assert.equal(signatures.size,4);});

test('trimming a growth clip keeps its actual evolution moment inside the selected range',()=>{const clips=Array.from({length:20},(_,id)=>candidate(id,{stage:id<3?0:Math.min(5,Math.floor(id/3)),evolution:id===3?1:0,anchor:id===0?'beginning':id===3?'growth:1':null,evolutions:id===3?[{level:1,at:2.9}]:[]}));const plan=planHighlights(clips,{...RECORD_CONFIG,targetDuration:15,storyWeights:{beginning:.15,growth:.1,peak:.75}});const growth=plan.segments.find(c=>c.id===3);assert.ok(growth);assert.ok(growth.duration<4);assert.ok(growth.offset>0);assert.ok(growth.offset<=2.9&&growth.offset+growth.duration>2.9);assert.ok(growth.offset+growth.duration<=4);});

test('PoC leaves missing measurements unavailable and keeps latency histograms at a fixed size',()=>{const h=new Histogram();assert.equal(h.p95,null);for(let i=0;i<100000;i++)h.add(i%100);assert.equal(h.bins.length,201);assert.equal(h.count,100000);assert.equal(h.p95,100);});

test('capture prefers an editable codec when H.264 recording exists but native decoding does not',async()=>{
  const Recorder={isTypeSupported:()=>true},AudioDecoder={isConfigSupported:async()=>({supported:true})};
  const VideoDecoder={isConfigSupported:async({codec})=>({supported:codec==='vp8'})};
  assert.equal(await preferredRecorderMime({Recorder,VideoDecoder,AudioDecoder}),'video/webm;codecs=vp8,opus');
  assert.equal(await preferredRecorderMime({Recorder,VideoDecoder:{isConfigSupported:async()=>({supported:true})},AudioDecoder}),'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
});
test('codec probes preserve playable capture on Safari without decoders, unsupported codecs, or rejected probes',async()=>{
  const Recorder={isTypeSupported:type=>type.startsWith('video/mp4')};
  for(const VideoDecoder of [null,{isConfigSupported:async()=>({supported:false})},{isConfigSupported:async()=>{throw new Error('Unsupported configuration');}}]){
    assert.equal(await preferredRecorderMime({Recorder,VideoDecoder,AudioDecoder:{isConfigSupported:async()=>({supported:false})}}),'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  }
  assert.equal(await preferredRecorderMime({Recorder:{isTypeSupported:()=>false},VideoDecoder:null,AudioDecoder:null}),null);
});
