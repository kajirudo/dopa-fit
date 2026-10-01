// SPDX-License-Identifier: MIT
// Regenerate cache-manifest.js with `npm run audit:files` after changing a release.
importScripts('./cache-manifest.js','./optional-manifest.js');
const cacheName = `dopa-fit-${self.DOPA_CACHE.version}`;
const requests = new Map();
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  try {
    // Verify every byte before making the release available offline.
    for (const file of self.DOPA_CACHE.files) {
      const url = new URL(file.path, self.registration.scope);
      const response = await fetch(url, {cache: 'reload'});
      if (!response.ok) throw new Error(`Cache fetch failed: ${file.path}`);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256) throw new Error(`Release changed during install: ${file.path}`);
      await cache.put(url, response);
    }
    await cache.put(new URL('__offline_ready__', self.registration.scope), new Response('complete'));
  } catch (error) { await caches.delete(cacheName); throw error; }
  // An update waits. It never replaces the running game automatically.
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if ((name.startsWith('dopa-fit-') && name !== cacheName) || (name.startsWith('dopa-record-') && name !== `dopa-record-${self.DOPA_OPTIONAL.version}`)) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin) return;
  let path = url.pathname.slice(scope.pathname.length);
  if (!path || path === 'index.html') path = 'index.html';
  const optional=self.DOPA_OPTIONAL.files.find(f=>f.path===path);
  if(optional){event.respondWith((async()=>{
    const cache=await caches.open(`dopa-record-${self.DOPA_OPTIONAL.version}`),stored=await cache.match(event.request);if(stored)return stored;
    const response=await fetch(event.request);if(!response.ok)return response;
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==optional.sha256)return new Response('Optional asset integrity mismatch',{status:503});await cache.put(event.request,response.clone());return response;
  })());return;}
  if (!self.DOPA_CACHE.files.some(f => f.path === path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName), stored = await cache.match(new URL(path, self.registration.scope));
    // Never mix a partial new release into the active release.
    return stored || new Response('Offline cache incomplete. Reconnect and update.', {status:503});
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CLIENT_STATE') { requests.get(event.data.nonce)?.set(event.source.id, event.data.busy); return; }
  if (event.data?.type === 'CHECK_READY') event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    if (await cache.match(new URL('__offline_ready__', self.registration.scope))) event.source?.postMessage({type:'OFFLINE_READY'});
  })());
  if (event.data?.type === 'ACTIVATE') event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const nonce = `${Date.now()}`, states = new Map(); requests.set(nonce, states);
    for (const client of clients) client.postMessage({type:'STATE_REQUEST', nonce});
    await new Promise(resolve => setTimeout(resolve, 800)); requests.delete(nonce);
    if (clients.some(client => states.get(client.id) !== false)) event.source?.postMessage({type:'UPDATE_BUSY'});
    else await self.skipWaiting();
  })());
});
