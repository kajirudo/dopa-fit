// SPDX-License-Identifier: MIT
import { CameraManager } from './camera.js';
import { PoseDetector } from './pose.js';
import { mapPose, distance } from './coordinates.js';
import { HandTracker } from './hands.js';
import { CalibrationManager } from './calibration.js';
import { GameEngine, LAYERS, BAR_SECONDS } from './game.js';
import { AudioManager } from './audio.js';
import { MusicEngine } from './music.js';
import { Renderer } from './renderer.js';
import { Store } from './storage.js';
import { FeedbackDirector } from './feedback.js';
const $ = id => document.getElementById(id);
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const courseCues = ['左右へ、ゆっくりリーチ', '両手を上げてみよう', '左右へステップ', 'ゆっくり上下に動こう', '好きな動きで音をつくろう', 'ひと息、のんびり動こう'];
export class AppController {
  constructor() {
    this.phase = Math.max(1, Math.min(7, Number(new URLSearchParams(location.search).get('phase')) || 7));
    this.camera = new CameraManager($('camera')); this.pose = new PoseDetector(); this.audio = new AudioManager(); this.renderer = new Renderer($('canvas')); this.calibration = new CalibrationManager(); this.store = new Store();
    this.state = 'IDLE'; this.generation = 0; this.seconds = 0; this.game = null; this.demo = false; this.pointer = null; this.mapped = null; this.lastFrame = 0; this.lastInference = 0; this.inferenceInterval = 50; this.latencies = []; this.frameTimes = []; this.poseTimes = []; this.shiftSince = 0; this.countdownAt = null;
    this.music = new MusicEngine(this.audio, () => this.game?.energy || { layer: 0, cycle: 'BUILD' });
    this.feedbackDirector = new FeedbackDirector(); this.renderer.phase = this.phase; this.hands = new HandTracker();
    this.bind();
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
    $('history-open').onclick = () => { this.renderHistory(); $('history').showModal(); };
    $('history-close').onclick = () => $('history').close();
    $('history-clear').onclick = () => { this.store.clearHistory(); this.renderHistory(); };
    $('mute').onclick = () => { this.audio.setMuted(!this.audio.muted); if (!this.audio.muted) this.retryAudio(); this.updateAudio(); this.saveSettings(); };
    $('audio-retry').onclick = () => this.retryAudio();
    const settings = this.store.read('settings', {});
    $('reach').value = settings.reach === 'small' ? 'small' : 'wide';
    $('reach').onchange = () => this.saveSettings();
    $('camera-fit').value = settings.cameraFit === 'contain' ? 'contain' : 'cover';
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
  saveSettings() { this.store.write('settings', { volume: Number($('volume').value), reduced: $('reduced').checked, reach: $('reach').value, cameraFit: $('camera-fit').value }); }
  updateAudio() {
    const quiet = this.audio.muted || this.audio.volume === 0;
    $('mute').textContent = this.audio.muted ? '音 OFF' : '音 ON'; $('mute').setAttribute('aria-pressed', String(this.audio.muted));
    $('audio-status').textContent = this.audio.pending ? '確認音を準備中…' : quiet ? '音はOFFです' : this.audio.ready ? '音が聞こえないときは →' : 'タップして音を有効に →';
    $('audio-retry').textContent = this.audio.ready && !quiet ? '音を試す' : '音を有効にする';
    $('audio-retry').disabled = this.audio.pending || ['IDLE', 'FINISHED', 'ERROR'].includes(this.state) || (this.state === 'PAUSED' && !$('settings').open);
    $('sound-alert').classList.toggle('hidden', this.state !== 'PLAYING' || this.audio.ready || quiet || this.audio.pending);
    $('audio-check').classList.toggle('needs-audio', !this.audio.ready && !quiet && !this.audio.pending);
  }
  async retryAudio() {
    if (this.audio.pending || (!['STARTING', 'CALIBRATING', 'COUNTDOWN', 'PLAYING'].includes(this.state) && !(this.state === 'PAUSED' && $('settings').open))) return;
    const generation = this.generation;
    $('audio-help').classList.remove('hidden');
    this.music.stop(); this.audio.setMuted(false);
    if (this.audio.volume === 0) { $('volume').value = 55; this.audio.setVolume(.55); }
    this.saveSettings();
    try {
      // Recreate in this click, so an interrupted/stalled iOS context is not reused.
      const ready = await this.audio.unlock({ rebuild: true });
      if (generation === this.generation && ready && this.state === 'PLAYING' && this.phase >= 2) this.music.start(this.seconds);
    } catch { this.audio.pending = false; this.audio.ready = false; }
    this.updateAudio();
  }
  message(text, action = false, countdown = false) { $('stage-scrim').classList.remove('hidden'); $('stage-message').textContent = text; $('stage-message').classList.toggle('countdown', countdown); $('resume').classList.toggle('hidden', !action); }
  async start(demo) {
    if (!['IDLE', 'FINISHED', 'ERROR'].includes(this.state)) return;
    this.demo = demo; this.game = null; this.seconds = 0; this.mapped = null; this.pointer = null; this.renderer.rewards = []; this.audioClock = null; this.course = $('course').checked && this.phase >= 4; this.latencies = []; this.frameTimes = []; this.poseTimes = [];
    $('audio-help').classList.add('hidden');
    this.feedbackDirector.reset(); this.renderer.celebration = null; this.cueUntil = 0; $('celebration').classList.add('hidden'); this.lastCue = null;
    $('landing').classList.add('hidden'); $('play').classList.remove('hidden'); $('demo-badge').classList.toggle('hidden', !demo); $('mode-label').textContent = demo ? 'DEMO · NO CAMERA' : this.course ? '3 MIN FLOW' : this.phase === 1 ? 'FIRST REACH' : 'FREE FLOW';
    this.state = 'STARTING'; this.updateUI(performance.now()); this.renderer.resize(); this.message(demo ? '音を準備しています' : 'カメラを許可してね\n音と姿勢推定を準備しています');
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
    this.generation++; this.camera.stop(); this.music.stop(); this.audio.suspend(); this.state = 'ERROR'; cancelAnimationFrame(this.raf);
    const messages = { NotAllowedError: 'カメラが許可されていません。\nブラウザのサイト設定で許可して、再開してください', NotFoundError: 'カメラが見つかりません。別の端末でも試せます', NotReadableError: 'カメラが使用中のようです。ほかのアプリを閉じて再開してください', OverconstrainedError: 'カメラを起動できません。再開して試してください' };
    this.message(messages[error.name] || error.message || '準備できませんでした。再開して試してください', true);
  }
  beginCalibration() {
    this.hands.reset(); this.mapped = null; this.renderer.markers = {}; this.renderer.trails = {};
    this.calibration.reset(); this.countdownAt = null; this.shiftSince = 0; this.game?.resetTracking(); this.state = 'CALIBRATING'; this.message(this.demo ? 'GOへ触れて、音をつくろう' : '肩と両手が映る位置に立ってね');
    if (this.demo) {
      const w = this.renderer.width, h = this.renderer.height;
      this.acceptCalibration({ center: { x: w / 2, y: h * .46 }, shoulder: w * .28, rect: { x: 0, y: 0, width: w, height: h } });
      this.countdownAt = performance.now() - 3000;
    }
  }
  acceptCalibration(calibration) {
    const previous = this.game?.energy;
    this.game = new GameEngine(calibration, this.phase, $('reach').value); if (previous) this.game.energy = previous;
    this.state = 'COUNTDOWN'; this.countdownAt = performance.now();
  }
  animate() {
    if (['IDLE', 'FINISHED', 'PAUSED', 'ERROR'].includes(this.state)) return;
    const now = performance.now(), dt = Math.min(.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.frameTimes.push(now - this.lastFrame); if (this.frameTimes.length > 300) this.frameTimes.shift(); this.lastFrame = now;
    if (this.state === 'COUNTDOWN') {
      const left = Math.ceil(3 - (now - this.countdownAt) / 1000);
      if (left > 0) this.message(String(left), false, true);
      else { this.state = 'PLAYING'; $('stage-scrim').classList.add('hidden'); if (this.phase >= 2) this.music.start(this.seconds); }
    }
    if (this.state === 'PLAYING') {
      this.seconds += dt; this.game.energy.tick(this.seconds, dt, this.phase >= 3);
      this.game.targets.advance(now, this.music.clockSeconds ?? this.seconds, this.game.energy.cycle);
      if (now - this.game.movement.lastMotion < 500) this.game.energy.flow += dt;
      if (this.course && this.seconds >= 180) { this.finish(); return; }
    }
    if (!this.demo && !this.pose.busy && now - this.lastInference >= this.inferenceInterval) {
      this.lastInference = now; const generation = this.generation;
      this.pose.estimate($('camera'), now, { width: this.renderer.width, height: this.renderer.height, fit: $('camera-fit').value }).then(frame => { if (generation === this.generation && frame) this.processFrame(frame); }).catch(error => { if (generation === this.generation) this.fail(error); });
    }
    if (this.demo && this.state === 'PLAYING') this.processDemo(now);
    if (this.phase >= 3 && this.state === 'PLAYING') {
      const cue = this.feedbackDirector.update(this.game.energy);
      if (cue) this.celebrate(cue, now);
    }
    this.renderer.draw(this.mapped, this.game, now, dt, this.music.clockSeconds ?? this.seconds); this.updateUI(now);
    this.raf = requestAnimationFrame(() => this.animate());
  }
  processFrame(frame) {
    const now = performance.now(); this.latencies.push(frame.completedAt - frame.capturedAt); if (this.latencies.length > 200) this.latencies.shift(); this.poseTimes.push(now); if (this.poseTimes.length > 100) this.poseTimes.shift();
    const mapped = mapPose(frame, this.renderer.width, this.renderer.height, now, $('camera-fit').value); if (!mapped) return;
    const lShoulder = mapped.points.left_shoulder, rShoulder = mapped.points.right_shoulder;
    const shoulder = this.game?.calibration.shoulder || (lShoulder?.valid && rShoulder?.valid ? distance(lShoulder,rShoulder) : this.renderer.width*.25);
    const pose = this.hands.update(mapped, now, shoulder); this.mapped = pose;
    if (this.state === 'CALIBRATING') { const result = this.calibration.update(pose, now); if (result.ready) this.acceptCalibration(result.calibration); else this.message(result.message); return; }
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
    $('course-cue').textContent = valid ? this.course ? courseCues[Math.min(5, Math.floor(this.seconds / 30))] : '' : '肩と両手を画面に戻してね';
  }
  processDemo(now) {
    const c = this.game.calibration, p = this.pointer || { x: c.center.x, y: c.center.y + c.shoulder };
    const points = { left_shoulder: { x: c.center.x - c.shoulder / 2, y: c.center.y, valid: true }, right_shoulder: { x: c.center.x + c.shoulder / 2, y: c.center.y, valid: true }, left_wrist: { ...p, valid: true }, right_wrist: { x: c.center.x, y: c.center.y + c.shoulder, valid: true } };
    this.mapped = this.hands.update({ id: ++this.pose.sequence, capturedAt: now, points, rect: c.rect }, now, c.shoulder);
    this.feedback(this.game.process(this.mapped, now));
    $('course-cue').textContent = this.course ? courseCues[Math.min(5, Math.floor(this.seconds / 30))] : '';
  }
  feedback(events) {
    const hasAccent = events.some(event => event.type !== 'move');
    for (const event of events) {
      if (event.type === 'move') { if (hasAccent) continue; this.audio.move(); }
      else this.audio.hit(event.targetId ?? 2, this.phase >= 3 && this.game?.energy.cycle === 'FEVER', event.intensity || 1);
      this.renderer.reward(event);
    }
  }
  celebrate(cue, now) {
    if (this.cueUntil > now && this.lastCue?.priority > cue.priority) return;
    this.lastCue = cue; this.cueUntil = now + cue.duration; this.renderer.celebrate(cue, now); this.audio.celebrate(cue.kind);
    $('celebration-title').textContent = cue.title; $('celebration-note').textContent = cue.subtitle;
    $('celebration').className = `celebration ${cue.kind}`;
    // Restart a short entrance only for a new milestone, never on every frame.
    $('celebration').getAnimations().forEach(animation => animation.cancel());
    if (!this.renderer.particles.reduced && !matchMedia('(prefers-reduced-motion: reduce)').matches) $('celebration').animate([{ opacity: 0, transform: 'translateY(8px) scale(.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  updateUI(now) {
    const state = this.game?.energy;
    $('energy').textContent = state?.energy || 0; $('timer').textContent = formatTime(this.seconds);
    $('energy-fill').style.width = `${state ? Math.min(100, state.energy - state.lastFeverEnergy) : 0}%`;
    $('cycle').textContent = state?.cycle === 'FEVER' ? `FEVER ✦ ${Math.ceil(Math.max(0, 8 * BAR_SECONDS - (this.seconds - state.phaseAt)))}s` : state?.cycle === 'REST' ? 'ひと息 · KEEP YOUR GROOVE' : this.phase >= 3 && state?.energy - state?.lastFeverEnergy >= 75 ? `FEVERまであと ${Math.max(0, 100 - (state.energy - state.lastFeverEnergy))}` : 'BUILD THE BEAT';
    $('play').classList.toggle('fever', state?.cycle === 'FEVER');
    $('cycle').classList.toggle('hidden', this.phase < 3 || (state?.cycle === 'BUILD' && state.energy - state.lastFeverEnergy < 75) || !state);
    $('current-sound').textContent = this.phase === 1 ? 'TOUCH → SOUND' : `${LAYERS[state?.layer || 0]} ♪`;
    $('play').classList.toggle('near-fever', this.phase >= 3 && state?.cycle !== 'FEVER' && state?.energy - state?.lastFeverEnergy >= 75);
    $('rally').classList.toggle('hidden', this.phase < 3); $('rally-count').textContent = state?.hits || 0;
    if (now >= this.cueUntil) $('celebration').classList.add('hidden');
    $('layers').classList.toggle('hidden', this.phase === 1); $('energy-fill').parentElement.classList.toggle('hidden', this.phase === 1);
    [...$('layers').children].forEach((el, i) => { el.classList.toggle('on', !!state && i <= state.layer); el.setAttribute('aria-label', `${LAYERS[i]} ${state && i <= state.layer ? '解放済み' : '未解放'}`); });
    if (now - (this.lastMetricsAt || 0) > 1000) {
      this.lastMetricsAt = now; const sorted = [...this.latencies].sort((a, b) => a - b), fps = this.frameTimes.length ? 1000 / (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length) : 0;
      const audioTime = this.audio.ctx?.currentTime ?? 0;
      if (this.state === 'PLAYING' && this.audio.ready && this.audioClock?.ctx === this.audio.ctx && audioTime <= this.audioClock.time + .001) this.audio.ready = false;
      this.audioClock = { ctx: this.audio.ctx, time: audioTime }; this.updateAudio();
      const poseFPS = this.poseTimes.length > 1 ? (this.poseTimes.length - 1) * 1000 / (this.poseTimes.at(-1) - this.poseTimes[0]) : 0;
      this.metrics = { state: this.state, input: this.demo ? 'demo' : 'camera', backend: this.pose.backend || 'none', canvasFPS: Math.round(fps), poseFPS: +poseFPS.toFixed(1), inferenceP95ms: Math.round(sorted[Math.floor(sorted.length * .95)] || 0), particles: this.renderer.particles.parts.length, voices: this.audio.voices.size, audioNodes: this.audio.nodeCount, audioState: this.audio.ctx?.state || 'closed', audioReady: this.audio.ready, audioTime: +audioTime.toFixed(2), tensors: globalThis.tf?.memory().numTensors ?? null, seconds: Math.floor(this.seconds), energy: state?.energy || 0 };
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
    this.generation++; this.state = 'PAUSED'; cancelAnimationFrame(this.raf); this.camera.stop(); this.music.stop(); this.audio.suspend(); this.game?.resetTracking(); this.mapped = null; this.message('ひと息つこう\nENERGYはそのまま', true);
    this.updateAudio();
  }
  async resume() {
    if (!['PAUSED', 'ERROR'].includes(this.state)) return;
    this.state = 'STARTING'; const generation = ++this.generation; this.message('準備しています');
    try { const audioPromise = this.audio.unlock({ rebuild: true }), cameraPromise = this.demo ? Promise.resolve() : this.camera.start(); await Promise.all([audioPromise, cameraPromise, this.demo ? Promise.resolve() : this.pose.init()]); if (generation !== this.generation) return; this.pose.lastVideoTime = -1; this.beginCalibration(); this.lastFrame = performance.now(); this.animate(); }
    catch (error) { if (generation === this.generation) this.fail(error); }
  }
  async finish() {
    if (['IDLE', 'FINISHED'].includes(this.state)) return;
    this.hands.reset();
    $('settings').close();
    const hadGame = !!this.game, energy = this.game?.energy; this.generation++; this.state = 'FINISHED'; cancelAnimationFrame(this.raf); this.camera.stop(); this.music.stop(); await this.audio.close(); await this.pose.dispose();
    $('play').classList.add('hidden'); $('landing').classList.remove('hidden'); this.mapped = null; this.renderer.particles.parts = [];
    if (hadGame) {
      const record = { at: new Date().toISOString(), seconds: Math.floor(this.seconds), energy: energy.energy, hits: energy.hits, input: this.demo ? 'demo' : 'camera' };
      const saved = this.phase >= 4 && this.store.saveSession(record);
      $('result-energy').textContent = record.energy; $('result-hits').textContent = record.hits; $('result-time').textContent = formatTime(record.seconds);
      $('saved-note').textContent = saved ? (this.demo ? 'カメラなしのデモとして、この端末に記録しました。' : 'この端末にだけ記録しました。') : this.phase < 4 ? '今回の成果です。このモードでは履歴を保存しません。' : '今回の成果です。記録の保存はできませんでした。';
      $('result').showModal();
    }
  }
  renderHistory() {
    const list = $('history-list'); list.replaceChildren(); const history = this.store.history();
    if (!history.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'まだ記録はありません。最初のひと動きから。'; list.append(p); }
    for (const record of history) { const row = document.createElement('div'); row.className = 'history-row'; const date = document.createElement('span'); date.textContent = new Date(record.at).toLocaleDateString('ja-JP') + (record.input === 'demo' ? ' · デモ' : ''); const value = document.createElement('span'); value.textContent = `${record.energy} ENERGY · ${formatTime(record.seconds)}`; row.append(date, value); list.append(row); }
  }
  async offlineSetup() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js'); this.registration = registration;
      this.hadController = !!navigator.serviceWorker.controller;
      const showUpdate = () => { if (registration.waiting && navigator.serviceWorker.controller) $('update-banner').classList.remove('hidden'); };
      showUpdate(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', showUpdate));
      $('update').onclick = async () => { if (!['IDLE', 'FINISHED'].includes(this.state)) await this.finish(); this.updateRequested = true; registration.waiting?.postMessage({ type: 'ACTIVATE' }); };
      navigator.serviceWorker.addEventListener('controllerchange', () => { if ((this.updateRequested || this.hadController) && ['IDLE','FINISHED'].includes(this.state) && !this.updating) { this.updating = true; location.reload(); } else (navigator.serviceWorker.controller)?.postMessage({ type: 'CHECK_READY' }); this.hadController = true; });
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'OFFLINE_READY') $('offline').textContent = 'オフライン利用OK';
        if (event.data?.type === 'STATE_REQUEST') event.source?.postMessage({ type: 'CLIENT_STATE', nonce: event.data.nonce, busy: !['IDLE', 'FINISHED'].includes(this.state) });
        if (event.data?.type === 'UPDATE_BUSY') { this.updateRequested = false; $('update').textContent = 'ほかのタブの運動を終えて更新'; }
      });
      const check = () => (navigator.serviceWorker.controller || registration.active)?.postMessage({ type: 'CHECK_READY' }); check(); navigator.serviceWorker.ready.then(check);
    } catch { $('offline').textContent = 'オフライン保存なし'; }
  }
}
export const app = new AppController();
