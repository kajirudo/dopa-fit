// SPDX-License-Identifier: MIT
// Desktop WebKit is a compatibility check, not an iPhone speaker test.
const engines = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain'};
(async () => {
  let server;
  const base = process.env.DOPA_BASE_URL || await new Promise(resolve => {
    server = http.createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep)) throw Error('Path');
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file));
      } catch { res.writeHead(404); res.end(); }
    }).listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
  const results = [];
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await engines[engine].launch({headless:true});
      try {
        const page = await browser.newPage({locale:'ja-JP',viewport:{width:390,height:844}}), errors = [], checks = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base); await page.evaluate(async () => { window.testApp = (await import('./src/app.js')).app; });
        if (!await page.evaluate(() => !!(globalThis.AudioContext || globalThis.webkitAudioContext))) {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.deepEqual(errors, []);
          results.push({engine,version:browser.version(),checks:['390px homepage and module initialization'],status:'audio-unavailable',reason:'This desktop engine build has no Web Audio API; audio checks were not executed.'});
          console.log(JSON.stringify(results.at(-1))); continue;
        }
        await page.locator('#demo').click();
        try { await page.waitForFunction(() => window.testApp.state === 'PLAYING' && window.testApp.audio.ready); }
        catch (error) { console.log(JSON.stringify(await page.evaluate(() => ({state:window.testApp.state,audio:window.testApp.audio.ctx?.state,time:window.testApp.audio.ctx?.currentTime,ready:window.testApp.audio.ready,message:document.getElementById('stage-message').textContent}))));console.log(JSON.stringify(errors));throw error; }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        checks.push('Gesture confirmation, advancing audio clock, 390px controls');
        await page.locator('#pause').click();await page.locator('#finish').click(); await page.locator('#result-close').click();
        // Inject only the two Safari failure signals: unresolved resume +
        // suspended state. Actual rendering and controls remain real browser code.
        await page.evaluate(() => {
          const a = window.testApp, original = a.audio.createContext;
          a.audio.createContext = () => {
            a.audio.createContext = original;
            const ctx = original();
            ctx.resume = () => new Promise(() => {});
            Object.defineProperty(ctx, 'state', {get:() => 'suspended', configurable:true});
            return ctx;
          };
        });
        await page.locator('#demo').click(); await page.waitForFunction(() => window.testApp.state === 'PLAYING');
        assert.equal(await page.evaluate(() => window.testApp.audio.ready), false);
        await page.waitForFunction(()=>!document.getElementById('sound-alert').classList.contains('hidden'));
        await page.locator('#sound-alert').click();
        assert.equal(await page.evaluate(()=>window.testApp.state),'PAUSED');
        assert.equal(await page.locator('#audio-retry').innerText(), '音を有効にする');
        assert.equal(await page.locator('#audio-retry').isEnabled(), true);
        checks.push('Blocked audio does not hang startup; recovery is visible');
        const before = await page.evaluate(() => { const a=window.testApp; a.game.energy.reward('hit'); window.oldAudio=a.audio.ctx; return{energy:a.game.energy.energy,seconds:a.seconds}; });
        await page.locator('#audio-retry').click(); await page.waitForFunction(() => window.testApp.audio.ready && !window.testApp.audio.pending);
        assert.equal(await page.evaluate(() => window.testApp.audio.ctx !== window.oldAudio), true);
        assert.ok(await page.evaluate(() => window.testApp.game.energy.energy) >= before.energy);
        assert.ok(await page.evaluate(() => window.testApp.seconds) >= before.seconds);
        assert.equal(await page.evaluate(() => window.testApp.music.timer),null);
        await page.locator('#settings-close').click();await page.waitForFunction(()=>window.testApp.state==='PLAYING'&&window.testApp.audio.ready);
        assert.equal(await page.evaluate(() => window.testApp.music.timer !== null), true);
        checks.push('Recovery replaces blocked context and resumes music without lost progress');
        await page.locator('#pause').click();
        await page.evaluate(() => { window.testApp.audio.setVolume(0); document.getElementById('volume').value=0; });
        await page.locator('#audio-retry').click(); await page.waitForFunction(() => window.testApp.audio.ready && !window.testApp.audio.pending);
        assert.equal(await page.locator('#volume').inputValue(), '55');
        await page.locator('#mute').click(); assert.equal(await page.evaluate(() => window.testApp.audio.muted), true);
        await page.locator('#mute').click(); await page.waitForFunction(() => window.testApp.audio.ready && !window.testApp.audio.pending);
        assert.equal(await page.evaluate(() => window.testApp.audio.muted), false);
        checks.push('Zero volume recovery and unmute are explicit audio gestures');
        await page.locator('#settings-close').click();await page.waitForFunction(()=>window.testApp.state==='PLAYING'&&window.testApp.audio.ready);
        await page.evaluate(() => { const ctx=window.testApp.audio.ctx; Object.defineProperty(ctx,'state',{get:()=> 'interrupted',configurable:true});ctx.onstatechange(); });
        assert.equal(await page.evaluate(() => window.testApp.state), 'PAUSED');
        await page.locator('#resume').click(); await page.waitForFunction(() => window.testApp.state === 'PLAYING' && window.testApp.audio.ready);
        assert.ok(await page.evaluate(() => window.testApp.game.energy.energy) >= before.energy);
        checks.push('Audio interruption pauses safely; resume creates a fresh context');
        await page.locator('#pause').click();await page.keyboard.press('Escape');
        assert.equal(await page.locator('#settings').isVisible(),false);
        assert.equal(await page.evaluate(()=>window.testApp.state),'PAUSED');
        assert.equal(await page.evaluate(()=>window.testApp.music.timer),null);
        await page.locator('#resume').click();await page.waitForFunction(()=>window.testApp.state==='PLAYING'&&window.testApp.audio.ready);
        checks.push('Dismissed settings stays paused until an explicit resume gesture');
        await page.locator('#pause').click();await page.locator('#finish').click();
        assert.equal(await page.evaluate(() => window.testApp.audio.voices.size), 0);
        assert.deepEqual(errors, []);
        results.push({engine,version:browser.version(),checks,status:'passed'}); console.log(JSON.stringify(results.at(-1)));
      } finally { await browser.close(); }
    }
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await fs.writeFile(path.join(root,'test-results/audio-browser-report.json'),JSON.stringify({date:new Date().toISOString(),environment:'Desktop engines and simulated audio interruptions; physical iPhone unverified',results},null,2)+'\n');
  } finally { server?.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
