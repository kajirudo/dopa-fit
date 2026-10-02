// SPDX-License-Identifier: MIT
import { OPTIONAL_PACK } from './optional-assets.js';
let loading;
let status={phase:'idle',path:null};
export const recordPackStatus=()=>({...status});
export function loadRecordPack(){return loading??=load().catch(error=>{loading=null;throw error;});}
async function load(){
  if(OPTIONAL_PACK.files.reduce((n,f)=>n+f.bytes,0)>32*1024*1024)throw new Error('Optional pack exceeds its limit');
  status={phase:'cache-open',path:null};const cache=await caches.open(`dopa-record-${OPTIONAL_PACK.version}`);
  for(const f of OPTIONAL_PACK.files){
    status={phase:'cache-match',path:f.path};const url=new URL('../'+f.path,import.meta.url);let response=await cache.match(url);
    if(!response){status.phase='fetch';response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('Record assets unavailable');
      status.phase='body';const bytes=await response.arrayBuffer();status.phase='hash';const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(hash!==f.sha256)throw new Error('Record asset integrity mismatch');status.phase='cache-put';const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');await cache.put(url,new Response(bytes,{headers,status:response.status}));}
  }
  status={phase:'ready',path:null};
  return OPTIONAL_PACK;
}
