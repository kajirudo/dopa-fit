// SPDX-License-Identifier: MIT
// Synthetic inputs are deliberately separate from real-device acceptance.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain'};
(async () => {
  let server;
  const base = process.env.DOPA_BASE_URL || await new Promise(resolve => {
    server = http.createServer(async (req,res) => {
      try { const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`); if (!file.startsWith(root+path.sep)) throw Error('Path'); const data = await fs.readFile(file); res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream'); res.end(data); }
      catch { res.writeHead(404); res.end('Not found'); }
    }).listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));
  });
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  let browser;
  try { browser = await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader']}); } catch(error) {server?.close();throw error;}
  const context = await browser.newContext({viewport:{width:1440,height:1000},permissions:['camera']});
  const requests=[],errors=[],results={date:new Date().toISOString(),browser:browser.version(),environment:'Desktop Chromium, fake camera, software WebGL; not physical iPhone/Android',checks:[]};
  context.on('request',r=>requests.push({url:r.url(),method:r.method(),body:!!r.postData()}));
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state = () => page.evaluate(()=>window.testApp.state);
  const check = (name) => {results.checks.push(name);console.log('PASS '+name);};
  const attach = () => page.evaluate(async()=>{window.testApp=(await import('./src/app.js')).app;});
  try {
    await page.goto(base+'/?debug=1'); await attach();
    assert.equal(await page.locator('h1').innerText(),'Move your body.\nBuild the beat.');
    await page.screenshot({path:path.join(root,'test-results/desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(root,'test-results/mobile.png'),fullPage:true}); check('Landing and 390px portrait layout');
    await page.locator('#demo').click(); await page.waitForFunction(()=>window.testApp.state==='PLAYING');
    assert.equal(await page.evaluate(()=>window.testApp.audio.ready),true);
    // Free movement receives a softer note even when it never enters a circle.
    const wave = await page.evaluate(() => {
      const a=window.testApp,c=a.game.calibration; let notes=0;
      const original=a.audio.move.bind(a.audio);a.audio.move=()=>{notes++;original();};
      const initial=a.game.energy.energy, now=performance.now();
      const frame=(x,id,t)=>({id,capturedAt:t,points:{left_shoulder:{x:c.center.x-c.shoulder/2,y:c.center.y,valid:true},right_shoulder:{x:c.center.x+c.shoulder/2,y:c.center.y,valid:true},left_wrist:{x,y:c.center.y+c.shoulder,valid:true},right_wrist:{x:c.center.x,y:c.center.y+c.shoulder,valid:true}}});
      a.feedback(a.game.process(frame(c.center.x,++a.pose.sequence,now),now));
      a.feedback(a.game.process(frame(c.center.x+.3*c.shoulder,++a.pose.sequence,now+1),now+1));
      a.audio.move=original;
      return {notes,added:a.game.energy.energy-initial,label:a.renderer.rewards.at(-1)?.label};
    });assert.equal(wave.notes,1);assert.equal(wave.added,1);assert.equal(wave.label,'MOVE +1');check('Free waving → positioned MOVE +1 and pentatonic note');
    const audioRecovery = await page.evaluate(() => {const a=window.testApp;window.beforeAudio=a.audio.ctx;return{energy:a.game.energy.energy,seconds:a.seconds};});
    await page.locator('#pause').click();
    await page.locator('#audio-retry').click();await page.waitForFunction(()=>window.testApp.audio.ready&&!window.testApp.audio.pending);
    assert.equal(await page.evaluate(()=>window.beforeAudio.state),'closed');assert.equal(await page.evaluate(()=>window.testApp.audio.ctx!==window.beforeAudio),true);
    assert.ok(await page.evaluate(()=>window.testApp.game.energy.energy)>=audioRecovery.energy);assert.ok(await page.evaluate(()=>window.testApp.seconds)>=audioRecovery.seconds);
    await page.locator('#settings-close').click();await page.waitForFunction(()=>window.testApp.state==='PLAYING'&&window.testApp.audio.ready);
    assert.ok(await page.evaluate(()=>window.testApp.music.timer!==null));check('Audio retry replaces context and preserves progress / music');
    assert.equal(await page.evaluate(()=>['pause','energy','current-sound'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})),true);
    assert.ok((await page.locator('#stage').boundingBox()).height>=844*.95);
    for(const id of ['audio-retry','volume','layers','finish'])assert.equal(await page.locator('#'+id).isVisible(),false);
    check('Full-height camera stage and minimal ENERGY / unlocked sound / Pause HUD');
    const destinations = new Set();
    const hit = async(capture=false)=>{
      const box=await page.locator('#canvas').boundingBox(), c=await page.evaluate(()=>window.testApp.game.calibration);
      await page.mouse.move(box.x+c.center.x,box.y+Math.min(c.center.y+c.shoulder*1.8,box.height-20)); await page.waitForTimeout(60);
      await page.waitForFunction(()=>window.testApp.game.targets.active.length>0);
      const t=await page.evaluate(()=>{const m=window.testApp.game.targets;return{...(m.active.find(t=>t.id===m.leadId)||m.active[0])};});
      destinations.add(`${t.id}:${t.height}`);
      await page.mouse.move(box.x+t.x,box.y+t.y);
      if(capture){await page.waitForTimeout(40);await page.screenshot({path:path.join(root,'test-results/target-flow.png')});}
      await page.waitForTimeout(410);
    };
    await hit(true); const first=await page.evaluate(()=>window.testApp.game.energy.hits);
    await page.waitForTimeout(550); assert.equal(await page.evaluate(()=>window.testApp.game.energy.hits),first); check('Holding target never repeats a HIT');
    let capturedFever=false;
    for(let i=0;i<21;i++){
      await hit();
      if(!capturedFever&&await page.evaluate(()=>window.testApp.game.energy.cycle==='FEVER')){
        await page.screenshot({path:path.join(root,'test-results/fever.png')});capturedFever=true;
      }
    }
    const rewards=await page.evaluate(()=>({energy:window.testApp.game.energy.energy,hits:window.testApp.game.energy.hits,cycle:window.testApp.game.energy.cycle,layer:window.testApp.game.energy.layer,audio:window.testApp.audio.ctx.state}));
    assert.ok(rewards.energy>=100); assert.equal(rewards.layer,5); assert.equal(rewards.cycle,'FEVER'); assert.equal(rewards.audio,'running'); check('Pointer → HIT → audio → ENERGY → FEVER');
    assert.equal(capturedFever,true);
    assert.ok(destinations.size>=6);assert.equal(await page.evaluate(()=>window.testApp.game.targets.positions.length),8);
    check('Alternating target flow uses varied heights with a bounded incoming preview');
    assert.equal(await page.locator('#play').evaluate(el=>el.classList.contains('fever')),true);
    assert.equal(await page.locator('#rally-count').textContent(),String(rewards.hits));
    const effects=await page.evaluate(()=>({cue:window.testApp.lastCue?.kind,parts:window.testApp.renderer.particles.parts.length,limit:window.testApp.renderer.particles.limit}));
    assert.equal(effects.cue,'fever');assert.ok(effects.parts<=240&&effects.limit<=240);
    await page.locator('#pause').click();
    await page.locator('#reach').selectOption('small');
    await page.screenshot({path:path.join(root,'test-results/settings.png')});
    await page.locator('#reduced').check();
    assert.equal(await page.evaluate(()=>window.testApp.renderer.particles.parts.length),0);
    assert.equal(await page.locator('#play').evaluate(el=>el.classList.contains('reduced-effects')),true);
    await page.locator('#reduced').uncheck();check('FEVER celebration / cumulative HITS / bounded effects / immediate motion reduction');
    assert.equal(await state(),'PAUSED');
    await page.locator('#settings-close').click(); await page.waitForFunction(()=>window.testApp.state==='PLAYING'); assert.ok(await page.evaluate(()=>window.testApp.game.energy.energy)>=rewards.energy); check('Pause / recalibrate / resume preserves ENERGY');
    assert.equal(await page.evaluate(()=>window.testApp.store.read('settings',{}).reach),'small');
    assert.ok(await page.evaluate(()=>window.testApp.game.targets.positions.filter(p=>p.lane===0).every(p=>p.x>window.testApp.game.calibration.center.x-window.testApp.game.calibration.shoulder*.7)));
    check('Compact reach persists and applies on resume without losing ENERGY');
    const voiceStats=await page.evaluate(async()=>{const a=window.testApp.audio;for(let i=0;i<100;i++)a.hit(i);const peak={voices:a.voices.size,nodes:a.nodeCount};window.testApp.music.stop();await new Promise(r=>setTimeout(r,700));return{...peak,after:a.voices.size};});
    assert.ok(voiceStats.voices<=24&&voiceStats.nodes<=160);assert.equal(voiceStats.after,0);results.voiceStats=voiceStats;check('Audio cap and complete node cleanup');
    await page.locator('#pause').click();await page.locator('#finish').click(); await page.locator('#result').waitFor();
    assert.equal(await page.evaluate(()=>window.testApp.camera.stream),null); await page.locator('#result-close').click();
    await page.locator('#history-open').click(); assert.ok((await page.locator('#history-list').innerText()).includes('デモ'));await page.locator('#history-clear').click();assert.ok((await page.locator('#history-list').innerText()).includes('まだ記録'));await page.locator('#history-close').click();check('Finish / saved demo distinction / delete history');
    // Real model and fake getUserMedia video, without pretending it tests human tracking.
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.testApp.pose.detector&&window.testApp.camera.stream,{},{timeout:60000});
    const inference=await page.evaluate(async()=>{
      const a=window.testApp;cancelAnimationFrame(a.raf);while(a.pose.busy)await new Promise(r=>setTimeout(r,10));
      const start=performance.now();let f;for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,50));f=await a.pose.estimate(document.getElementById('camera'),performance.now(),{width:a.renderer.width,height:a.renderer.height,fit:'cover'})||f;}
      return{cropHeight:a.pose.cropCanvas?.height,backend:a.pose.backend,keypoints:Object.keys(f?.points||{}).length,completed:!!f,elapsedMs:Math.round(performance.now()-start),camera:a.camera.stream.getVideoTracks()[0].readyState,tensors:tf.memory().numTensors};
    }); assert.equal(inference.completed,true);assert.ok(inference.cropHeight>0&&inference.cropHeight<=640);assert.ok([0,17].includes(inference.keypoints));assert.equal(inference.camera,'live');results.inference=inference;check('getUserMedia → local MoveNet inference (fake video may contain no person)');
    const cover=await page.evaluate(async()=>{const a=window.testApp,v=document.getElementById('camera'),{viewport}=await import('./src/coordinates.js');return{fit:getComputedStyle(v).objectFit,source:viewport(v.videoWidth,v.videoHeight,a.renderer.width,a.renderer.height,'cover'),width:a.renderer.width,height:a.renderer.height};});
    assert.equal(cover.fit,'cover');assert.ok(cover.source.width>=cover.width&&cover.source.height>=cover.height);assert.ok(cover.source.x<0);
    await page.screenshot({path:path.join(root,'test-results/camera-cover.png')});check('Portrait camera fills stage; real model processes the visible crop capped at 640px');
    // Run calibration and contact through actual AppController with a clearly synthetic skeleton.
    const integrated=await page.evaluate(async()=>{
      const a=window.testApp;a.inferenceInterval=Infinity;a.generation++;cancelAnimationFrame(a.raf);while(a.pose.busy)await new Promise(r=>setTimeout(r,10));a.beginCalibration();const v=document.getElementById('camera');const {viewport}=await import('./src/coordinates.js');const source=viewport(v.videoWidth,v.videoHeight,a.renderer.width,a.renderer.height,'cover');const norm=(x,y)=>({x:1-(x-source.x)/source.width,y:(y-source.y)/source.height,score:1});const shoulders={left_shoulder:norm(a.renderer.width*.36,a.renderer.height*.4),right_shoulder:norm(a.renderer.width*.64,a.renderer.height*.4)};
      for(let i=0;i<24&&a.state==='CALIBRATING';i++){const now=performance.now();a.processFrame({id:++a.pose.sequence,capturedAt:now-1,completedAt:now,width:v.videoWidth,height:v.videoHeight,points:{...shoulders,left_wrist:norm(a.renderer.width*.3,a.renderer.height*.8),right_wrist:norm(a.renderer.width*.7,a.renderer.height*.8)}});await new Promise(r=>setTimeout(r,50));}
      if(a.state!=='COUNTDOWN')throw Error('Synthetic calibration failed: '+JSON.stringify({state:a.state,mapped:a.mapped,samples:a.calibration.samples,message:document.getElementById('stage-message').textContent}));
      a.countdownAt=performance.now()-3100;a.lastFrame=performance.now();a.animate();await new Promise(r=>setTimeout(r,30));cancelAnimationFrame(a.raf);a.generation++;
      const t=a.game.targets.targets[0], rect=a.game.calibration.rect;
      function frame(x,y){const now=performance.now();return{id:++a.pose.sequence,capturedAt:now-1,completedAt:now,width:v.videoWidth,height:v.videoHeight,points:{...shoulders,left_wrist:norm(x,y),right_wrist:norm(a.renderer.width*.7,a.renderer.height*.8)}};}
      a.processFrame(frame(a.game.calibration.center.x,rect.y+rect.height*.9));a.processFrame(frame(t.x,t.y));
      return{state:a.state,hits:a.game.energy.hits,energy:a.game.energy.energy,audio:a.audio.ctx.state};
    });assert.equal(integrated.hits,1);assert.equal(integrated.audio,'running');check('Synthetic shoulders / wrists → calibration → contact → sound');
    const assist=await page.evaluate(async()=>{const a=window.testApp,{viewport}=await import('./src/coordinates.js'),v=document.getElementById('camera');const s=viewport(v.videoWidth,v.videoHeight,a.renderer.width,a.renderer.height,'cover'),c=a.game.calibration;
      const norm=(x,y,score=1)=>({x:1-(x-s.x)/s.width,y:(y-s.y)/s.height,score});const t=a.game.targets.active[0],initial=a.game.energy.hits;
      const send=(x,y,score=1)=>{a.processFrame({id:++a.pose.sequence,capturedAt:performance.now()-1,completedAt:performance.now(),width:v.videoWidth,height:v.videoHeight,points:{left_shoulder:norm(c.center.x-c.shoulder/2,c.center.y),right_shoulder:norm(c.center.x+c.shoulder/2,c.center.y),left_wrist:norm(x,y,score)}});};
      // Use actual performance time for cooldown, then test a low-confidence edge touch.
      await new Promise(r=>setTimeout(r,360));send(c.center.x,c.rect.height*.9);send(t.x-t.radius-12,t.y,.35);
      const hand=a.mapped.hands.left_wrist;send(0,0,0);a.renderer.draw(a.mapped,a.game,performance.now(),.016,a.seconds);
      return{added:a.game.energy.hits-initial,held:a.mapped.hands.left_wrist?.held,radius:hand.radius,visible:!!a.renderer.markers.left_wrist};});
    assert.equal(assist.added,1);assert.equal(assist.held,true);assert.equal(assist.visible,true);assert.ok(assist.radius>=20);check('Low-confidence near-edge HIT and brief display-only hand retention through AppController');
    await page.locator('#pause').click();assert.equal(await page.evaluate(()=>window.testApp.camera.stream),null);
    await page.locator('#camera-fit').selectOption('contain');assert.equal(await page.locator('#camera').evaluate(v=>getComputedStyle(v).objectFit),'contain');assert.equal(await page.evaluate(()=>window.testApp.store.read('settings',{}).cameraFit),'contain');
    await page.locator('#camera-fit').selectOption('cover');assert.equal(await page.locator('#camera').evaluate(v=>getComputedStyle(v).objectFit),'cover');check('Pause switches and persists full-screen / full-body framing');
    await page.locator('#finish').click();await page.locator('#result-close').click();check('Camera tracks released on pause and finish');
    // Only mark ready after the verified entire static cache has installed.
    await page.waitForFunction(()=>document.getElementById('offline').textContent.includes('OK'),{},{timeout:60000});
    await context.setOffline(true);await page.reload();await attach();await page.locator('#demo').click();await page.waitForFunction(()=>window.testApp.state==='PLAYING');check('Complete-cache offline launch and demo');await page.locator('#pause').click();await page.locator('#finish').click();await page.locator('#result-close').click();await context.setOffline(false);
    const foreign=requests.filter(r=>new URL(r.url).origin!==new URL(base).origin), writes=requests.filter(r=>r.method!=='GET'||r.body);
    assert.deepEqual(foreign,[]);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    results.network={requestCount:requests.length,origins:[...new Set(requests.map(r=>new URL(r.url).origin))],methods:[...new Set(requests.map(r=>r.method))],external:foreign.length,payloadWrites:writes.length,paths:[...new Set(requests.map(r=>new URL(r.url).pathname))].sort()};check('No external requests, payload uploads, or console errors');
    results.status='passed';await fs.writeFile(path.join(root,'test-results/browser-report.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({status:results.status,checks:results.checks.length,inference,network:results.network.origins}));
  } catch(error){results.status='failed';results.error=error.stack;results.consoleErrors=errors;await fs.writeFile(path.join(root,'test-results/browser-report.json'),JSON.stringify(results,null,2)+'\n');await page.screenshot({path:path.join(root,'test-results/failure.png')}).catch(()=>{});throw error;}
  finally{await browser.close();server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
