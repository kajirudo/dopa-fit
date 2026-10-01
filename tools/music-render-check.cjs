// SPDX-License-Identifier: MIT
// Render actual synthesis and scheduling; this does not test phone speakers.
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
(async()=>{
  let server,browser;
  try {
    const base=process.env.DOPA_BASE_URL||await new Promise(resolve=>{
      server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))throw Error('Path');res.setHeader('Content-Type',path.extname(file)==='.js'?'text/javascript':path.extname(file)==='.css'?'text/css':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));
    });
    browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(base);
    const results=await page.evaluate(async()=>{
      const {AudioManager}=await import('./src/audio.js'),{MusicEngine}=await import('./src/music.js'),{FEVER_STAGES}=await import('./src/fever.js');
      const results=[];
      for(const profile of [{name:'BUILD',bpm:112},{name:'REST',bpm:100},...FEVER_STAGES]) {
        const cycle=profile.level?'FEVER':profile.name,seconds=8*60/profile.bpm+1,sampleRate=22050;
        const offline=new OfflineAudioContext(1,Math.ceil(seconds*sampleRate),sampleRate);
        // Offline rendering is suspended for scheduled ticks. Treat those ticks
        // like a running real-time context; all nodes and signals remain real.
        const proxy=new Proxy(offline,{get(target,key){if(key==='state')return'running';if(key==='resume')return()=>Promise.resolve();const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){Reflect.set(target,key,value,target);return true;}});
        const audio=new AudioManager({createContext:()=>proxy,getSession:()=>null,timeoutMs:100});const unlock=audio.unlock();
        let seed=42;for(let i=0,data=audio.noise.getChannelData(0);i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
        const engine=new MusicEngine(audio,()=>({layer:5,cycle,feverLevel:profile.level||1})),schedule=engine.schedule.bind(engine);
        engine.schedule=(step,time)=>{if(step<32)schedule(step,time);};engine.start();clearInterval(engine.timer);
        let maxVoices=audio.voices.size,maxNodes=audio.nodeCount,pause=offline.suspend(.04);
        const rendering=offline.startRendering();
        for(let time=.04;time<seconds-.1;time+=.04){await pause;engine.tick();maxVoices=Math.max(maxVoices,audio.voices.size);maxNodes=Math.max(maxNodes,audio.nodeCount);pause=time+.04<seconds-.1?offline.suspend(time+.04):null;await offline.resume();if(!pause)break;}
        const buffer=await rendering;await unlock;engine.stop();
        const data=buffer.getChannelData(0);let sum=0,peak=0,tailPeak=0,crossings=0,hash=2166136261;
        for(let i=0;i<data.length;i++){const v=data[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));if(i>data.length-sampleRate*.2)tailPeak=Math.max(tailPeak,Math.abs(v));if(i&&v>0&&data[i-1]<=0)crossings++;hash=Math.imul(hash^Math.round(v*32767),16777619)>>>0;}
        results.push({name:profile.name,bpm:profile.bpm,seconds,rms:Math.sqrt(sum/data.length),peak,tailPeak,crossings,signature:hash,maxVoices,maxNodes,remainingVoices:audio.voices.size});
      }
      return results;
    });
    for(const result of results){assert.ok(result.rms>.005,`${result.name}: audible signal`);assert.ok(result.peak<1,`${result.name}: no clipping`);assert.ok(result.tailPeak<.00001,`${result.name}: tail ended`);assert.equal(result.remainingVoices,0);assert.ok(result.maxVoices<=24&&result.maxNodes<=160);console.log(JSON.stringify(result));}
    assert.equal(new Set(results.map(r=>r.signature)).size,7);
    assert.ok(Math.min(...results.slice(2).map(r=>r.rms))>results[1].rms,'every FEVER is more energetic than REST');
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/music-render-report.json'),JSON.stringify({date:new Date().toISOString(),environment:'OfflineAudioContext PCM, real synthesis and scheduler, not physical speakers',results},null,2)+'\n');
  }finally{await browser?.close();server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
