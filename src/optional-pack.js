// SPDX-License-Identifier: MIT
import { OPTIONAL_PACK } from './optional-assets.js';
let loading;
export function loadRecordPack(){return loading??=load().catch(error=>{loading=null;throw error;});}
async function load(){
  if(OPTIONAL_PACK.files.reduce((n,f)=>n+f.bytes,0)>32*1024*1024)throw new Error('Optional pack exceeds its limit');
  const cache=await caches.open(`dopa-record-${OPTIONAL_PACK.version}`);
  for(const f of OPTIONAL_PACK.files){
    const url=new URL('../'+f.path,import.meta.url);let response=await cache.match(url);
    if(!response){response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('Record assets unavailable');
      const bytes=await response.clone().arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(hash!==f.sha256)throw new Error('Record asset integrity mismatch');await cache.put(url,response);}
  }
  return OPTIONAL_PACK;
}
