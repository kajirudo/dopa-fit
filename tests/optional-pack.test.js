// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('optional assets consume one body, verify bytes before caching, and permit retry after an integrity failure',async()=>{
  const originalCaches=globalThis.caches,originalFetch=globalThis.fetch;
  const data=await readFile(new URL('../optional/vision/vision_bundle.mjs',import.meta.url));
  let corrupt=true,requests=0,stored=null;
  globalThis.caches={open:async()=>({
    match:async url=>url.pathname.endsWith('/vision_bundle.mjs')?null:new Response('already cached'),
    put:async(url,response)=>{stored={path:url.pathname,bytes:new Uint8Array(await response.arrayBuffer()),encoding:response.headers.get('content-encoding')};}
  })};
  globalThis.fetch=async()=>{requests++;const response=new Response(corrupt?'corrupt':data,{headers:{'content-type':'text/javascript','content-encoding':'gzip'}});response.clone=()=>{throw new Error('Body must not be cloned');};return response;};
  try{
    const {loadRecordPack,recordPackStatus}=await import('../src/optional-pack.js?one-body-test');
    await assert.rejects(loadRecordPack(),/integrity mismatch/);assert.equal(stored,null);
    corrupt=false;await loadRecordPack();assert.equal(requests,2);
    assert.deepEqual(stored.bytes,new Uint8Array(data));assert.equal(stored.encoding,null);
    assert.deepEqual(recordPackStatus(),{phase:'ready',path:null});
    await loadRecordPack();assert.equal(requests,2);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;
  }
});
