// SPDX-License-Identifier: MIT
import {viewport} from './coordinates.js';
import {faceResultIssue} from './face-tracker.js';
import {feverStage} from './fever.js';
// Only the already-masked snapshot may bridge a brief inference gap.
// Recording still requires the original 200ms freshness limit.
export const SAFE_DISPLAY_HOLD_MS=450;
export function maskBounds(f){return {x:f.x-f.width*.1,y:f.y-f.height*.14,width:f.width*1.2,height:f.height*1.24,radius:Math.min(f.width,f.height)*.08};}
export class SafeScene {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.layer=document.createElement('canvas');this.mask=document.createElement('canvas');this.lastSafeAt=-Infinity;this.valid=false;}
  fallback(level=0,issue=this.issue||'checking'){const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.fillStyle='#102c29';c.fillRect(0,0,w,h);c.fillStyle=level?feverStage(level).color:'#85d9c0';c.globalAlpha=.15;c.beginPath();c.arc(w/2,h*.42,w*.4,0,Math.PI*2);c.fill();c.globalAlpha=1;this.valid=false;this.issue=issue;}
  compose(result,{background='MY_ROOM',level=0,fit='cover'},now=performance.now()){
    this.fallback(level,'checking');
    try {
      const issue=faceResultIssue(result,now);if(issue){this.issue=issue;return false;}
      const {bitmap,faces,segmentation}=result,w=this.canvas.width,h=this.canvas.height;
      const rect=viewport(bitmap.width,bitmap.height,w,h,fit),c=this.ctx;
      if(!rect){this.issue='invalid';return false;}
      const f=faces[0],faceBox={x:w-rect.x-(f.x+f.width)*rect.width,y:rect.y+f.y*rect.height,width:f.width*rect.width,height:f.height*rect.height,roll:-f.roll};
      const bounds=maskBounds(faceBox);
      if(bounds.width>w*1.2||bounds.height>h*.55||bounds.width*bounds.height>w*h*.45){this.issue='too-close';return false;}
      if(background!=='MY_ROOM'&&(!segmentation||!segmentation.data?.length)){this.issue='background';return false;}
      this.layer.width=bitmap.width;this.layer.height=bitmap.height;
      const l=this.layer.getContext('2d');l.drawImage(bitmap,0,0);
      // Always hide the face BEFORE this private layer can reach the visible canvas.
      this.cover(l,{x:f.x*bitmap.width,y:f.y*bitmap.height,width:f.width*bitmap.width,height:f.height*bitmap.height,roll:f.roll},level);
      if(background!=='MY_ROOM'){
        if(background==='BLUR_ROOM'){c.save();c.translate(w,0);c.scale(-1,1);c.filter='blur(28px)';c.drawImage(this.layer,rect.x-20,rect.y-20,rect.width+40,rect.height+40);c.restore();}
        this.mask.width=segmentation.width;this.mask.height=segmentation.height;const mc=this.mask.getContext('2d'),image=mc.createImageData(this.mask.width,this.mask.height);
        let foreground=0;
        for(let i=0;i<segmentation.data.length;i++){const a=segmentation.data[i]===1?255:0;image.data[i*4+3]=a;foreground+=a?1:0;}
        if(foreground<segmentation.data.length*.01||foreground>segmentation.data.length*.97){this.fallback(level,'background');return false;}
        mc.putImageData(image,0,0);l.globalCompositeOperation='destination-in';l.drawImage(this.mask,0,0,bitmap.width,bitmap.height);l.globalCompositeOperation='source-over';
        if(background==='BLUR_ROOM'){

          // The blur pass includes a face, so replace the entire head area with an opaque shield too.
          const mirrored={x:w-rect.x-(f.x+f.width)*rect.width,y:rect.y+f.y*rect.height,width:f.width*rect.width,height:f.height*rect.height,roll:-f.roll};this.cover(c,mirrored,level);
        }
      }
      c.save();c.translate(w,0);c.scale(-1,1);c.drawImage(this.layer,rect.x,rect.y,rect.width,rect.height);c.restore();
      if(performance.now()-result.capturedAt>200){this.fallback(level,'delayed');return false;}
      this.faceBox=faceBox;
      this.level=level;this.valid=true;this.issue=null;this.lastSafeAt=result.capturedAt;return true;
    }finally{result?.bitmap?.close();}
  }
  cover(c,f,level){
    const color=level?feverStage(level).color:'#85d9c0',cx=f.x+f.width/2,cy=f.y+f.height*.5,b=maskBounds(f);
    // Cover stays axis-aligned and fully opaque. Rotating decorations never opens holes.
    c.fillStyle='#152e36';c.beginPath();if(c.roundRect)c.roundRect(b.x,b.y,b.width,b.height,b.radius);else c.rect(b.x,b.y,b.width,b.height);c.fill();
    // Decorations share the shield's silhouette instead of covering nearby hands.
    c.save();c.clip();c.translate(cx,cy);c.rotate(f.roll);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=Math.max(2,f.width*.035);
    c.strokeRect(-f.width*.5,-f.height*.5,f.width,f.height);
    c.fillRect(-f.width*.4,-f.height*.05,f.width*.23,f.height*.1);c.fillRect(f.width*.17,-f.height*.05,f.width*.23,f.height*.1);
    if(level>=2){for(const side of [-1,1])c.fillRect(side*f.width*.43-f.width*.04,-f.height*.2,f.width*.08,f.height*.4);}
    if(level>=3){c.globalAlpha=.5;c.fillRect(-f.width*.47,-f.height*.15,f.width*.94,f.height*.3);c.globalAlpha=1;}
    if(level>=4){c.beginPath();c.moveTo(-f.width*.3,-f.height*.3);c.lineTo(-f.width*.2,-f.height*.43);c.lineTo(0,-f.height*.32);c.lineTo(f.width*.2,-f.height*.43);c.lineTo(f.width*.3,-f.height*.3);c.stroke();}
    if(level===5){c.strokeStyle='#ffe486';c.beginPath();c.ellipse(0,f.height*.32,f.width*.3,f.height*.06,0,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  recordSafe(now){return this.valid&&now>=this.lastSafeAt&&now-this.lastSafeAt<=200;}
  check(now,level){if(now<this.lastSafeAt||now-this.lastSafeAt>SAFE_DISPLAY_HOLD_MS)this.fallback(level,this.issue||'delayed');return this.valid;}
  avatar(pose,width,height,level,now){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,scaleX=w/width,scaleY=h/height;
    const point=name=>{const p=pose?.points?.[name];return p?.valid&&now-pose.capturedAt<=200?{x:p.x*scaleX,y:p.y*scaleY}:null;};
    const l=point('left_shoulder'),r=point('right_shoulder');
    const center=l&&r?{x:(l.x+r.x)/2,y:(l.y+r.y)/2}:{x:w/2,y:h*.48};
    const span=l&&r?Math.min(w*.65,Math.max(w*.18,Math.hypot(l.x-r.x,l.y-r.y))):w*.35;
    c.save();c.lineCap='round';c.lineJoin='round';c.strokeStyle='#85d9c0';c.globalAlpha=.45;c.lineWidth=Math.max(5,span*.07);
    const chain=names=>{const points=names.map(point);c.beginPath();let previous=false;for(const p of points){if(!p){previous=false;continue;}previous?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);previous=true;}c.stroke();};
    for(const side of ['left','right'])chain([`${side}_hip`,`${side}_shoulder`,`${side}_elbow`,`${side}_wrist`]);
    chain(['left_shoulder','right_shoulder']);chain(['left_hip','right_hip']);
    c.globalAlpha=.3;c.fillStyle='#85d9c0';c.beginPath();if(c.roundRect)c.roundRect(center.x-span*.42,center.y,span*.84,span*1.1,span*.12);else c.rect(center.x-span*.42,center.y,span*.84,span*1.1);c.fill();c.restore();
    this.cover(c,{x:center.x-span*.24,y:center.y-span*.76,width:span*.48,height:span*.54,roll:0},level);
  }
  present(level){if(this.valid&&this.faceBox&&level!==this.level){this.cover(this.ctx,this.faceBox,level);this.level=level;}}
  clear(){this.lastSafeAt=-Infinity;this.faceBox=null;this.level=0;this.fallback(0,'checking');this.layer.width=this.mask.width=1;}
}
