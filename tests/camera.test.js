import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraManager } from '../src/camera.js';
test('camera permission granted after cancellation immediately releases every track', async () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'), secure=globalThis.isSecureContext;
  let grant,stopped=0,requested;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(options){requested=options;return new Promise(resolve=>grant=resolve);}}}});globalThis.isSecureContext=true;
  try{
    const video={pause(){},play(){throw Error('Cancelled video must never be played');}},camera=new CameraManager(video);
    const pending=camera.start();camera.stop();grant({getTracks:()=>[{stop(){stopped++;}},{stop(){stopped++;}}]});
    await assert.rejects(pending,{name:'AbortError'});assert.equal(stopped,2);assert.equal(camera.stream,null);assert.equal(video.srcObject,null);assert.equal(requested.audio,false);assert.equal(requested.video.facingMode.ideal,'user');
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;globalThis.isSecureContext=secure;}
});
