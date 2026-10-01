// SPDX-License-Identifier: MIT
import { cameraCrop } from './coordinates.js';
const scripts = ['vendor/tf-core.min.js', 'vendor/tf-converter.min.js', 'vendor/tf-backend-webgl.min.js', 'vendor/pose-detection.min.js'];
const loads = new Map();
function loadScript(path) {
  if (!loads.has(path)) loads.set(path, new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = new URL(`../${path}`, import.meta.url).href;
    script.onload = resolve; script.onerror = () => { loads.delete(path); script.remove(); reject(new Error('姿勢推定ファイルを読み込めません。接続を確認して再試行してください')); };
    document.head.append(script);
  }));
  return loads.get(path);
}
export class PoseDetector {
  constructor() { this.detector = null; this.sequence = 0; this.busy = false; this.lastVideoTime = -1; this.backend = ''; this.initPromise = null; }
  async init() {
    if (this.detector) return;
    if (!this.initPromise) this.initPromise = this.initialize().finally(() => { this.initPromise = null; });
    return this.initPromise;
  }
  async initialize() {
    for (const path of scripts) await loadScript(path);
    const tf = globalThis.tf, pd = globalThis.poseDetection;
    const options = { modelType: pd.movenet.modelType.SINGLEPOSE_LIGHTNING, enableSmoothing: true,
      modelUrl: new URL('../models/movenet-lightning-v4/model.json', import.meta.url).href };
    try {
      if (!await tf.setBackend('webgl')) throw new Error('WebGL unavailable');
      await tf.ready();
      this.detector = await pd.createDetector(pd.SupportedModels.MoveNet, options);
      this.backend = 'webgl';
    } catch {
      this.detector?.dispose(); this.detector = null;
      await loadScript('vendor/tf-backend-wasm.min.js');
      tf.wasm.setWasmPaths(new URL('../vendor/', import.meta.url).href);
      tf.wasm.setThreadsCount(1);
      if (!await tf.setBackend('wasm')) throw new Error('この端末で姿勢推定を開始できません');
      await tf.ready();
      this.detector = await pd.createDetector(pd.SupportedModels.MoveNet, options);
      this.backend = 'wasm';
    }
  }
  async estimate(video, now, view) {
    if (!this.detector || this.busy || video.readyState < 2 || video.currentTime === this.lastVideoTime) return null;
    this.busy = true; this.lastVideoTime = video.currentTime;
    try {
      const crop = view?.fit === 'cover' && view.bodyMode !== 'upper' ? cameraCrop(video.videoWidth,video.videoHeight,view.width,view.height) : null;
      const inputMode = crop ? 'visible-crop' : 'full-camera';
      if(this.inputMode && this.inputMode!==inputMode) this.detector.reset?.();
      this.inputMode = inputMode;
      let input = video;
      if (crop) {
        this.cropCanvas ??= document.createElement('canvas');
        const scale=Math.min(1,640/Math.max(crop.width,crop.height)), width=Math.max(1,Math.round(crop.width*scale)), height=Math.max(1,Math.round(crop.height*scale));
        if(this.cropCanvas.width!==width||this.cropCanvas.height!==height){this.cropCanvas.width=width;this.cropCanvas.height=height;}
        this.cropCanvas.getContext('2d').drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,width,height); input=this.cropCanvas;
      }
      const poses = await this.detector.estimatePoses(input, { flipHorizontal: false }, now);
      const points = {};
      for (const p of poses[0]?.keypoints || []) points[p.name] = { x: crop ? (crop.x+p.x/input.width*crop.width)/video.videoWidth : p.x/video.videoWidth, y: crop ? (crop.y+p.y/input.height*crop.height)/video.videoHeight : p.y/video.videoHeight, score: p.score || 0 };
      return { id: ++this.sequence, capturedAt: now, completedAt: performance.now(), width: video.videoWidth, height: video.videoHeight, points };
    } finally { this.busy = false; }
  }
  async dispose() { await this.initPromise?.catch(() => {}); while (this.busy) await new Promise(r => setTimeout(r, 10)); this.detector?.dispose(); this.detector = null; this.lastVideoTime = -1; if(this.cropCanvas){this.cropCanvas.width=1;this.cropCanvas.height=1;this.cropCanvas=null;} }
}
