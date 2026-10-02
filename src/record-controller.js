// SPDX-License-Identifier: MIT
import {FaceTracker} from './face-tracker.js';
import {SafeScene} from './safe-scene.js';
import {RecordSession} from './record-session.js';
import {planHighlights} from './highlight-planner.js';
import {exportHighlights} from './video-exporter.js';
import {BACKGROUNDS,RECORD_CONFIG,STAGE_NAMES} from './record-config.js';
import {t} from './i18n.js';
import {PoCMetrics} from './poc-metrics.js';
const $=id=>document.getElementById(id);
export class DopaRecordController {
  constructor(app){
    this.app=app;this.scene=new SafeScene($('private-scene'));this.provider=new URLSearchParams(location.search).get('faceTracker')==='landmarker'?'landmarker':'detector';
    const prefs=app.store.read('settings',{});$('face-mask').checked=!!prefs.faceMask;$('background-mode').value=BACKGROUNDS.includes(prefs.backgroundMode)?prefs.backgroundMode:'MY_ROOM';
    $('face-mask').onchange=()=>this.preferences();$('record-enabled').onchange=()=>this.preferences();$('background-mode').onchange=()=>{if($('background-mode').value!=='MY_ROOM')$('face-mask').checked=true;this.preferences();};
    $('preview-start').onclick=()=>this.previewActive?this.stopPreview():this.preview();
    $('video-retry').onclick=()=>this.generate();$('video-save').onclick=()=>this.download();$('video-share').onclick=()=>this.share();
    $('poc-provider').value=this.provider;$('poc-provider').onchange=()=>{this.nextProvider=$('poc-provider').value;};
    $('poc-save').onclick=()=>this.savePoC();
    this.preferences(false);document.addEventListener('visibilitychange',()=>{if(document.hidden){this.stopPreview();this.scene.clear();}});
  }
  get settings(){return {faceMask:$('face-mask').checked,backgroundMode:$('background-mode').value};}
  preferences(save=true){const requiresMask=$('record-enabled').checked||$('background-mode').value!=='MY_ROOM';if(requiresMask)$('face-mask').checked=true;$('face-mask').disabled=requiresMask;$('record-setup-summary').textContent=$('record-enabled').checked?'RECORD ON':$('face-mask').checked?'MASK ON':'OFF';
    $('background-note').textContent=t($('background-mode').value==='MY_ROOM'?'roomNotice':$('background-mode').value==='BLUR_ROOM'?'blurNotice':'stageNotice');if(save)this.app.saveSettings();if(this.previewActive)this.configure();}
  configure(){this.background=$('background-mode').value;this.masked=$('face-mask').checked||$('record-enabled').checked||this.background!=='MY_ROOM';
    this.app.renderer.masked=this.masked;$('face-notice').classList.add('hidden');$('play').classList.toggle('masked',this.masked);$('private-scene').classList.toggle('hidden',!this.masked);this.scene.clear();}
  initTracker(){
    if(this.trackerInit)return this.trackerInit;
    if(this.tracker?.background!==this.background){this.tracker?.dispose();this.tracker=null;}
    const tracker=this.tracker??=new FaceTracker(this.provider,{background:this.background});
    const pending=tracker.init().then(()=>{if(this.tracker===tracker){this.trackingError=null;this.retryAt=0;this.retryDelay=1000;}}).catch(error=>{
      if(this.tracker===tracker){this.tracker=null;if(error.name!=='AbortError'){this.trackingError=String(error.message);this.retryAt=performance.now()+(this.retryDelay||1000);this.retryDelay=Math.min(8000,(this.retryDelay||1000)*2);$('setup-status').textContent=t('maskRetrying');}}tracker.dispose();
    }).finally(()=>{if(this.trackerInit===pending)this.trackerInit=null;});
    return this.trackerInit=pending;
  }
  stopPreview(){this.previewActive=false;cancelAnimationFrame(this.previewRaf);$('setup-preview').classList.add('hidden');$('preview-start').textContent=t('previewScene');
    if(['IDLE','FINISHED'].includes(this.app.state))this.app.camera.stop();this.scene.clear();}
  async preview(){
    if(!['IDLE','FINISHED'].includes(this.app.state))return;this.configure();this.previewActive=true;$('setup-preview').classList.remove('hidden');$('preview-start').textContent=t('previewStop');$('setup-status').textContent=this.masked?t('maskPreparing'):'';
    try{await this.app.camera.start();if(this.masked)await this.initTracker();if(!this.previewActive)return;
      const loop=()=>{if(!this.previewActive)return;this.resize(390,600);this.capture(performance.now(),0);
        if(!this.masked){const c=this.scene.ctx;c.save();c.translate(390,0);c.scale(-1,1);c.drawImage($('camera'),0,0,390,600);c.restore();}
        else {this.scene.check(performance.now(),0);if(!this.scene.valid)this.scene.avatar(null,390,600,0,performance.now());}
        $('setup-preview').getContext('2d').drawImage(this.scene.canvas,0,0,390,600);this.previewRaf=requestAnimationFrame(loop);};loop();
    }catch{$('setup-status').textContent=t('maskUnavailable');this.stopPreview();}
  }
  start(demo){
    this.stopPreview();this.abortExport?.abort();this.abortExport=null;this.exporting=false;this.clearVideo();this.session?.dispose();this.session=null;this.plan=null;this.demo=demo;this.configure();this.enabled=$('record-enabled').checked;
    if(this.nextProvider&&this.nextProvider!==this.provider){this.tracker?.dispose();this.tracker=null;this.provider=this.nextProvider;}this.poc=new PoCMetrics(this.provider);
    this.trackingError=null;this.retryAt=0;this.retryDelay=1000;this.exportError=null;this.fallbackReason=null;$('record-result').classList.add('hidden');$('record-indicator').classList.toggle('hidden',!this.enabled);
    if(this.enabled){try{this.session=new RecordSession({onStatus:status=>{this.status=status;$('record-indicator').textContent=status==='on'?'RECORD ON':t(status==='limited'?'recordLimited':'recordError');}});}catch{this.status='error';$('record-indicator').textContent=t('recordError');}}
    if(this.masked&&!demo)this.initTracker();
  }
  resize(w,h){if(this.scene.canvas.width!==w||this.scene.canvas.height!==h){this.scene.canvas.width=w;this.scene.canvas.height=h;this.scene.clear();}}
  capture(now,level){if(!this.masked||this.demo)return;
    if(!this.tracker?.ready||this.tracker.background!==this.background){if(!this.trackerInit&&now>=(this.retryAt||0))this.initTracker();return;}
    if(this.tracker.busy||now-(this.lastCapture||0)<100)return;
    this.lastCapture=now;const generation=this.app.generation,background=this.background,tracker=this.tracker;
    tracker.track($('camera'),background).then(result=>{
      if(!result)return;if(generation!==this.app.generation||!this.masked||background!==this.background){result.bitmap?.close();return;}
      this.trackingError=null;this.poc?.face.add(performance.now()-result.capturedAt);this.scene.compose(result,{background,level:this.app.game?.energy.presentedStageLevel||0,fit:$('camera-fit').value});
      if(this.previewActive)$('setup-status').textContent=this.scene.valid?'':this.maskNotice;
    }).catch(error=>{if(generation!==this.app.generation||this.tracker!==tracker||!this.masked||background!==this.background)return;this.trackingError=String(error.message);this.scene.fallback(level,'error');tracker.dispose();this.retryAt=performance.now()+1000;});
  }
  get maskNotice(){if(this.trackingError)return t('maskRetrying');if(!this.tracker?.ready)return t('maskPreparing');return t(({ 'no-face':'maskFindFace','too-close':'maskStepBack',multiple:'maskOnePerson',delayed:'maskTracking',background:'maskBackground',checking:'maskTracking' })[this.scene.issue]||'maskTracking');}
  render(now){
    if(!this.masked)return;const app=this.app,level=app.game?.energy.presentedStageLevel||0;this.resize(app.renderer.canvas.width,app.renderer.canvas.height);
    if(this.demo){this.scene.fallback(level);const c=this.scene.ctx,w=this.scene.canvas.width,h=this.scene.canvas.height;
      this.scene.cover(c,{x:w*.4,y:h*.22,width:w*.2,height:h*.12,roll:Math.sin(now/1000)*.08},level);this.scene.valid=true;this.scene.lastSafeAt=now;this.scene.level=level;
    }else {this.capture(now,level);this.scene.check(now,level);this.scene.present(level);if(!this.scene.valid)this.scene.avatar(app.mapped,app.renderer.width,app.renderer.height,level,now);}
    $('face-notice').classList.toggle('setup-notice',['CALIBRATING','COUNTDOWN'].includes(app.state));$('face-notice').classList.toggle('hidden',this.demo||this.scene.valid);if(!this.demo&&!this.scene.valid)$('face-notice').textContent=this.maskNotice;
    if(app.state==='PLAYING')this.poc?.frame(Math.max(0,(now-(this.pocFrameAt||now))/1000),this.scene.valid);this.pocFrameAt=now;
    const state=app.game?.energy;
    if(this.session&&state)this.session.frame(this.scene.canvas,app.renderer.canvas,state,app.audio,{active:app.state==='PLAYING'&&!app.practice?.active,safe:this.scene.valid,seconds:app.seconds,cycle:app.game.presentationCycle||state.cycle,beatSeconds:(app.music.clock?.beatMs||500)/1000});
  }
  note(events,pose){this.session?.note(events,pose,this.app.renderer.width,this.app.renderer.height);}
  pause(){this.session?.stop();this.scene.clear();}
  observe(metrics,now){this.poc?.sample(metrics,this.diagnostics);const sorted=[...(this.tracker?.latencies||[])].sort((a,b)=>a-b);this.session?.observe({fps:metrics.canvasFPS,poseP95:metrics.inferenceP95ms,faceP95:sorted[Math.floor(sorted.length*.95)]||0,encodeWait:this.session.closing?performance.now()-(this.closeAt??=now):0,dropped:this.app.frameTimes.filter(ms=>ms>62.5).length/Math.max(1,this.app.frameTimes.length)},now);if(!this.session?.closing)this.closeAt=null;}
  async finish(){await this.session?.finish();this.tracker?.dispose();this.tracker=null;this.scene.clear();}
  async generate(){
    if(!this.enabled)return;$('record-result').classList.remove('hidden');$('video-retry').classList.add('hidden');$('video-save').disabled=$('video-share').disabled=true;
    this.abortExport?.abort();const controller=new AbortController();this.abortExport=controller;
    this.exportError=null;this.fallbackReason=null;
    if(!this.session){$('record-status').textContent=t('videoFailed');return;}
    if(!this.plan)this.planReservation=this.session.pool.reserve(RECORD_CONFIG.maxCandidates*RECORD_CONFIG.maxMetadataBytes);
    this.plan??=planHighlights(this.session.pool.clips,RECORD_CONFIG);
    if(!this.plan.segments.length){$('record-status').textContent=t('videoEmpty');$('record-progress').classList.add('hidden');return;}
    this.session.pool.keep(new Set(this.plan.segments.map(c=>c.id)));$('record-progress').classList.remove('hidden');$('record-progress').value=0;
    this.exporting=true;try {
      const output=await exportHighlights(this.plan,this.app.resultRecord,{profile:this.session.controller.profile,signal:controller.signal,onProgress:(progress,method,detail)=>{if(detail)this.fallbackReason=detail;
        if(controller.signal.aborted)return;$('record-progress').value=Math.min(1,Math.max(0,progress));$('record-status').textContent=t(method==='realtime'?'videoRealtime':'videoFinishing',{n:Math.round(Math.min(1,Math.max(0,progress))*100)});}});
      if(controller.signal.aborted)return;this.clearVideo();this.output=output;this.url=URL.createObjectURL(output.blob);$('record-preview').src=this.url;$('record-preview').classList.remove('hidden');$('record-status').textContent=t('videoReady');$('video-save').disabled=$('video-share').disabled=false;
    }catch(error){if(controller.signal.aborted)return;this.exportError=String(error.message);$('record-status').textContent=t('videoFailed');$('video-retry').classList.remove('hidden');}finally{if(this.abortExport===controller)this.exporting=false;}
  }
  clearVideo(){this.output=null;$('record-preview').pause();$('record-preview').removeAttribute('src');$('record-preview').load();$('record-preview').classList.add('hidden');if(this.url)URL.revokeObjectURL(this.url);this.url=null;}
  get file(){return this.output?new File([this.output.blob],`dopa-record-${new Date().toISOString().slice(0,10)}.${this.output.blob.type.includes('mp4')?'mp4':'webm'}`,{type:this.output.blob.type}):null;}
  download(){if(!this.url)return;const a=document.createElement('a');a.href=this.url;a.download=this.file.name;document.body.append(a);a.click();a.remove();}
  async share(){const file=this.file;if(!file)return;
    if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Dopa Record'});}catch(error){if(error.name!=='AbortError')$('record-status').textContent=t('cardFailed');}}else this.download();}
  savePoC(){if(!this.poc)return;const raw=$('poc-exposures').value,report=this.poc.report({background:this.background,inputWidth:this.tracker?.inputWidth||384,recordEnabled:this.enabled,bodyMode:this.app.bodyMode,elapsed:this.app.seconds,exposureObservations:raw===''?null:Math.max(0,Number(raw)),notes:$('poc-notes').value});const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`dopa-poc-${this.provider}-${Math.floor(this.app.seconds)}s.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  get diagnostics(){return {provider:this.provider,adoption:'pending physical-device PoC',background:this.background||'MY_ROOM',masked:this.masked,safe:this.scene.valid,faceIssue:this.scene.issue,inputWidth:this.tracker?.inputWidth||384,trackingError:this.trackingError||null,budget:this.session?.controller.profile,ownedBytes:this.session?.pool.usedBytes||0,candidates:this.session?.pool.clips.length||0,stage:STAGE_NAMES[this.app.game?.energy.stageLevel||0],recordMime:this.session?.mime,exportMethod:this.output?.method,fallbackReason:this.fallbackReason||null,exportError:this.exportError||null};}
}
