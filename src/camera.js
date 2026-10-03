// SPDX-License-Identifier: MIT
import {viewport} from './coordinates.js';
export function drawCameraFrame(video,canvas,fit='cover') {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle='#102c29';c.fillRect(0,0,w,h);
  if(video.readyState<2)return false;
  const rect=viewport(video.videoWidth,video.videoHeight,w,h,fit);if(!rect)return false;
  c.save();c.translate(w,0);c.scale(-1,1);c.drawImage(video,rect.x,rect.y,rect.width,rect.height);c.restore();
  return true;
}
export function initialCameraFit(settings={}) {
  // Old full-body sessions acquired contain automatically; migrate that default once.
  if(settings.bodyMode==='full'&&settings.cameraFit==='contain'&&settings.cameraViewVersion!==2)return 'cover';
  return settings.cameraFit==='contain'?'contain':'cover';
}
export class CameraManager {
  constructor(video) { this.video = video; this.generation = 0; this.stream = null; }
  async start() {
    const generation = ++this.generation;
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('HTTPSまたはlocalhostで開いてください');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 480 }, height: { ideal: 854 }, aspectRatio: { ideal: 9/16 }, frameRate: { ideal: 30, max: 30 } } });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); throw new DOMException('Cancelled', 'AbortError'); }
    this.stream = stream;
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
    if (!this.video.videoWidth) await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.video.removeEventListener('loadedmetadata', ready); this.metadataCancel = null; };
      const ready = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('カメラの映像が届きません。再開を押してください')); }, 10000);
      this.metadataCancel = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
      this.video.addEventListener('loadedmetadata', ready, { once: true });
    });
    if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
    return stream;
  }
  stop() { this.generation++; this.metadataCancel?.(); this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.video.pause(); this.video.srcObject = null; }
}
