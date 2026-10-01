import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CalibrationManager } from '../src/calibration.js';
import { messages,t,initialLanguage,setLanguage } from '../src/i18n.js';
const pose=()=>({rect:{x:0,y:0,width:390,height:844},points:{left_shoulder:{x:145,y:330,valid:true},right_shoulder:{x:245,y:330,valid:true},left_wrist:{x:165,y:400,handValid:true},right_wrist:{x:225,y:400,handValid:true}}});
test('saved language wins over device preference and all explanatory keys have both languages',()=>{
  assert.equal(initialLanguage('ja',['en-US']),'ja');assert.equal(initialLanguage('en',['ja-JP']),'en');assert.equal(initialLanguage(null,['ja-JP']),'ja');assert.equal(initialLanguage('invalid',['en-GB']),'en');
  for(const [key,pair] of Object.entries(messages)){assert.equal(pair.length,2,key);assert.ok(pair.every(s=>typeof s==='string'&&s.length),key);assert.deepEqual([...pair[0].matchAll(/\{\w+\}/g)].map(x=>x[0]).sort(),[...pair[1].matchAll(/\{\w+\}/g)].map(x=>x[0]).sort(),key);}
  for(const name of ['index.html','privacy.html'])for(const match of readFileSync(new URL(`../${name}`,import.meta.url),'utf8').matchAll(/data-i18n(?:-label|-alt)?="([^"]+)"/g))assert.ok(messages[match[1]],`${name}: ${match[1]}`);
  setLanguage('en');assert.equal(t('until',{name:'RUSH',n:25}),'25 to RUSH');setLanguage('ja');
});
test('calibration exposes missing hands, steady progress and readiness without changing recognition gates',()=>{
  const c=new CalibrationManager(),p=pose();delete p.points.right_wrist;
  let r=c.update(p,0);assert.equal(r.reason,'calHands');assert.deepEqual(r.checks,{shoulders:true,hands:false,hips:true});assert.equal(r.progress,0);
  p.points.right_wrist=pose().points.right_wrist;r=c.update(p,200);assert.ok(r.progress>0&&r.progress<1);
  p.points.left_shoulder.valid=false;r=c.update(p,400);assert.equal(r.reason,'calShoulders');assert.equal(r.progress,0);assert.equal(r.ready,undefined);
  p.points.left_shoulder.valid=true;for(let now=500;now<=1300;now+=100)r=c.update(p,now);assert.equal(r.ready,true);assert.equal(r.progress,1);
  c.reset();assert.equal(c.wrists.size,0);assert.equal(c.samples.length,0);
});
test('full body shows missing hips and switching to upper body can complete without them',()=>{
  const c=new CalibrationManager();const r=c.update(pose(),0,'full');assert.equal(r.reason,'calHips');assert.equal(r.checks.hips,false);assert.equal(r.progress,0);
  c.reset();let ready;for(let now=0;now<=800;now+=100)ready=c.update(pose(),now,'upper');assert.equal(ready.ready,true);assert.equal(ready.calibration.bodyMode,'upper');
});
