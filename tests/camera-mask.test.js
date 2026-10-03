import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCameraFit} from '../src/camera.js';
import {maskBounds,SafeScene,SAFE_DISPLAY_HOLD_MS} from '../src/safe-scene.js';
import {faceResultIssue,validFaceResult} from '../src/face-tracker.js';

test('both body modes fill the screen; legacy automatic full-body contain migrates once and explicit choices persist',()=>{
  assert.equal(initialCameraFit({bodyMode:'full'}),'cover');
  assert.equal(initialCameraFit({bodyMode:'upper'}),'cover');
  assert.equal(initialCameraFit({bodyMode:'full',cameraFit:'contain'}),'cover');
  assert.equal(initialCameraFit({bodyMode:'full',cameraFit:'contain',cameraViewVersion:2}),'contain');
  assert.equal(initialCameraFit({bodyMode:'upper',cameraFit:'contain'}),'contain');
});
test('compact opaque shield contains the entire detected face and leaves a hand below the chin visible',()=>{
  const face={x:140,y:90,width:100,height:138},b=maskBounds(face);
  assert.ok(b.x<=face.x&&b.y<=face.y);
  assert.ok(b.x+b.width>=face.x+face.width&&b.y+b.height>=face.y+face.height);
  assert.ok(b.radius<face.x-b.x&&b.radius<face.y-b.y);
  assert.ok(b.width*b.height<face.width*face.height*1.8*2*.5);
  assert.ok(b.y+b.height<244); // A raised hand near the chin remains outside the shield.
});

test('only an already-masked snapshot bridges inference gaps; stale frames never become recording-safe',()=>{
  const scene=Object.assign(Object.create(SafeScene.prototype),{valid:true,lastSafeAt:100,fallback(){this.valid=false;}});
  assert.equal(scene.recordSafe(300),true);
  assert.equal(scene.check(301,0),true);
  assert.equal(scene.recordSafe(301),false);
  assert.equal(scene.check(100+SAFE_DISPLAY_HOLD_MS,0),true);
  assert.equal(scene.check(101+SAFE_DISPLAY_HOLD_MS,0),false);
  scene.valid=false;scene.lastSafeAt=600;
  assert.equal(scene.check(601,0),false); // A rejected frame cannot revive the previous view.
  assert.equal(scene.recordSafe(601),false);
  scene.valid=true;
  assert.equal(scene.recordSafe(599),false);
});
test('face loss, oversized detections and stale processing have actionable reasons and never authorize raw footage',()=>{
  const result={capturedAt:100,faces:[{x:.3,y:.3,width:.2,height:.3,roll:0}]};
  assert.equal(faceResultIssue(result,199),null);assert.equal(validFaceResult(result,199),true);
  assert.equal(faceResultIssue({...result,faces:[]},199),'no-face');
  assert.equal(faceResultIssue({...result,faces:[...result.faces,...result.faces]},199),'multiple');
  assert.equal(faceResultIssue({...result,faces:[{x:0,y:0,width:.9,height:.85,roll:0}]},199),'too-close');
  assert.equal(faceResultIssue(result,301),'delayed');assert.equal(validFaceResult(result,301),false);
  assert.equal(validFaceResult(null,199),false);
});
