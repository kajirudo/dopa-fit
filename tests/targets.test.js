import test from 'node:test';
import assert from 'node:assert/strict';
import { targetPositions, TargetManager, GameEngine, BEAT_MS } from '../src/game.js';
const calibration = { center: { x: 180, y: 200 }, shoulder: 90, rect: { x: 0, y: 0, width: 360, height: 600 } };
const pose = (x, y, id, time) => ({ id, capturedAt: time, points: { left_shoulder: { x: 135, y: 200, valid: true }, right_shoulder: { x: 225, y: 200, valid: true }, left_wrist: { x, y, valid: true }, right_wrist: { x: 180, y: 400, valid: true } } });
test('eight wide destinations fit; compact mode merges overlapping larger targets and shrinks travel', () => {
  const wide = targetPositions(calibration), small = targetPositions(calibration, 'small');
  assert.equal(wide.length, 8); assert.equal(small.length, 4);
  for (const p of wide) {
    assert.ok(p.x-p.radius>=0 && p.x+p.radius<=360 && p.y-p.radius>=0 && p.y+p.radius<=600);
    const compact = small.filter(q => q.lane===p.lane).reduce((a,b)=>Math.abs(b.height-p.height)<Math.abs(a.height-p.height)?b:a);
    assert.ok(Math.hypot(compact.x-180,compact.y-200)<Math.hypot(p.x-180,p.y-200));
  }
  const clipped = targetPositions({...calibration,center:{x:180,y:35},rect:{x:0,y:0,width:360,height:240}});
  assert.ok(clipped.length < 8);
  for (let i=0;i<clipped.length;i++) for(let j=i+1;j<clipped.length;j++) assert.ok(Math.hypot(clipped[i].x-clipped[j].x,clipped[i].y-clipped[j].y)>=12);
});
test('HIT changes the suggested side, previews the next destination and replaces on a future beat', () => {
  const manager = new TargetManager(calibration,true); manager.advance(0,0);
  const t=manager.targets[0], initial={x:t.x,y:t.y};
  manager.process(pose(180,400,1,0),0);
  assert.equal(manager.process(pose(t.x,t.y,2,50),50).length,1);
  assert.equal(manager.leadId,1);assert.equal(t.waiting,true);assert.equal(manager.active.length,1);
  assert.equal(manager.preview.lane,0);assert.ok(manager.preview.y<initial.y);
  assert.ok(t.relocateAt>=400 && t.relocateAt<400+BEAT_MS);
  assert.ok(Math.abs(t.relocateAt/BEAT_MS-Math.round(t.relocateAt/BEAT_MS))<1e-9);
  assert.equal(manager.process(pose(manager.preview.x,manager.preview.y,3,100),100).length,0);
  const planned={...manager.preview}; manager.advance(t.relocateAt);
  assert.equal(manager.active.length,2);assert.equal(manager.preview,null);assert.equal(t.x,planned.x);assert.equal(t.y,planned.y);
});
test('a slow player can hit off beat or with either hand; a held hand cannot hit a newly arriving target', () => {
  const manager=new TargetManager(calibration,true);manager.advance(0);
  const t=manager.targets[1];manager.process(pose(180,400,1,0),0);
  const input=pose(180,400,2,137);input.points.right_wrist={x:t.x,y:t.y,valid:true};
  assert.equal(manager.process(input,137)[0].wristId,'right_wrist');
  const next={...manager.preview}, due=t.relocateAt;
  manager.process(pose(next.x,next.y,3,due-1),due-1);manager.advance(due);
  assert.equal(manager.process(pose(next.x,next.y,4,due),due).length,0);
});
test('successes alternate through all four heights on each side without growing target lists', () => {
  const manager=new TargetManager(calibration,true);manager.advance(0);
  const visited=[new Set(),new Set()];let now=0,id=0;
  for(let n=0;n<24;n++) {
    const target=manager.targets[n%2];manager.advance(now);
    visited[target.id].add(target.height);
    manager.process(pose(180,400,++id,now),now);
    assert.equal(manager.process(pose(target.x,target.y,++id,now+50),now+50).length,1);
    now=Math.max(now+100,target.relocateAt);manager.advance(now);
    assert.ok(manager.active.length<=2 && manager.targets.length===2);
  }
  assert.equal(visited[0].size,4);assert.equal(visited[1].size,4);
});
test('quiet expirations and FEVER / REST patterns never decrease progress or generate HIT events', () => {
  const game=new GameEngine(calibration,3);game.energy.energy=150;
  game.targets.advance(0,0,'BUILD');game.targets.advance(5000,5,'BUILD');
  assert.ok(game.targets.preview);game.targets.advance(5100,5.1,'FEVER');
  assert.equal(game.energy.energy,150);assert.equal(game.targets.active.length,4);
  const normal=new TargetManager(calibration,true), fever=new TargetManager(calibration,true), rest=new TargetManager(calibration,true);
  fever.cycle='FEVER';rest.cycle='REST';
  assert.notEqual(normal.destination(1,0).height,fever.destination(1,0).height);
  for(let i=0;i<10;i++)assert.ok([1,2].includes(rest.destination(0,i).height));
});
