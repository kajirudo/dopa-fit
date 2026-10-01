// SPDX-License-Identifier: MIT
// Synthetic inputs and desktop audio: physical phone acceptance remains separate.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
(async()=>{
  let server,browser;
  try {
    const base=process.env.DOPA_BASE_URL||await new Promise(resolve=>{server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('Path');const ext=path.extname(file);res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':ext==='.json'?'application/json':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));});
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});browser=await chromium.launch({headless:true});
    const context=await browser.newContext({locale:'ja-JP',viewport:{width:390,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[],requests=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>requests.push({url:r.url(),method:r.method(),body:!!r.postData()}));
    const check=name=>{checks.push(name);console.log('PASS '+name);};
    await page.goto(base);await page.evaluate(async()=>{window.a=(await import('./src/app.js')).app;});await page.locator('#demo').click();await page.waitForFunction(()=>window.a.state==='PLAYING');
    assert.equal(await page.locator('#practice').isVisible(),true);assert.equal(await page.evaluate(()=>window.a.game.targets.active.length),1);
    await page.screenshot({path:path.join(root,'test-results/practice.png')});
    const touch=async()=>{const box=await page.locator('#canvas').boundingBox(),target=await page.evaluate(()=>({...window.a.game.targets.active[0]}));await page.mouse.move(box.x+box.width/2,box.y+box.height*.8);await page.waitForTimeout(80);await page.mouse.move(box.x+target.x,box.y+target.y);};
    await touch();await page.waitForFunction(()=>window.a.practice.lane===1);assert.ok((await page.locator('#practice-note').innerText()).includes('右'));
    await touch();await page.waitForFunction(()=>!window.a.practice.active);assert.equal(await page.locator('#practice').isVisible(),false);assert.equal(await page.evaluate(()=>window.a.game.energy.hits),2);assert.equal(await page.evaluate(()=>window.a.game.targets.dynamic),true);check('Left / right introduction finishes early and keeps both HIT rewards');
    await page.evaluate(()=>{window.a.game.energy.energy=100;});await page.waitForFunction(()=>window.a.game.presentationCycle==='RISE');
    assert.equal(await page.locator('#play').evaluate(el=>el.classList.contains('fever')),false);assert.equal(await page.evaluate(()=>window.a.peakFeverLevel),0);assert.notEqual(await page.evaluate(()=>window.a.lastCue?.kind),'fever');
    await page.waitForFunction(()=>window.a.music.clock?.cycle==='RISE');await page.screenshot({path:path.join(root,'test-results/fever-rise.png')});
    await page.waitForFunction(()=>window.a.game.presentationCycle==='FEVER'&&window.a.lastCue?.kind==='fever');
    assert.equal(await page.evaluate(()=>window.a.music.clock.bpm),120);assert.equal(await page.evaluate(()=>window.a.peakFeverLevel),1);assert.ok(await page.evaluate(()=>window.a.seconds-window.a.game.energy.phaseAt)<1);
    const cueAt=await page.evaluate(()=>window.a.renderer.celebration.at);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.a.renderer.celebration.at),cueAt);check('Rise precedes audible drop; FEVER burst fires once with the new BPM and a full duration');
    // Keep record assertions deterministic, using aggregates only.
    await page.evaluate(()=>{window.a.peakFeverLevel=4;window.a.seconds=185;window.a.game.energy.hits=23;window.a.game.energy.energy=423;});
    await page.locator('#pause').click();await page.locator('#finish').click();await page.locator('#result').waitFor();
    assert.equal(await page.locator('#result-hits').innerText(),'23');assert.equal(await page.locator('#result-fever').innerText(),'4/5');assert.equal(await page.locator('#result-time').innerText(),'3:05');
    assert.equal(await page.evaluate(()=>window.a.store.history()[0].feverLevel),4);await page.screenshot({path:path.join(root,'test-results/result-ja.png')});
    await page.setViewportSize({width:320,height:640});assert.ok(await page.locator('#result').evaluate(el=>el.scrollWidth<=el.clientWidth));
    const downloading=page.waitForEvent('download');await page.locator('#card-save').click();const download=await downloading;assert.equal(download.suggestedFilename(),'dopa-fit-session.png');const png=await fs.readFile(await download.path());assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),720);assert.equal(png.readUInt32BE(20),900);await download.saveAs(path.join(root,'test-results/result-card-ja.png'));check('Highest FEVER / HIT / time stored locally and exported as a 720×900 PNG; 320px dialog fits');
    await page.evaluate(()=>window.a.changeLanguage('en'));assert.equal(await page.locator('#card-save').innerText(),'Save result card ↓');await page.screenshot({path:path.join(root,'test-results/result-en.png')});
    const english=page.waitForEvent('download');await page.locator('#card-save').click();await(await english).saveAs(path.join(root,'test-results/result-card-en.png'));check('Japanese / English card and export controls');
    await page.locator('#play-again').click();await page.waitForFunction(()=>window.a.state==='PLAYING'&&window.a.audio.ready);assert.equal(await page.evaluate(()=>window.a.game.energy.energy),0);assert.equal(await page.evaluate(()=>window.a.peakFeverLevel),0);assert.equal(await page.locator('#result').isVisible(),false);assert.equal(await page.evaluate(()=>window.a.practice.active),true);check('Replay starts a fresh session with gesture-unlocked audio');
    await page.locator('#pause').click();const elapsed=await page.evaluate(()=>window.a.practice.elapsed);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.a.practice.elapsed),elapsed);await page.locator('#settings-close').click();await page.waitForFunction(()=>window.a.state==='PLAYING');assert.ok(await page.evaluate(()=>window.a.practice.elapsed)<elapsed+.3);check('Pause and recalibration preserve practice progress');
    await page.evaluate(()=>{window.a.practice.elapsed=9.98;});await page.waitForFunction(()=>!window.a.practice.active);assert.equal(await page.evaluate(()=>window.a.game.targets.dynamic),true);check('Ten active seconds transition to normal fitness without a penalty');
    await page.locator('#pause').click();await page.locator('#finish').click();await page.locator('#result-close').click();await page.locator('#demo').click();await page.waitForFunction(()=>window.a.state==='PLAYING');await page.locator('#practice-skip').click();assert.equal(await page.evaluate(()=>window.a.practice.active),false);check('Practice skip restores normal targets immediately');
    assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>new URL(r.url).origin!==new URL(base).origin||r.method!=='GET'||r.body).length,0);check('No script errors, external requests or uploaded results');
    await fs.writeFile(path.join(root,'test-results/experience-report.json'),JSON.stringify({date:new Date().toISOString(),environment:'Desktop Chromium, pointer input, real-time Web Audio; not physical phone speakers',checks,network:{requests:requests.length,external:0,uploads:0}},null,2)+'\n');
    await page.locator('#pause').click();await page.locator('#finish').click();await context.close();
  }finally{await browser?.close();server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
