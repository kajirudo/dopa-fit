// SPDX-License-Identifier: MIT
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'), temp=await fs.mkdtemp(path.join(os.tmpdir(),'dopa-fit-pwa-'));
 const manifest=JSON.parse(await fs.readFile(path.join(root,'docs/distribution-manifest.json')));
 for(const file of [...manifest.files,{path:'sw.js'},{path:'cache-manifest.js'}]){const target=path.join(temp,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,file.path),target);}
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
 const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),file=path.resolve(temp,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(temp+path.sep))throw Error();res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.setHeader('Cache-Control','no-store');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const result={date:new Date().toISOString(),environment:'Desktop Chromium synthetic test only',checks:[]};
 let browser,fallback;
 try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}}),a=await context.newPage(),b=await context.newPage();
  await a.goto(base);await a.waitForFunction(()=>navigator.serviceWorker.controller&&document.getElementById('offline').textContent.includes('OK'));
  await a.evaluate(async()=>{window.testApp=(await import('./src/app.js')).app;});await a.locator('#demo').click();await a.waitForFunction(()=>window.testApp.state==='PLAYING');
  await b.goto(base);await b.evaluate(async()=>{window.testApp=(await import('./src/app.js')).app;});
  const old=manifest.version, source=await fs.readFile(path.join(root,'cache-manifest.js'),'utf8');
  await fs.writeFile(path.join(temp,'cache-manifest.js'),source.replace(old,old+'-update-test'));
  await fs.appendFile(path.join(temp,'sw.js'),'\n// synthetic update test\n');
  await b.evaluate(async()=>{await window.testApp.registration.update();});await b.waitForFunction(()=>!!window.testApp.registration.waiting,{},{timeout:30000});
  await b.locator('#update').click();await b.waitForFunction(()=>document.getElementById('update').textContent.includes('ほかのタブ'));
  assert.equal(await a.evaluate(()=>window.testApp.state),'PLAYING');assert.ok(await b.evaluate(()=>!!window.testApp.registration.waiting));result.checks.push('Update is blocked while another tab plays');
  // Browser focus may pause a, which is still intentionally a busy session.
  await a.locator('#finish').click();await a.locator('#result-close').click();await b.locator('#update').click();await b.waitForFunction(()=>!document.getElementById('update-banner').classList.contains('hidden')===false);
  await b.waitForFunction(async version=>{const keys=await caches.keys();return keys.length===1&&keys[0]==='dopa-fit-'+version+'-update-test';},old);
  const keys=await b.evaluate(()=>caches.keys());assert.deepEqual(keys,['dopa-fit-'+old+'-update-test']);result.checks.push('Idle update activates atomically and deletes the old cache');
  await b.evaluate(async()=>{window.testApp=(await import('./src/app.js')).app;});
  // Wrong hash deliberately prevents installing a partial release.
  await fs.writeFile(path.join(temp,'cache-manifest.js'),source.replace(old,old+'-corrupt-test').replace(manifest.files[0].sha256,'0'.repeat(64)));
  await fs.appendFile(path.join(temp,'sw.js'),'\n// corrupt cache test\n');
  await b.evaluate(async()=>{await window.testApp.registration.update();});
  await b.waitForFunction(()=>!window.testApp.registration.installing&&!window.testApp.registration.waiting,{},{timeout:30000});
  assert.deepEqual(await b.evaluate(()=>caches.keys()),['dopa-fit-'+old+'-update-test']);result.checks.push('Corrupt update is rejected; the active release remains intact');
  await browser.close();browser=null;
  await fs.copyFile(path.join(root,'cache-manifest.js'),path.join(temp,'cache-manifest.js'));await fs.copyFile(path.join(root,'sw.js'),path.join(temp,'sw.js'));
  fallback=await chromium.launch({headless:true,args:['--disable-webgl','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const wc=await fallback.newContext({permissions:['camera']}),p=await wc.newPage();const requests=[],pageErrors=[];wc.on('request',r=>requests.push(r.url()));p.on('pageerror',e=>pageErrors.push(e.message));
  await p.addInitScript(()=>{for(const type of [globalThis.HTMLCanvasElement,globalThis.OffscreenCanvas])if(type){const original=type.prototype.getContext;type.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};}});
  await p.goto(base);await p.evaluate(async()=>{window.testApp=(await import('./src/app.js')).app;});await p.locator('#start').click();await p.waitForFunction(()=>window.testApp.pose.detector||window.testApp.state==='ERROR',{},{timeout:45000});
  const actual=await p.evaluate(async()=>{const a=window.testApp;if(a.state==='ERROR')throw Error(document.getElementById('stage-message').textContent);cancelAnimationFrame(a.raf);a.inferenceInterval=Infinity;a.generation++;while(a.pose.busy)await new Promise(r=>setTimeout(r,10));await new Promise(r=>setTimeout(r,60));const output=await a.pose.estimate(document.getElementById('camera'),performance.now());a.pause();return{backend:a.pose.backend,completed:!!output,keypoints:Object.keys(output?.points||{}).length,tensors:tf.memory().numTensors};});
  assert.equal(actual.backend,'wasm');assert.equal(actual.completed,true);assert.ok([0,17].includes(actual.keypoints));assert.deepEqual(pageErrors,[]);assert.ok(requests.every(u=>new URL(u).origin===new URL(base).origin));result.wasm=actual;result.checks.push('WebGL failure → single-thread WASM → real model inference, same-origin only');
  result.status='passed';await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/pwa-report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{await browser?.close();await fallback?.close();server.close();if(temp.startsWith(path.join(os.tmpdir(),'dopa-fit-pwa-')))await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
