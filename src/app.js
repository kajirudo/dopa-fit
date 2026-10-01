// SPDX-License-Identifier: MIT
import { DopaRecordController } from './record-controller.js';
import { CameraManager } from './camera.js';
import { PoseDetector } from './pose.js';
import { mapPose, distance } from './coordinates.js';
import { HandTracker } from './hands.js';
import { CalibrationManager } from './calibration.js';
import { GameEngine, LAYERS } from './game.js';
import { AudioManager } from './audio.js';
import { MusicEngine } from './music.js';
import { Renderer } from './renderer.js';
import { Store } from './storage.js';
import { FeedbackDirector } from './feedback.js';
import { FEVER_STAGES, feverStage, BASE_BPM, REST_BPM } from './fever.js';
import { mascotBox } from './layout.js';
import { t, initialLanguage, setLanguage, applyLanguage, getLanguage } from './i18n.js';
import { Practice } from './practice.js';
import { drawResultCard, downloadResultCard } from './result-card.js';
const $ = id => document.getElementById(id);
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export class AppController {
  constructor() {
    this.phase = Math.max(1, Math.min(7, Number(new URLSearchParams(location.search).get('phase')) || 7));
    this.camera = new CameraManager($('camera')); this.pose = new PoseDetector(); this.audio = new AudioManager(); this.renderer = new Renderer($('canvas')); this.calibration = new CalibrationManager(); this.store = new Store();
    this.state = 'IDLE'; this.generation = 0; this.seconds = 0; this.game = null; this.demo = false; this.pointer = null; this.mapped = null; this.lastFrame = 0; this.lastInference = 0; this.inferenceInterval = 50; this.latencies = []; this.frameTimes = []; this.poseTimes = []; this.shiftSince = 0; this.countdownAt = null;
    this.music = new MusicEngine(this.audio, () => this.game?.energy || { layer: 0, cycle: 'BUILD' });
    this.feedbackDirector = new FeedbackDirector(); this.renderer.phase = this.phase; this.hands = new HandTracker();
    setLanguage(initialLanguage(this.store.read('settings',{}).language)); applyLanguage();
    this.bind();this.recordFeature=new DopaRecordController(this);
    this.audio.onStatus = () => { this.updateAudio(); if (this.audio.ctx?.state === 'interrupted' && this.state === 'PLAYING') this.pause(); };
    this.resize = () => { if (this.state === 'IDLE' || this.state === 'FINISHED') return; this.renderer.resize(); if (['PLAYING', 'COUNTDOWN', 'CALIBRATING'].includes(this.state)) this.beginCalibration(); };
    new ResizeObserver(() => { const r = $('canvas').getBoundingClientRect(); if (Math.abs(r.width - (this.renderer.width || 0)) > 2 || Math.abs(r.height - (this.renderer.height || 0)) > 2) this.resize(); }).observe($('stage'));
    addEventListener('orientationchange', () => setTimeout(this.resize, 150));
    document.addEventListener('visibilitychange', () => { if (document.hidden && !['IDLE', 'FINISHED', 'PAUSED'].includes(this.state)) this.pause(); });
    $('camera').addEventListener('ended', () => this.pause());
    if (new URLSearchParams(location.search).has('debug')) $('diagnostics').classList.remove('hidden');
    this.offlineSetup();
  }
  bind() {
    $('start').onclick = () => this.start(false);
    $('demo').onclick = () => this.start(true);
    $('finish').onclick = () => this.finish();
    $('pause').onclick = () => this.openSettings();
    $('sound-alert').onclick = () => this.openSettings();
    $('settings-close').onclick = () => { $('settings').close(); this.resume(); };
    $('resume').onclick = () => this.resume();
    $('result-close').onclick = () => $('result').close();
    $('practice-skip').onclick = () => {if(this.state==='PLAYING'&&this.practice?.active){this.practice.skip();this.endPractice();}};
    $('play-again').onclick = () => { $('result').close();this.start(this.demo); };
    $('card-save').onclick = async () => { $('card-save').disabled=true;try{await downloadResultCard($('result-card'));$('card-status').textContent=t('cardSaved');}catch{$('card-status').textContent=t('cardFailed');}finally{$('card-save').disabled=false;} };
    $('history-open').onclick = () => { this.renderHistory(); $('history').showModal(); };
    $('history-close').onclick = () => $('history').close();
    $('history-clear').onclick = () => { this.store.clearHistory(); this.renderHistory(); };
    $('mute').onclick = () => { this.audio.setMuted(!this.audio.muted); if (!this.audio.muted) this.retryAudio(); this.updateAudio(); this.saveSettings(); };
    $('audio-retry').onclick = () => this.retryAudio();
    const settings = this.store.read('settings', {});
    this.bodyMode = settings.bodyMode === 'full' ? 'full' : 'upper';
    for(const id of ['body-mode','body-mode-settings','calibration-mode']) {
      $(id).value=this.bodyMode;
      $(id).onchange=()=>{this.bodyMode=$(id).value;for(const other of ['body-mode','body-mode-settings','calibration-mode'])$(other).value=this.bodyMode;$('camera-fit').value=this.bodyMode==='full'?'contain':'cover';$('play').classList.toggle('fit-camera',$('camera-fit').value==='contain');this.bodyHint();this.saveSettings();if(this.state==='CALIBRATING')this.beginCalibration();};
    }
    for(const el of document.querySelectorAll('[data-language]'))el.onchange=()=>this.changeLanguage(el.value);
    this.bodyHint();
    $('reach').value = settings.reach === 'small' ? 'small' : 'wide';
    $('reach').onchange = () => this.saveSettings();
    $('camera-fit').value = ['contain','cover'].includes(settings.cameraFit) ? settings.cameraFit : this.bodyMode==='full'?'contain':'cover';
    $('play').classList.toggle('fit-camera', $('camera-fit').value === 'contain');
    $('camera-fit').onchange = () => { $('play').classList.toggle('fit-camera', $('camera-fit').value === 'contain'); this.saveSettings(); };
    $('volume').value = Math.min(100, Math.max(0, Number.isFinite(settings.volume) ? settings.volume : 55)); this.audio.volume = Number($('volume').value) / 100;
    $('volume').oninput = () => { this.audio.setVolume(Number($('volume').value) / 100); this.updateAudio(); this.saveSettings(); };
    $('reduced').checked = settings.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer.particles.reduced = $('reduced').checked;
    $('play').classList.toggle('reduced-effects', $('reduced').checked);
    $('reduced').onchange = () => { this.renderer.particles.reduced = $('reduced').checked; $('play').classList.toggle('reduced-effects', $('reduced').checked); if ($('reduced').checked) { this.renderer.particles.parts = []; this.renderer.rewards = []; $('celebration').getAnimations().forEach(animation => animation.cancel()); } this.saveSettings(); };
    const pointer = event => { const rect = $('canvas').getBoundingClientRect(); this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    $('canvas').addEventListener('pointerdown', event => { if (this.demo) { pointer(event); $('canvas').setPointerCapture(event.pointerId); } });
    $('canvas').addEventListener('pointermove', event => { if (this.demo) pointer(event); });
    $('canvas').addEventListener('pointerup', () => { if (this.demo) this.pointer = null; });
    $('canvas').addEventListener('pointercancel', () => { this.pointer = null; });
  }
  bodyHint() { $('body-hint').textContent=t(this.bodyMode==='full'?'hintFull':'hintUpper'); }
  get courseCue() { return t(`${this.bodyMode==='upper'?'upper':'full'}Cue${Math.min(5,Math.floor(this.seconds/30))}`); }
  saveSettings() { this.store.write('settings', { language:getLanguage(), volume: Number($('volume').value), reduced: $('reduced').checked, reach: $('reach').value, cameraFit: $('camera-fit').value, bodyMode: this.bodyMode, ...this.recordFeature?.settings }); }
  updateAudio() {
    const quiet = this.audio.muted || this.audio.volume === 0;
    $('mute').textContent = t(this.audio.muted ? 'soundOff' : 'soundOn'); $('mute').setAttribute('aria-pressed', String(this.audio.muted));
    $('audio-status').textContent = t(this.audio.pending?'audioPending':quiet?'audioQuiet':this.audio.ready?'audioReady':'audioEnable');
    $('audio-retry').textContent = t(this.audio.ready&&!quiet?'audioTest':'audioRetry');
    $('audio-retry').disabled = this.audio.pending || ['IDLE', 'FINISHED', 'ERROR'].includes(this.state) || (this.state === 'PAUSED' && !$('settings').open);
    $('sound-alert').classList.toggle('hidden', this.state !== 'PLAYING' || this.audio.ready || quiet || this.audio.pending);
    $('audio-check').classList.toggle('needs-audio', !this.audio.ready && !quiet && !this.audio.pending);
  }
  async retryAudio() {
    if (this.audio.pending || (!['STARTING', 'CALIBRATING', 'COUNTDOWN', 'PLAYING'].includes(this.state) && !(this.state === 'PAUSED' && $('settings').open))) return;
    const generation = this.generation;
    $('audio-help').classList.remove('hidden');
    this.recordFeature.pause();this.music.stop(); this.audio.setMuted(false);
    if (this.audio.volume === 0) { $('volume').value = 55; this.audio.setVolume(.55); }
    this.saveSettings();
    try {
      // Recreate in this click, so an interrupted/stalled iOS context is not reused.
      const ready = await this.audio.unlock({ rebuild: true });
      if (generation === this.generation && ready && this.state === 'PLAYING' && this.phase >= 2) this.music.start(this.seconds);
    } catch { this.audio.pending = false; this.audio.ready = false; }
    this.updateAudio();
  }
  message(text, action = false, countdown = false) { this.messageTranslation=null;const calibrating=this.state==='CALIBRATING'&&!this.demo; $('stage-scrim').classList.toggle('calibrating',calibrating);$('stage-scrim').classList.toggle('counting',countdown);$('calibration-panel').classList.toggle('hidden',!calibrating);$('calibration-guide').classList.toggle('hidden',!calibrating);$('countdown-note').classList.toggle('hidden',!countdown);$('stage-scrim').classList.remove('hidden'); if($('stage-message').textContent!==text)$('stage-message').textContent = text; $('stage-message').classList.toggle('countdown', countdown); $('resume').classList.toggle('hidden', !action); }
  messageKey(key,action=false,values={}) { this.message(t(key,values),action);this.messageTranslation={key,action,values}; }
  changeLanguage(value) {
    const message=this.messageTranslation;setLanguage(value);applyLanguage();this.bodyHint();this.updateAudio();this.saveSettings();
    $('offline').textContent=t(this.offlineStatus||'online');if(this.updateBusy)$('update').textContent=t('updateBusy');
    if(this.state==='CALIBRATING')this.showCalibration(this.latestCalibration);else if(message)this.messageKey(message.key,message.action,message.values);
    if($('history').open)this.renderHistory();this.updateUI(performance.now());
    if($('result').open&&this.resultRecord)drawResultCard($('result-card'),this.resultRecord,this.renderer.characters.idle);
  }
  showCalibration(result=null) {
    this.latestCalibration=result;this.messageKey(this.demo?'demoGuide':result?.reason||'calHands');
    $('calibration-intro').textContent=t(this.bodyMode==='upper'?'calibrationUpper':'calibrationFull');
    $('calibration-guide').classList.toggle('full-body',this.bodyMode==='full');$('check-hips').classList.toggle('hidden',this.bodyMode!=='full');
    for(const part of ['shoulders','hands','hips']) { const seen=!!result?.checks?.[part],el=$(`check-${part}`);el.classList.toggle('seen',seen);el.querySelector('small').textContent=`${seen?'✓':'○'} ${t(seen?'detected':'waiting')}`;$('calibration-guide').classList.toggle(`seen-${part}`,seen); }
    const progress=Math.round((result?.progress||0)*100);$('calibration-progress').setAttribute('aria-valuenow',String(progress));$('calibration-progress').firstElementChild.style.width=`${progress}%`;
  }
  async start(demo) {
    if (!['IDLE', 'FINISHED', 'ERROR'].includes(this.state)) return;
    this.recordFeature.start(demo);
    this.demo = demo; this.game = null; this.seconds = 0; this.mapped = null; this.pointer = null; this.renderer.rewards = []; this.audioClock = null; this.course = $('course').checked && this.phase >= 4; this.latencies = []; this.frameTimes = []; this.poseTimes = [];
    this.practice=new Practice(this.phase>=2);this.peakFeverLevel=0;this.audibleFeverToken=null;this.presentedBar=-1;
    $('audio-help').classList.add('hidden');
    this.feedbackDirector.reset();this.renderer.departingTargets=[]; this.renderer.celebration = null; this.cueUntil = 0; $('celebration').classList.add('hidden'); this.lastCue = null;
    $('landing').classList.add('hidden'); $('play').classList.remove('hidden'); $('demo-badge').classList.toggle('hidden', !demo); $('mode-label').textContent = demo ? 'DEMO · NO CAMERA' : `${t(this.bodyMode==='upper'?'upper':'full')} · ${this.course?'3 MIN FLOW':'FREE FLOW'}`;
    this.state = 'STARTING'; this.updateUI(performance.now()); this.renderer.resize(); this.messageKey(demo?'startingDemo':'starting');
    const generation = ++this.generation;
    // Calls are both initiated in this user gesture, before the first await.
    try {
    const audioPromise = this.audio.unlock();
    const cameraPromise = demo ? Promise.resolve() : this.camera.start();
    const modelPromise = demo ? Promise.resolve() : this.pose.init();
    const cameraFailure = cameraPromise.catch(error => { if (generation === this.generation) this.fail(error); throw error; });
      await Promise.all([audioPromise, cameraFailure, modelPromise]);
      if (generation !== this.generation) return;
      this.camera.stream?.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (this.state === 'PLAYING') this.pause(); }));
      this.beginCalibration(); this.lastFrame = performance.now(); this.animate();
    } catch (error) { if (generation === this.generation) this.fail(error); }
  }
  fail(error) {
    this.hands.reset(); this.mapped = null;
    this.recordFeature.pause();this.generation++; this.camera.stop(); this.music.stop(); this.audio.suspend(); this.state = 'ERROR'; cancelAnimationFrame(this.raf);
    const keys={NotAllowedError:'cameraDenied',NotFoundError:'cameraMissing',NotReadableError:'cameraBusy',OverconstrainedError:'cameraError'};
    this.messageKey(keys[error.name]||'error',true);
  }
  beginCalibration() {
    this.hands.reset(); this.mapped = null; this.renderer.markers = {}; this.renderer.trails = {};
    this.calibration.reset(); this.countdownAt = null; this.shiftSince = 0; this.game?.resetTracking(); this.state = 'CALIBRATING'; this.latestCalibration=null; this.showCalibration();
    if (this.demo) {
      const w = this.renderer.width, h = this.renderer.height;
      this.acceptCalibration({ center: { x: w / 2, y: h * .46 }, shoulder: w * .28, rect: { x: 0, y: 0, width: w, height: h }, bodyMode: this.bodyMode });
      this.countdownAt = performance.now() - 3000;
    }
  }
  acceptCalibration(calibration) {
    const stage=$('stage').getBoundingClientRect(), hud=document.querySelector('.play-hud').getBoundingClientRect();
    this.renderer.mascot=mascotBox(this.renderer.width,this.renderer.height,hud.bottom-stage.top);
    calibration={...calibration,ui:{top:this.renderer.mascot?this.renderer.mascot.y+this.renderer.mascot.height+12:hud.bottom-stage.top+12,bottom:24}};
    const previous = this.game?.energy;
    this.game = new GameEngine(calibration, this.phase, $('reach').value); if (previous) this.game.energy = previous;
    this.state = 'COUNTDOWN'; this.countdownAt = performance.now();this.message('3',false,true);
  }
  animate() {
    if (['IDLE', 'FINISHED', 'PAUSED', 'ERROR'].includes(this.state)) return;
    const now = performance.now(), dt = Math.min(.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.frameTimes.push(now - this.lastFrame); if (this.frameTimes.length > 300) this.frameTimes.shift(); this.lastFrame = now;
    if (this.state === 'COUNTDOWN') {
      const left = Math.ceil(3 - (now - this.countdownAt) / 1000);
      if (left > 0) this.message(String(left), false, true);
      else { this.state = 'PLAYING'; $('stage-scrim').classList.add('hidden');if(this.practice?.active)this.practice.attach(this.game,now); if (this.phase >= 2) this.music.start(this.seconds); }
    }
    if (this.state === 'PLAYING') {
      this.seconds += dt;
      if(this.practice?.active){this.practice.tick(dt);if(!this.practice.active)this.endPractice();}
      this.game.energy.tick(this.seconds, dt, this.phase >= 3&&!this.practice?.active);
      const energy=this.game.energy,audible=this.music.clock;
      if(audible&&Number.isFinite(audible.stageLevel))energy.presentedStageLevel=Math.max(energy.presentedStageLevel,audible.stageLevel);
      else if(!this.audio.ready&&Math.floor(this.seconds/(240/112))!==this.presentedBar){this.presentedBar=Math.floor(this.seconds/(240/112));energy.presentedStageLevel=energy.stageLevel;}
      const waiting=energy.cycle==='FEVER'&&this.audio.ready&&this.music.timer!==null&&(audible?.cycle!=='FEVER'||audible?.token!==energy.lastFeverEnergy);
      this.game.presentationCycle=waiting?'RISE':energy.cycle;
      if(waiting)energy.phaseAt=this.seconds;
      else if(energy.cycle==='FEVER'){
        if(this.audibleFeverToken!==energy.lastFeverEnergy){this.audibleFeverToken=energy.lastFeverEnergy;energy.phaseAt=this.seconds;}
        this.peakFeverLevel=Math.max(this.peakFeverLevel,energy.feverLevel);
      }
      const clock=this.music.clock, bpm=this.game.energy.cycle==='FEVER'?feverStage(this.game.energy.feverLevel).bpm:this.game.energy.cycle==='REST'?REST_BPM:BASE_BPM;
      this.game.targets.advance(now, clock?.seconds ?? this.seconds, this.game.presentationCycle, clock?.beatMs ?? 60000/bpm, Math.max(energy.presentedStageLevel,energy.feverLevel));
      if (now - this.game.movement.lastMotion < 500) this.game.energy.flow += dt;
      if (this.course && this.seconds >= 180) { this.finish(); return; }
    }
    if (!this.demo && !this.pose.busy && now - this.lastInference >= this.inferenceInterval) {
      this.lastInference = now; const generation = this.generation;
      this.pose.estimate($('camera'), now, { width: this.renderer.width, height: this.renderer.height, fit: $('camera-fit').value, bodyMode: this.bodyMode }).then(frame => { if (generation === this.generation && frame) this.processFrame(frame); }).catch(error => { if (generation === this.generation) this.fail(error); });
    }
    if (this.demo && this.state === 'PLAYING') this.processDemo(now);
    if (this.phase >= 3 && this.state === 'PLAYING') {
      const cue = this.feedbackDirector.update(this.feedbackState);
      if (cue) this.celebrate(cue, now);
    }
    this.renderer.draw(this.mapped, this.game, now, dt, this.music.clockSeconds ?? this.seconds); this.recordFeature.render(now); this.updateUI(now);
    this.raf = requestAnimationFrame(() => this.animate());
  }
  processFrame(frame) {
    const now = performance.now(); this.recordFeature.poc?.pose.add(frame.completedAt-frame.capturedAt);this.latencies.push(frame.completedAt - frame.capturedAt); if (this.latencies.length > 200) this.latencies.shift(); this.poseTimes.push(now); if (this.poseTimes.length > 100) this.poseTimes.shift();
    const mapped = mapPose(frame, this.renderer.width, this.renderer.height, now, $('camera-fit').value, this.bodyMode); if (!mapped) return;
    const lShoulder = mapped.points.left_shoulder, rShoulder = mapped.points.right_shoulder;
    const shoulder = this.game?.calibration.shoulder || (lShoulder?.valid && rShoulder?.valid ? distance(lShoulder,rShoulder) : this.renderer.width*.25);
    const pose = this.hands.update(mapped, now, shoulder); this.mapped = pose;
    if (this.state === 'CALIBRATING') { const result=this.calibration.update(pose,now,this.bodyMode); this.showCalibration(result); if(result.ready)this.acceptCalibration(result.calibration);return; }
    if (this.state !== 'PLAYING') return;
    const l = pose.points.left_shoulder, r = pose.points.right_shoulder;
    if (l?.valid && r?.valid) {
      const center = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
      // Side steps are intentional in phase 4; only a very large shift recenters them.
      const tolerance = this.phase >= 4 ? .9 : .45;
      if (distance(center, this.game.calibration.center) > this.game.calibration.shoulder * tolerance) {
        this.shiftSince ||= now; if (now - this.shiftSince > 1000) { this.beginCalibration(); return; }
      } else this.shiftSince = 0;
    }
    this.feedback(this.game.process(pose, now));
    const valid = l?.valid && r?.valid;
    $('course-cue').textContent = valid ? this.course ? this.courseCue : '' : t(this.bodyMode==='upper'?'trackingUpper':'trackingFull');
  }
  processDemo(now) {
    const c = this.game.calibration, p = this.pointer || { x: c.center.x, y: c.center.y + c.shoulder };
    const points = { left_shoulder: { x: c.center.x - c.shoulder / 2, y: c.center.y, valid: true }, right_shoulder: { x: c.center.x + c.shoulder / 2, y: c.center.y, valid: true }, left_wrist: { ...p, valid: true }, right_wrist: { x: c.center.x, y: c.center.y + c.shoulder, valid: true } };
    this.mapped = this.hands.update({ id: ++this.pose.sequence, capturedAt: now, points, rect: c.rect }, now, c.shoulder);
    this.feedback(this.game.process(this.mapped, now));
    $('course-cue').textContent = this.course ? this.courseCue : '';
  }
  feedback(events) {
    this.recordFeature.note(events,this.mapped);
    const hasAccent = events.some(event => event.type !== 'move');
    for (const event of events) {
      if (event.type === 'move') { if (hasAccent) continue; this.audio.move(); }
      else this.audio.hit(event.targetId ?? 2, this.game?.energy.stageLevel||0, event.intensity || 1);
      this.renderer.reward(event);
    }
    if(this.practice?.hit(events)){this.renderer.departingTargets=[{...this.game.targets.active[0],waiting:true}];if(this.practice.active)this.practice.attach(this.game,performance.now());else this.endPractice();}
  }
  endPractice() { this.practice.restore(this.game,$('reach').value);this.updateUI(performance.now()); }
  get feedbackState() {const state=this.game?.energy;return state?{...state,cycle:this.game.presentationCycle||state.cycle,layer:state.layer,variant:state.variant,nextFeverLevel:state.nextFeverLevel,feverDuration:state.feverDuration}:null;}
  celebrate(cue, now) {
    if (this.cueUntil > now && this.lastCue?.priority > cue.priority) return;
    this.lastCue = cue; this.cueUntil = now + cue.duration; this.renderer.celebrate(cue, now); this.audio.celebrate(cue.kind,cue.level);
    $('celebration-title').textContent = cue.title; $('celebration-note').textContent = cue.subtitle;
    $('celebration').className = `celebration ${cue.kind}`;
    // Restart a short entrance only for a new milestone, never on every frame.
    $('celebration').getAnimations().forEach(animation => animation.cancel());
    if (!this.renderer.particles.reduced && !matchMedia('(prefers-reduced-motion: reduce)').matches) $('celebration').animate([{ opacity: 0, transform: 'translateY(8px) scale(.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  updateUI(now) {
    const state = this.feedbackState;
    const practicing=this.state==='PLAYING'&&this.practice?.active;
    $('practice').classList.toggle('hidden',!practicing);
    $('demo-badge').classList.toggle('hidden',!this.demo||practicing);
    if(practicing)$('practice-note').textContent=t(this.practice.lane?'practiceRight':'practiceLeft',{n:this.practice.remaining});
    $('energy').textContent = state?.energy || 0; $('timer').textContent = formatTime(this.seconds);
    $('energy-fill').style.width = `${state ? Math.min(100, state.energy - state.lastFeverEnergy) : 0}%`;
    const stage=feverStage(state?.presentedStageLevel||state?.feverLevel), next=Math.max(state?.stageLevel||0,state?.nextFeverLevel || 1);
    const bpm=this.music.clock?.bpm || (state?.cycle==='FEVER'?stage.bpm:state?.cycle==='REST'?REST_BPM:BASE_BPM);
    $('cycle').textContent = state?.cycle === 'RISE'?t('rise',{name:stage.name}):state?.cycle === 'FEVER' ? `${stage.name} ${stage.level}/5 · ${bpm} BPM · ${Math.ceil(Math.max(0, state.feverDuration - (this.seconds - state.phaseAt)))}s` : state?.cycle === 'REST' ? `FEVER ${state.feverLevel}/5 · ${t('calm')}` : this.phase >= 3 && state?.energy - state?.lastFeverEnergy >= 75 ? t('until',{name:feverStage(next).name,n:Math.max(0,100-(state.energy-state.lastFeverEnergy))}) : state?.feverLevel ? `FEVER ${state.feverLevel}/5 · ${t('next',{name:feverStage(next).name})}` : 'BUILD THE BEAT';
    $('play').classList.toggle('rising',state?.cycle==='RISE');
    $('play').dataset.feverLevel=String(state?.feverLevel || 0);
    $('play').classList.toggle('fever', state?.cycle === 'FEVER');
    $('cycle').classList.toggle('hidden', this.phase < 3 || (state?.cycle === 'BUILD' && !state.feverLevel && state.energy - state.lastFeverEnergy < 75) || !state);
    [...$('fever-levels').children].forEach((el,i)=>{el.classList.toggle('on',i<(state?.stageLevel||state?.feverLevel||0));el.setAttribute('aria-label',`${FEVER_STAGES[i].name} ${t(i<(state?.stageLevel||state?.feverLevel||0)?'reached':'upcoming')}`);});
    $('current-sound').textContent = this.phase === 1 ? 'TOUCH → SOUND' : `${LAYERS[state?.layer || 0]} ♪`;
    $('play').classList.toggle('near-fever', this.phase >= 3 && state?.cycle !== 'FEVER' && state?.energy - state?.lastFeverEnergy >= 75);
    $('rally').classList.toggle('hidden', this.phase < 3); $('rally-count').textContent = state?.hits || 0;
    if (now >= this.cueUntil) $('celebration').classList.add('hidden');
    $('layers').classList.toggle('hidden', this.phase === 1); $('energy-fill').parentElement.classList.toggle('hidden', this.phase === 1);
    [...$('layers').children].forEach((el, i) => { el.classList.toggle('on', !!state && i <= state.layer); el.setAttribute('aria-label', `${LAYERS[i]} ${t(state && i <= state.layer ? 'unlocked' : 'locked')}`); });
    if (now - (this.lastMetricsAt || 0) > 1000) {
      this.lastMetricsAt = now; const sorted = [...this.latencies].sort((a, b) => a - b), fps = this.frameTimes.length ? 1000 / (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length) : 0;
      const audioTime = this.audio.ctx?.currentTime ?? 0;
      if (this.state === 'PLAYING' && this.audio.ready && this.audioClock?.ctx === this.audio.ctx && audioTime <= this.audioClock.time + .001) this.audio.ready = false;
      this.audioClock = { ctx: this.audio.ctx, time: audioTime }; this.updateAudio();
      const poseFPS = this.poseTimes.length > 1 ? (this.poseTimes.length - 1) * 1000 / (this.poseTimes.at(-1) - this.poseTimes[0]) : 0;
      this.metrics = { state: this.state, input: this.demo ? 'demo' : 'camera', bodyMode: this.bodyMode, poseInput: this.pose.inputMode || 'none', feverLevel: state?.feverLevel || 0, backend: this.pose.backend || 'none', canvasFPS: Math.round(fps), poseFPS: +poseFPS.toFixed(1), inferenceP95ms: Math.round(sorted[Math.floor(sorted.length * .95)] || 0), particles: this.renderer.particles.parts.length, voices: this.audio.voices.size, audioNodes: this.audio.nodeCount, audioState: this.audio.ctx?.state || 'closed', audioReady: this.audio.ready, audioTime: +audioTime.toFixed(2), tensors: globalThis.tf?.memory().numTensors ?? null, seconds: Math.floor(this.seconds), energy: state?.energy || 0 };
      this.recordFeature?.observe(this.metrics,now);this.metrics.record=this.recordFeature?.diagnostics;
      $('metrics').textContent = JSON.stringify(this.metrics, null, 2);
      if (!this.demo && this.latencies.length > 30 && (this.metrics.inferenceP95ms > 90 || fps < 30)) { this.renderer.particleBudget = 80; if (this.renderer.dpr !== 1) { this.renderer.dpr = 1; this.renderer.resize(); } this.inferenceInterval = 67; }
    }
  }
  openSettings() {
    if (['IDLE', 'FINISHED'].includes(this.state)) return;
    this.pause();
    if (!$('settings').open) $('settings').showModal();
    this.updateAudio();
  }
  pause() {
    if (['IDLE', 'FINISHED', 'PAUSED'].includes(this.state)) return;
    this.hands.reset();
    this.recordFeature.pause();this.generation++; this.state = 'PAUSED'; cancelAnimationFrame(this.raf); this.camera.stop(); this.music.stop(); this.audio.suspend(); this.game?.resetTracking(); this.mapped = null; this.messageKey('paused',true);
    this.updateAudio();
  }
  async resume() {
    if (!['PAUSED', 'ERROR'].includes(this.state)) return;
    this.state = 'STARTING'; const generation = ++this.generation; this.messageKey('preparing');if(this.recordFeature.masked&&!this.demo)this.recordFeature.initTracker();
    try { const audioPromise = this.audio.unlock({ rebuild: true }), cameraPromise = this.demo ? Promise.resolve() : this.camera.start(); await Promise.all([audioPromise, cameraPromise, this.demo ? Promise.resolve() : this.pose.init()]); if (generation !== this.generation) return; this.pose.lastVideoTime = -1; this.beginCalibration(); this.lastFrame = performance.now(); this.animate(); }
    catch (error) { if (generation === this.generation) this.fail(error); }
  }
  async finish() {
    if (['IDLE', 'FINISHED','FINISHING'].includes(this.state)) return;
    this.hands.reset();
    $('settings').close();
    const hadGame = !!this.game, energy = this.game?.energy; this.generation++; this.state = 'FINISHING'; cancelAnimationFrame(this.raf); await this.recordFeature.finish(); this.camera.stop(); this.music.stop(); await this.audio.close(); await this.pose.dispose();this.state='FINISHED';
    $('play').classList.add('hidden'); $('landing').classList.remove('hidden'); this.mapped = null; this.renderer.particles.parts = [];
    if (hadGame) {
      const record = { at: new Date().toISOString(), seconds: Math.floor(this.seconds), energy: energy.energy, hits: energy.hits, feverLevel:this.peakFeverLevel||0,stageLevel:energy.stageLevel,cycleCount:energy.cycleId, input: this.demo ? 'demo' : 'camera' };
      const saved = this.phase >= 4 && this.store.saveSession(record);
      $('result-energy').textContent = record.energy; $('result-hits').textContent = record.hits; $('result-time').textContent = formatTime(record.seconds);
      this.resultRecord=record;drawResultCard($('result-card'),record,this.renderer.characters.idle);$('result-fever').textContent=`${record.feverLevel}/5`;$('card-status').textContent='';
      $('saved-note').textContent = t(saved?(this.demo?'savedDemo':'saved'):this.phase<4?'notSavedMode':'notSaved');
      $('result').showModal();this.recordFeature.generate();
    }
  }
  renderHistory() {
    const list = $('history-list'); list.replaceChildren(); const history = this.store.history();
    if (!history.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = t('emptyHistory'); list.append(p); }
    for (const record of history) { const row = document.createElement('div'); row.className = 'history-row'; const date = document.createElement('span'); date.textContent = new Date(record.at).toLocaleDateString(getLanguage()==='ja'?'ja-JP':'en-US') + (record.input === 'demo' ? ` · ${t('demoName')}` : ''); const value = document.createElement('span'); value.textContent = `${record.energy} ENERGY · ${formatTime(record.seconds)}`; row.append(date, value); list.append(row); }
  }
  async offlineSetup() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js'); this.registration = registration;
      this.hadController = !!navigator.serviceWorker.controller;
      const showUpdate = () => { if (registration.waiting && navigator.serviceWorker.controller) $('update-banner').classList.remove('hidden'); };
      showUpdate(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', showUpdate));
      $('update').onclick = async () => { if(this.recordFeature.exporting){$('update').textContent=t('videoUpdateWait');return;}this.recordFeature.stopPreview();if (!['IDLE', 'FINISHED'].includes(this.state)) await this.finish(); this.updateRequested = true; registration.waiting?.postMessage({ type: 'ACTIVATE' }); };
      navigator.serviceWorker.addEventListener('controllerchange', () => { if ((this.updateRequested || this.hadController) && ['IDLE','FINISHED'].includes(this.state) && !this.updating) { this.updating = true; location.reload(); } else (navigator.serviceWorker.controller)?.postMessage({ type: 'CHECK_READY' }); this.hadController = true; });
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'OFFLINE_READY') {this.offlineStatus='offlineReady'; $('offline').textContent=t(this.offlineStatus);}
        if (event.data?.type === 'STATE_REQUEST') event.source?.postMessage({ type: 'CLIENT_STATE', nonce: event.data.nonce, busy: !['IDLE', 'FINISHED'].includes(this.state)||!!this.recordFeature.exporting||!!this.recordFeature.previewActive });
        if (event.data?.type === 'UPDATE_BUSY') { this.updateRequested = false; this.updateBusy=true; $('update').textContent=t('updateBusy'); }
      });
      const check = () => (navigator.serviceWorker.controller || registration.active)?.postMessage({ type: 'CHECK_READY' }); check(); navigator.serviceWorker.ready.then(check);
    } catch { this.offlineStatus='offlineNone'; $('offline').textContent=t(this.offlineStatus); }
  }
}
export const app = new AppController();
