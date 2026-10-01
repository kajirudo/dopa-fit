// SPDX-License-Identifier: MIT
import {RECORD_CONFIG,recordQuality} from './record-config.js';
import {crossfade} from './audio-transition.js';
import {recorderMime} from './record-session.js';
const abort=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
export function drawOutro(canvas,record){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.fillStyle='#102c29';c.fillRect(0,0,w,h);c.textAlign='center';c.fillStyle='#85d9c0';c.font=`bold ${w*.1}px system-ui`;c.fillText('dopa fit',w/2,h*.36);c.fillStyle='#fff';c.font=`bold ${w*.065}px system-ui`;c.fillText(`${record.energy} ENERGY`,w/2,h*.48);c.font=`${w*.04}px system-ui`;c.fillText(`${record.hits} HIT · ${Math.floor(record.seconds/60)}:${String(Math.floor(record.seconds%60)).padStart(2,'0')}`,w/2,h*.55);c.fillText('MOVE. GROW. GLOW.',w/2,h*.64);}
export async function exportHighlights(plan,record,{profile='LOW',config=RECORD_CONFIG,onProgress=()=>{},signal,forceFallback=false}={}){
  if(!plan.segments.length)throw new Error('No usable highlights');abort(signal);
  if(!forceFallback&&globalThis.VideoEncoder&&globalThis.AudioEncoder){try{return await exportBunny(plan,record,{profile,config,onProgress,signal});}catch(error){if(signal?.aborted)throw error;onProgress(0,'fallback',String(error.message||error));}}
  return exportCanvas(plan,record,{profile,config,onProgress,signal});
}
async function exportBunny(plan,record,{profile,config,onProgress,signal}){
  const {loadRecordPack}=await import('./optional-pack.js');await loadRecordPack();abort(signal);
  const m=await import('../optional/mediabunny.mjs'),q=recordQuality(profile);
  const mp4=await m.canEncodeVideo('avc',{width:q.width,height:q.height})&&await m.canEncodeAudio('aac');
  const codec=mp4?'avc':'vp8',audioCodec=mp4?'aac':'opus';
  if(!await m.canEncodeVideo(codec,{width:q.width,height:q.height})||!await m.canEncodeAudio(audioCodec))throw new Error('Native encoding unavailable');
  const canvas=document.createElement('canvas');canvas.width=q.width;canvas.height=q.height;const ctx=canvas.getContext('2d');
  const pages=new Map(),pageSize=256*1024;let length=0;
  const target=new m.StreamTarget(new WritableStream({write({data,position}){
    abort(signal);if(position+data.length>config.maxOutputBytes)throw new Error('Output capacity exceeded');length=Math.max(length,position+data.length);
    for(let offset=0;offset<data.length;){const pos=position+offset,index=Math.floor(pos/pageSize),within=pos%pageSize,n=Math.min(pageSize-within,data.length-offset);
      if(!pages.has(index))pages.set(index,new Uint8Array(pageSize));pages.get(index).set(data.subarray(offset,offset+n),within);offset+=n;}
  }}),{chunked:true,chunkSize:256*1024});
  const output=new m.Output({format:mp4?new m.Mp4OutputFormat({fastStart:'fragmented'}):new m.WebMOutputFormat(),target});
  const video=new m.CanvasSource(canvas,{codec,quality:new m.Quality({bitrate:q.bitrate})});
  const audio=new m.AudioSampleSource({codec:audioCodec,quality:new m.Quality({bitrate:96_000}),transform:{numberOfChannels:2,sampleRate:48000}});output.addVideoTrack(video,{frameRate:q.fps});output.addAudioTrack(audio);let input;const cancel=()=>{input?.dispose();output.cancel().catch(()=>{});pages.clear();};signal?.addEventListener('abort',cancel,{once:true});
  try{
    await output.start();let at=0,tail=null;const fadeFrames=Math.round((config.crossfadeDuration??0)*48000);
    const addPCM=async(planes,first,last,timestamp)=>{for(let pos=first;pos<last;pos+=4800){abort(signal);const n=Math.min(4800,last-pos),data=new Float32Array(n*2);for(let channel=0;channel<2;channel++)data.set(planes[channel].subarray(pos,pos+n),channel*n);const sample=new m.AudioSample({data,format:'f32-planar',numberOfChannels:2,sampleRate:48000,timestamp:timestamp+(pos-first)/48000});try{await audio.add(sample);}finally{sample.close();}}};
    for(const [index,clip] of plan.segments.entries()){
      abort(signal);input=new m.Input({source:new m.BlobSource(clip.blob,{maxCacheSize:config.reservationBytes}),formats:m.ALL_FORMATS});
      const vt=await input.getPrimaryVideoTrack(),atTrack=await input.getPrimaryAudioTrack();if(!vt||!atTrack)throw new Error('Missing media track');
      const start=clip.offset||0,end=start+clip.duration,base=at,hasNext=index<plan.segments.length-1,fade=hasNext?fadeFrames/48000:0;
      await Promise.all([
        (async()=>{for await(const sample of new m.VideoSampleSink(vt).samples(start,end)){try{abort(signal);const t=Math.max(0,sample.timestamp-start);if(t>=clip.duration-fade)break;
          sample.draw(ctx,0,0,q.width,q.height);await video.add(base+t,Math.min(sample.duration||1/q.fps,clip.duration-fade-t));onProgress((base+t)/plan.duration,'encoding');}finally{sample.close();}}})(),
        (async()=>{
          if(clip.duration>config.clipSeconds+.25)throw new Error('Decoded clip exceeds fixed PCM capacity');
          const n=Math.ceil(clip.duration*48000),planes=[new Float32Array(n),new Float32Array(n)];
          for await(const sample of new m.AudioSampleSink(atTrack).samples(start,end)){try{abort(signal);
            if(sample.numberOfFrames>sample.sampleRate*(config.clipSeconds+.25)||sample.numberOfChannels>2)throw new Error('Audio decode capacity exceeded');
            for(let channel=0;channel<2;channel++){const data=new Float32Array(sample.numberOfFrames);sample.copyTo(data,{planeIndex:Math.min(channel,sample.numberOfChannels-1),format:'f32-planar'});
              const first=Math.max(0,Math.ceil((sample.timestamp-start)*48000)),last=Math.min(n,Math.floor((sample.timestamp+sample.duration-start)*48000));
              for(let i=first;i<last;i++){const position=(start+i/48000-sample.timestamp)*sample.sampleRate,j=Math.max(0,Math.min(data.length-1,Math.floor(position))),f=Math.max(0,Math.min(1,position-j));planes[channel][i]=data[j]*(1-f)+(data[Math.min(j+1,data.length-1)]||0)*f;}
            }
          }finally{sample.close();}}
          if(tail&&fadeFrames){const mixed=[crossfade(tail[0],planes[0].subarray(0,fadeFrames)),crossfade(tail[1],planes[1].subarray(0,fadeFrames))];await addPCM(mixed,0,mixed[0].length,base);}
          const first=tail?fadeFrames:0,last=hasNext?Math.max(first,n-fadeFrames):n;
          await addPCM(planes,first,last,base+first/48000);tail=hasNext?planes.map(p=>p.slice(n-fadeFrames)):null;
        })()
      ]);input.dispose();input=null;at+=clip.duration-fade;
    }
    drawOutro(canvas,record);
    for(let t=0;t<plan.outroDuration;t+=1/q.fps){abort(signal);await video.add(at+t,Math.min(1/q.fps,plan.outroDuration-t));}
    for(let t=0;t<plan.outroDuration;t+=.1){const n=Math.round(Math.min(.1,plan.outroDuration-t)*48000),s=new m.AudioSample({data:new Float32Array(n*2),format:'f32-planar',numberOfChannels:2,sampleRate:48000,timestamp:at+t});try{await audio.add(s);}finally{s.close();}}
    await output.finalize();abort(signal);
    const parts=[...pages].sort((a,b)=>a[0]-b[0]).map(([i,data])=>data.subarray(0,Math.min(pageSize,length-i*pageSize)));
    const blob=new Blob(parts,{type:mp4?'video/mp4':'video/webm'});pages.clear();onProgress(1,'ready');return {blob,method:'webcodecs',duration:plan.duration};
  }catch(error){await output.cancel().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',cancel);input?.dispose();pages.clear();canvas.width=canvas.height=1;}
}
async function exportCanvas(plan,record,{profile,config,onProgress,signal}){
  const q=recordQuality(profile),canvas=document.createElement('canvas');canvas.width=q.width;canvas.height=q.height;
  const c=canvas.getContext('2d'),ctx=new (globalThis.AudioContext||globalThis.webkitAudioContext)(),destination=ctx.createMediaStreamDestination();
  await ctx.resume();if(ctx.state!=='running'){await ctx.close();throw new Error('Audio export requires a tap to retry');}
  const stream=canvas.captureStream(q.fps);destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const mime=recorderMime();if(!mime){stream.getTracks().forEach(t=>t.stop());await ctx.close();throw new Error('Export unavailable');}
  let recorder;try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:q.bitrate,audioBitsPerSecond:96_000});}catch(error){stream.getTracks().forEach(t=>t.stop());await ctx.close();canvas.width=canvas.height=1;throw error;}let parts=[],bytes=0,failure,closed=false;
  const prepared=new Set(),sources=new Set();
  const dispose=clip=>{clip.element.pause();clip.element.removeAttribute('src');clip.element.load();URL.revokeObjectURL(clip.url);clip.buffer=null;prepared.delete(clip);};
  const prepare=async clip=>{
    abort(signal);if(clip.duration>config.clipSeconds+.25)throw new Error('Decoded clip exceeds fixed capacity');
    const element=document.createElement('video');element.playsInline=true;element.muted=true;element.preload='auto';const url=URL.createObjectURL(clip.blob),p={element,url,buffer:null};prepared.add(p);element.src=url;
    try{
      await Promise.all([new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Clip load stalled')),8000);element.onloadeddata=()=>{clearTimeout(timer);resolve();};element.onerror=()=>{clearTimeout(timer);reject(new Error('Clip playback failed'));};}),
        (async()=>{const encoded=await clip.blob.arrayBuffer();p.buffer=await ctx.decodeAudioData(encoded);if(p.buffer.duration>config.clipSeconds+1||p.buffer.numberOfChannels>2)throw new Error('Audio decode capacity exceeded');})()]);
      abort(signal);if(closed)throw new DOMException('Cancelled','AbortError');return p;
    }catch(error){dispose(p);throw error;}
  };
  recorder.ondataavailable=e=>{bytes+=e.data.size;if(bytes>config.maxOutputBytes){failure=new Error('Output capacity exceeded');parts=[];if(recorder.state!=='inactive')recorder.stop();}else parts.push(e.data);};
  recorder.onerror=()=>{failure=new Error('Export failed');};
  const stopped=new Promise(resolve=>recorder.onstop=resolve);let current,next;
  try{
    current=await prepare(plan.segments[0]);let at=0;
    for(const [index,clip] of plan.segments.entries()){
      abort(signal);if(failure)throw failure;
      const hasNext=index<plan.segments.length-1,fade=hasNext?(config.crossfadeDuration??0):0;
      next=hasNext?prepare(plan.segments[index+1]):null;next?.catch(()=>{});
      current.element.currentTime=clip.offset||0;await current.element.play();c.drawImage(current.element,0,0,q.width,q.height);
      if(index===0)recorder.start(500);
      const source=ctx.createBufferSource(),gain=ctx.createGain(),when=ctx.currentTime;source.buffer=current.buffer;source.connect(gain);gain.connect(destination);sources.add({source,gain});
      const entry=[...sources].at(-1);gain.gain.setValueAtTime(index>0?0:1,when);if(index>0)gain.gain.linearRampToValueAtTime(1,when+(config.crossfadeDuration??0));
      if(hasNext){gain.gain.setValueAtTime(1,when+clip.duration-fade);gain.gain.linearRampToValueAtTime(0,when+clip.duration);}
      source.onended=()=>{source.disconnect();gain.disconnect();sources.delete(entry);};source.start(when,clip.offset||0,clip.duration);
      const beginning=performance.now(),start=clip.offset||0;
      await new Promise((resolve,reject)=>{const loop=()=>{try{abort(signal);if(failure)throw failure;
        const t=Math.max(0,current.element.currentTime-start);c.drawImage(current.element,0,0,q.width,q.height);onProgress(Math.min(1,(at+t)/plan.duration),'realtime');
        if(t>=clip.duration-fade||current.element.ended){resolve();return;}if(performance.now()-beginning>clip.duration*1000+8000)throw new Error('Clip playback stalled');setTimeout(loop,1000/q.fps);
      }catch(error){reject(error);}};loop();});dispose(current);current=null;at+=clip.duration-fade;current=next?await next:null;next=null;
    }
    drawOutro(canvas,record);const beginning=performance.now();
    await new Promise((resolve,reject)=>{const loop=()=>{try{abort(signal);if(failure)throw failure;const t=(performance.now()-beginning)/1000;onProgress(Math.min(1,(at+t)/plan.duration),'realtime');if(t>=plan.outroDuration){resolve();return;}setTimeout(loop,1000/q.fps);}catch(error){reject(error);}};loop();});
    if(recorder.state!=='inactive')recorder.stop();await Promise.race([stopped,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Recorder finalization stalled')),4000))]);if(failure)throw failure;abort(signal);
    const blob=new Blob(parts,{type:mime.includes('mp4')?'video/mp4':'video/webm'});parts=[];onProgress(1,'ready');return {blob,method:'canvas',duration:plan.duration};
  }finally{closed=true;if(recorder.state!=='inactive')recorder.stop();for(const p of [...prepared])dispose(p);for(const {source,gain} of sources){try{source.stop();}catch{}source.disconnect();gain.disconnect();}sources.clear();stream.getTracks().forEach(t=>t.stop());await ctx.close();parts=[];canvas.width=canvas.height=1;}
}
